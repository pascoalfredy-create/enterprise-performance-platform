import {managementIncome} from '../lib/management-income';
import type {D1Database} from '../worker-configuration';
import {financialScope} from './financial-scope';
import {parseMoneyMinor} from '../lib/money';
import {classifyDataError} from '../lib/api-error';
type Security={tenantId:string;organizationId:string|null;email:string;role:string};
export async function managementActualsApi(request:Request,db:D1Database,security:Security):Promise<Response>{try{
 const {scope,currency,period:selected}=await financialScope(request,db,security),tenant=security.tenantId,period=selected||new Date().toISOString().slice(0,7),canWrite=['Administrador','Financeiro','Gestor'].includes(security.role);
 if(request.method==='POST'){
  if(!canWrite)return Response.json({error:'Apenas consulta.'},{status:403});
  const body=await request.json() as Record<string,string>,now=new Date().toISOString(),id=crypto.randomUUID();
  if(!['saveActual','deleteActual'].includes(body.type))return Response.json({error:'Operação inválida.'},{status:400});
  const original=body.id?await db.prepare('SELECT e.*,m.id,m.entry_id,m.revision,m.reference,m.category,l.classification FROM management_actuals m JOIN performance_entries e ON e.id=m.entry_id AND e.tenant_id=m.tenant_id JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE m.id=? AND m.tenant_id=? AND (? IS NULL OR e.organization_id=?)').bind(body.id,tenant,scope,scope).first<Record<string,unknown>>():null;
  if(body.id&&!original)return Response.json({error:'Registo não encontrado.'},{status:404});
  if(original&&Number(body.revision)!==Number(original.revision))return Response.json({error:'Registo alterado. Atualize antes de corrigir.'},{status:409});
  const statements=[];
  if(body.type==='deleteActual'){
   if(!original)return Response.json({error:'Registo não encontrado.'},{status:404});
   statements.push(db.prepare('DELETE FROM performance_entries WHERE id=? AND tenant_id=? AND changes()>0').bind(original.entry_id,tenant));
   // Remove the management pointer first for foreign-key integrity.
   statements.unshift(db.prepare('DELETE FROM management_actuals WHERE id=? AND tenant_id=? AND revision=?').bind(body.id,tenant,Number(body.revision)));
  }else{
   const org=original?.organization_id||scope||body.organizationId,amount=parseMoneyMinor(body.amount);
   if(!org||!body.description?.trim()||!body.reference?.trim()||!['Receita','Custo'].includes(body.classification)||amount<=0)return Response.json({error:'Indique organização, receita/custo, descrição, referência e valor positivo.'},{status:400});
   if(!await db.prepare("SELECT id FROM organizations WHERE id=? AND tenant_id=? AND status='Ativa'").bind(org,tenant).first())return Response.json({error:'Organização inválida.'},{status:403});
   const category=(body.category||body.description).trim();
   if(!category||category.length>100||body.description.length>160||body.reference.length>160)return Response.json({error:'Categoria até 100 caracteres; descrição e referência até 160.'},{status:400});
   const code=String(original?.line_code||'MG_'+id),entryId=original?.entry_id||crypto.randomUUID();
   if(original){
    statements.push(db.prepare('UPDATE management_actuals SET revision=revision+1,reference=?,category=?,mutation_id=? WHERE id=? AND tenant_id=? AND revision=?').bind(body.reference.trim(),category,id,body.id,tenant,Number(body.revision)));
    statements.push(db.prepare('UPDATE performance_entries SET period=?,currency=?,line_name=?,amount_minor=? WHERE id=? AND tenant_id=? AND EXISTS(SELECT 1 FROM management_actuals WHERE id=? AND tenant_id=? AND mutation_id=?)').bind(period,currency,body.description.trim(),amount,entryId,tenant,body.id,tenant,id));
    statements.push(db.prepare('UPDATE financial_line_catalog SET name=?,classification=? WHERE tenant_id=? AND code=? AND EXISTS(SELECT 1 FROM management_actuals WHERE id=? AND tenant_id=? AND mutation_id=?)').bind(body.description.trim(),body.classification,tenant,code,body.id,tenant,id));
   }else{
    statements.push(db.prepare("INSERT INTO financial_line_catalog VALUES (?,?,?,?,?,'Operacional','Natural','Ativa',?,?)").bind(crypto.randomUUID(),tenant,code,body.description.trim(),body.classification,security.email,now));
    statements.push(db.prepare("INSERT INTO performance_entries (id,tenant_id,created_at,organization_id,period,scenario,version_id,currency,line_code,line_name,amount_minor,source) VALUES (?,?,?,?,?,'Actual',NULL,?,?,?,?,'Gestão manual')").bind(entryId,tenant,now,org,period,currency,code,body.description.trim(),amount));
    statements.push(db.prepare('INSERT INTO management_actuals (id,tenant_id,entry_id,revision,reference,category) VALUES (?,?,?,0,?,?)').bind(id,tenant,entryId,body.reference.trim(),category));
   }
  }
  statements.push(db.prepare('INSERT INTO audit_events (id,tenant_id,created_at,action,entity_type,entity_id,actor,summary) SELECT ?,?,?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),tenant,now,body.type,'managementActual',body.id||id,security.email,JSON.stringify({before:original,after:body})));
  const results=await db.batch(statements);
  if(original&&!Number(results[0].meta.changes))return Response.json({error:"Registo alterado. Atualize os dados."},{status:409});
  return managementActualsApi(new Request(request.url),db,security);
 }
 if(request.method!=='GET')return Response.json({error:'Método não permitido.'},{status:405});
 const rows=await db.prepare('SELECT m.id,m.revision,m.reference,e.organization_id,o.name organization_name,e.period,e.currency,e.line_name description,e.amount_minor,m.category,l.classification FROM management_actuals m JOIN performance_entries e ON e.id=m.entry_id AND e.tenant_id=m.tenant_id JOIN organizations o ON o.id=e.organization_id AND o.tenant_id=e.tenant_id JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE m.tenant_id=? AND e.period=? AND e.currency=? AND (? IS NULL OR e.organization_id=?) ORDER BY e.created_at DESC').bind(tenant,period,currency,scope,scope).all();
 const organizations=await db.prepare("SELECT id,name FROM organizations WHERE tenant_id=? AND (? IS NULL OR id=?) AND status='Ativa' ORDER BY name").bind(tenant,scope,scope).all();
 const entries=await db.prepare("SELECT e.id entry_id,e.line_code,e.organization_id,o.name organization_name,e.line_name description,e.amount_minor,e.source,COALESCE(l.classification,'Por classificar') classification,COALESCE(NULLIF(m.category,''),l.name,e.line_name) category,m.id manual_id,m.revision,m.reference FROM performance_entries e JOIN organizations o ON o.id=e.organization_id AND o.tenant_id=e.tenant_id LEFT JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code LEFT JOIN management_actuals m ON m.tenant_id=e.tenant_id AND m.entry_id=e.id WHERE e.tenant_id=? AND e.scenario='Actual' AND e.version_id IS NULL AND e.period=? AND e.currency=? AND (? IS NULL OR e.organization_id=?) ORDER BY e.created_at DESC,e.id").bind(tenant,period,currency,scope,scope).all<{entry_id:string;classification:string;category:string;amount_minor:number}>();
 const categories=await db.prepare("SELECT DISTINCT m.category,l.classification FROM management_actuals m JOIN performance_entries e ON e.id=m.entry_id AND e.tenant_id=m.tenant_id JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE m.tenant_id=? AND (? IS NULL OR e.organization_id=?) AND m.category<>'' ORDER BY m.category").bind(tenant,scope,scope).all();
 return Response.json({rows:rows.results,entries:entries.results,analysis:managementIncome(entries.results),categories:categories.results,organizations:organizations.results,period,currency,canWrite});
}catch(error){const failure=classifyDataError(error,'Não foi possível guardar os dados.');return Response.json({error:failure.message},{status:failure.status})}}

