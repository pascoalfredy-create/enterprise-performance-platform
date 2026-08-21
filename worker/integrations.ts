import { classifyDataError } from "../lib/api-error";
type Security={tenantId:string;organizationId:string|null;email:string;role:string};
const uid=()=>crypto.randomUUID();
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,"0")).join("");
export async function integrationsApi(request:Request,db:D1Database,security:Security){
 try{
  const tenant=security.tenantId,scope=security.organizationId,now=new Date().toISOString();
  const snapshot=async()=>{const [sources,runs,mappings,organizations,audit]=await Promise.all([
   db.prepare("SELECT s.*,(SELECT COUNT(*) FROM integration_runs r WHERE r.tenant_id=s.tenant_id AND r.source_id=s.id) run_count FROM integration_sources s WHERE s.tenant_id=? ORDER BY s.name").bind(tenant).all(),
   db.prepare("SELECT r.*,s.name source_name,s.code source_code,o.name organization_name FROM integration_runs r JOIN integration_sources s ON s.id=r.source_id AND s.tenant_id=r.tenant_id LEFT JOIN organizations o ON o.id=r.organization_id AND o.tenant_id=r.tenant_id WHERE r.tenant_id=? AND (? IS NULL OR r.organization_id=?) ORDER BY r.created_at DESC LIMIT 100").bind(tenant,scope,scope).all(),
   db.prepare("SELECT source_system,COUNT(*) mapping_count FROM financial_source_mappings WHERE tenant_id=? GROUP BY source_system ORDER BY source_system").bind(tenant).all(),
   db.prepare("SELECT id,code,name FROM organizations WHERE tenant_id=? AND (? IS NULL OR id=?) AND status='Ativa' ORDER BY name").bind(tenant,scope,scope).all(),
   db.prepare("SELECT * FROM audit_events WHERE tenant_id=? AND entity_type IN ('integrationSource','integrationRun') ORDER BY created_at DESC LIMIT 20").bind(tenant).all()
  ]);return{sources:sources.results,runs:runs.results,mappings:mappings.results,organizations:organizations.results,audit:audit.results}};
  if(request.method==="GET")return Response.json(await snapshot());
  if(request.method!=="POST")return Response.json({error:"Método não permitido."},{status:405});
  const body=await request.json() as Record<string,string>;let entityId="",summary="";
  if(body.type==="createSource"){
   if(scope)return Response.json({error:"A configuração de fontes exige âmbito de todo o tenant."},{status:403});
   if(!body.code?.trim()||!body.name?.trim()||!["API","SFTP","Ficheiro","Base de dados"].includes(body.connectorType)||!["Entrada","Saída","Bidirecional"].includes(body.direction))return Response.json({error:"Código, nome, conector e direção são obrigatórios."},{status:400});
   entityId=uid();summary=`Fonte ${body.code.trim().toUpperCase()} criada`;
   await db.batch([db.prepare("INSERT INTO integration_sources VALUES (?,?,?,?,?,?,?,?,?)").bind(entityId,tenant,body.code.trim().toUpperCase(),body.name.trim(),body.connectorType,body.direction,"Ativa",security.email,now),db.prepare("INSERT INTO audit_events (id,tenant_id,actor,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(uid(),tenant,security.email,"integration.source.created","integrationSource",entityId,summary,now)]);
  }else if(body.type==="receiveRun"){
   const organizationId=scope||body.organizationId,count=Math.trunc(Number(body.recordCount));
   if(!body.sourceId||!organizationId||!body.idempotencyKey?.trim()||!Number.isSafeInteger(count)||count<0)return Response.json({error:"Fonte, organização, chave idempotente e quantidade válida são obrigatórias."},{status:400});
   const existing=await db.prepare("SELECT id FROM integration_runs WHERE tenant_id=? AND idempotency_key=?").bind(tenant,body.idempotencyKey.trim()).first();if(existing)return Response.json({...await snapshot(),idempotent:true});
   const next=await db.prepare("SELECT COALESCE(MAX(run_number),0)+1 next FROM integration_runs WHERE tenant_id=? AND source_id=?").bind(tenant,body.sourceId).first<{next:number}>();entityId=uid();summary=`Execução ${next?.next||1} recebida`;
   const inputHash=await hash(`${tenant}|${body.sourceId}|${organizationId}|${body.idempotencyKey.trim()}|${count}`);
   await db.batch([db.prepare("INSERT INTO integration_runs (id,tenant_id,source_id,organization_id,run_number,idempotency_key,status,record_count,accepted_count,rejected_count,input_hash,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(entityId,tenant,body.sourceId,organizationId,next?.next||1,body.idempotencyKey.trim(),"Recebida",count,0,0,inputHash,security.email,now),db.prepare("INSERT INTO audit_events (id,tenant_id,actor,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(uid(),tenant,security.email,"integration.run.received","integrationRun",entityId,summary,now)]);
  }else if(body.type==="validateRun"){
   const accepted=Math.trunc(Number(body.acceptedCount)),rejected=Math.trunc(Number(body.rejectedCount));if(!body.runId||accepted<0||rejected<0)return Response.json({error:"Execução e contagens válidas são obrigatórias."},{status:400});
   const changed=await db.prepare("UPDATE integration_runs SET status='Validada',accepted_count=?,rejected_count=?,validated_by=?,validated_at=? WHERE id=? AND tenant_id=? AND status='Recebida' AND record_count=?").bind(accepted,rejected,security.email,now,body.runId,tenant,accepted+rejected).run();if(!Number(changed.meta.changes||0))return Response.json({error:"As contagens não reconciliam ou a execução foi alterada."},{status:409});entityId=body.runId;summary="Execução validada";
  }else if(body.type==="decideRun"){
   if(!body.runId||!["Aprovada","Rejeitada"].includes(body.decision)||!body.note?.trim())return Response.json({error:"Execução, decisão e nota são obrigatórias."},{status:400});
   const changed=await db.prepare("UPDATE integration_runs SET status=?,decided_by=?,decided_at=?,decision_note=? WHERE id=? AND tenant_id=? AND status='Validada' AND validated_by<>?").bind(body.decision,security.email,now,body.note.trim(),body.runId,tenant,security.email).run();if(!Number(changed.meta.changes||0))return Response.json({error:"A decisão exige maker-checker e estado Validada."},{status:409});entityId=body.runId;summary=`Execução ${body.decision.toLowerCase()}`;
  }else return Response.json({error:"Comando de integração desconhecido."},{status:400});
  if(["validateRun","decideRun"].includes(body.type))await db.prepare("INSERT INTO audit_events (id,tenant_id,actor,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(uid(),tenant,security.email,`integration.${body.type}`,"integrationRun",entityId,summary,now).run();
  return Response.json(await snapshot(),{status:201});
 }catch(error){const x=classifyDataError(error,"Não foi possível processar a integração.");return Response.json({error:x.message,code:x.code},{status:x.status})}
}
