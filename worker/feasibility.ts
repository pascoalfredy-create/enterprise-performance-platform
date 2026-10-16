import type {D1Database} from '../worker-configuration';
import {isCurrency} from '../lib/money';
import {financialScope} from './financial-scope';
import {feasibility,feasibilityDefaults,type FeasibilityAssumptions} from '../lib/feasibility-engine';
import {classifyDataError} from '../lib/api-error';
type Security={tenantId:string;organizationId:string|null;email:string;role:string};
export async function feasibilityApi(request:Request,db:D1Database,security:Security):Promise<Response>{try{
 let savedStudyId:string|undefined;
 const {scope}=await financialScope(request,db,security),tenant=security.tenantId,canWrite=['Administrador','Financeiro','Gestor'].includes(security.role);
 if(request.method==='POST'){
  if(!canWrite)return Response.json({error:'Apenas consulta.'},{status:403});
  const body=await request.json() as {id?:string;revision?:number;name:string;organizationId:string;currency:string;assumptions:FeasibilityAssumptions},org=scope||body.organizationId;
  if(!body.name?.trim()||!org||!await db.prepare("SELECT id FROM organizations WHERE id=? AND tenant_id=? AND status='Ativa'").bind(org,tenant).first()||!isCurrency(body.currency||''))return Response.json({error:'Indique nome, organização e moeda.'},{status:400});
  if(!body.assumptions||Object.keys(body.assumptions).some(key=>!Object.keys(feasibilityDefaults).includes(key)&&key!=='activityPeriod')||Object.keys(feasibilityDefaults).some(key=>!(key in body.assumptions)))return Response.json({error:'Premissas incompletas.'},{status:400});
  feasibility(body.assumptions);
  const id=body.id||crypto.randomUUID(),now=new Date().toISOString(),original=body.id?await db.prepare('SELECT * FROM feasibility_studies WHERE id=? AND tenant_id=? AND organization_id=?').bind(id,tenant,org).first<Record<string,unknown>>():null;
  if(body.id&&(!original||Number(original.revision)!==body.revision))return Response.json({error:'Estudo alterado ou indisponível. Atualize antes de guardar.'},{status:409});
  const statement=original?db.prepare('UPDATE feasibility_studies SET name=?,currency=?,assumptions_json=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND tenant_id=? AND organization_id=? AND revision=?').bind(body.name.trim(),body.currency,JSON.stringify(body.assumptions),security.email,now,id,tenant,org,body.revision):db.prepare('INSERT INTO feasibility_studies VALUES (?,?,?,?,?,?,0,?,?)').bind(id,tenant,org,body.name.trim(),body.currency,JSON.stringify(body.assumptions),security.email,now);
  const results=await db.batch([statement,db.prepare('INSERT INTO audit_events (id,tenant_id,created_at,action,entity_type,entity_id,actor,summary) SELECT ?,?,?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),tenant,now,'saveFeasibility','feasibility',id,security.email,JSON.stringify({before:original,after:body}))]);
  if(!Number(results[0].meta.changes))return Response.json({error:'Estudo alterado. Atualize antes de guardar.'},{status:409});
  savedStudyId=id;
 }else if(request.method!=='GET')return Response.json({error:'Método não permitido.'},{status:405});
 const studies=await db.prepare('SELECT * FROM feasibility_studies WHERE tenant_id=? AND (? IS NULL OR organization_id=?) ORDER BY updated_at DESC').bind(tenant,scope,scope).all(),organizations=await db.prepare("SELECT id,name,currency FROM organizations WHERE tenant_id=? AND (? IS NULL OR id=?) AND status='Ativa' ORDER BY name").bind(tenant,scope,scope).all();
 return Response.json({canWrite,studies:studies.results,organizations:organizations.results,...(savedStudyId?{savedStudyId}:{})});
}catch(error){const failure=classifyDataError(error,'Não foi possível guardar o estudo.');return Response.json({error:error instanceof Error&&/^(Reveja|Premissa|Valor da projeção)/.test(error.message)?error.message:failure.message},{status:error instanceof Error&&/^(Reveja|Premissa|Valor da projeção)/.test(error.message)?400:failure.status})}}

