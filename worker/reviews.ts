import {classifyDataError} from "../lib/api-error";

type ReviewSecurity={tenantId:string;organizationId:string|null;email:string;role:string};
const id=()=>crypto.randomUUID();
const fail=(error:unknown)=>{const failure=classifyDataError(error,"Não foi possível processar a avaliação.");return Response.json({error:failure.message,code:failure.code},{status:failure.status})};
const rating=(value:string|undefined)=>{const n=Number(value);if(!Number.isInteger(n)||n<1||n>5)throw new Error("invalid review rating");return n*2000};

export async function reviewsApi(request:Request,db:D1Database,security:ReviewSecurity){
 try{
  const tenant=security.tenantId,scope=security.organizationId,now=new Date().toISOString();
  const snapshot=async()=>{const [reviews,cycles,people,organizations,development,audit]=await Promise.all([
   db.prepare("SELECT r.*,c.name cycle_name,o.name organization_name,s.name subject_name,v.name reviewer_name,(SELECT COUNT(*) FROM performance_review_goal_snapshots x WHERE x.tenant_id=r.tenant_id AND x.review_id=r.id) snapshot_count FROM performance_reviews r JOIN performance_cycles c ON c.id=r.cycle_id AND c.tenant_id=r.tenant_id JOIN organizations o ON o.id=r.organization_id AND o.tenant_id=r.tenant_id JOIN platform_users s ON lower(s.email)=lower(r.subject_email) AND s.tenant_id=r.tenant_id JOIN platform_users v ON lower(v.email)=lower(r.reviewer_email) AND v.tenant_id=r.tenant_id WHERE r.tenant_id=? AND (? IS NULL OR r.organization_id=?) ORDER BY r.created_at DESC").bind(tenant,scope,scope).all(),
   db.prepare("SELECT id,name,start_date,end_date,status FROM performance_cycles WHERE tenant_id=? AND status='Ativo' ORDER BY start_date DESC").bind(tenant).all(),
   db.prepare("SELECT name,email,role,organization_id FROM platform_users WHERE tenant_id=? AND status='Ativo' AND (? IS NULL OR organization_id IS NULL OR organization_id=?) ORDER BY name").bind(tenant,scope,scope).all(),
   db.prepare("SELECT id,code,name FROM organizations WHERE tenant_id=? AND status='Ativa' AND (? IS NULL OR id=?) ORDER BY name").bind(tenant,scope,scope).all(),
   db.prepare("SELECT d.*,r.subject_email FROM performance_development_items d JOIN performance_reviews r ON r.id=d.review_id AND r.tenant_id=d.tenant_id WHERE d.tenant_id=? AND (? IS NULL OR r.organization_id=?) ORDER BY CASE d.status WHEN 'Aberta' THEN 1 ELSE 2 END,d.due_date").bind(tenant,scope,scope).all(),
   scope?Promise.resolve({results:[]}):db.prepare("SELECT * FROM audit_events WHERE tenant_id=? AND entity_type IN ('performanceReview','developmentItem') ORDER BY created_at DESC LIMIT 12").bind(tenant).all()
  ]);return{reviews:reviews.results,cycles:cycles.results,people:people.results,organizations:organizations.results,development:development.results,audit:audit.results}};
  if(request.method==="GET")return Response.json(await snapshot());
  if(request.method!=="POST")return Response.json({error:"Método não permitido."},{status:405});
  const body=await request.json() as Record<string,string>;let entityId=body.reviewId||body.itemId||"";
  if(body.type==="createReview"){
   if(!["Administrador","Recursos Humanos","Gestor"].includes(security.role))return Response.json({error:"A criação exige Administrador, Recursos Humanos ou Gestor."},{status:403});
   if(!body.cycleId||!body.organizationId||!body.subjectEmail||!body.reviewerEmail)return Response.json({error:"Ciclo, organização, colaborador e gestor são obrigatórios."},{status:400});
   if(scope&&scope!==body.organizationId)return Response.json({error:"Avaliação fora do âmbito organizacional autorizado."},{status:403});
   entityId=id();await db.prepare("INSERT INTO performance_reviews (id,tenant_id,cycle_id,organization_id,subject_email,reviewer_email,status,created_by,created_at) VALUES (?,?,?,?,?,?,'Aguardando autoavaliação',?,?)").bind(entityId,tenant,body.cycleId,body.organizationId,body.subjectEmail.toLowerCase(),body.reviewerEmail.toLowerCase(),security.email,now).run();
  }else if(body.type==="selfReview"){
   const review=await db.prepare("SELECT * FROM performance_reviews WHERE id=? AND tenant_id=? AND status='Aguardando autoavaliação' AND (? IS NULL OR organization_id=?)").bind(body.reviewId,tenant,scope,scope).first<Record<string,unknown>>();
   if(!review)return Response.json({error:"Autoavaliação pendente não encontrada."},{status:404});
   if(String(review.subject_email).toLowerCase()!==security.email.toLowerCase())return Response.json({error:"A autoavaliação pertence exclusivamente ao colaborador avaliado."},{status:403});
   const result=await db.prepare("UPDATE performance_reviews SET status='Aguardando gestor',self_competency_bps=?,self_comment=?,self_submitted_at=? WHERE id=? AND tenant_id=? AND status='Aguardando autoavaliação'").bind(rating(body.rating),body.comment?.trim(),now,body.reviewId,tenant).run();
   if(!Number(result.meta.changes||0))return Response.json({error:"A avaliação foi atualizada em paralelo."},{status:409});
  }else if(body.type==="managerReview"){
   const review=await db.prepare("SELECT * FROM performance_reviews WHERE id=? AND tenant_id=? AND status='Aguardando gestor' AND (? IS NULL OR organization_id=?)").bind(body.reviewId,tenant,scope,scope).first<Record<string,unknown>>();
   if(!review)return Response.json({error:"Avaliação do gestor pendente não encontrada."},{status:404});
   if(String(review.reviewer_email).toLowerCase()!==security.email.toLowerCase())return Response.json({error:"A decisão pertence exclusivamente ao gestor designado."},{status:403});
   const goals=await db.prepare("SELECT g.*,(SELECT value_scaled FROM performance_goal_checkins c WHERE c.goal_id=g.id AND c.tenant_id=g.tenant_id ORDER BY c.checked_at DESC,c.id DESC LIMIT 1) current_scaled FROM performance_goals g WHERE g.tenant_id=? AND g.cycle_id=? AND g.organization_id=? AND lower(g.owner_email)=lower(?) AND g.status IN ('Ativo','Concluído')").bind(tenant,review.cycle_id,review.organization_id,review.subject_email).all<Record<string,unknown>>();
   if(!goals.results.length)return Response.json({error:"Não existem objetivos elegíveis para esta avaliação."},{status:409});
   let weighted=0,totalWeight=0;const snapshots=goals.results.map(g=>{const start=Number(g.start_scaled),target=Number(g.target_scaled),current=g.current_scaled==null?start:Number(g.current_scaled),raw=g.direction==="Aumentar"?(current-start)*10000/(target-start):(start-current)*10000/(start-target),progress=Math.max(0,Math.min(10000,Math.trunc(raw))),weight=Number(g.weight_bps);weighted+=progress*weight;totalWeight+=weight;return db.prepare("INSERT INTO performance_review_goal_snapshots VALUES (?,?,?,?,?,?,?,?)").bind(id(),tenant,body.reviewId,g.id,progress,weight,current,now)});
   const goalScore=Math.round(weighted/totalWeight),competency=rating(body.rating),finalScore=Math.round((goalScore*6000+competency*4000)/10000);
   const commands=[...snapshots,db.prepare("UPDATE performance_reviews SET status='Calibração',goal_score_bps=?,manager_competency_bps=?,manager_comment=?,manager_submitted_at=?,final_score_bps=? WHERE id=? AND tenant_id=? AND status='Aguardando gestor'").bind(goalScore,competency,body.comment?.trim(),now,finalScore,body.reviewId,tenant)];
   const results=await db.batch(commands);if(!Number(results.at(-1)?.meta.changes||0))return Response.json({error:"A avaliação foi atualizada em paralelo."},{status:409});
  }else if(body.type==="calibrate"){
   if(!["Administrador","Recursos Humanos"].includes(security.role))return Response.json({error:"A calibração exige Administrador ou Recursos Humanos."},{status:403});
   const review=await db.prepare("SELECT * FROM performance_reviews WHERE id=? AND tenant_id=? AND status='Calibração' AND (? IS NULL OR organization_id=?)").bind(body.reviewId,tenant,scope,scope).first<Record<string,unknown>>();
   if(!review)return Response.json({error:"Avaliação em calibração não encontrada."},{status:404});
   if([review.subject_email,review.reviewer_email].some(x=>String(x).toLowerCase()===security.email.toLowerCase()))return Response.json({error:"O calibrador deve ser independente do colaborador e do gestor."},{status:403});
   const competency=rating(body.rating),finalScore=Math.round((Number(review.goal_score_bps)*6000+competency*4000)/10000);
   const result=await db.prepare("UPDATE performance_reviews SET status='Finalizada',calibrated_competency_bps=?,calibration_reason=?,final_score_bps=?,calibrated_by=?,calibrated_at=? WHERE id=? AND tenant_id=? AND status='Calibração'").bind(competency,body.reason?.trim(),finalScore,security.email,now,body.reviewId,tenant).run();
   if(!Number(result.meta.changes||0))return Response.json({error:"A avaliação foi atualizada em paralelo."},{status:409});
  }else if(body.type==="createDevelopment"){
   if(!body.reviewId||!body.title?.trim()||!body.ownerEmail||!/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate||""))return Response.json({error:"Avaliação, ação, responsável e prazo são obrigatórios."},{status:400});
   const review=await db.prepare("SELECT * FROM performance_reviews WHERE id=? AND tenant_id=? AND status='Finalizada' AND (? IS NULL OR organization_id=?)").bind(body.reviewId,tenant,scope,scope).first<Record<string,unknown>>();
   if(!review)return Response.json({error:"Avaliação finalizada não encontrada."},{status:404});
   if(!["Administrador","Recursos Humanos"].includes(security.role)&&![review.subject_email,review.reviewer_email].some(x=>String(x).toLowerCase()===security.email.toLowerCase()))return Response.json({error:"O plano exige colaborador, gestor, RH ou Administrador associado."},{status:403});
   entityId=id();await db.prepare("INSERT INTO performance_development_items (id,tenant_id,review_id,title,description,owner_email,due_date,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,'Aberta',?,?)").bind(entityId,tenant,body.reviewId,body.title.trim(),body.description?.trim()||null,body.ownerEmail.toLowerCase(),body.dueDate,security.email,now).run();
  }else if(body.type==="completeDevelopment"){
   const item=await db.prepare("SELECT d.*,r.organization_id FROM performance_development_items d JOIN performance_reviews r ON r.id=d.review_id AND r.tenant_id=d.tenant_id WHERE d.id=? AND d.tenant_id=? AND d.status='Aberta' AND (? IS NULL OR r.organization_id=?)").bind(body.itemId,tenant,scope,scope).first<Record<string,unknown>>();
   if(!item)return Response.json({error:"Ação de desenvolvimento aberta não encontrada."},{status:404});
   if(!["Administrador","Recursos Humanos"].includes(security.role)&&String(item.owner_email).toLowerCase()!==security.email.toLowerCase())return Response.json({error:"Apenas o responsável, RH ou Administrador pode concluir."},{status:403});
   const result=await db.prepare("UPDATE performance_development_items SET status='Concluída',completion_evidence=?,completed_at=? WHERE id=? AND tenant_id=? AND status='Aberta'").bind(body.evidence?.trim(),now,body.itemId,tenant).run();
   if(!Number(result.meta.changes||0))return Response.json({error:"A ação foi atualizada em paralelo."},{status:409});
  }else return Response.json({error:"Operação de avaliação não suportada."},{status:400});
  const entityType=body.type.includes("Development")?"developmentItem":"performanceReview";await db.prepare("INSERT INTO audit_events (id,tenant_id,action,entity_type,entity_id,actor,summary,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(id(),tenant,body.type,entityType,entityId,security.email,`Performance review: ${body.type}`,now).run();
  return Response.json(await snapshot(),{status:201});
 }catch(error){return fail(error)}
}
