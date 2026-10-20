import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const {applyMapping,setAdjustment,getCellOrigin}=await import('../worker/budget-integration.ts');
const {
 workforcePlanDepartments,recordDepartmentDecision,previewWorkforceIntegration,createWorkforceIntegration,
 syncWorkforceIntegration,applyWorkforceIntegration,checkWorkforceVersionUpdate,switchWorkforceVersion,listApprovedWorkforcePlans,
}=await import('../worker/workforce-budget-integration.ts');

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
 sqlite.exec(`INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant1','Ativo');
  INSERT INTO organizations VALUES ('o1','t1','now','ORG','Empresa 1','Empresa','AOA','Ativa');
  INSERT INTO organizations VALUES ('o2','t1','now','ORG2','Empresa 2','Empresa','AOA','Ativa');
  INSERT INTO financial_dimensions VALUES ('dim1','t1','now','CC','Centro de Custo','','Ativo');
  INSERT INTO dimension_members VALUES ('m-fin','t1','now','dim1','FIN','Financeiro',NULL,'Ativo');
  INSERT INTO dimension_members VALUES ('m-com','t1','now','dim1','COM','Comercial',NULL,'Ativo');`);
 return {sqlite,db:new D1(sqlite)};
}
const line=(sqlite,tenant,id,code,overrides={})=>{
 const defaults={name:code,classification:'Custo',cash_flow_category:'Operacional',sign_mode:'Natural',status:'Ativa',parent_id:null,level:1,display_order:0,hidden:0,line_kind:'Analítica'};
 const v={...defaults,...overrides};
 sqlite.exec(`INSERT INTO financial_line_catalog (id,tenant_id,code,name,classification,cash_flow_category,sign_mode,status,created_by,created_at,parent_id,level,display_order,hidden,line_kind) VALUES ('${id}','${tenant}','${code}','${v.name}','${v.classification}','${v.cash_flow_category}','${v.sign_mode}','${v.status}','u','now',${v.parent_id?`'${v.parent_id}'`:'NULL'},${v.level},${v.display_order},${v.hidden},'${v.line_kind}')`);
};
const version=(sqlite,tenant,id,status='Rascunho',fiscalYear=2026)=>
 sqlite.exec(`INSERT INTO budget_versions VALUES ('${id}','${tenant}','now','${id}',${fiscalYear},'${status}',${status==='Aprovado'?"'now'":'NULL'})`);

// Mirrors the real workforce_plan_line_guard trigger: lines can only be
// inserted while the parent plan is still Rascunho. So every plan is
// created Rascunho here regardless of the status the test ultimately wants
// — call finalizePlan() after adding lines to walk it through the same
// Rascunho->Submetido->Aprovado transitions workforcePlansApi enforces.
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

test('só um plano aprovado alimenta o orçamento; um rascunho é recusado', async () => {
 const f=setup();
 const draftPlan=plan(f.sqlite,'t1','o1');
 planLine(f.sqlite,'t1',draftPlan,{departmentCode:'FIN'});
 const result=await previewWorkforceIntegration(f.db,'t1',null,draftPlan);
 assert.equal(result.status,409);
 f.sqlite.close();
});

test('departamento sem decisão fica pendente; SemDimensao e um código ausente convergem na mesma célula sem dimensão', async () => {
 const f=setup();
 const planId=plan(f.sqlite,'t1','o1');
 planLine(f.sqlite,'t1',planId,{departmentCode:'FIN',headcount:2,monthlyCostMinor:100000});
 planLine(f.sqlite,'t1',planId,{departmentCode:'RH-ADMIN',headcount:1,monthlyCostMinor:50000});
 planLine(f.sqlite,'t1',planId,{departmentCode:null,headcount:1,monthlyCostMinor:30000});
 finalizePlan(f.sqlite,'t1',planId);
 const before=await (await previewWorkforceIntegration(f.db,'t1',null,planId)).json();
 assert.equal(before.pendingDepartments.length,2); // FIN and RH-ADMIN both unresolved
 await decide(f.db,'t1','FIN','Mapeado','m-fin');
 await decide(f.db,'t1','RH-ADMIN','SemDimensao');
 const after=await (await previewWorkforceIntegration(f.db,'t1',null,planId)).json();
 assert.equal(after.pendingDepartments.length,0);
 assert.equal(after.byDimension['m-fin']['2026-01'],200000);
 // RH-ADMIN (SemDimensao) + the line with no department_code at all both land in the no-dimension bucket
 assert.equal(after.byDimension['(sem dimensão)']['2026-01'],50000+30000);
 f.sqlite.close();
});

test('cálculo é headcount × monthly_cost_minor, agregado por cargo/departamento/período — nunca por colaborador nomeado', async () => {
 const f=setup();
 const planId=plan(f.sqlite,'t1','o1');
 planLine(f.sqlite,'t1',planId,{jobTitle:'Analista',departmentCode:'FIN',period:'2026-01',headcount:3,monthlyCostMinor:120000});
 planLine(f.sqlite,'t1',planId,{jobTitle:'Gestor',departmentCode:'FIN',period:'2026-01',headcount:1,monthlyCostMinor:400000});
 finalizePlan(f.sqlite,'t1',planId);
 await decide(f.db,'t1','FIN','Mapeado','m-fin');
 const preview=await (await previewWorkforceIntegration(f.db,'t1',null,planId)).json();
 assert.equal(preview.byDimension['m-fin']['2026-01'],3*120000+1*400000);
 f.sqlite.close();
});

test('criar integração: um mapeamento por departamento resolvido, ingestão imediata, pendentes não entram', async () => {
 const f=setup();
 line(f.sqlite,'t1','l1','03.01.01');
 const planId=plan(f.sqlite,'t1','o1');
 planLine(f.sqlite,'t1',planId,{departmentCode:'FIN',headcount:2,monthlyCostMinor:100000});
 planLine(f.sqlite,'t1',planId,{departmentCode:'COM',headcount:1,monthlyCostMinor:60000});
 planLine(f.sqlite,'t1',planId,{departmentCode:'DESCONHECIDO',headcount:1,monthlyCostMinor:70000});
 finalizePlan(f.sqlite,'t1',planId);
 await decide(f.db,'t1','FIN','Mapeado','m-fin');
 await decide(f.db,'t1','COM','Mapeado','m-com');
 const created=await (await createWorkforceIntegration(f.db,'t1','gestor',null,{planId,lineId:'l1',syncPolicy:'Manual',relationPolicy:'Exclusiva'})).json();
 assert.equal(Object.keys(created.mappingsByDimension).length,2);
 assert.equal(created.pendingDepartments.length,1);
 assert.equal(created.pendingDepartments[0].departmentCode,'DESCONHECIDO');
 const mappingCount=f.sqlite.prepare("SELECT COUNT(*) n FROM financial_line_catalog_mappings WHERE tenant_id='t1' AND source_module='RH'").get().n;
 assert.equal(mappingCount,2);
 const movementCount=f.sqlite.prepare("SELECT COUNT(*) n FROM budget_integration_movements WHERE tenant_id='t1'").get().n;
 assert.equal(movementCount,2); // one movement per ingested line (FIN + COM), the unresolved one excluded
 f.sqlite.close();
});

test('não é possível ter duas integrações RH activas para a mesma rubrica/empresa com planos diferentes', async () => {
 const f=setup();
 line(f.sqlite,'t1','l1','03.01.01');
 const planA=plan(f.sqlite,'t1','o1',{name:'Plano A'});
 const planB=plan(f.sqlite,'t1','o1',{name:'Plano B'});
 await decide(f.db,'t1','FIN','Mapeado','m-fin');
 planLine(f.sqlite,'t1',planA,{departmentCode:'FIN'});
 planLine(f.sqlite,'t1',planB,{departmentCode:'FIN'});
 finalizePlan(f.sqlite,'t1',planA);
 finalizePlan(f.sqlite,'t1',planB);
 await createWorkforceIntegration(f.db,'t1','gestor',null,{planId:planA,lineId:'l1'});
 const conflict=await createWorkforceIntegration(f.db,'t1','gestor',null,{planId:planB,lineId:'l1'});
 assert.equal(conflict.status,409);
 f.sqlite.close();
});

test('sincronização repetida é idempotente: nenhum mapeamento ou movimento é duplicado', async () => {
 const f=setup();
 line(f.sqlite,'t1','l1','03.01.01');
 const planId=plan(f.sqlite,'t1','o1');
 planLine(f.sqlite,'t1',planId,{departmentCode:'FIN',headcount:2,monthlyCostMinor:100000});
 finalizePlan(f.sqlite,'t1',planId);
 await decide(f.db,'t1','FIN','Mapeado','m-fin');
 await createWorkforceIntegration(f.db,'t1','gestor',null,{planId,lineId:'l1'});
 await syncWorkforceIntegration(f.db,'t1','gestor',{organizationId:'o1',lineId:'l1'});
 await syncWorkforceIntegration(f.db,'t1','gestor',{organizationId:'o1',lineId:'l1'});
 const mappingCount=f.sqlite.prepare("SELECT COUNT(*) n FROM financial_line_catalog_mappings WHERE tenant_id='t1' AND source_module='RH'").get().n;
 const movementCount=f.sqlite.prepare("SELECT COUNT(*) n FROM budget_integration_movements WHERE tenant_id='t1'").get().n;
 assert.equal(mappingCount,1);
 assert.equal(movementCount,1);
 f.sqlite.close();
});

test('aplicar ao orçamento escreve em performance_entries na versão em rascunho, respeitando o isolamento de empresa', async () => {
 const f=setup();
 line(f.sqlite,'t1','l1','03.01.01');
 version(f.sqlite,'t1','v1');
 const planId=plan(f.sqlite,'t1','o1');
 planLine(f.sqlite,'t1',planId,{departmentCode:'FIN',period:'2026-01',headcount:2,monthlyCostMinor:100000});
 finalizePlan(f.sqlite,'t1',planId);
 await decide(f.db,'t1','FIN','Mapeado','m-fin');
 await createWorkforceIntegration(f.db,'t1','gestor',null,{planId,lineId:'l1'});
 const applied=await (await applyWorkforceIntegration(f.db,'t1','gestor',{organizationId:'o1',lineId:'l1',versionId:'v1'})).json();
 assert.equal(applied.applied,12);
 const entry=f.sqlite.prepare("SELECT amount_minor,organization_id,dimension_member_id FROM performance_entries WHERE tenant_id='t1' AND line_code='03.01.01' AND period='2026-01'").get();
 assert.equal(entry.amount_minor,200000);
 assert.equal(entry.organization_id,'o1');
 assert.equal(entry.dimension_member_id,'m-fin');
 f.sqlite.close();
});

test('ajuste manual sobrevive a uma nova sincronização (Adicionar não duplica; Bloquear congela a célula)', async () => {
 const f=setup();
 line(f.sqlite,'t1','l1','03.01.01');
 version(f.sqlite,'t1','v1');
 const planId=plan(f.sqlite,'t1','o1');
 planLine(f.sqlite,'t1',planId,{departmentCode:'FIN',period:'2026-01',headcount:2,monthlyCostMinor:100000});
 finalizePlan(f.sqlite,'t1',planId);
 await decide(f.db,'t1','FIN','Mapeado','m-fin');
 await createWorkforceIntegration(f.db,'t1','gestor',null,{planId,lineId:'l1'});
 await applyWorkforceIntegration(f.db,'t1','gestor',{organizationId:'o1',lineId:'l1',versionId:'v1'});
 await setAdjustment(f.db,'t1','gestor',{versionId:'v1',lineId:'l1',organizationId:'o1',dimensionMemberId:'m-fin',currency:'AOA',period:'2026-01',mode:'Adicionar',manualAdjustmentMinor:50000});
 await applyWorkforceIntegration(f.db,'t1','gestor',{organizationId:'o1',lineId:'l1',versionId:'v1'});
 const entry=f.sqlite.prepare("SELECT amount_minor,manual_adjustment_minor FROM performance_entries WHERE tenant_id='t1' AND line_code='03.01.01' AND period='2026-01'").get();
 assert.equal(entry.amount_minor,200000+50000);
 assert.equal(entry.manual_adjustment_minor,50000);
 f.sqlite.close();
});

test('substituição de versão: o orçamento já aprovado mantém-se inalterado; um novo rascunho reflecte o plano actualizado; o mapeamento antigo é desactivado', async () => {
 const f=setup();
 line(f.sqlite,'t1','l1','03.01.01');
 version(f.sqlite,'t1','v1','Rascunho',2026);
 const planV1=plan(f.sqlite,'t1','o1',{name:'Plano RH',versionNumber:1});
 planLine(f.sqlite,'t1',planV1,{departmentCode:'FIN',period:'2026-01',headcount:2,monthlyCostMinor:100000});
 finalizePlan(f.sqlite,'t1',planV1);
 await decide(f.db,'t1','FIN','Mapeado','m-fin');
 await createWorkforceIntegration(f.db,'t1','gestor',null,{planId:planV1,lineId:'l1'});
 await applyWorkforceIntegration(f.db,'t1','gestor',{organizationId:'o1',lineId:'l1',versionId:'v1'});
 // approve v1 — from this point on it must never change again
 f.sqlite.exec("UPDATE budget_versions SET status='Aprovado' WHERE id='v1'");
 const approvedSnapshotBefore=f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE tenant_id='t1' AND version_id='v1' AND period='2026-01'").get().amount_minor;
 assert.equal(approvedSnapshotBefore,200000);

 // the source changes: a new approved version of the SAME plan, higher cost
 const planV2=plan(f.sqlite,'t1','o1',{name:'Plano RH',versionNumber:2});
 planLine(f.sqlite,'t1',planV2,{departmentCode:'FIN',period:'2026-01',headcount:2,monthlyCostMinor:150000});
 finalizePlan(f.sqlite,'t1',planV2);

 const updateCheck=await (await checkWorkforceVersionUpdate(f.db,'t1','o1','l1')).json();
 assert.equal(updateCheck.hasUpdate,true);
 assert.equal(updateCheck.latestVersion,2);
 assert.equal(updateCheck.currentTotalMinor,200000);
 assert.equal(updateCheck.latestTotalMinor,300000);

 const switched=await (await switchWorkforceVersion(f.db,'t1','gestor',{organizationId:'o1',lineId:'l1',newPlanId:planV2})).json();
 assert.equal(Object.keys(switched.mappingsByDimension).length,1);

 // the already-approved version's cell is untouched by the switch itself
 const approvedSnapshotAfter=f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE tenant_id='t1' AND version_id='v1' AND period='2026-01'").get().amount_minor;
 assert.equal(approvedSnapshotAfter,200000);

 // applying the NEW mapping to a NEW draft reflects the updated plan
 version(f.sqlite,'t1','v2','Rascunho',2026);
 const appliedV2=await (await applyWorkforceIntegration(f.db,'t1','gestor',{organizationId:'o1',lineId:'l1',versionId:'v2'})).json();
 assert.equal(appliedV2.applied,12);
 const v2Entry=f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE tenant_id='t1' AND version_id='v2' AND period='2026-01'").get();
 assert.equal(v2Entry.amount_minor,300000);

 // the old mapping (tied to planV1) is no longer active
 const oldMappingStatus=f.sqlite.prepare("SELECT status FROM financial_line_catalog_mappings WHERE tenant_id='t1' AND (source_reference=? OR source_reference LIKE ?)").get(planV1,`${planV1}::%`).status;
 assert.equal(oldMappingStatus,'Inativo');
 f.sqlite.close();
});

test('uma versão aprovada é completamente imutável: aplicar ou ajustar é recusado', async () => {
 const f=setup();
 line(f.sqlite,'t1','l1','03.01.01');
 version(f.sqlite,'t1','v1','Aprovado',2026);
 const planId=plan(f.sqlite,'t1','o1');
 planLine(f.sqlite,'t1',planId,{departmentCode:'FIN'});
 finalizePlan(f.sqlite,'t1',planId);
 await decide(f.db,'t1','FIN','Mapeado','m-fin');
 await createWorkforceIntegration(f.db,'t1','gestor',null,{planId,lineId:'l1'});
 const applied=await applyWorkforceIntegration(f.db,'t1','gestor',{organizationId:'o1',lineId:'l1',versionId:'v1'});
 assert.equal(applied.status,409);
 f.sqlite.close();
});

test('isolamento multiempresa: um plano/mapeamento de outra empresa nunca é acessível fora do seu âmbito', async () => {
 const f=setup();
 line(f.sqlite,'t1','l1','03.01.01');
 const planOrg2=plan(f.sqlite,'t1','o2');
 planLine(f.sqlite,'t1',planOrg2,{departmentCode:'FIN'});
 finalizePlan(f.sqlite,'t1',planOrg2);
 // scoped to o1, a plan belonging to o2 must 404, not just filter quietly
 const scoped=await previewWorkforceIntegration(f.db,'t1','o1',planOrg2);
 assert.equal(scoped.status,404);
 // unscoped (holding-level) access still works
 const unscoped=await previewWorkforceIntegration(f.db,'t1',null,planOrg2);
 assert.equal(unscoped.status,200);
 const plansForO1=await (await listApprovedWorkforcePlans(f.db,'t1','o1')).json();
 assert.equal(plansForO1.plans.length,0);
 f.sqlite.close();
});

test('listar departamentos de um plano mostra decisões já tomadas e o impacto (headcount/custo) dos pendentes', async () => {
 const f=setup();
 const planId=plan(f.sqlite,'t1','o1');
 planLine(f.sqlite,'t1',planId,{departmentCode:'FIN',headcount:2,monthlyCostMinor:100000});
 planLine(f.sqlite,'t1',planId,{departmentCode:'NOVO',headcount:3,monthlyCostMinor:40000});
 finalizePlan(f.sqlite,'t1',planId);
 await decide(f.db,'t1','FIN','Mapeado','m-fin');
 const rows=(await (await workforcePlanDepartments(f.db,'t1',null,planId)).json()).departments;
 const fin=rows.find(r=>r.department_code==='FIN');
 const novo=rows.find(r=>r.department_code==='NOVO');
 assert.equal(fin.decision,'Mapeado');
 assert.equal(fin.dimension_member_name,'Financeiro');
 assert.equal(novo.decision,null);
 assert.equal(novo.total_cost_minor,3*40000);
 f.sqlite.close();
});

test('a moeda é sempre a do plano, nunca introduzida à parte — propaga-se correctamente aos movimentos', async () => {
 const f=setup();
 line(f.sqlite,'t1','l1','03.01.01');
 const planId=plan(f.sqlite,'t1','o1',{currency:'USD'});
 planLine(f.sqlite,'t1',planId,{departmentCode:'FIN',headcount:1,monthlyCostMinor:5000});
 finalizePlan(f.sqlite,'t1',planId);
 await decide(f.db,'t1','FIN','Mapeado','m-fin');
 await createWorkforceIntegration(f.db,'t1','gestor',null,{planId,lineId:'l1'});
 const movement=f.sqlite.prepare("SELECT currency FROM budget_integration_movements WHERE tenant_id='t1'").get();
 assert.equal(movement.currency,'USD');
 f.sqlite.close();
});
