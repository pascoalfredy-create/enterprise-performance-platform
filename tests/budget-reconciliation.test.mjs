import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const {createMapping,setMappingStatus,listMappings,checkForUpdates,confirmMovements,applyMapping,setAdjustment,getCellOrigin}=await import('../worker/budget-integration.ts');
const {budgetAnnualMapSnapshot,buildApprovalLineSnapshotStatements}=await import('../worker/budget-annual-map.ts');

class Statement{constructor(db,sql){this.db=db;this.sql=sql;this.values=[]}bind(...values){this.values=values;return this}run(){const r=this.db.prepare(this.sql).run(...this.values);return {success:true,meta:{changes:r.changes}}}all(){return {results:this.db.prepare(this.sql).all(...this.values)}}first(){return this.db.prepare(this.sql).get(...this.values)||null}}
class D1{
 constructor(db){this.db=db}
 prepare(sql){return new Statement(this.db,sql)}
 async batch(statements){
  this.db.exec('BEGIN');
  try{const out=statements.map(s=>s.run());this.db.exec('COMMIT');return out}
  catch(e){this.db.exec('ROLLBACK');throw e}
 }
}
function setup(){
 const sqlite=new DatabaseSync(':memory:');
 for(const f of fs.readdirSync(new URL('../drizzle',import.meta.url)).filter(f=>/^\d+.*\.sql$/.test(f)).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 sqlite.exec(`INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant1','Ativo'); INSERT INTO tenants VALUES ('t2','now','Tenant 2','tenant2','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ORG','Org','Empresa','AOA','Ativa'); INSERT INTO organizations VALUES ('o1b','t1','now','ORG2','Org 2','Empresa','AOA','Ativa'); INSERT INTO organizations VALUES ('o2','t2','now','ORG','Org','Empresa','AOA','Ativa');`);
 return {sqlite,db:new D1(sqlite)};
}
const line=(sqlite,tenant,id,code,overrides={})=>{
 const defaults={name:code,classification:'Custo',cash_flow_category:'Operacional',sign_mode:'Natural',status:'Ativa',parent_id:null,level:1,display_order:0,hidden:0,line_kind:'Analítica'};
 const v={...defaults,...overrides};
 sqlite.exec(`INSERT INTO financial_line_catalog (id,tenant_id,code,name,classification,cash_flow_category,sign_mode,status,created_by,created_at,parent_id,level,display_order,hidden,line_kind) VALUES ('${id}','${tenant}','${code}','${v.name}','${v.classification}','${v.cash_flow_category}','${v.sign_mode}','${v.status}','u','now',${v.parent_id?`'${v.parent_id}'`:'NULL'},${v.level},${v.display_order},${v.hidden},'${v.line_kind}')`);
};
const version=(sqlite,tenant,id,status='Rascunho',fiscalYear=2026)=>
 sqlite.exec(`INSERT INTO budget_versions VALUES ('${id}','${tenant}','now','V',${fiscalYear},'${status}',${status==='Aprovado'?"'now'":'NULL'})`);

const {batchSaveBudgetCells}=await import('../worker/budget-annual-map.ts');
const {recordDepartmentDecision,createWorkforceIntegration,applyWorkforceIntegration,syncWorkforceIntegration,switchWorkforceVersion}=await import('../worker/workforce-budget-integration.ts');
let planSeq=0;
function plan(sqlite,tenant,orgId,{name='Plano RH',versionNumber=1,currency='AOA',startPeriod='2026-01',endPeriod='2026-12'}={}){
 const id=`plan-${tenant}-${++planSeq}`;
 sqlite.exec(`INSERT INTO workforce_plans (id,tenant_id,organization_id,name,currency,start_period,end_period,version_number,status,created_by,created_at,submitted_by,submitted_at,approved_by,approved_at,approval_hash) VALUES ('${id}','${tenant}','${orgId}','${name}','${currency}','${startPeriod}','${endPeriod}',${versionNumber},'Rascunho','maker','now',NULL,NULL,NULL,NULL,NULL)`);
 return id;
}
function finalizePlan(sqlite,tenant,planId,targetStatus='Aprovado'){
 if(targetStatus==='Rascunho')return;
 sqlite.exec(`UPDATE workforce_plans SET status='Submetido',submitted_by='checker',submitted_at='now' WHERE id='${planId}' AND tenant_id='${tenant}'`);
 if(targetStatus==='Submetido')return;
 sqlite.exec(`UPDATE workforce_plans SET status='Aprovado',approved_by='approver',approved_at='now',approval_hash='hash' WHERE id='${planId}' AND tenant_id='${tenant}'`);
}
let lineSeq=0;
function planLine(sqlite,tenant,planId,{jobTitle='Analista',departmentCode=null,period='2026-01',headcount=2,monthlyCostMinor=100000,movementType='Base',note='Pressuposto de teste'}={}){
 const id=`pline-${tenant}-${++lineSeq}`;
 sqlite.exec(`INSERT INTO workforce_plan_lines VALUES ('${id}','${tenant}','${planId}','${jobTitle}',${departmentCode?`'${departmentCode}'`:'NULL'},'${period}',${headcount},${monthlyCostMinor},'${movementType}','${note}','maker','now')`);
 return id;
}
const decide=(db,tenant,departmentCode,decision,dimensionMemberId=null)=>
 recordDepartmentDecision(db,tenant,'gestor',{departmentCode,decision,dimensionMemberId});


async function generic(policy='Manual'){
 const f=setup();line(f.sqlite,'t1','l1','03.01.01');version(f.sqlite,'t1','v1');
 const j=await (await createMapping(f.db,'t1','u',{organizationId:'o1',lineId:'l1',currency:'AOA',sourceModule:'RH',sourceReference:'audit-plan',syncPolicy:policy})).json();
 f.mappingId=j.id;return f;
}
const mv=(ref,amount,period='2026-01')=>({organizationId:'o1',sourceModule:'RH',sourceReference:ref,componentLabel:ref,period,currency:'AOA',dimensionMemberId:null,financialNature:'Economico',amountMinor:amount,sourceStatus:'Aprovado',sourceFingerprint:ref+':'+amount});
const read=f=>f.sqlite.prepare("SELECT period,amount_minor,dimension_member_id FROM performance_entries WHERE scenario='Budget' AND version_id='v1' AND amount_minor<>0 ORDER BY period,dimension_member_id").all();
const ingest=async(f,values)=>checkForUpdates(f.db,'t1',f.mappingId,values,{fromPeriod:'2026-01',toPeriod:'2026-12'});
const apply=async f=>applyMapping(f.db,'t1','u',{mappingId:f.mappingId,versionId:'v1'});
function probe(name,fn){test(name,async()=>{const r=await fn();
 if(name==='empty month after full source refresh')assert.equal(r.actual.find(x=>x.period==='2026-02')?.amount_minor||0,r.expectedFebruary);
 else if(name==='RH mapping failures are returned as HTTP errors')assert.ok(r.status>=400);
 else if('actualStatus' in r)assert.equal(r.actualStatus,r.expectedStatus);
 else if('expectedAfter' in r)assert.equal(r.after,r.expectedAfter);
 else if('actualTotal' in r)assert.equal(r.actualTotal,r.expectedTotal);
 else assert.equal(r.actual.reduce((n,x)=>n+x.amount_minor,0),r.expectedManual??r.expectedBeforeConfirmation??r.expected);
 });}
probe('empty month after full source refresh',async()=>{const f=await generic();await ingest(f,[mv('a',100),mv('b',200,'2026-02')]);await apply(f);await ingest(f,[mv('a',100)]);await apply(f);return {expectedFebruary:0,actual:read(f)};});
probe('deletion preserves the confirmed amount until confirmation',async()=>{const f=await generic('ComConfirmacao');await ingest(f,[mv('a',100),mv('b',200)]);await apply(f);await ingest(f,[mv('a',100)]);await apply(f);return {expectedBeforeConfirmation:300,actual:read(f)};});
probe('pending change reverted at source',async()=>{const f=await generic('ComConfirmacao');await ingest(f,[mv('a',100)]);await ingest(f,[mv('a',200)]);await ingest(f,[mv('a',100)]);await confirmMovements(f.db,'t1',f.mappingId,null);await apply(f);return {expected:100,actual:read(f)};});
probe('protected manual cell before first integration',async()=>{const f=await generic();await batchSaveBudgetCells(f.db,'t1','u',{versionId:'v1',organizationId:'o1',cells:[{code:'03.01.01',lineName:'Protected',dimensionMemberId:null,period:'2026-01',currency:'AOA',amount:'5.00',manualOverride:true}]});await ingest(f,[mv('a',100)]);await apply(f);return {expectedManual:500,actual:read(f)};});
async function rhFixture(){const f=setup();line(f.sqlite,'t1','l1','03.01.01');version(f.sqlite,'t1','v1');f.sqlite.exec("INSERT INTO financial_dimensions VALUES ('dim','t1','now','CC','Centro de custo','','Ativo'); INSERT INTO dimension_members VALUES ('fin','t1','now','dim','FIN','Financeiro',NULL,'Ativo'); INSERT INTO dimension_members VALUES ('com','t1','now','dim','COM','Comercial',NULL,'Ativo');");return f;}
probe('department dimension reassignment',async()=>{const f=await rhFixture();const id=plan(f.sqlite,'t1','o1');planLine(f.sqlite,'t1',id,{departmentCode:'FIN',headcount:2,monthlyCostMinor:100});finalizePlan(f.sqlite,'t1',id);await decide(f.db,'t1','FIN','Mapeado','fin');await createWorkforceIntegration(f.db,'t1','u',null,{planId:id,lineId:'l1'});await applyWorkforceIntegration(f.db,'t1','u',{organizationId:'o1',lineId:'l1',versionId:'v1'});await decide(f.db,'t1','FIN','Mapeado','com');await syncWorkforceIntegration(f.db,'t1','u',{organizationId:'o1',lineId:'l1'});await applyWorkforceIntegration(f.db,'t1','u',{organizationId:'o1',lineId:'l1',versionId:'v1'});return {expectedTotal:200,actual:read(f),actualTotal:read(f).reduce((n,r)=>n+r.amount_minor,0)};});
probe('department removed in new plan version',async()=>{const f=await rhFixture();const id=plan(f.sqlite,'t1','o1');planLine(f.sqlite,'t1',id,{departmentCode:'FIN',headcount:2,monthlyCostMinor:100});planLine(f.sqlite,'t1',id,{departmentCode:'COM',headcount:1,monthlyCostMinor:100});finalizePlan(f.sqlite,'t1',id);await decide(f.db,'t1','FIN','Mapeado','fin');await decide(f.db,'t1','COM','Mapeado','com');await createWorkforceIntegration(f.db,'t1','u',null,{planId:id,lineId:'l1'});await applyWorkforceIntegration(f.db,'t1','u',{organizationId:'o1',lineId:'l1',versionId:'v1'});const id2=plan(f.sqlite,'t1','o1',{versionNumber:2});planLine(f.sqlite,'t1',id2,{departmentCode:'FIN',headcount:3,monthlyCostMinor:100});finalizePlan(f.sqlite,'t1',id2);await switchWorkforceVersion(f.db,'t1','u',{organizationId:'o1',lineId:'l1',newPlanId:id2});await applyWorkforceIntegration(f.db,'t1','u',{organizationId:'o1',lineId:'l1',versionId:'v1'});return {expectedTotal:300,actual:read(f),actualTotal:read(f).reduce((n,r)=>n+r.amount_minor,0)};});
probe('unknown budget line',async()=>{const f=await generic();const r=await batchSaveBudgetCells(f.db,'t1','u',{versionId:'v1',organizationId:'o1',cells:[{code:'UNKNOWN',lineName:'Invisible line',dimensionMemberId:null,period:'2026-01',currency:'AOA',amount:'5.00'}]});return {expectedStatus:400,actualStatus:r.status,rows:f.sqlite.prepare("SELECT line_code,amount_minor FROM performance_entries WHERE line_code='UNKNOWN'").all()};});
const {PERSONNEL_COST_LINE_CODES_SUBQUERY}=await import('../worker/financial-line-catalog.ts');
probe('approved personnel dashboard survives live mapping deactivation',async()=>{const f=await generic();await ingest(f,[mv('a',100)]);await apply(f);await f.db.batch(await buildApprovalLineSnapshotStatements(f.db,'t1','v1'));f.sqlite.exec("UPDATE budget_versions SET status='Aprovado',approved_at='now' WHERE id='v1'");const amount=()=>f.sqlite.prepare("SELECT SUM(amount_minor) n FROM performance_entries WHERE tenant_id='t1' AND version_id='v1' AND line_code IN "+PERSONNEL_COST_LINE_CODES_SUBQUERY).get('t1','t1','o1','o1').n;const before=amount();await setMappingStatus(f.db,'t1',f.mappingId,'Inativo');return {expectedAfter:100,before,after:amount(),storedValue:read(f)};});
probe('RH mapping failures are returned as HTTP errors',async()=>{const f=await rhFixture();const id=plan(f.sqlite,'t1','o1');planLine(f.sqlite,'t1',id,{headcount:1,monthlyCostMinor:100});finalizePlan(f.sqlite,'t1',id);const r=await createWorkforceIntegration(f.db,'t1','u',null,{planId:id,lineId:'missing-line'});return {expectedHttpError:true,status:r.status,body:await r.json()};});

test('a partial refresh preserves uncovered months, while a complete empty refresh awaits explicit removal confirmation',async()=>{
 const f=await generic('ComConfirmacao');await ingest(f,[mv('a',100),mv('b',200,'2026-02')]);await apply(f);
 await checkForUpdates(f.db,'t1',f.mappingId,[mv('a',100)]);await apply(f);
 assert.equal(read(f).reduce((n,r)=>n+r.amount_minor,0),300);
 await ingest(f,[]);await apply(f);assert.equal(read(f).reduce((n,r)=>n+r.amount_minor,0),300);
 await confirmMovements(f.db,'t1',f.mappingId,null);await apply(f);assert.equal(read(f).length,0);
 await ingest(f,[mv('a',100)]);await confirmMovements(f.db,'t1',f.mappingId,null);await apply(f);assert.equal(read(f)[0].amount_minor,100);f.sqlite.close();
});
test('a full refresh with a foreign currency refuses the entire ingestion without making existing movements obsolete',async()=>{
 const f=await generic();await ingest(f,[mv('a',100)]);await apply(f);
 const r=await ingest(f,[{...mv('b',200),currency:'USD'}]);assert.equal(r.status,400);await apply(f);assert.equal(read(f)[0].amount_minor,100);f.sqlite.close();
});
test('approval freezes the personnel classification per company, including manual budget lines',async()=>{
 const f=await generic();await batchSaveBudgetCells(f.db,'t1','u',{versionId:'v1',organizationId:'o1',cells:[{code:'03.01.01',lineName:'Cost',period:'2026-01',currency:'AOA',dimensionMemberId:null,amount:'1.00'}]});
 await batchSaveBudgetCells(f.db,'t1','u',{versionId:'v1',organizationId:'o1b',cells:[{code:'03.01.01',lineName:'Cost',period:'2026-01',currency:'AOA',dimensionMemberId:null,amount:'9.00'}]});
 await f.db.batch(await buildApprovalLineSnapshotStatements(f.db,'t1','v1'));f.sqlite.exec("UPDATE budget_versions SET status='Aprovado',approved_at='now' WHERE id='v1'");
 await setMappingStatus(f.db,'t1',f.mappingId,'Inativo');f.sqlite.exec("UPDATE financial_line_catalog SET code='RENAMED' WHERE id='l1'");
 const sum=f.sqlite.prepare("SELECT SUM(amount_minor) n FROM performance_entries WHERE tenant_id='t1' AND version_id='v1' AND line_code IN "+PERSONNEL_COST_LINE_CODES_SUBQUERY).get('t1','t1',null,null).n;
 assert.equal(sum,100,'Other company is not classified as personnel by a mapping it never had');const origin=await (await getCellOrigin(f.db,'t1',{versionId:'v1',lineId:'l1',organizationId:'o1',dimensionMemberId:null,period:'2026-01',currency:'AOA'})).json();assert.equal(origin.origin.amountMinor,100,'Historical origin uses the approved code after a catalog rename');f.sqlite.close();
});
test('RH status exposes pending movements and its confirmation action promotes them without editing an approved budget',async()=>{
 const {workforceIntegrationStatus,confirmWorkforceIntegration}=await import('../worker/workforce-budget-integration.ts');
 const f=await rhFixture();const id=plan(f.sqlite,'t1','o1');planLine(f.sqlite,'t1',id,{departmentCode:'FIN',headcount:2,monthlyCostMinor:100});finalizePlan(f.sqlite,'t1',id);await decide(f.db,'t1','FIN','Mapeado','fin');
 await createWorkforceIntegration(f.db,'t1','u',null,{planId:id,lineId:'l1',syncPolicy:'ComConfirmacao'});await applyWorkforceIntegration(f.db,'t1','u',{organizationId:'o1',lineId:'l1',versionId:'v1'});
 await decide(f.db,'t1','FIN','Mapeado','com');await syncWorkforceIntegration(f.db,'t1','u',{organizationId:'o1',lineId:'l1'});
 const status=await (await workforceIntegrationStatus(f.db,'t1','o1','l1')).json();assert.equal(status.pendingMovements.length,1);assert.equal(status.pendingMovements[0].pending_amount_minor,0);
 const r=await confirmWorkforceIntegration(f.db,'t1','o1','l1');assert.equal((await r.json()).confirmed,1);
 await applyWorkforceIntegration(f.db,'t1','u',{organizationId:'o1',lineId:'l1',versionId:'v1'});assert.deepEqual(read(f).map(r=>[r.dimension_member_id,r.amount_minor]),[['com',200]]);f.sqlite.close();
});
test('an approved zero-headcount successor clears every old department in a draft, while unresolved successors preserve the current integration',async()=>{
 const f=await rhFixture(),id=plan(f.sqlite,'t1','o1');planLine(f.sqlite,'t1',id,{departmentCode:'FIN',headcount:2,monthlyCostMinor:100});finalizePlan(f.sqlite,'t1',id);await decide(f.db,'t1','FIN','Mapeado','fin');
 await createWorkforceIntegration(f.db,'t1','u',null,{planId:id,lineId:'l1'});await applyWorkforceIntegration(f.db,'t1','u',{organizationId:'o1',lineId:'l1',versionId:'v1'});
 const unresolved=plan(f.sqlite,'t1','o1',{versionNumber:2});planLine(f.sqlite,'t1',unresolved,{departmentCode:'UNKNOWN'});finalizePlan(f.sqlite,'t1',unresolved);
 assert.equal((await switchWorkforceVersion(f.db,'t1','u',{organizationId:'o1',lineId:'l1',newPlanId:unresolved})).status,409);assert.equal(read(f)[0].amount_minor,200);
 const empty=plan(f.sqlite,'t1','o1',{versionNumber:3});planLine(f.sqlite,'t1',empty,{headcount:0,monthlyCostMinor:100,movementType:'Redução'});finalizePlan(f.sqlite,'t1',empty);
 assert.equal((await switchWorkforceVersion(f.db,'t1','u',{organizationId:'o1',lineId:'l1',newPlanId:empty})).status,200);
 assert.equal((await applyWorkforceIntegration(f.db,'t1','u',{organizationId:'o1',lineId:'l1',versionId:'v1'})).status,200);assert.equal(read(f).length,0);f.sqlite.close();
});
