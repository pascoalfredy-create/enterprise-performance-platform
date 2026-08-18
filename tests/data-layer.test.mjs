import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const migration=readFileSync(new URL("../drizzle/0006_core_data_hardening.sql",import.meta.url),"utf8");
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
 assert.throws(()=>db.exec("INSERT INTO performance_entries (id,tenant_id,created_at,organization_id,period,scenario,currency,line_code,line_name,amount_minor,source) VALUES ('x','t','now','o','2026-99','Actual','AOA','REV','Receita',1,'test')"),/invalid performance entry/);
 db.close();
});
