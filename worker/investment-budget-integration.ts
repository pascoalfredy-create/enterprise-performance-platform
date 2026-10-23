import type { D1Database, D1PreparedStatement } from '../worker-configuration';
import { periodAdd } from '../lib/financial-arithmetic';
import { classifyDataError } from '../lib/api-error';
import { budgetOrganizationAccess, budgetResourceAccess } from './budget-authorization';
import { requireDraftVersion, fiscalYearPeriods } from './budget-annual-map';
import { createMapping, checkForUpdates, confirmMovements, applyMapping, setMappingStatus, type SourceValue } from './budget-integration';

// Each channel has its own destination and source identity. Cash is stored
// in frozen integration contributions, NEVER in the economic entries grid.
export type InvestmentChannel = 'CAPEX' | 'Depreciacao' | 'Pagamento' | 'Financiamento';
type Row = Record<string, unknown>;
const channels: InvestmentChannel[] = ['CAPEX', 'Depreciacao', 'Pagamento', 'Financiamento'];
const cashChannel = (channel: InvestmentChannel) => channel === 'Pagamento' || channel === 'Financiamento';
const encode = (modelId: string, sourceLineId: string, channel: InvestmentChannel) => JSON.stringify({modelId, sourceLineId, channel});
const decode = (value: unknown) => {
  try { const x = JSON.parse(String(value)); return typeof x.modelId === 'string' && typeof x.sourceLineId === 'string' && channels.includes(x.channel) ? x as {modelId:string;sourceLineId:string;channel:InvestmentChannel} : null; } catch { return null; }
};
const bad = (error: string, status = 400) => Response.json({error}, {status});
const validPeriod = (value: unknown) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value));

async function source(db:D1Database, tenant:string, scope:string|null, modelId:string, sourceLineId:string, channel:InvestmentChannel) {
  const model = await db.prepare('SELECT * FROM financial_models WHERE id=? AND tenant_id=? AND (? IS NULL OR organization_id=?)').bind(modelId,tenant,scope,scope).first<Row>();
  if (!model) return {error:bad('Plano financeiro não encontrado.',404)};
  if (model.status !== 'Aprovado') return {error:bad('A origem deve ser um plano financeiro aprovado.',409)};
  const line = await db.prepare('SELECT * FROM financial_model_lines WHERE id=? AND model_id=? AND tenant_id=?').bind(sourceLineId,modelId,tenant).first<Row>();
  if (!line) return {error:bad('Linha de origem não encontrada.',404)};
  const expected = channel === 'Depreciacao' ? 'Custo' : channel === 'Financiamento' ? 'Financiamento' : 'CAPEX';
  if (line.line_type !== expected) return {error:bad('O tipo da linha de origem não corresponde à finalidade escolhida.')};
  const projections = await db.prepare('SELECT * FROM financial_projections WHERE tenant_id=? AND model_id=? AND line_id=? ORDER BY period').bind(tenant,modelId,sourceLineId).all<Row>();
  if (!projections.results.length) return {error:bad('A origem não tem projeções mensais aprovadas.',409)};
  for (const p of projections.results) {
    if (!validPeriod(p.period) || !validPeriod(p.cash_period) || !Number.isSafeInteger(p.statement_amount_minor) || !Number.isSafeInteger(p.cash_amount_minor)) return {error:bad('A projeção contém um período ou montante inválido.')};
  }
  return {model,line,projections:projections.results};
}

async function destination(db:D1Database, tenant:string, lineId:string, channel:InvestmentChannel) {
  const line = await db.prepare("SELECT * FROM financial_line_catalog WHERE id=? AND tenant_id=? AND status='Ativa' AND line_kind='Analítica'").bind(lineId,tenant).first<Row>();
  if (!line) return {error:bad('Escolha uma rubrica analítica ativa.')};
  if (channel === 'CAPEX' && (line.classification !== 'Ativo' || line.cash_flow_category !== 'Investimento')) return {error:bad('O investimento deve alimentar uma rubrica de Ativo / Investimento, sem passar pelos custos operacionais.')};
  if (channel === 'Depreciacao' && (line.classification !== 'Custo' || !['Não aplicável','Operacional'].includes(String(line.cash_flow_category)))) return {error:bad('A depreciação deve alimentar uma rubrica de Custo.')};
  if (cashChannel(channel) && (line.classification !== 'Caixa' || line.cash_flow_category !== (channel === 'Pagamento' ? 'Investimento' : 'Financiamento'))) return {error:bad('Escolha uma rubrica de Caixa com a categoria correspondente: Investimento ou Financiamento.')};
  return {line};
}

async function mappingSource(db:D1Database,tenant:string,scope:string|null,mappingId:string) {
  const denied = await budgetResourceAccess(db,tenant,scope,'mapping',mappingId); if (denied) return {error:denied};
  const mapping = await db.prepare("SELECT * FROM financial_line_catalog_mappings WHERE id=? AND tenant_id=? AND source_module='Investimentos'").bind(mappingId,tenant).first<Row>();
  const reference = decode(mapping?.source_reference);
  if (!mapping || !reference) return {error:bad('Ligação de investimento não encontrada.',404)};
  return {mapping,reference};
}

export async function syncInvestmentMapping(db:D1Database,tenant:string,scope:string|null,mappingId:string) {
  const found = await mappingSource(db,tenant,scope,mappingId); if (found.error) return found.error;
  const {mapping,reference} = found;
  const loaded = await source(db,tenant,scope,reference.modelId,reference.sourceLineId,reference.channel); if (loaded.error) return loaded.error;
  const checked = await destination(db,tenant,String(mapping.line_id),reference.channel); if (checked.error) return checked.error;
  if (mapping.organization_id !== loaded.model.organization_id || mapping.currency !== loaded.model.currency) return bad('Empresa ou moeda da ligação não corresponde à origem.');
  const nature = cashChannel(reference.channel) ? 'Financeiro' : 'Economico';
  if (mapping.financial_nature !== nature) return bad('Natureza da ligação incompatível.');
  const values:SourceValue[] = loaded.projections.map(p=>({organizationId:String(loaded.model.organization_id),sourceModule:'Investimentos',sourceReference:String(p.id),componentLabel:`${reference.channel} · ${loaded.line.code} · ${loaded.line.name} · ${p.period}`,period:String(cashChannel(reference.channel)?p.cash_period:p.period),currency:String(loaded.model.currency),dimensionMemberId:mapping.dimension_member_id ? String(mapping.dimension_member_id):null,financialNature:nature,amountMinor:Number(cashChannel(reference.channel)?p.cash_amount_minor:p.statement_amount_minor),sourceStatus:'Aprovado',sourceFingerprint:JSON.stringify([loaded.model.approval_hash,p.formula_hash,p.period,p.cash_period,p.statement_amount_minor,p.cash_amount_minor,reference.channel])}));
  const fromPeriod = String(loaded.model.start_period);
  const toPeriod = values.reduce((max,v)=>v.period>max?v.period:max,periodAdd(fromPeriod,Number(loaded.model.horizon_months)-1));
  return checkForUpdates(db,tenant,mappingId,values,{fromPeriod,toPeriod});
}

export async function createInvestmentMapping(db:D1Database,tenant:string,scope:string|null,actor:string,body:Row) {
  const channel = String(body.channel) as InvestmentChannel;
  if (!channels.includes(channel)) return bad('Finalidade inválida.');
  if(channel==='Depreciacao'&&body.confirmDepreciation!==true)return bad('Confirme que a linha de Custo contém depreciações mensais aprovadas.');
  const loaded = await source(db,tenant,scope,String(body.modelId||''),String(body.sourceLineId||''),channel); if (loaded.error) return loaded.error;
  const organizationId = String(loaded.model.organization_id);
  if (body.organizationId && body.organizationId !== organizationId) return bad('A empresa selecionada não corresponde à origem.',403);
  const denied = await budgetOrganizationAccess(db,tenant,scope,organizationId); if (denied) return denied;
  const checked = await destination(db,tenant,String(body.lineId||''),channel); if (checked.error) return checked.error;
  const dimensionMemberId = body.dimensionMemberId ? String(body.dimensionMemberId) : null;
  if (dimensionMemberId && !await db.prepare("SELECT id FROM dimension_members WHERE id=? AND tenant_id=? AND status='Ativo'").bind(dimensionMemberId,tenant).first()) return bad('Dimensão inválida ou inativa.');
  const sourceReference = encode(String(loaded.model.id),String(loaded.line.id),channel);
  // A source projection is not an allocation driver. Its full amount may
  // feed one active destination per channel, never several departments.
  const duplicate = await db.prepare("SELECT id FROM financial_line_catalog_mappings WHERE tenant_id=? AND source_module='Investimentos' AND source_reference=? AND status='Ativo'").bind(tenant,sourceReference).first();
  if (duplicate) return bad('Esta origem já tem uma ligação ativa para esta finalidade. Retire a ligação anterior antes de a reclassificar.',409);
  const previousId = body.supersedesMappingId ? String(body.supersedesMappingId) : null;
  if (previousId) {
    const old = await mappingSource(db,tenant,scope,previousId); if (old.error) return old.error;
    if (old.reference.channel !== channel || old.mapping.line_id !== body.lineId || old.mapping.organization_id !== organizationId || old.mapping.dimension_member_id !== dimensionMemberId || old.mapping.currency !== loaded.model.currency) return bad('A substituição exige a mesma rubrica, finalidade, empresa, moeda e dimensão.');
  }
  const response = await createMapping(db,tenant,actor,{...body,organizationId,currency:loaded.model.currency,dimensionMemberId,sourceModule:'Investimentos',sourceReference,financialNature:cashChannel(channel)?'Financeiro':'Economico',relationPolicy:previousId?'Substituicao':body.relationPolicy||'Exclusiva'});
  if (!response.ok) return response;
  const {id} = await response.json() as {id:string};
  const synced = await syncInvestmentMapping(db,tenant,scope,id); if (!synced.ok) return synced;
  return Response.json({id,...await synced.json() as Row});
}

// Cash contributions share the existing approved-version freeze guards.
// No economic entry, opening balance or invented treasury balance is made.
async function applyCashMapping(db:D1Database,tenant:string,actor:string,mapping:Row,versionId:string,retire=false) {
  const draft = await requireDraftVersion(db,tenant,versionId); if (draft.error) return draft.error;
  const periods = fiscalYearPeriods(Number(draft.version!.fiscal_year));
  const rows = retire ? [] : (await db.prepare("SELECT source_movement_reference,component_label,period,amount_minor,source_status,source_fingerprint FROM budget_integration_movements WHERE tenant_id=? AND mapping_id=? AND sync_state IN ('Atualizado','PendenteConfirmacao')").bind(tenant,mapping.id).all<Row>()).results;
  const statements:D1PreparedStatement[] = [], now=new Date().toISOString();
  for (const period of periods) {
    const movements=rows.filter(x=>x.period===period), amount=movements.reduce((n,x)=>n+Number(x.amount_minor),0);
    if (!Number.isSafeInteger(amount)) return bad('Montante fora do limite seguro.');
    statements.push(db.prepare("INSERT INTO budget_integration_values (id,tenant_id,mapping_id,version_id,organization_id,line_id,period,dimension_member_id,currency,financial_nature,integration_amount_minor,movement_count,source_module,source_reference,relation_policy,sync_policy,applied_entry_id,sync_state,applied_by,applied_at,movements_json,cell_snapshot_json) VALUES (?,?,?,?,?,?,?,?,?,'Financeiro',?,?,'Investimentos',?,?,?,NULL,'Atualizado',?,?,?,?) ON CONFLICT(tenant_id,mapping_id,version_id,period,COALESCE(dimension_member_id,''),financial_nature) DO UPDATE SET integration_amount_minor=excluded.integration_amount_minor,movement_count=excluded.movement_count,movements_json=excluded.movements_json,cell_snapshot_json=excluded.cell_snapshot_json,applied_by=excluded.applied_by,applied_at=excluded.applied_at")
      .bind(crypto.randomUUID(),tenant,mapping.id,versionId,mapping.organization_id,mapping.line_id,period,mapping.dimension_member_id,mapping.currency,amount,movements.length,mapping.source_reference,mapping.relation_policy,mapping.sync_policy,actor,now,JSON.stringify(movements),JSON.stringify({code:mapping.code,name:mapping.name,classification:'Caixa',cashFlowCategory:mapping.cash_flow_category})));
  }
  await db.batch(statements);
  return Response.json({applied:periods.length,blocked:0});
}

export async function applyInvestmentMapping(db:D1Database,tenant:string,scope:string|null,actor:string,mappingId:string,versionId:string) {
  const found=await mappingSource(db,tenant,scope,mappingId); if(found.error)return found.error;
  if(found.mapping.status!=='Ativo')return bad('A ligação está inativa.',409);
  const checked=await destination(db,tenant,String(found.mapping.line_id),found.reference.channel);if(checked.error)return checked.error;
  const pending=await db.prepare("SELECT id FROM budget_integration_movements WHERE tenant_id=? AND mapping_id=? AND sync_state IN ('PendenteConfirmacao','Conflito','Erro') LIMIT 1").bind(tenant,mappingId).first();
  if(pending)return bad('Confirme as alterações da origem antes de aplicar.',409);
  const result=cashChannel(found.reference.channel)?await applyCashMapping(db,tenant,actor,{...found.mapping,...{code:checked.line.code,name:checked.line.name,cash_flow_category:checked.line.cash_flow_category}},versionId):await applyMapping(db,tenant,actor,{mappingId,versionId});
  if(!result.ok)return result;
  // Reconcile obsolete contributions in this draft after a version switch.
  const old=await db.prepare("SELECT DISTINCT m.* FROM financial_line_catalog_mappings m JOIN budget_integration_values v ON v.mapping_id=m.id AND v.tenant_id=m.tenant_id WHERE m.tenant_id=? AND m.source_module='Investimentos' AND m.status='Inativo' AND m.line_id=? AND m.organization_id=? AND m.dimension_member_id IS ? AND m.currency=? AND v.version_id=?").bind(tenant,found.mapping.line_id,found.mapping.organization_id,found.mapping.dimension_member_id,found.mapping.currency,versionId).all<Row>();
  for(const row of old.results){ const ref=decode(row.source_reference);if(!ref||ref.channel!==found.reference.channel)continue;const retired=cashChannel(ref.channel)?await applyCashMapping(db,tenant,actor,row,versionId,true):await applyMapping(db,tenant,actor,{mappingId:String(row.id),versionId,retire:true});if(!retired.ok)return retired; }
  return result;
}

export async function investmentBudgetApi(request:Request,db:D1Database,tenant:string,scope:string|null,actor:string) {
  try {
    const url=new URL(request.url);
    if(request.method==='GET') {
      const organizationId=scope||url.searchParams.get('organizationId')||'';
      const denied=await budgetOrganizationAccess(db,tenant,scope,organizationId);if(denied)return denied;
      const models=await db.prepare("SELECT id,name,currency,version_number,start_period,horizon_months FROM financial_models WHERE tenant_id=? AND organization_id=? AND status='Aprovado' ORDER BY created_at DESC").bind(tenant,organizationId).all();
      const modelId=url.searchParams.get('modelId')||'';
      const lines=await db.prepare("SELECT l.id,l.code,l.name,l.line_type FROM financial_model_lines l JOIN financial_models m ON m.id=l.model_id AND m.tenant_id=l.tenant_id WHERE l.tenant_id=? AND m.organization_id=? AND m.status='Aprovado' AND m.id=? AND l.line_type IN ('CAPEX','Custo','Financiamento') ORDER BY l.code").bind(tenant,organizationId,modelId).all();
      const mappings=await db.prepare("SELECT m.*,l.code,l.name FROM financial_line_catalog_mappings m JOIN financial_line_catalog l ON l.id=m.line_id AND l.tenant_id=m.tenant_id WHERE m.tenant_id=? AND m.organization_id=? AND m.source_module='Investimentos' ORDER BY m.created_at DESC").bind(tenant,organizationId).all<Row>();
      const versionId=url.searchParams.get('versionId')||'';
      const cash=await db.prepare("SELECT v.*,s.code snapshot_code,s.name snapshot_name,s.cash_flow_category snapshot_category FROM budget_integration_values v JOIN budget_versions b ON b.id=v.version_id AND b.tenant_id=v.tenant_id LEFT JOIN budget_version_line_snapshots s ON s.tenant_id=v.tenant_id AND s.version_id=v.version_id AND s.line_id=v.line_id WHERE v.tenant_id=? AND v.organization_id=? AND v.version_id=? AND v.source_module='Investimentos' AND v.financial_nature='Financeiro' ORDER BY v.period,v.line_id").bind(tenant,organizationId,versionId).all<Row>();
      const pending=await db.prepare("SELECT x.* FROM budget_integration_movements x JOIN financial_line_catalog_mappings m ON m.id=x.mapping_id AND m.tenant_id=x.tenant_id WHERE x.tenant_id=? AND m.organization_id=? AND m.source_module='Investimentos' AND m.status='Ativo' AND x.sync_state='PendenteConfirmacao'").bind(tenant,organizationId).all();
      const outside=await db.prepare("SELECT x.mapping_id,x.period,x.amount_minor FROM budget_integration_movements x JOIN financial_line_catalog_mappings m ON m.id=x.mapping_id AND m.tenant_id=x.tenant_id JOIN budget_versions b ON b.tenant_id=m.tenant_id AND b.id=? WHERE m.tenant_id=? AND m.organization_id=? AND m.source_module='Investimentos' AND m.status='Ativo' AND m.financial_nature='Financeiro' AND x.sync_state IN ('Atualizado','PendenteConfirmacao') AND substr(x.period,1,4)<>CAST(b.fiscal_year AS TEXT)").bind(versionId,tenant,organizationId).all();
      return Response.json({models:models.results,lines:lines.results,mappings:mappings.results.map(m=>({...m,reference:decode(m.source_reference)})),cash:cash.results,pending:pending.results,outside:outside.results});
    }
    if(request.method!=='POST')return bad('Método não permitido.',405);
    const body=await request.json() as Row;
    if(body.type==='create')return createInvestmentMapping(db,tenant,scope,actor,body);
    const mappingId=String(body.mappingId||'');const found=await mappingSource(db,tenant,scope,mappingId);if(found.error)return found.error;
    if(body.type==='sync')return syncInvestmentMapping(db,tenant,scope,mappingId);
    if(body.type==='confirm')return confirmMovements(db,tenant,mappingId,null);
    if(body.type==='apply')return applyInvestmentMapping(db,tenant,scope,actor,mappingId,String(body.versionId||''));
    if(body.type==='reactivate'){
      const checked=await destination(db,tenant,String(found.mapping.line_id),found.reference.channel);if(checked.error)return checked.error;
      const loaded=await source(db,tenant,scope,found.reference.modelId,found.reference.sourceLineId,found.reference.channel);if(loaded.error)return loaded.error;
      const result=await setMappingStatus(db,tenant,mappingId,'Ativo');if(!result.ok)return result;
      return syncInvestmentMapping(db,tenant,scope,mappingId);
    }
    if(body.type==='unlink'){
      const versionId=String(body.versionId||'');const draft=await requireDraftVersion(db,tenant,versionId);if(draft.error)return draft.error;
      const stopped=await setMappingStatus(db,tenant,mappingId,'Inativo');if(!stopped.ok)return stopped;
      return cashChannel(found.reference.channel)?applyCashMapping(db,tenant,actor,found.mapping,versionId,true):applyMapping(db,tenant,actor,{mappingId,versionId,retire:true});
    }
    return bad('Operação não suportada.');
  }catch(error){const fail=classifyDataError(error,'Não foi possível processar a integração de investimentos.');return Response.json({error:fail.message},{status:fail.status});}
}
