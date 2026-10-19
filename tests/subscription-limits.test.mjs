import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const {employeeCapacityError,financialModelProjectCapacityError} = await import('../worker/subscription-limits.ts');
class Statement{constructor(db,sql){this.db=db;this.sql=sql;this.values=[]}bind(...values){this.values=values;return this}run(){const r=this.db.prepare(this.sql).run(...this.values);return {success:true,meta:{changes:r.changes}}}all(){return {results:this.db.prepare(this.sql).all(...this.values)}}first(){return this.db.prepare(this.sql).get(...this.values)||null}}
class D1{constructor(db){this.db=db}prepare(sql){return new Statement(this.db,sql)}}
function setup(){
 const sqlite=new DatabaseSync(':memory:');
 for(const f of fs.readdirSync(new URL('../drizzle',import.meta.url)).filter(f=>/^\d+.*\.sql$/.test(f)).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 sqlite.exec(`INSERT INTO tenants VALUES ('t1','now','Tenant','tenant','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ORG','Org','Empresa','AOA','Ativa');`);
 return {sqlite,db:new D1(sqlite)};
}
const subscription=(sqlite,tier,extraProjects=0)=>sqlite.exec(`INSERT INTO commerce_accounts VALUES ('a1','sub:t1','t1@test','Ativa','now','now'); INSERT INTO checkout_sessions VALUES ('c1','a1','AO-2026-02','ENTERPRISE','monthly',1,25,'AOA',15000000,'Pago','idem1','later','now','now',0,'monthly'); INSERT INTO subscriptions (id,account_id,checkout_id,tenant_id,bundle_code,billing_interval,status,current_period_start,current_period_end,created_at,employee_tier,extra_financial_model_projects) VALUES ('s1','a1','c1','t1','ENTERPRISE','monthly','Ativa','now','later','now','${tier}',${extraProjects});`);
const employee=(sqlite,id,status='Ativo')=>sqlite.exec(`INSERT INTO employees VALUES ('${id}','t1','now','E-${id}','Nome','Teste','o1','Cargo','2026-01-01','${status}')`);

test('employeeCapacityError allows a tenant with no commercial subscription on record',async()=>{const f=setup();assert.equal(await employeeCapacityError(f.db,'t1'),null);f.sqlite.close()});
test('employeeCapacityError blocks exactly at the tier ceiling, never before it',async()=>{
 const f=setup();subscription(f.sqlite,'T1');
 for(let i=0;i<49;i++)employee(f.sqlite,`e${i}`);
 assert.equal(await employeeCapacityError(f.db,'t1'),null);
 employee(f.sqlite,'e49');
 assert.match(await employeeCapacityError(f.db,'t1'),/limite de colaboradores/);
 f.sqlite.close();
});
test('employeeCapacityError counts Pendente employees toward the cap, and never counts Inativo ones',async()=>{
 const f=setup();subscription(f.sqlite,'T1');
 for(let i=0;i<50;i++)employee(f.sqlite,`e${i}`,i%2?'Pendente':'Ativo');
 assert.match(await employeeCapacityError(f.db,'t1'),/limite de colaboradores/);
 f.sqlite.exec("UPDATE employees SET status='Inativo' WHERE id='e0'");
 assert.equal(await employeeCapacityError(f.db,'t1'),null);
 f.sqlite.close();
});
test('employeeCapacityError never blocks the uncapped top tier',async()=>{
 const f=setup();subscription(f.sqlite,'T4');
 for(let i=0;i<500;i++)employee(f.sqlite,`e${i}`);
 assert.equal(await employeeCapacityError(f.db,'t1'),null);
 f.sqlite.close();
});
test('financialModelProjectCapacityError allows a tenant with no commercial subscription on record',async()=>{const f=setup();assert.equal(await financialModelProjectCapacityError(f.db,'t1'),null);f.sqlite.close()});
test('financialModelProjectCapacityError enforces the included-project allowance per tier',async()=>{
 const f=setup();subscription(f.sqlite,'T1');
 assert.equal(await financialModelProjectCapacityError(f.db,'t1'),null);
 f.sqlite.exec("INSERT INTO financial_models VALUES ('m1','t1','o1','Projeto A','AOA','2026-01',12,0,'Rascunho',1,NULL,'hr@test','now',NULL,NULL,NULL,NULL,NULL)");
 assert.match(await financialModelProjectCapacityError(f.db,'t1'),/Limite de projetos/);
 f.sqlite.close();
});
test('financialModelProjectCapacityError counts distinct project names, not model/version rows',async()=>{
 const f=setup();subscription(f.sqlite,'T2');
 f.sqlite.exec("INSERT INTO financial_models VALUES ('m1','t1','o1','Projeto A','AOA','2026-01',12,0,'Rascunho',1,NULL,'hr@test','now',NULL,NULL,NULL,NULL,NULL)");
 f.sqlite.exec("INSERT INTO financial_models VALUES ('m2','t1','o1','Projeto A','AOA','2026-01',12,0,'Rascunho',2,NULL,'hr@test','now',NULL,NULL,NULL,NULL,NULL)");
 assert.equal(await financialModelProjectCapacityError(f.db,'t1'),null);
 f.sqlite.exec("INSERT INTO financial_models VALUES ('m3','t1','o1','Projeto B','AOA','2026-01',12,0,'Rascunho',1,NULL,'hr@test','now',NULL,NULL,NULL,NULL,NULL)");
 assert.match(await financialModelProjectCapacityError(f.db,'t1'),/Limite de projetos/);
 f.sqlite.close();
});
test('financialModelProjectCapacityError adds purchased extra projects to the included allowance',async()=>{
 const f=setup();subscription(f.sqlite,'T1',2);
 for(const name of ['Projeto A','Projeto B'])f.sqlite.exec(`INSERT INTO financial_models VALUES ('m-${name}','t1','o1','${name}','AOA','2026-01',12,0,'Rascunho',1,NULL,'hr@test','now',NULL,NULL,NULL,NULL,NULL)`);
 assert.equal(await financialModelProjectCapacityError(f.db,'t1'),null);
 f.sqlite.exec("INSERT INTO financial_models VALUES ('m-Projeto C','t1','o1','Projeto C','AOA','2026-01',12,0,'Rascunho',1,NULL,'hr@test','now',NULL,NULL,NULL,NULL,NULL)");
 assert.match(await financialModelProjectCapacityError(f.db,'t1'),/Limite de projetos/);
 f.sqlite.close();
});
