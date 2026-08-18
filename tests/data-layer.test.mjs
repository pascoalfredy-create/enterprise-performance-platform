import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

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
