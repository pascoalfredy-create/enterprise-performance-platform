import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { classifyDataError } from "../lib/api-error.ts";

const migration=readFileSync(new URL("../drizzle/0006_core_data_hardening.sql",import.meta.url),"utf8");
const referenceMigration=readFileSync(new URL("../drizzle/0007_tenant_reference_integrity.sql",import.meta.url),"utf8");
const worker=readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");

test("formal migration covers runtime-owned scope and invitation tables",()=>{
 for(const table of ["tenants","invitation_tokens","payroll_run_scopes","management_report_scopes"])
  assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS \`${table}\``));
});

test("tenant business keys and analytical access paths are indexed",()=>{
 for(const index of ["organizations_tenant_code_uq","platform_users_tenant_email_uq","employees_tenant_number_uq","performance_scope_idx","payroll_runs_tenant_period_idx"])
  assert.match(migration,new RegExp(index));
});

test("deterministic data invariants are enforced below the API layer",()=>{
 assert.match(migration,/invalid performance entry/);
 assert.match(migration,/invalid payroll run/);
 assert.match(migration,/workforce total must reconcile/);
});

test("workforce query contains no malformed double join",()=>{
 assert.doesNotMatch(worker,/LEFT LEFT JOIN/);
});

test("all formal migrations apply to a clean database and enforce invariants",()=>{
 const db=new DatabaseSync(":memory:");
 const directory=new URL("../drizzle/",import.meta.url);
 for(const file of readdirSync(directory).filter(name=>/^\d{4}.*\.sql$/.test(name)).sort())
  db.exec(readFileSync(new URL(file,directory),"utf8").replaceAll("--> statement-breakpoint",""));
 const indexed=db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='performance_scope_idx'").get();
 assert.equal(indexed.name,"performance_scope_idx");
 db.exec("INSERT INTO tenants VALUES ('t','now','Tenant','tenant','Ativo'); INSERT INTO organizations VALUES ('o','t','now','ROOT','Org','Empresa','AOA','Ativa')");
 assert.throws(()=>db.exec("INSERT INTO performance_entries (id,tenant_id,created_at,organization_id,period,scenario,currency,line_code,line_name,amount_minor,source) VALUES ('x','t','now','o','2026-99','Actual','AOA','REV','Receita',1,'test')"),/invalid performance entry/);
 db.close();
});

test("database rejects cross-tenant references",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant-1','Ativo'),('t2','now','Tenant 2','tenant-2','Ativo')");
 db.exec("INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org 1','Empresa','AOA','Ativa')");
 assert.throws(()=>db.exec("INSERT INTO employees VALUES ('e1','t2','now','001','Ana','Silva','o1','Analista','2026-01-01','Ativo')"),/organization outside tenant/);
 db.close();
});

test("closed payroll and issued management reports are immutable",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant-1','Ativo')");
 db.exec("INSERT INTO payroll_runs VALUES ('r1','t1','now','2026-08','AOA','Fechado',0,0,0,0,0,'now')");
 db.exec("INSERT INTO management_reports VALUES ('m1','t1','now',1,'Gestão','Executivo','2026-08','AOA',NULL,'Emitido','{}','hash','cfo@test.local')");
 assert.throws(()=>db.exec("UPDATE payroll_runs SET net_minor=1 WHERE id='r1'"),/closed payroll is immutable/);
 assert.throws(()=>db.exec("UPDATE management_reports SET payload_json='{\"changed\":true}' WHERE id='m1'"),/issued report is immutable/);
 db.close();
});

test("payslips require closed payroll and remain immutable",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant-1','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org 1','Empresa','AOA','Ativa'); INSERT INTO employees VALUES ('e1','t1','now','001','Ana','Silva','o1','Analista','2026-01-01','Ativo'); INSERT INTO payroll_runs VALUES ('r1','t1','now','2026-08','AOA','Rascunho',1,100,10,5,90,NULL); INSERT INTO payroll_run_lines VALUES ('l1','t1','now','r1','e1',80,100,10,5,90,'calc','{}')");
 assert.throws(()=>db.exec("INSERT INTO payroll_payslips VALUES ('p1','t1','r1','l1','e1','PS-1','2026-08','AOA',100,10,5,90,'{}','hash','Emitido','now')"),/payslip requires closed payroll/);
 db.exec("UPDATE payroll_runs SET status='Validado' WHERE id='r1'; UPDATE payroll_runs SET status='Aprovado' WHERE id='r1'; UPDATE payroll_runs SET status='Fechado',closed_at='now' WHERE id='r1'; INSERT INTO payroll_payslips VALUES ('p1','t1','r1','l1','e1','PS-1','2026-08','AOA',100,10,5,90,'{}','hash','Emitido','now')");
 assert.throws(()=>db.exec("UPDATE payroll_payslips SET net_minor=91 WHERE id='p1'"),/issued payslip is immutable/);
 assert.throws(()=>db.exec("DELETE FROM payroll_payslips WHERE id='p1'"),/issued payslip is immutable/);
 db.close();
});

test("payment batches reconcile payslips and enforce immutable sequential workflow",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant-1','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org 1','Empresa','AOA','Ativa'); INSERT INTO employees VALUES ('e1','t1','now','001','Ana','Silva','o1','Analista','2026-01-01','Ativo'); INSERT INTO payroll_runs VALUES ('r1','t1','now','2026-08','AOA','Rascunho',1,100,10,5,90,NULL); INSERT INTO payroll_run_lines VALUES ('l1','t1','now','r1','e1',80,100,10,5,90,'calc','{}'); UPDATE payroll_runs SET status='Validado' WHERE id='r1'; UPDATE payroll_runs SET status='Aprovado' WHERE id='r1'; UPDATE payroll_runs SET status='Fechado',closed_at='now' WHERE id='r1'; INSERT INTO payroll_payslips VALUES ('p1','t1','r1','l1','e1','PS-1','2026-08','AOA',100,10,5,90,'{}','hash','Emitido','now')");
 assert.throws(()=>db.exec("INSERT INTO payroll_payment_batches (id,tenant_id,run_id,batch_number,period,currency,employee_count,total_minor,status,evidence_hash,prepared_by,prepared_at) VALUES ('b0','t1','r1','PB-0','2026-08','AOA',1,89,'Preparado','hash','rh@test','now')"),/payment batch requires reconciled closed payroll/);
 db.exec("INSERT INTO payroll_payment_batches (id,tenant_id,run_id,batch_number,period,currency,employee_count,total_minor,status,evidence_hash,prepared_by,prepared_at) VALUES ('b1','t1','r1','PB-1','2026-08','AOA',1,90,'Preparado','hash','rh@test','now'); INSERT INTO payroll_payment_batch_lines VALUES ('bl1','t1','b1','p1','e1',90)");
 assert.throws(()=>db.exec("UPDATE payroll_payment_batches SET status='Exportado',exported_by='admin',exported_at='now' WHERE id='b1'"),/invalid payment batch transition/);
 assert.throws(()=>db.exec("UPDATE payroll_payment_batches SET total_minor=91 WHERE id='b1'"),/(payment batch evidence is immutable|invalid payment batch transition)/);
 db.exec("UPDATE payroll_payment_batches SET status='Aprovado',approved_by='admin',approved_at='now' WHERE id='b1'; UPDATE payroll_payment_batches SET status='Exportado',exported_by='admin',exported_at='later' WHERE id='b1'");
 assert.equal(db.prepare("SELECT status FROM payroll_payment_batches WHERE id='b1'").get().status,"Exportado");
 assert.throws(()=>db.exec("DELETE FROM payroll_payment_batch_lines WHERE id='bl1'"),/payment batch lines are immutable/);
 db.close();
});

test("absence management rejects cross-tenant references overlaps and invalid workflow",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant-1','Ativo'),('t2','now','Tenant 2','tenant-2','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org 1','Empresa','AOA','Ativa'),('o2','t2','now','ROOT','Org 2','Empresa','AOA','Ativa'); INSERT INTO employees VALUES ('e1','t1','now','001','Ana','Silva','o1','Analista','2026-01-01','Ativo'); INSERT INTO hcm_absence_types VALUES ('at1','t1','FERIAS','Férias','Dias',1,1,'Ativo','now'),('at2','t2','FERIAS','Férias','Dias',1,1,'Ativo','now')");
 assert.throws(()=>db.exec("INSERT INTO hcm_absence_balances VALUES ('b0','t1','e1','at2',2026,1000,0,'now')"),/absence balance reference outside tenant/);
 db.exec("INSERT INTO hcm_absence_balances VALUES ('b1','t1','e1','at1',2026,960,0,'now'); INSERT INTO hcm_absence_requests VALUES ('ar1','t1','e1','at1','2026-08-10','2026-08-10',480,'Descanso','Pendente','ana@test','now',NULL,NULL,NULL)");
 assert.throws(()=>db.exec("INSERT INTO hcm_absence_requests VALUES ('ar2','t1','e1','at1','2026-08-10','2026-08-11',480,NULL,'Pendente','ana@test','now',NULL,NULL,NULL)"),/absence request overlaps existing request/);
 assert.throws(()=>db.exec("UPDATE hcm_absence_requests SET status='Pendente',reason='alterado' WHERE id='ar1'"),/invalid absence request transition/);
 db.exec("UPDATE hcm_absence_requests SET status='Aprovado',decided_by='rh@test',decided_at='later' WHERE id='ar1'");
 assert.equal(db.prepare("SELECT status FROM hcm_absence_requests WHERE id='ar1'").get().status,"Aprovado");
 assert.equal(db.prepare("SELECT used_minutes FROM hcm_absence_balances WHERE id='b1'").get().used_minutes,480);
 assert.throws(()=>db.exec("DELETE FROM hcm_absence_requests WHERE id='ar1'"),/absence requests cannot be deleted/);
 db.close();
});

test("performance actions enforce tenant owner workflow evidence and retention",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant-1','Ativo'),('t2','now','Tenant 2','tenant-2','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org 1','Empresa','AOA','Ativa'); INSERT INTO platform_users VALUES ('u1','t1','now','Ana','ana@test','Gestor','o1','Ativo'),('u2','t2','now','Eva','eva@test','Gestor',NULL,'Ativo')");
 assert.throws(()=>db.exec("INSERT INTO performance_actions (id,tenant_id,organization_id,title,owner_email,due_date,priority,status,created_by,created_at,updated_at) VALUES ('a0','t1','o1','Ação inválida','eva@test','2026-09-01','Alta','Aberta','ana@test','now','now')"),/performance action reference outside tenant/);
 db.exec("INSERT INTO performance_actions (id,tenant_id,organization_id,period,currency,source_line_code,title,owner_email,due_date,priority,status,created_by,created_at,updated_at) VALUES ('a1','t1','o1','2026-08','AOA','WORKFORCE','Rever custo','ana@test','2026-09-01','Alta','Aberta','ana@test','now','now')");
 assert.throws(()=>db.exec("UPDATE performance_actions SET status='Concluída',completed_at='later' WHERE id='a1'"),/completion evidence is required/);
 db.exec("UPDATE performance_actions SET status='Em curso',updated_at='later' WHERE id='a1'; UPDATE performance_actions SET status='Concluída',updated_at='done',completed_at='done',completion_evidence='Medida implementada' WHERE id='a1'");
 assert.equal(db.prepare("SELECT status FROM performance_actions WHERE id='a1'").get().status,"Concluída");
 assert.throws(()=>db.exec("DELETE FROM performance_actions WHERE id='a1'"),/performance actions cannot be deleted/);
 db.close();
});

test("forecast scenarios keep versions sources and entries governed",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant-1','Ativo'),('t2','now','Tenant 2','tenant-2','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org 1','Empresa','AOA','Ativa'),('o2','t2','now','ROOT','Org 2','Empresa','AOA','Ativa'); INSERT INTO planning_versions VALUES ('v1','t1','Forecast Q4','Forecast',2026,NULL,'Rascunho','fp@test','now',NULL,NULL)");
 assert.throws(()=>db.exec("INSERT INTO planning_entries VALUES ('x','t1','v1','o2','2026-08','AOA','REV','Receita',NULL,100,NULL,'fp@test','now')"),/invalid planning entry reference or closed version/);
 db.exec("INSERT INTO planning_entries VALUES ('e1','t1','v1','o1','2026-08','AOA','REV','Receita',NULL,100,'Crescimento contratual','fp@test','now')");
 assert.throws(()=>db.exec("UPDATE planning_entries SET amount_minor=200 WHERE id='e1'"),/planning entries are append only/);
 assert.throws(()=>db.exec("UPDATE planning_versions SET status='Arquivado' WHERE id='v1'"),/invalid planning version transition/);
 db.exec("UPDATE planning_versions SET status='Aprovado',approved_by='manager@test',approved_at='later' WHERE id='v1'");
 assert.throws(()=>db.exec("INSERT INTO planning_entries VALUES ('e2','t1','v1','o1','2026-09','AOA','REV','Receita',NULL,120,NULL,'fp@test','later')"),/invalid planning entry reference or closed version/);
 db.close();
});

test("performance goals activate with cycle and require append-only target evidence",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant-1','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org 1','Empresa','AOA','Ativa'); INSERT INTO platform_users VALUES ('u1','t1','now','Ana','ana@test','Gestor','o1','Ativo'); INSERT INTO performance_cycles VALUES ('c1','t1','Ciclo 2026','2026-01-01','2026-12-31','Rascunho','manager@test','now',NULL,NULL,NULL); INSERT INTO performance_goals VALUES ('g1','t1','c1','o1','ana@test','Crescer receita',NULL,'Receita','AOA','Aumentar',10000,20000,100,10000,'Rascunho','manager@test','now',NULL)");
 db.exec("UPDATE performance_cycles SET status='Ativo',activated_by='admin@test',activated_at='later' WHERE id='c1'");
 assert.equal(db.prepare("SELECT status FROM performance_goals WHERE id='g1'").get().status,"Ativo");
 db.exec("INSERT INTO performance_goal_checkins VALUES ('ci1','t1','g1',15000,'Parcial',NULL,'ana@test','2026-06-01')");
 assert.throws(()=>db.exec("UPDATE performance_goal_checkins SET value_scaled=20000 WHERE id='ci1'"),/goal check-ins are append only/);
 assert.throws(()=>db.exec("UPDATE performance_goals SET status='Concluído',completed_at='now' WHERE id='g1'"),/goal target not reached/);
 db.exec("INSERT INTO performance_goal_checkins VALUES ('ci2','t1','g1',20000,'Meta',NULL,'ana@test','2026-12-01'); UPDATE performance_goals SET status='Concluído',completed_at='now' WHERE id='g1'");
 assert.equal(db.prepare("SELECT status FROM performance_goals WHERE id='g1'").get().status,"Concluído");db.close();
});

test("performance reviews preserve goal evidence and enforce segregated workflow",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant-1','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org 1','Empresa','AOA','Ativa'); INSERT INTO platform_users VALUES ('u1','t1','now','Ana','ana@test','Financeiro','o1','Ativo'),('u2','t1','now','Mário','mario@test','Gestor','o1','Ativo'),('u3','t1','now','Rita','rita@test','Recursos Humanos','o1','Ativo'); INSERT INTO performance_cycles VALUES ('c1','t1','Ciclo 2026','2026-01-01','2026-12-31','Rascunho','admin@test','now',NULL,NULL,NULL); INSERT INTO performance_goals VALUES ('g1','t1','c1','o1','ana@test','Margem',NULL,'Margem','%', 'Aumentar',1000,2000,100,10000,'Rascunho','admin@test','now',NULL); UPDATE performance_cycles SET status='Ativo',activated_by='admin2@test',activated_at='later' WHERE id='c1'; INSERT INTO performance_goal_checkins VALUES ('ci1','t1','g1',1800,'Evidência',NULL,'ana@test','2026-08-01')");
 db.exec("INSERT INTO performance_reviews (id,tenant_id,cycle_id,organization_id,subject_email,reviewer_email,status,created_by,created_at) VALUES ('r1','t1','c1','o1','ana@test','mario@test','Aguardando autoavaliação','rh@test','now')");
 db.exec("UPDATE performance_reviews SET status='Aguardando gestor',self_competency_bps=6000,self_comment='Autoavaliação submetida',self_submitted_at='self' WHERE id='r1'");
 assert.throws(()=>db.exec("UPDATE performance_reviews SET status='Calibração',goal_score_bps=8000,manager_competency_bps=8000,manager_comment='Gestor',manager_submitted_at='manager',final_score_bps=8000 WHERE id='r1'"),/invalid performance review transition/);
 db.exec("INSERT INTO performance_review_goal_snapshots VALUES ('s1','t1','r1','g1',8000,10000,1800,'manager'); UPDATE performance_reviews SET status='Calibração',goal_score_bps=8000,manager_competency_bps=8000,manager_comment='Avaliação do gestor',manager_submitted_at='manager',final_score_bps=8000 WHERE id='r1'");
 assert.throws(()=>db.exec("UPDATE performance_review_goal_snapshots SET progress_bps=9000 WHERE id='s1'"),/review goal snapshots are immutable/);
 db.exec("UPDATE performance_reviews SET status='Finalizada',calibrated_competency_bps=10000,calibration_reason='Calibração independente documentada',final_score_bps=8800,calibrated_by='rita@test',calibrated_at='final' WHERE id='r1'; INSERT INTO performance_development_items (id,tenant_id,review_id,title,owner_email,due_date,status,created_by,created_at) VALUES ('d1','t1','r1','Formação','ana@test','2026-12-01','Aberta','rita@test','final')");
 assert.throws(()=>db.exec("UPDATE performance_development_items SET status='Concluída',completed_at='done' WHERE id='d1'"),/invalid development item transition/);
 db.exec("UPDATE performance_development_items SET status='Concluída',completion_evidence='Certificado emitido',completed_at='done' WHERE id='d1'");
 assert.equal(db.prepare("SELECT final_score_bps FROM performance_reviews WHERE id='r1'").get().final_score_bps,8800);db.close();
});

test("competency frameworks and 360 feedback enforce complete immutable evidence",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant','tenant','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org','Empresa','AOA','Ativa'); INSERT INTO platform_users VALUES ('u1','t1','now','Ana','ana@test','Financeiro','o1','Ativo'),('u2','t1','now','Mário','mario@test','Gestor','o1','Ativo'),('u3','t1','now','Eva','eva@test','Leitura','o1','Ativo'); INSERT INTO performance_cycles VALUES ('c1','t1','Ciclo','2026-01-01','2026-12-31','Rascunho','rh@test','now',NULL,NULL,NULL); INSERT INTO performance_goals VALUES ('g1','t1','c1','o1','ana@test','Meta',NULL,'Meta','%', 'Aumentar',0,10000,100,10000,'Rascunho','rh@test','now',NULL); UPDATE performance_cycles SET status='Ativo',activated_by='admin@test',activated_at='later' WHERE id='c1'; INSERT INTO performance_reviews (id,tenant_id,cycle_id,organization_id,subject_email,reviewer_email,status,created_by,created_at) VALUES ('r1','t1','c1','o1','ana@test','mario@test','Aguardando autoavaliação','rh@test','now'); INSERT INTO competency_frameworks (id,tenant_id,name,status,created_by,created_at) VALUES ('f1','t1','Liderança','Rascunho','rh@test','now'); INSERT INTO competency_definitions (id,tenant_id,framework_id,code,name,category,weight_bps,status,created_at) VALUES ('cp1','t1','f1','LID','Liderança','Comportamental',5000,'Ativa','now'),('cp2','t1','f1','COL','Colaboração','Comportamental',5000,'Ativa','now'); UPDATE competency_frameworks SET status='Ativo',activated_by='admin@test',activated_at='later' WHERE id='f1'");
 db.exec("INSERT INTO feedback_360_rounds (id,tenant_id,review_id,framework_id,due_date,confidentiality,status,created_by,created_at) VALUES ('fr1','t1','r1','f1','2026-12-01','Confidencial','Rascunho','rh@test','now'); INSERT INTO feedback_360_participants VALUES ('p1','t1','fr1','mario@test','Gestor',6000,'Pendente','now',NULL),('p2','t1','fr1','eva@test','Par',4000,'Pendente','now',NULL); UPDATE feedback_360_rounds SET status='Aberto',opened_by='admin@test',opened_at='later' WHERE id='fr1'");
 db.exec("INSERT INTO feedback_360_responses VALUES ('x1','t1','fr1','p1','cp1',8000,'Evidência','s1'),('x2','t1','fr1','p1','cp2',6000,NULL,'s1'); UPDATE feedback_360_participants SET status='Submetido',submitted_at='s1' WHERE id='p1'; INSERT INTO feedback_360_responses VALUES ('x3','t1','fr1','p2','cp1',10000,NULL,'s2')");
 assert.throws(()=>db.exec("UPDATE feedback_360_participants SET status='Submetido',submitted_at='s2' WHERE id='p2'"),/invalid feedback participant transition/);
 db.exec("INSERT INTO feedback_360_responses VALUES ('x4','t1','fr1','p2','cp2',8000,NULL,'s2'); UPDATE feedback_360_participants SET status='Submetido',submitted_at='s2' WHERE id='p2'");
 assert.throws(()=>db.exec("UPDATE feedback_360_rounds SET status='Fechado',overall_score_bps=7600,closed_by='rh@test',closed_at='done' WHERE id='fr1'"),/invalid feedback round transition/);
 db.exec("UPDATE feedback_360_rounds SET status='Fechado',overall_score_bps=7800,closed_by='rh@test',closed_at='done' WHERE id='fr1'");
 assert.throws(()=>db.exec("UPDATE feedback_360_responses SET rating_bps=10000 WHERE id='x1'"),/feedback responses are immutable/);
 assert.equal(db.prepare("SELECT status FROM feedback_360_rounds WHERE id='fr1'").get().status,"Fechado");db.close();
});

test("control plane changes require sequential decisions and retain immutable evidence",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant','tenant','Ativo'); INSERT INTO control_plane_change_requests (id,change_type,target_type,target_id,tenant_id,reason,status,requested_by,requested_at,before_json) VALUES ('c1','Suspender subscrição','subscription','s1','t1','Incumprimento contratual','Pendente','billing@test','now','{\"status\":\"Ativa\"}')");
 assert.throws(()=>db.exec("UPDATE control_plane_change_requests SET status='Executado',executed_at='now' WHERE id='c1'"),/invalid control plane change transition/);
 db.exec("UPDATE control_plane_change_requests SET status='Aprovado',decided_by='owner@test',decided_at='later' WHERE id='c1'; UPDATE control_plane_change_requests SET status='Executado',executed_at='done',after_json='{\"status\":\"Suspenso\"}' WHERE id='c1'; INSERT INTO operator_audit_events VALUES ('a1','owner@test','APPROVE_CHANGE','changeRequest','c1','Incumprimento contratual','hash','done')");
 assert.throws(()=>db.exec("DELETE FROM control_plane_change_requests WHERE id='c1'"),/control plane changes cannot be deleted/);
 assert.throws(()=>db.exec("UPDATE operator_audit_events SET reason='alterado' WHERE id='a1'"),/operator audit is immutable/);db.close();
});

test("reference migration protects every vertical-slice boundary",()=>{
 for(const phrase of ["organization outside tenant","dimension reference outside tenant","performance reference outside tenant","salary reference outside tenant","payroll assignment outside tenant","payroll scope outside tenant","payroll line outside tenant","workforce reference outside tenant","report version outside tenant","report scope outside tenant"])
  assert.match(referenceMigration,new RegExp(phrase));
});

test("concurrency guards prevent duplicate business operations",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant-1','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org 1','Empresa','AOA','Ativa'); INSERT INTO employees VALUES ('e1','t1','now','001','Ana','Silva','o1','Analista','2026-01-01','Ativo')");
 db.exec("INSERT INTO salary_profiles VALUES ('s1','t1','now','e1','AOA','Mensal',100,'2026-01-01',NULL,NULL,'Ativo')");
 assert.throws(()=>db.exec("INSERT INTO salary_profiles VALUES ('s2','t1','now','e1','AOA','Mensal',200,'2026-02-01',NULL,NULL,'Ativo')"),/UNIQUE constraint failed/);
 db.exec("INSERT INTO management_reports VALUES ('m1','t1','now',1,'Gestão','Executivo','2026-08','AOA',NULL,'Emitido','{}','hash','cfo@test.local')");
 assert.throws(()=>db.exec("INSERT INTO management_reports VALUES ('m2','t1','now',1,'Duplicado','Executivo','2026-08','AOA',NULL,'Emitido','{}','hash','cfo@test.local')"),/UNIQUE constraint failed/);
 db.close();
});

test("audit trail cannot be rewritten or deleted",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO audit_events VALUES ('a1','t1','now','CREATE','employee','e1','admin@test.local','created')");
 assert.throws(()=>db.exec("UPDATE audit_events SET summary='changed' WHERE id='a1'"),/audit event is immutable/);
 assert.throws(()=>db.exec("DELETE FROM audit_events WHERE id='a1'"),/audit event is immutable/);
 db.close();
});

function migratedDatabase(){
 const db=new DatabaseSync(":memory:"),directory=new URL("../drizzle/",import.meta.url);
 for(const file of readdirSync(directory).filter(name=>/^\d{4}.*\.sql$/.test(name)).sort())
  db.exec(readFileSync(new URL(file,directory),"utf8").replaceAll("--> statement-breakpoint",""));
 return db;
}

test("database failures are translated into stable API responses",()=>{
 assert.deepEqual(classifyDataError(new Error("UNIQUE constraint failed: reports.number"),"fallback"),{status:409,code:"CONFLICT",message:"O registo já existe ou a operação foi concluída em paralelo. Atualize os dados e confirme o resultado."});
 assert.equal(classifyDataError(new Error("issued report is immutable"),"fallback").code,"IMMUTABLE_RECORD");
 assert.equal(classifyDataError(new Error("organization outside tenant"),"fallback").status,403);
 assert.equal(classifyDataError(new Error("invalid payroll run"),"fallback").status,422);
 assert.equal(classifyDataError(new Error("budget version is not open"),"fallback").code,"INVALID_STATE");
 assert.deepEqual(classifyDataError(new Error("socket unavailable"),"Mensagem segura"),{status:500,code:"INTERNAL_ERROR",message:"Mensagem segura"});
});

test("employee contract lifecycle controls payroll eligibility",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant-1','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org 1','Empresa','AOA','Ativa'); INSERT INTO employees VALUES ('e1','t1','now','001','Ana','Silva','o1','Analista','2026-01-01','Pendente')");
 db.exec("INSERT INTO employee_contracts VALUES ('c1','t1','now','e1','CTR-001','Sem termo','2026-01-01',NULL,'Tempo inteiro',2400,NULL,'Rascunho',NULL,NULL)");
 assert.equal(db.prepare("SELECT status FROM employees WHERE id='e1'").get().status,"Pendente");
 db.exec("UPDATE employee_contracts SET status='Ativo',activated_at='now' WHERE id='c1'");
 assert.equal(db.prepare("SELECT status FROM employees WHERE id='e1'").get().status,"Ativo");
 assert.throws(()=>db.exec("INSERT INTO employee_contracts VALUES ('c2','t1','now','e1','CTR-002','Prazo','2026-02-01',NULL,'Tempo inteiro',2400,NULL,'Ativo','now',NULL)"),/invalid employee contract/);
 db.exec("UPDATE employee_contracts SET status='Terminado',end_date='2026-12-31',ended_at='now' WHERE id='c1'");
 assert.equal(db.prepare("SELECT status FROM employees WHERE id='e1'").get().status,"Inativo");
 db.close();
});

test("payroll selection requires an active effective contract",()=>{
 assert.match(worker,/JOIN employee_contracts c ON c\.employee_id=e\.id/);
 assert.match(worker,/c\.status='Ativo'/);
 assert.match(worker,/c\.start_date<=\?/);
 assert.match(worker,/c\.end_date IS NULL OR c\.end_date>=\?/);
});

test("workflow transitions are sequential and protected by database state",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant-1','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org 1','Empresa','AOA','Ativa')");
 db.exec("INSERT INTO budget_versions VALUES ('b1','t1','now','Budget 2027',2027,'Rascunho',NULL)");
 assert.throws(()=>db.exec("UPDATE budget_versions SET status='Fechado' WHERE id='b1'"),/invalid budget transition/);
 db.exec("UPDATE budget_versions SET status='Aprovado',approved_at='now' WHERE id='b1'");
 assert.throws(()=>db.exec("INSERT INTO performance_entries (id,tenant_id,created_at,organization_id,period,scenario,version_id,currency,line_code,line_name,amount_minor,source) VALUES ('p1','t1','now','o1','2027-01','Budget','b1','AOA','REV','Receita',100,'Manual')"),/budget version is not open/);
 db.exec("INSERT INTO payroll_runs VALUES ('r1','t1','now','2026-08','AOA','Rascunho',0,0,0,0,0,NULL)");
 assert.throws(()=>db.exec("UPDATE payroll_runs SET status='Aprovado' WHERE id='r1'"),/invalid payroll transition/);
 db.exec("UPDATE payroll_runs SET status='Validado' WHERE id='r1'; UPDATE payroll_runs SET status='Aprovado' WHERE id='r1'; UPDATE payroll_runs SET status='Fechado',closed_at='now' WHERE id='r1'");
 assert.equal(db.prepare("SELECT status FROM payroll_runs WHERE id='r1'").get().status,"Fechado");
 db.close();
});

test("API state changes use compare-and-set updates",()=>{
 assert.match(worker,/status='Rascunho'\"\)\.bind\(created,body\.versionId,tenantId\)/);
 assert.match(worker,/AND status=\?\"\)\.bind\(next\[run\.status\]/);
 assert.match(worker,/transition\.meta\.changes/);
 assert.match(worker,/approval\.meta\.changes/);
});

test("multicurrency consolidation preserves immutable evidence and reconciles approval",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant-1','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org 1','Empresa','AOA','Ativa')");
 db.exec("INSERT INTO fx_rate_sets (id,tenant_id,name,period,base_currency,status,created_by,created_at) VALUES ('f1','t1','Fecho agosto','2026-08','AOA','Rascunho','maker@test','now'); INSERT INTO fx_rates VALUES ('x1','t1','f1','USD','AOA',90000000000,100000000,'now'); UPDATE fx_rate_sets SET status='Aprovado',approved_by='checker@test',approved_at='later' WHERE id='f1'");
 assert.throws(()=>db.exec("UPDATE fx_rates SET rate_scaled=1 WHERE id='x1'"),/FX rates are immutable/);
 db.exec("INSERT INTO consolidation_runs (id,tenant_id,rate_set_id,period,target_currency,run_number,status,source_count,organization_count,currency_count,converted_total_minor,adjustment_total_minor,reported_total_minor,input_hash,created_by,created_at) VALUES ('r1','t1','f1','2026-08','AOA',1,'Calculado',2,1,2,30000,0,30000,'input-hash','maker@test','now'); INSERT INTO consolidation_lines VALUES ('l1','t1','r1','o1','USD','AOA','REV','Receita',100,90000000000,90000,1,'source-hash')");
 assert.throws(()=>db.exec("UPDATE consolidation_lines SET converted_amount_minor=1 WHERE id='l1'"),/consolidation lines are immutable/);
 db.exec("INSERT INTO consolidation_adjustments VALUES ('a1','t1','r1','IC','Intercompany',-5000,'Eliminação','Eliminação intercompany documentada','DOC-001','maker@test','now')");
 assert.throws(()=>db.exec("UPDATE consolidation_runs SET status='Aprovado',adjustment_total_minor=-1,reported_total_minor=29999,approval_hash='wrong' WHERE id='r1'"),/invalid consolidation run transition/);
 db.exec("UPDATE consolidation_runs SET status='Aprovado',adjustment_total_minor=-5000,reported_total_minor=25000,approved_by='checker@test',approved_at='later',approval_hash='approval-hash' WHERE id='r1'");
 const approved=db.prepare("SELECT status,reported_total_minor FROM consolidation_runs WHERE id='r1'").get();
 assert.equal(approved.status,'Aprovado');assert.equal(approved.reported_total_minor,25000);
 db.close();
});

test("business planning locks deterministic projections through approval",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant-1','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org 1','Empresa','AOA','Ativa')");
 db.exec("INSERT INTO financial_models (id,tenant_id,organization_id,name,currency,start_period,horizon_months,opening_cash_minor,status,version_number,created_by,created_at) VALUES ('m1','t1','o1','Plano 2027','AOA','2027-01',12,10000,'Rascunho',1,'maker@test','now'); INSERT INTO financial_model_lines VALUES ('l1','t1','m1','REV','Receita','Receita',1000,500,1,'maker@test','now'); INSERT INTO financial_projections VALUES ('p1','t1','m1','l1','2027-01','2027-02',0,1000,1000,'formula-hash')");
 assert.throws(()=>db.exec("UPDATE financial_projections SET statement_amount_minor=2 WHERE id='p1'"),/financial projections are immutable/);
 db.exec("UPDATE financial_models SET status='Calculado',input_hash='input-hash',calculated_by='maker@test',calculated_at='later' WHERE id='m1'");
 assert.throws(()=>db.exec("INSERT INTO financial_model_lines VALUES ('l2','t1','m1','COST','Custo','Custo',100,0,0,'maker@test','later')"),/financial model is not editable/);
 db.exec("UPDATE financial_models SET status='Aprovado',approved_by='checker@test',approved_at='final',approval_hash='approval-hash' WHERE id='m1'");
 assert.equal(db.prepare("SELECT status FROM financial_models WHERE id='m1'").get().status,'Aprovado');db.close();
});

test("financial imports preserve source evidence and sequential posting",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant-1','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org 1','Empresa','AOA','Ativa'); INSERT INTO financial_line_catalog VALUES ('l1','t1','REV','Receita','Receita','Operacional','Natural','Ativa','admin@test','now'); INSERT INTO financial_source_mappings VALUES ('m1','t1','ERP','701','l1',NULL,'admin@test','now')");
 db.exec("INSERT INTO financial_import_batches VALUES ('b1','t1','o1','2026-08','AOA','ERP','actual.csv','Carregado',1,1000,'input-hash','maker@test','now',NULL,NULL,NULL,NULL); INSERT INTO financial_import_rows VALUES ('r1','t1','b1',1,'701','Receita',1000,'l1',NULL,'Mapeado','row-hash')");
 assert.throws(()=>db.exec("UPDATE financial_import_rows SET amount_minor=2 WHERE id='r1'"),/financial import rows are immutable/);
 assert.throws(()=>db.exec("UPDATE financial_import_batches SET status='Publicado' WHERE id='b1'"),/invalid financial import transition/);
 db.exec("UPDATE financial_import_batches SET status='Validado',validated_by='validator@test',validated_at='later' WHERE id='b1'; INSERT INTO performance_entries (id,tenant_id,created_at,organization_id,period,scenario,version_id,currency,line_code,line_name,dimension_member_id,amount_minor,source) VALUES ('p1','t1','later','o1','2026-08','Actual',NULL,'AOA','REV','Receita',NULL,1000,'Import:b1'); INSERT INTO financial_import_postings VALUES ('fp1','t1','b1','r1','p1','later')");
 assert.throws(()=>db.exec("INSERT INTO financial_import_postings VALUES ('fp2','t1','b1','r1','p1','later')"),/UNIQUE constraint failed/);
 db.exec("UPDATE financial_import_batches SET status='Publicado',posted_by='checker@test',posted_at='final' WHERE id='b1'");
 assert.equal(db.prepare("SELECT status FROM financial_import_batches WHERE id='b1'").get().status,'Publicado');db.close();
});

test("diagnostic methodologies and investment evidence lock after approval",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant','tenant','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org','Empresa','AOA','Ativa'); INSERT INTO financial_line_catalog VALUES ('l1','t1','REV','Receita','Receita','Operacional','Natural','Ativa','admin@test','now'); INSERT INTO diagnostic_line_roles VALUES ('dr1','t1','l1','REVENUE','admin@test','now'); INSERT INTO diagnostic_frameworks (id,tenant_id,name,status,created_by,created_at) VALUES ('f1','t1','Equilibrado','Rascunho','maker@test','now'); INSERT INTO diagnostic_metric_configs VALUES ('mc1','t1','f1','NET_MARGIN',10000,'now'); INSERT INTO diagnostic_rules VALUES ('rule1','t1','f1','NET_MARGIN',0,NULL,8000,'Saudável','Manter margem e acompanhar a tendência','now'); UPDATE diagnostic_frameworks SET status='Ativo',activated_by='checker@test',activated_at='later' WHERE id='f1'");
 db.exec("INSERT INTO diagnostic_runs (id,tenant_id,organization_id,framework_id,period,currency,run_number,status,overall_score_bps,input_hash,created_by,created_at) VALUES ('run1','t1','o1','f1','2026-08','AOA',1,'Calculado',8000,'input','maker@test','now'); INSERT INTO diagnostic_results VALUES ('res1','t1','run1','NET_MARGIN','Margem líquida',2500,10000,8000,'Saudável','Manter margem e acompanhar a tendência','Resultado / Receita','result-hash')");
 assert.throws(()=>db.exec("UPDATE diagnostic_results SET score_bps=1 WHERE id='res1'"),/diagnostic results are immutable/);db.exec("UPDATE diagnostic_runs SET status='Aprovado',approved_by='checker@test',approved_at='later',approval_hash='approved' WHERE id='run1'");
 db.exec("INSERT INTO investment_cases (id,tenant_id,organization_id,name,currency,discount_rate_bps,status,version_number,created_by,created_at) VALUES ('i1','t1','o1','Projeto','AOA',1000,'Rascunho',1,'maker@test','now'); INSERT INTO investment_cash_flows VALUES ('cf0','t1','i1',0,-10000,'Investimento','now'),('cf1','t1','i1',1,12000,'Retorno','now'); INSERT INTO investment_sensitivities VALUES ('s1','t1','i1',1000,909,'now'); UPDATE investment_cases SET status='Calculado',npv_minor=909,irr_bps=2000,payback_period=1,input_hash='investment-input',calculated_by='maker@test',calculated_at='later' WHERE id='i1'");
 assert.throws(()=>db.exec("INSERT INTO investment_cash_flows VALUES ('cf2','t1','i1',2,100,'Late','later')"),/investment case is not editable/);db.exec("UPDATE investment_cases SET status='Aprovado',approved_by='checker@test',approved_at='final',approval_hash='investment-approved' WHERE id='i1'");db.close();
});

test("industry packs are configurable, balanced and preserve installation history",()=>{
 const db=migratedDatabase();
 for(const pack of db.prepare("SELECT code FROM industry_packs").all()){
  const total=db.prepare("SELECT SUM(weight_bps) total FROM industry_pack_metrics WHERE pack_code=?").get(pack.code);
  assert.equal(total.total,10000,`${pack.code} must total 100%`);
 }
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant','tenant','Ativo'); INSERT INTO tenant_business_profiles VALUES ('t1','TECHNOLOGY','SERVICE','Software B2B para gestão empresarial','AO','now','now'); INSERT INTO tenant_industry_pack_installations VALUES ('i1','t1','SERVICE',1,NULL,'admin@test','now','Instalado')");
 assert.throws(()=>db.exec("INSERT INTO tenant_industry_pack_installations VALUES ('i2','t1','GENERAL',1,NULL,'admin@test','later','Instalado')"),/UNIQUE constraint failed/);
 db.exec("UPDATE tenant_industry_pack_installations SET status='Substituído' WHERE id='i1'; INSERT INTO tenant_industry_pack_installations VALUES ('i2','t1','GENERAL',1,NULL,'admin@test','later','Instalado')");
 assert.throws(()=>db.exec("DELETE FROM tenant_industry_pack_installations WHERE id='i1'"),/industry pack installations cannot be deleted/);
 db.close();
});

test("diagnostic reports are immutable and improvement actions require evidence",()=>{
 const db=migratedDatabase();
 db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant','tenant','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org','Empresa','AOA','Ativa'); INSERT INTO diagnostic_frameworks (id,tenant_id,name,status,created_by,created_at) VALUES ('f1','t1','Framework','Rascunho','maker@test','now'); INSERT INTO diagnostic_metric_configs VALUES ('mc1','t1','f1','NET_MARGIN',10000,'now'); INSERT INTO diagnostic_rules VALUES ('rule1','t1','f1','NET_MARGIN',0,NULL,8000,'Saudável','Manter margem sustentável','now'); UPDATE diagnostic_frameworks SET status='Ativo',activated_by='checker@test',activated_at='later' WHERE id='f1'; INSERT INTO diagnostic_runs (id,tenant_id,organization_id,framework_id,period,currency,run_number,status,overall_score_bps,input_hash,created_by,created_at) VALUES ('run1','t1','o1','f1','2026-08','AOA',1,'Calculado',8000,'input','maker@test','now'); INSERT INTO diagnostic_results VALUES ('res1','t1','run1','NET_MARGIN','Margem líquida',2500,10000,8000,'Saudável','Manter margem sustentável','Resultado / Receita','result-hash'); UPDATE diagnostic_runs SET status='Aprovado',approved_by='checker@test',approved_at='later',approval_hash='approved' WHERE id='run1'; INSERT INTO diagnostic_management_reports VALUES ('rep1','t1','run1',1,'Relatório','Emitido','{}','report-hash','cfo@test','now'); INSERT INTO diagnostic_improvement_actions VALUES ('act1','t1','run1','res1','o1','Melhorar margem','Manter margem sustentável','owner@test','2026-09-30','Alta','Aberta',NULL,'cfo@test','now','now',NULL)");
 assert.throws(()=>db.exec("UPDATE diagnostic_management_reports SET title='Alterado' WHERE id='rep1'"),/immutable/);
 assert.throws(()=>db.exec("UPDATE diagnostic_improvement_actions SET status='Concluída',updated_at='later' WHERE id='act1'"),/invalid diagnostic action transition/);
 db.exec("UPDATE diagnostic_improvement_actions SET status='Em curso',updated_at='later' WHERE id='act1'; UPDATE diagnostic_improvement_actions SET status='Concluída',completion_evidence='Cobranças revistas e validadas',completed_at='final',updated_at='final' WHERE id='act1'");
 assert.equal(db.prepare("SELECT status FROM diagnostic_improvement_actions WHERE id='act1'").get().status,'Concluída');db.close();
});

test("headcount plans enforce immutable assumptions and maker-checker workflow",()=>{
 const db=migratedDatabase();db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant','tenant','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org','Empresa','AOA','Ativa'); INSERT INTO workforce_plans (id,tenant_id,organization_id,name,currency,start_period,end_period,version_number,status,created_by,created_at) VALUES ('p1','t1','o1','Plano 2027','AOA','2027-01','2027-12',1,'Rascunho','maker@test','now'); INSERT INTO workforce_plan_lines VALUES ('l1','t1','p1','Analista','FIN','2027-01',2,50000000,'Nova contratação','Expansão da operação','maker@test','now')");assert.throws(()=>db.exec("UPDATE workforce_plan_lines SET headcount=3 WHERE id='l1'"),/immutable/);db.exec("UPDATE workforce_plans SET status='Submetido',submitted_by='maker@test',submitted_at='later' WHERE id='p1'; UPDATE workforce_plans SET status='Aprovado',approved_by='checker@test',approved_at='final',approval_hash='hash' WHERE id='p1'");assert.equal(db.prepare("SELECT status FROM workforce_plans WHERE id='p1'").get().status,'Aprovado');db.close();
});

test("recruitment and onboarding enforce sequential decisions and evidence",()=>{
 const db=migratedDatabase();db.exec("INSERT INTO tenants VALUES ('t1','now','Tenant','tenant','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ROOT','Org','Empresa','AOA','Ativa'); INSERT INTO recruitment_requisitions VALUES ('r1','t1','o1','Analista','FIN',1,'2027-01-01','Efetivo',50000000,'AOA','Rascunho','Expansão aprovada','maker@test','now',NULL,NULL); UPDATE recruitment_requisitions SET status='Aberta',approved_by='checker@test',approved_at='later' WHERE id='r1'; INSERT INTO recruitment_candidates VALUES ('c1','t1','Candidata Um','candidate@test',NULL,'Direto','now','hr@test','now'); INSERT INTO recruitment_applications VALUES ('a1','t1','r1','c1','Recebida',NULL,NULL,'hr@test','now','now')");assert.throws(()=>db.exec("UPDATE recruitment_applications SET status='Oferta',updated_at='later' WHERE id='a1'"),/invalid recruitment application transition/);db.exec("UPDATE recruitment_applications SET status='Triagem',updated_at='1' WHERE id='a1'; UPDATE recruitment_applications SET status='Entrevista',updated_at='2' WHERE id='a1'; UPDATE recruitment_applications SET status='Oferta',updated_at='3' WHERE id='a1'; UPDATE recruitment_applications SET status='Contratada',updated_at='4' WHERE id='a1'; INSERT INTO employee_onboarding_cases VALUES ('oc1','t1','a1',NULL,'Preparação','2027-01-01','hr@test','hr@test','now',NULL); INSERT INTO employee_onboarding_tasks VALUES ('ot1','t1','oc1','Documentação','hr@test','2026-12-20','Pendente',NULL,'now',NULL); UPDATE employee_onboarding_cases SET status='Em curso' WHERE id='oc1'");assert.throws(()=>db.exec("UPDATE employee_onboarding_tasks SET status='Concluída',completed_at='later' WHERE id='ot1'"),/requires evidence/);db.exec("UPDATE employee_onboarding_tasks SET status='Concluída',evidence='Documentos verificados',completed_at='later' WHERE id='ot1'; UPDATE employee_onboarding_cases SET status='Concluído',completed_at='later' WHERE id='oc1'");assert.equal(db.prepare("SELECT status FROM employee_onboarding_cases WHERE id='oc1'").get().status,'Concluído');db.close();
});
