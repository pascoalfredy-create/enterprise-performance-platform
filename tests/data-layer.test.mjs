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
