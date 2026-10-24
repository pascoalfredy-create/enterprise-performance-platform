import type {D1Database} from "../worker-configuration";
import { classifyDataError } from "../lib/api-error";
import { integrationRunActions } from "../lib/approval-policy";
type Security={tenantId:string;organizationId:string|null;email:string;role:string};
const uid=()=>crypto.randomUUID();
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,"0")).join("");
export async function integrationsApi(request:Request,db:D1Database,security:Security){
 try{
  const tenant=security.tenantId,scope=security.organizationId,now=new Date().toISOString();
  const snapshot=async()=>{const [sources,runs,mappings,organizations,audit]=await Promise.all([
   db.prepare("SELECT s.*,(SELECT COUNT(*) FROM integration_runs r WHERE r.tenant_id=s.tenant_id AND r.source_id=s.id AND (? IS NULL OR r.organization_id=?)) run_count FROM integration_sources s WHERE s.tenant_id=? ORDER BY s.name").bind(scope,scope,tenant).all(),
   db.prepare("SELECT r.*,s.name source_name,s.code source_code,o.name organization_name FROM integration_runs r JOIN integration_sources s ON s.id=r.source_id AND s.tenant_id=r.tenant_id LEFT JOIN organizations o ON o.id=r.organization_id AND o.tenant_id=r.tenant_id WHERE r.tenant_id=? AND (? IS NULL OR r.organization_id=?) ORDER BY r.created_at DESC LIMIT 100").bind(tenant,scope,scope).all(),
   db.prepare("SELECT source_system,COUNT(*) mapping_count FROM financial_source_mappings WHERE tenant_id=? GROUP BY source_system ORDER BY source_system").bind(tenant).all(),
   db.prepare("SELECT id,code,name FROM organizations WHERE tenant_id=? AND (? IS NULL OR id=?) AND status='Ativa' ORDER BY name").bind(tenant,scope,scope).all(),
   scope?Promise.resolve({results:[]}):db.prepare("SELECT * FROM audit_events WHERE tenant_id=? AND entity_type IN ('integrationSource','integrationRun') ORDER BY created_at DESC LIMIT 20").bind(tenant).all()
  ]);return{sources:sources.results,runs:runs.results.map(run=>({...run,actions:integrationRunActions(run as {status:string;validated_by?:unknown},security.email,security.role)})),capabilities:{canWrite:["Administrador","Financeiro"].includes(security.role),canConfigure:!scope&&["Administrador","Financeiro"].includes(security.role)},mappings:mappings.results,organizations:organizations.results,audit:audit.results}};
  if(request.method==="GET")return Response.json(await snapshot());
  if(request.method!=="POST")return Response.json({error:"Método não permitido."},{status:405});
  if(!["Administrador","Financeiro"].includes(security.role))return Response.json({error:"O seu perfil permite apenas consulta."},{status:403});
  const body=await request.json() as Record<string,string>;let entityId="",summary="";
  if(body.type==="createSource"){
   if(scope)return Response.json({error:"A configuração de fontes exige âmbito de todo o tenant."},{status:403});
   if(!body.code?.trim()||!body.name?.trim()||!["API","SFTP","Ficheiro","Base de dados"].includes(body.connectorType)||!["Entrada","Saída","Bidirecional"].includes(body.direction))return Response.json({error:"Código, nome, conector e direção são obrigatórios."},{status:400});
   entityId=uid();summary=`Fonte ${body.code.trim().toUpperCase()} criada`;
   await db.batch([db.prepare("INSERT INTO integration_sources VALUES (?,?,?,?,?,?,?,?,?)").bind(entityId,tenant,body.code.trim().toUpperCase(),body.name.trim(),body.connectorType,body.direction,"Ativa",security.email,now),db.prepare("INSERT INTO audit_events (id,tenant_id,actor,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(uid(),tenant,security.email,"integration.source.created","integrationSource",entityId,summary,now)]);
  }else if(body.type==="receiveRun"){
   const organizationId=scope||body.organizationId,count=Number(body.recordCount);
   if(!body.sourceId||!organizationId||!body.idempotencyKey?.trim()||!Number.isSafeInteger(count)||count<0)return Response.json({error:"Fonte, organização, chave idempotente e quantidade válida são obrigatórias."},{status:400});
   if(scope&&body.organizationId&&body.organizationId!==scope)return Response.json({error:"Organização fora do âmbito autorizado."},{status:403});
   const existing=await db.prepare("SELECT id,source_id,organization_id,record_count FROM integration_runs WHERE tenant_id=? AND idempotency_key=?").bind(tenant,body.idempotencyKey.trim()).first<{id:string;source_id:string;organization_id:string;record_count:number}>();
   if(existing){
    if(existing.source_id!==body.sourceId||existing.organization_id!==organizationId||existing.record_count!==count)return Response.json({error:"A chave já foi utilizada para dados diferentes.",code:"IDEMPOTENCY_CONFLICT"},{status:409});
    return Response.json({...await snapshot(),idempotent:true});
   }
   const source=await db.prepare("SELECT status,direction FROM integration_sources WHERE id=? AND tenant_id=?").bind(body.sourceId,tenant).first<{status:string;direction:string}>();
   if(!source||source.status!=="Ativa"||!["Entrada","Bidirecional"].includes(source.direction))return Response.json({error:"Escolha uma fonte ativa que permita receber dados."},{status:409});
   if(!await db.prepare("SELECT id FROM organizations WHERE id=? AND tenant_id=? AND status='Ativa'").bind(organizationId,tenant).first())return Response.json({error:"Organização ativa não encontrada no âmbito autorizado."},{status:403});
   const next=await db.prepare("SELECT COALESCE(MAX(run_number),0)+1 next FROM integration_runs WHERE tenant_id=? AND source_id=?").bind(tenant,body.sourceId).first<{next:number}>();entityId=uid();summary=`Execução ${next?.next||1} recebida`;
   const inputHash=await hash(`${tenant}|${body.sourceId}|${organizationId}|${body.idempotencyKey.trim()}|${count}`);
   await db.batch([db.prepare("INSERT INTO integration_runs (id,tenant_id,source_id,organization_id,run_number,idempotency_key,status,record_count,accepted_count,rejected_count,input_hash,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(entityId,tenant,body.sourceId,organizationId,next?.next||1,body.idempotencyKey.trim(),"Recebida",count,0,0,inputHash,security.email,now),db.prepare("INSERT INTO audit_events (id,tenant_id,actor,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(uid(),tenant,security.email,"integration.run.received","integrationRun",entityId,summary,now)]);
  }else if(body.type==="validateRun"){
   const accepted=Number(body.acceptedCount),rejected=Number(body.rejectedCount);if(!body.runId||!Number.isSafeInteger(accepted)||!Number.isSafeInteger(rejected)||accepted<0||rejected<0)return Response.json({error:"Execução e contagens válidas são obrigatórias."},{status:400});
   const update=db.prepare("UPDATE integration_runs SET status='Validada',accepted_count=?,rejected_count=?,validated_by=?,validated_at=? WHERE id=? AND tenant_id=? AND status='Recebida' AND record_count=? AND (? IS NULL OR organization_id=?)").bind(accepted,rejected,security.email,now,body.runId,tenant,accepted+rejected,scope,scope);
   const changed=await db.batch([update,db.prepare("INSERT INTO audit_events (id,tenant_id,actor,action,entity_type,entity_id,summary,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1").bind(uid(),tenant,security.email,"integration.validateRun","integrationRun",body.runId,"Execução validada",now)]);
   if(!Number(changed[0].meta.changes||0))return Response.json({error:"As contagens não reconciliam ou a execução foi alterada."},{status:409});
  }else if(body.type==="decideRun"){
   if(!body.runId||!["Aprovada","Rejeitada"].includes(body.decision)||!body.note?.trim())return Response.json({error:"Execução, decisão e nota são obrigatórias."},{status:400});
   const current=await db.prepare("SELECT status,validated_by FROM integration_runs WHERE id=? AND tenant_id=? AND (? IS NULL OR organization_id=?)").bind(body.runId,tenant,scope,scope).first<{status:string;validated_by:string|null}>();
   if(!current)return Response.json({error:"Execução não encontrada no âmbito autorizado."},{status:404});
   const action=integrationRunActions(current,security.email,security.role).decide;
   if(!action.allowed)return Response.json({error:action.reason,code:"APPROVAL_BLOCKED"},{status:current.status==="Validada"?403:409});
   const update=db.prepare("UPDATE integration_runs SET status=?,decided_by=?,decided_at=?,decision_note=? WHERE id=? AND tenant_id=? AND status='Validada' AND validated_by<>? COLLATE NOCASE AND (? IS NULL OR organization_id=?)").bind(body.decision,security.email,now,body.note.trim(),body.runId,tenant,security.email,scope,scope);
   const changed=await db.batch([update,db.prepare("INSERT INTO audit_events (id,tenant_id,actor,action,entity_type,entity_id,summary,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1").bind(uid(),tenant,security.email,"integration.decideRun","integrationRun",body.runId,`Execução ${body.decision.toLowerCase()}`,now)]);
   if(!Number(changed[0].meta.changes||0))return Response.json({error:"A decisão exige maker-checker e estado Validada."},{status:409});
  }else return Response.json({error:"Comando de integração desconhecido."},{status:400});
  return Response.json(await snapshot(),{status:201});
 }catch(error){const x=classifyDataError(error,"Não foi possível processar a integração.");return Response.json({error:x.message,code:x.code},{status:x.status})}
}
