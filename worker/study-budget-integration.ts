import type {D1Database} from '../worker-configuration';
import {buildPlanningModel,type StudyAssumptions} from '../lib/feasibility-planning';
import {compareStudyYearOne,type StudyBridgeComponent} from '../lib/budget-study-bridge';
import {budgetOrganizationAccess} from './budget-authorization';
import {requireDraftVersion,fiscalYearPeriods} from './budget-annual-map';
import {createMapping,checkForUpdates,applyMapping,setMappingStatus,type SourceValue} from './budget-integration';
import {classifyDataError} from '../lib/api-error';
type Row=Record<string,unknown>;
const bad=(error:string,status=400)=>Response.json({error},{status});
const hash=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
/** A confirmed saved study revision is a planning source, never a real transaction.
 * Every application freezes the actual input snapshot and monthly values through
 * the common integration engine. Future study revisions require a new preview.
 */
export async function studyBudgetApi(request:Request,db:D1Database,tenant:string,scope:string|null,actor:string,canWrite=true){try{
 if(request.method==='GET'){const q=new URL(request.url).searchParams;if(q.has('evidence')){const snapshot=await db.prepare('SELECT * FROM study_budget_source_snapshots WHERE id=? AND tenant_id=?').bind(q.get('evidence'),tenant).first<Row>();if(!snapshot)return bad('Origem indisponível.',404);const denied=await budgetOrganizationAccess(db,tenant,scope,snapshot.organization_id);if(denied)return denied;return Response.json({snapshot});}const org=q.get('organizationId')||'',versionId=q.get('versionId')||'',lineId=q.get('lineId')||'',currency=q.get('currency')||'';const denied=await budgetOrganizationAccess(db,tenant,scope,org);if(denied)return denied;const version=await db.prepare('SELECT status FROM budget_versions WHERE id=? AND tenant_id=?').bind(versionId,tenant).first<Row>();if(!version)return bad('Versão indisponível.',404);const rows=(await db.prepare("SELECT id,source_reference FROM financial_line_catalog_mappings WHERE tenant_id=? AND organization_id=? AND line_id=? AND currency=? AND source_module='Financeiro' AND status='Ativo'").bind(tenant,org,lineId,currency).all<Row>()).results;const mappings=rows.flatMap(row=>{try{const reference=JSON.parse(String(row.source_reference));return reference.kind==='study-year-one'&&reference.versionId===versionId?[{id:row.id,reference}]:[]}catch{return []}});return Response.json({canWrite:canWrite&&version.status!=='Aprovado',mappings});}
 if(request.method!=='POST')return bad('Método não permitido.',405);
 if(!canWrite)return bad('Apenas consulta.',403);
 const body=await request.json() as Row;
 if(body.type==='unlink'){const mapping=await db.prepare("SELECT * FROM financial_line_catalog_mappings WHERE id=? AND tenant_id=? AND source_module='Financeiro'").bind(String(body.mappingId||''),tenant).first<Row>();if(!mapping)return bad('Ligação indisponível.',404);const denied=await budgetOrganizationAccess(db,tenant,scope,mapping.organization_id);if(denied)return denied;const reference=JSON.parse(String(mapping.source_reference));if(reference.kind!=='study-year-one'||reference.versionId!==body.versionId)return bad('Ligação incompatível.');const draft=await requireDraftVersion(db,tenant,String(body.versionId));if(draft.error)return draft.error;const stopped=await setMappingStatus(db,tenant,String(mapping.id),'Inativo');if(!stopped.ok)return stopped;try{const retired=await applyMapping(db,tenant,actor,{mappingId:String(mapping.id),versionId:String(body.versionId),retire:true,requireAllCells:true});if(!retired.ok)await setMappingStatus(db,tenant,String(mapping.id),'Ativo');return retired;}catch(error){await setMappingStatus(db,tenant,String(mapping.id),'Ativo');throw error;}}
 if(!['preview','apply'].includes(String(body.type)))return bad('Operação inválida.');
 const {organizationId,versionId,studyId,lineId,firstPeriod,component}=Object.fromEntries(['organizationId','versionId','studyId','lineId','firstPeriod','component'].map(k=>[k,String(body[k]||'')]));
 const denied=await budgetOrganizationAccess(db,tenant,scope,organizationId);if(denied)return denied;
 if(body.dimensionMemberId!==null&&body.dimensionMemberId!==undefined&&body.dimensionMemberId!=='__NONE__')return bad('O estudo não contém repartição por centros de custo.');
 const draft=await requireDraftVersion(db,tenant,versionId);if(draft.error)return draft.error;
 const study=await db.prepare('SELECT * FROM feasibility_studies WHERE id=? AND tenant_id=? AND organization_id=?').bind(studyId,tenant,organizationId).first<Row>();
 if(!study)return bad('Estudo fora do âmbito autorizado.',404);
 if(study.revision!==body.revision||study.currency!==body.currency)return bad('A revisão ou moeda da origem mudou. Volte a preparar a proposta.',409);
 const line=await db.prepare("SELECT * FROM financial_line_catalog WHERE id=? AND tenant_id=? AND line_kind='Analítica' AND status='Ativa'").bind(lineId,tenant).first<Row>();
 if(!line)return bad('Escolha uma rubrica analítica ativa.');
 const input=JSON.parse(String(study.assumptions_json)) as StudyAssumptions;
 if(!input.planning)return bad('Guarde os pressupostos integrados do estudo antes de preparar a proposta.');
 const model=buildPlanningModel(input),periods=fiscalYearPeriods(draft.version!.fiscal_year);
 const comparison=compareStudyYearOne({organizationId,currency:String(study.currency),monthly:model.monthly},{organizationId,currency:String(body.currency),dimensionMemberId:'__NONE__',classification:String(line.classification),cashFlowCategory:String(line.cash_flow_category),monthly:periods.map(period=>({period,amountMinor:0}))},firstPeriod,component as StudyBridgeComponent);
 // A study component cannot replace manually entered budget values silently.
 // Existing adjustments and overrides remain owned by the common budget engine.
 const entries=(await db.prepare("SELECT * FROM performance_entries WHERE tenant_id=? AND version_id=? AND scenario='Budget' AND organization_id=? AND currency=? AND line_code=? AND dimension_member_id IS NULL ORDER BY period,id").bind(tenant,versionId,organizationId,study.currency,line.code).all<Row>()).results;
 const assumptions=(await db.prepare("SELECT * FROM budget_assumptions WHERE tenant_id=? AND organization_id=? AND version_id=? AND line_id=? AND currency=? AND dimension_member_id IS NULL ORDER BY id").bind(tenant,organizationId,versionId,lineId,study.currency).all<Row>()).results;
 if(assumptions.some(a=>a.status==='Ativo'))return bad('Esta rubrica já tem pressupostos ativos. Use uma rubrica distinta ou retire esses pressupostos antes de integrar o estudo.',409);
 if(entries.some(e=>e.manual_override||e.adjustment_mode||e.manual_adjustment_minor||!e.integration_value_id&&Number(e.amount_minor)!==0))return bad('A rubrica contém valores manuais ou ajustes. Reconcilie-os antes de aplicar a proposta; não serão substituídos.',409);
 const reference=JSON.stringify({kind:'study-year-one',versionId,studyId,firstPeriod,component});
 const mappings=(await db.prepare("SELECT * FROM financial_line_catalog_mappings WHERE tenant_id=? AND source_module='Financeiro' AND source_reference=? AND status='Ativo'").bind(tenant,reference).all<Row>()).results;
 if(mappings.length>1)return bad('Origem com ligações duplicadas. Reveja a configuração.',409);
 const mapping=mappings[0]||await db.prepare("SELECT * FROM financial_line_catalog_mappings WHERE tenant_id=? AND source_module='Financeiro' AND source_reference=? AND line_id=? AND organization_id=? AND currency=? AND dimension_member_id IS NULL AND status='Inativo'").bind(tenant,reference,lineId,organizationId,study.currency).first<Row>();if(mapping&&(mapping.line_id!==lineId||mapping.organization_id!==organizationId||mapping.currency!==study.currency||mapping.dimension_member_id!==null))return bad('Esta componente já está associada a outra rubrica ou âmbito.',409);
 const conflicts=(await db.prepare("SELECT * FROM financial_line_catalog_mappings WHERE tenant_id=? AND line_id=? AND organization_id=? AND currency=? AND dimension_member_id IS NULL AND financial_nature='Economico' AND status='Ativo' ORDER BY id").bind(tenant,lineId,organizationId,study.currency).all<Row>()).results;
 // This initial transfer is intentionally exclusive: RH/ERP and other project
 // components must not be counted twice. Allocation/aggregation needs its own map.
 if(conflicts.some(m=>m.id!==mapping?.id))return bad('A rubrica já recebe outra origem. Escolha uma rubrica exclusiva para esta componente.',409);
 const rows=comparison.rows.filter(r=>r.studyMinor!==null).map(r=>({period:r.period,amountMinor:r.studyMinor!}));
 if(!rows.length)return bad('O primeiro ano do estudo não intersecta o exercício selecionado.');
 const context={versionId,organizationId,studyId,revision:study.revision,studyName:study.name,currency:study.currency,lineId,lineCode:line.code,lineName:line.name,firstPeriod,component,inputSnapshot:input,rows,entries,assumptions,mappingId:mapping?.id||null};
 const token=await hash(context),preview={token,studyId,revision:study.revision,studyName:study.name,versionId,lineId,rows,initialPeriod:comparison.initialPeriod,initialCapexMinor:comparison.initialCapexMinor,outsideMonths:comparison.outsideMonths};
 if(body.type==='preview')return Response.json(preview);
 if(body.confirmSource!==true||body.token!==token)return bad('A proposta mudou ou não foi confirmada. Volte a preparar e conferir.',409);
 let mappingId=mapping?String(mapping.id):'';
 if(!mappingId){const created=await createMapping(db,tenant,actor,{organizationId,lineId,currency:study.currency,sourceModule:'Financeiro',sourceReference:reference,financialNature:'Economico',dimensionMemberId:null,syncPolicy:'Automatica',relationPolicy:'Exclusiva'});if(!created.ok)return created;mappingId=(await created.json() as {id:string}).id;}
 if(mapping?.status==='Inativo'){const activated=await setMappingStatus(db,tenant,mappingId,'Ativo');if(!activated.ok)return activated;}
 const sourceHash=await hash({organizationId,studyId,revision:study.revision,currency:study.currency,inputs:input,calculatorVersion:'study-planning-20261023.2'});await db.prepare('INSERT OR IGNORE INTO study_budget_source_snapshots VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(sourceHash,tenant,organizationId,studyId,study.revision,study.name,study.currency,JSON.stringify(input),'study-planning-20261023.2',actor,new Date().toISOString()).run();
 const evidence={calculatorVersion:'study-planning-20261023.2',kind:'study-year-one',studyId,studyName:study.name,revision:study.revision,firstPeriod,component,modelVersion:3,inputSnapshotHash:sourceHash};
 const values:SourceValue[]=rows.map(row=>({organizationId,sourceModule:'Financeiro',sourceReference:studyId+':'+component+':'+row.period,componentLabel:String(study.name)+' · r'+study.revision+' · '+component,period:row.period,currency:String(study.currency),dimensionMemberId:null,financialNature:'Economico',amountMinor:row.amountMinor,sourceStatus:'Revisão guardada confirmada',sourceFingerprint:JSON.stringify({...evidence,period:row.period,amountMinor:row.amountMinor})}));
 const synced=await checkForUpdates(db,tenant,mappingId,values,{fromPeriod:periods[0],toPeriod:periods[11]});if(!synced.ok)return synced;
 const applied=await applyMapping(db,tenant,actor,{mappingId,versionId,requireAllCells:true,sourceSnapshotHash:sourceHash});if(!applied.ok)return applied;
 return Response.json({...await applied.json() as Row,mappingId,revision:study.revision,initialCapexExcluded:component!=='initialCapex'});
}catch(error){const failure=classifyDataError(error,'Não foi possível preparar ou aplicar a proposta do estudo.');return bad(failure.message,failure.status);}}
