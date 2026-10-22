import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {reviewsApi} from '../worker/reviews.ts';
class Statement {
 constructor(sqlite,sql){this.sqlite=sqlite;this.sql=sql;this.values=[]}
 bind(...values){this.values=values;return this}
 all(){return {results:this.sqlite.prepare(this.sql).all(...this.values)}}
 first(){return this.sqlite.prepare(this.sql).get(...this.values)||null}
 run(){const result=this.sqlite.prepare(this.sql).run(...this.values);return {meta:{changes:result.changes}}}
}
class D1 {
 constructor(sqlite){this.sqlite=sqlite}
 prepare(sql){return new Statement(this.sqlite,sql)}
 async batch(statements){this.sqlite.exec('BEGIN');try{const result=statements.map(statement=>statement.run());this.sqlite.exec('COMMIT');return result}catch(error){this.sqlite.exec('ROLLBACK');throw error}}
}
function setup(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(file=>/^\d+.*\.sql$/.test(file)).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 for(const [tenant,organization] of [['t1','o1'],['t1','o2'],['t2','o3']]){
  sqlite.prepare("INSERT OR IGNORE INTO tenants VALUES (?,'now',?,?,'Ativo')").run(tenant,tenant,tenant);
  sqlite.prepare("INSERT INTO organizations VALUES (?,?,'now',?,?,'Empresa','AOA','Ativa')").run(organization,tenant,organization,organization);
  for(const [suffix,role] of [['subject','Colaborador'],['manager','Gestor'],['calibrator','Recursos Humanos']])sqlite.prepare("INSERT INTO platform_users VALUES (?,?,'now',?,?,?,?,'Ativo')").run(organization+suffix,tenant,suffix,suffix+'@'+organization+'.test',role,organization);
  sqlite.prepare("INSERT INTO performance_cycles (id,tenant_id,name,start_date,end_date,status,created_by,created_at) VALUES (?,?,?,'2026-01-01','2026-12-31','Rascunho','admin','now')").run('cycle'+organization,tenant,'Cycle '+organization);
  sqlite.prepare("INSERT INTO performance_goals (id,tenant_id,cycle_id,organization_id,owner_email,title,metric_name,unit,direction,start_scaled,target_scaled,scale,weight_bps,status,created_by,created_at) VALUES (?,?,?,?,?,'Margem operacional','Margem','%','Aumentar',0,2000,100,10000,'Rascunho','admin','now')").run('goal'+organization,tenant,'cycle'+organization,organization,'subject@'+organization+'.test');
  sqlite.prepare("UPDATE performance_cycles SET status='Ativo' WHERE id=?").run('cycle'+organization);
  sqlite.prepare("INSERT INTO performance_goal_checkins VALUES (?,?,?,1850,'Real data','ERP','admin','2026-08-01')").run('check'+organization,tenant,'goal'+organization);
  sqlite.prepare("INSERT INTO performance_reviews (id,tenant_id,cycle_id,organization_id,subject_email,reviewer_email,status,created_by,created_at) VALUES (?,?,?,?,?,?,'Aguardando autoavaliação','admin','now')").run('review'+organization,tenant,'cycle'+organization,organization,'subject@'+organization+'.test','manager@'+organization+'.test');
 }
 sqlite.exec("INSERT INTO organizations VALUES ('dept','t1','now','FIN','Financeiro','Departamento','AOA','Ativa'); INSERT INTO employees VALUES ('employee','t1','now','RH001','Pessoa','Real','o1','Controller','2026-01-01','Ativo'); INSERT INTO employee_profile (tenant_id,employee_id,updated_by,updated_at,department_organization_id) VALUES ('t1','employee','admin','now','dept'); INSERT INTO employee_portal_accounts (id,tenant_id,employee_id,email,status,invited_by,invited_at,created_at) VALUES ('portal','t1','employee','subject@o1.test','Convidado','admin','now','now')");
 return {sqlite,db:new D1(sqlite)};
}
const manager={tenantId:'t1',organizationId:'o1',email:'manager@o1.test',role:'Gestor'};
const request=body=>new Request('https://example.test/api/v1/reviews',body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});
async function read(db,security=manager){const response=await reviewsApi(request(),db,security);const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body}
async function command(db,body,security){const response=await reviewsApi(request(body),db,security);const result=await response.json();assert.equal(response.status,201,JSON.stringify(result));return result}
test('review detail reads actual employee context and goals without leaking tenants or organizations',async()=>{
 const {sqlite,db}=setup();try{
  const before=sqlite.prepare('SELECT COUNT(*) count FROM performance_review_goal_snapshots').get().count;
  const data=await read(db);assert.equal(data.reviews.length,1);assert.equal(data.goals.length,1);assert.equal(data.reviews[0].subject_job_title,'Controller');assert.equal(data.reviews[0].subject_number,'RH001');assert.equal(data.reviews[0].department_name,'Financeiro');assert.equal(data.reviews[0].cycle_end_date,'2026-12-31');assert.equal(data.goals[0].value_scaled,1850);assert.equal(data.goals[0].target_scaled,2000);assert.equal(data.goals[0].captured_at,null);assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM performance_review_goal_snapshots').get().count,before,'Reading cannot create evidence');
  const other=await read(db,{...manager,organizationId:'o2'});assert.equal(other.goals[0].review_id,'reviewo2');assert.equal(other.reviews[0].subject_job_title,null,'No employee inferred from names or another organization');
  const tenant=await read(db,{...manager,tenantId:'t2',organizationId:null});assert.deepEqual(tenant.reviews.map(review=>review.id),['reviewo3']);assert.deepEqual(tenant.goals.map(goal=>goal.review_id),['reviewo3']);
 }finally{sqlite.close()}
});
test('review rows keep immutable captured values, original scoring and actor segregation after new check-ins',async()=>{
 const {sqlite,db}=setup();try{
  const refused=await reviewsApi(request({type:'managerReview',reviewId:'reviewo1',rating:'4',comment:'Evidence'}),db,manager);assert.equal(refused.status,404);
  await command(db,{type:'selfReview',reviewId:'reviewo1',rating:'3',comment:'Self evidence'},{...manager,email:'subject@o1.test',role:'Colaborador'});
  const wrong=await reviewsApi(request({type:'managerReview',reviewId:'reviewo1',rating:'4',comment:'Wrong actor'}),db,{...manager,email:'calibrator@o1.test'});assert.equal(wrong.status,403);
  const assessed=await command(db,{type:'managerReview',reviewId:'reviewo1',rating:'4',comment:'Manager evidence'},manager);assert.equal(assessed.reviews[0].goal_score_bps,9250);assert.equal(assessed.reviews[0].final_score_bps,8750);
  await command(db,{type:'calibrate',reviewId:'reviewo1',rating:'4',reason:'Independent calibration evidence'},{...manager,email:'calibrator@o1.test',role:'Recursos Humanos'});
  sqlite.exec("INSERT INTO performance_goal_checkins VALUES ('later','t1','goalo1',2200,'Later value','ERP','admin','2026-09-01')");
  const result=await read(db);assert.equal(result.goals[0].value_scaled,1850);assert.equal(result.goals[0].progress_bps,9250);assert(result.goals[0].captured_at);assert.equal(result.reviews[0].manager_comment,'Manager evidence');assert.equal(result.reviews[0].final_score_bps,8750);
  sqlite.exec("UPDATE performance_goals SET status='Cancelado' WHERE id='goalo1'");assert.equal((await read(db)).goals.length,1,'Captured evidence survives later goal cancellation');
  sqlite.exec("UPDATE performance_cycles SET status='Fechado' WHERE id='cycleo1'");assert.equal((await read(db)).cycles.find(cycle=>cycle.id==='cycleo1').status,'Fechado','Closed cycles remain filterable');
 }finally{sqlite.close()}
});
