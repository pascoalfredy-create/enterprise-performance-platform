import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const {budgetAnnualMapSnapshot,batchSaveBudgetCells,createOrUpdateAssumption,deleteAssumption,recalculateLine,buildApprovalLineSnapshotStatements}=await import('../worker/budget-annual-map.ts');

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
 sqlite.exec(`INSERT INTO tenants VALUES ('t1','now','Tenant 1','tenant1','Ativo'); INSERT INTO tenants VALUES ('t2','now','Tenant 2','tenant2','Ativo'); INSERT INTO organizations VALUES ('o1','t1','now','ORG','Org','Empresa','AOA','Ativa'); INSERT INTO organizations VALUES ('o2','t2','now','ORG','Org','Empresa','AOA','Ativa');`);
 return {sqlite,db:new D1(sqlite)};
}
const line=(sqlite,tenant,id,code,overrides={})=>{
 const defaults={name:code,classification:'Custo',cash_flow_category:'Operacional',sign_mode:'Natural',status:'Ativa',parent_id:null,level:1,display_order:0,hidden:0,line_kind:'Analítica'};
 const v={...defaults,...overrides};
 sqlite.exec(`INSERT INTO financial_line_catalog (id,tenant_id,code,name,classification,cash_flow_category,sign_mode,status,created_by,created_at,parent_id,level,display_order,hidden,line_kind) VALUES ('${id}','${tenant}','${code}','${v.name}','${v.classification}','${v.cash_flow_category}','${v.sign_mode}','${v.status}','u','now',${v.parent_id?`'${v.parent_id}'`:'NULL'},${v.level},${v.display_order},${v.hidden},'${v.line_kind}')`);
};
const version=(sqlite,tenant,id,status='Rascunho',fiscalYear=2026)=>
 sqlite.exec(`INSERT INTO budget_versions VALUES ('${id}','${tenant}','now','V',${fiscalYear},'${status}',${status==='Aprovado'?"'now'":'NULL'})`);

test('snapshot nests the hierarchy, fills 12 months of Budget entries and keeps tenants isolated', async () => {
 const f=setup();
 line(f.sqlite,'t1','grp','01',{line_kind:'Agregação'});
 line(f.sqlite,'t1','leaf','01.01',{parent_id:'grp',level:2});
 version(f.sqlite,'t1','v1');
 f.sqlite.exec("INSERT INTO performance_entries VALUES ('e1','t1','now','o1','2026-03','Budget','v1','AOA','01.01','Leaf',NULL,5000,'Manual',0,NULL,0,NULL,NULL)");
 line(f.sqlite,'t2','other','01',{});
 const snap = await budgetAnnualMapSnapshot(f.db,'t1',{versionId:'v1',organizationId:'o1',dimensionMemberId:null,currency:'AOA'});
 assert.equal(snap.tree.length,1);
 assert.equal(snap.tree[0].id,'grp');
 const leaf = snap.tree[0].children[0];
 assert.equal(leaf.monthly.length,12);
 assert.equal(leaf.monthly[2].amountMinor,5000);
 assert.equal(leaf.monthly[2].period,'2026-03');
 assert.equal(leaf.monthly[0].amountMinor,0);
 f.sqlite.close();
});

test('batchSave inserts new cells and updates existing ones (upsert), never duplicating', async () => {
 const f=setup();
 line(f.sqlite,'t1','leaf','L');
 version(f.sqlite,'t1','v1');
 const first = await batchSaveBudgetCells(f.db,'t1','maker@test',{versionId:'v1',organizationId:'o1',cells:[
  {code:'L',lineName:'Leaf',dimensionMemberId:null,period:'2026-01',currency:'AOA',amount:'1000'},
 ]});
 assert.equal(first.status,200);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM performance_entries").get().n,1);
 const second = await batchSaveBudgetCells(f.db,'t1','maker@test',{versionId:'v1',organizationId:'o1',cells:[
  {code:'L',lineName:'Leaf',dimensionMemberId:null,period:'2026-01',currency:'AOA',amount:'2000'},
 ]});
 assert.equal(second.status,200);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM performance_entries").get().n,1);
 assert.equal(f.sqlite.prepare("SELECT amount_minor FROM performance_entries").get().amount_minor,200000);
 f.sqlite.close();
});

test('batchSave is refused entirely for an approved version', async () => {
 const f=setup();
 line(f.sqlite,'t1','leaf','L');
 version(f.sqlite,'t1','v1','Aprovado');
 const result = await batchSaveBudgetCells(f.db,'t1','maker@test',{versionId:'v1',organizationId:'o1',cells:[
  {code:'L',lineName:'Leaf',dimensionMemberId:null,period:'2026-01',currency:'AOA',amount:'1000'},
 ]});
 assert.equal(result.status,409);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM performance_entries").get().n,0);
 f.sqlite.close();
});

test('an assumption cannot be created for a method that is not operational yet (Percentagem/Historico)', async () => {
 const f=setup();
 line(f.sqlite,'t1','leaf','L');
 version(f.sqlite,'t1','v1');
 const result = await createOrUpdateAssumption(f.db,'t1','maker@test',{
  versionId:'v1',lineId:'leaf',organizationId:'o1',currency:'AOA',method:'Percentagem',params:{sourceLineId:'x',percentageBps:500},
 });
 assert.equal(result.status,400);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM budget_assumptions").get().n,0);
 f.sqlite.close();
});

test('assumption CRUD is refused once the version is approved, create/update/delete alike', async () => {
 const f=setup();
 line(f.sqlite,'t1','leaf','L');
 version(f.sqlite,'t1','v1');
 const created = await createOrUpdateAssumption(f.db,'t1','maker@test',{
  versionId:'v1',lineId:'leaf',organizationId:'o1',currency:'AOA',method:'Crescimento',precedence:0,
  periodicity:'Mensal',params:{cadence:'Mensal',mode:'Composto',rateBps:1000},
 });
 assert.equal(created.status,200);
 const {id}=await created.json();
 f.sqlite.exec("UPDATE budget_versions SET status='Aprovado',approved_at='now' WHERE id='v1'");
 const updateAttempt = await createOrUpdateAssumption(f.db,'t1','maker@test',{
  id,versionId:'v1',lineId:'leaf',organizationId:'o1',currency:'AOA',method:'Crescimento',precedence:1,params:{cadence:'Mensal',mode:'Composto',rateBps:2000},
 });
 assert.equal(updateAttempt.status,409);
 const deleteAttempt = await deleteAssumption(f.db,'t1',id);
 assert.equal(deleteAttempt.status,409);
 assert.equal(f.sqlite.prepare("SELECT precedence FROM budget_assumptions WHERE id=?").get(id).precedence,0);
 f.sqlite.close();
});

test('recalculateLine composes from enabled assumptions and writes the result, skipping nothing when there are no manual overrides', async () => {
 const f=setup();
 line(f.sqlite,'t1','leaf','L');
 version(f.sqlite,'t1','v1');
 await createOrUpdateAssumption(f.db,'t1','maker@test',{
  versionId:'v1',lineId:'leaf',organizationId:'o1',currency:'AOA',method:'QuantidadePreco',precedence:0,
  params:{quantity:10,unitPriceMinor:100000},
 });
 const result = await recalculateLine(f.db,'t1',{versionId:'v1',lineId:'leaf',organizationId:'o1',dimensionMemberId:null,currency:'AOA'});
 const body = await result.json();
 assert.equal(body.updated,12);
 const row = f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE line_code='L' AND period='2026-01'").get();
 assert.equal(row.amount_minor,1000000);
 f.sqlite.close();
});

test('recalculateLine never overwrites a cell the user protected with manual_override', async () => {
 const f=setup();
 line(f.sqlite,'t1','leaf','L');
 version(f.sqlite,'t1','v1');
 f.sqlite.exec("INSERT INTO performance_entries VALUES ('e1','t1','now','o1','2026-01','Budget','v1','AOA','L','L',NULL,999999,'Manual',1,NULL,0,NULL,NULL)");
 await createOrUpdateAssumption(f.db,'t1','maker@test',{
  versionId:'v1',lineId:'leaf',organizationId:'o1',currency:'AOA',method:'QuantidadePreco',precedence:0,
  params:{quantity:10,unitPriceMinor:100000},
 });
 const result = await recalculateLine(f.db,'t1',{versionId:'v1',lineId:'leaf',organizationId:'o1',dimensionMemberId:null,currency:'AOA'});
 const body = await result.json();
 assert.equal(body.updated,11); // all months except the protected January
 const protectedRow = f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE line_code='L' AND period='2026-01'").get();
 assert.equal(protectedRow.amount_minor,999999);
 const computedRow = f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE line_code='L' AND period='2026-02'").get();
 assert.equal(computedRow.amount_minor,1000000);
 f.sqlite.close();
});

test('recalculateLine with no enabled assumptions reports zero updates and touches nothing', async () => {
 const f=setup();
 line(f.sqlite,'t1','leaf','L');
 version(f.sqlite,'t1','v1');
 f.sqlite.exec("INSERT INTO performance_entries VALUES ('e1','t1','now','o1','2026-01','Budget','v1','AOA','L','L',NULL,42,'Manual',0,NULL,0,NULL,NULL)");
 const result = await recalculateLine(f.db,'t1',{versionId:'v1',lineId:'leaf',organizationId:'o1',dimensionMemberId:null,currency:'AOA'});
 const body = await result.json();
 assert.equal(body.updated,0);
 assert.equal(f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE id='e1'").get().amount_minor,42);
 f.sqlite.close();
});

test('approving a version freezes the catalog hierarchy: a later rename, reparent or hide of the live rubrica does not change the approved map', async () => {
 const f=setup();
 line(f.sqlite,'t1','grp','01',{name:'Grupo A',line_kind:'Agregação'});
 line(f.sqlite,'t1','grp2','02',{name:'Grupo B',line_kind:'Agregação'});
 line(f.sqlite,'t1','leaf','01.01',{name:'Leaf',parent_id:'grp',level:2});
 version(f.sqlite,'t1','v1');
 f.sqlite.exec("INSERT INTO performance_entries VALUES ('e1','t1','now','o1','2026-01','Budget','v1','AOA','01.01','Leaf',NULL,1000,'Manual',0,NULL,0,NULL,NULL)");
 const snapshotStatements = await buildApprovalLineSnapshotStatements(f.db,'t1','v1');
 assert.ok(snapshotStatements.length>=2); // the leaf plus its ancestor group
 await f.db.batch([...snapshotStatements, f.db.prepare("UPDATE budget_versions SET status='Aprovado',approved_at='now' WHERE id='v1'")]);
 const before = await budgetAnnualMapSnapshot(f.db,'t1',{versionId:'v1',organizationId:'o1',dimensionMemberId:null,currency:'AOA'});
 assert.equal(before.tree.length,1);
 assert.equal(before.tree[0].code,'01');
 assert.equal(before.tree[0].children[0].name,'Leaf');
 assert.equal(before.tree[0].children[0].hidden,0);
 // Now mutate the LIVE catalog after approval: rename, reparent to a different group, and hide.
 f.sqlite.exec("UPDATE financial_line_catalog SET parent_id='grp2',name='Renamed Leaf',hidden=1 WHERE id='leaf'");
 const after = await budgetAnnualMapSnapshot(f.db,'t1',{versionId:'v1',organizationId:'o1',dimensionMemberId:null,currency:'AOA'});
 assert.equal(after.tree.length,1,'the approved map must still show a single root group, unaffected by the new live group');
 assert.equal(after.tree[0].code,'01','the leaf must still roll up under its original group in the approved map');
 assert.equal(after.tree[0].children[0].name,'Leaf','the approved map must keep the name it had at approval time');
 assert.equal(after.tree[0].children[0].hidden,0,'the approved map must keep the visibility it had at approval time');
 assert.equal(after.tree[0].children[0].monthly[0].amountMinor,1000);
 f.sqlite.close();
});

test('a draft version keeps reflecting live catalog changes immediately (only approved versions freeze)', async () => {
 const f=setup();
 line(f.sqlite,'t1','grp','01',{name:'Grupo A',line_kind:'Agregação'});
 line(f.sqlite,'t1','leaf','01.01',{name:'Leaf',parent_id:'grp',level:2});
 version(f.sqlite,'t1','v1');
 f.sqlite.exec("INSERT INTO performance_entries VALUES ('e1','t1','now','o1','2026-01','Budget','v1','AOA','01.01','Leaf',NULL,1000,'Manual',0,NULL,0,NULL,NULL)");
 f.sqlite.exec("UPDATE financial_line_catalog SET name='Renamed Leaf' WHERE id='leaf'");
 const snap = await budgetAnnualMapSnapshot(f.db,'t1',{versionId:'v1',organizationId:'o1',dimensionMemberId:null,currency:'AOA'});
 assert.equal(snap.tree[0].children[0].name,'Renamed Leaf');
 f.sqlite.close();
});

test('the approval snapshot itself is immutable once written', async () => {
 const f=setup();
 line(f.sqlite,'t1','grp','01',{name:'Grupo A',line_kind:'Agregação'});
 line(f.sqlite,'t1','leaf','01.01',{name:'Leaf',parent_id:'grp',level:2});
 version(f.sqlite,'t1','v1');
 f.sqlite.exec("INSERT INTO performance_entries VALUES ('e1','t1','now','o1','2026-01','Budget','v1','AOA','01.01','Leaf',NULL,1000,'Manual',0,NULL,0,NULL,NULL)");
 const snapshotStatements = await buildApprovalLineSnapshotStatements(f.db,'t1','v1');
 await f.db.batch([...snapshotStatements, f.db.prepare("UPDATE budget_versions SET status='Aprovado',approved_at='now' WHERE id='v1'")]);
 assert.throws(()=>f.sqlite.exec("UPDATE budget_version_line_snapshots SET name='Hacked' WHERE version_id='v1'"),/imutável/);
 assert.throws(()=>f.sqlite.exec("DELETE FROM budget_version_line_snapshots WHERE version_id='v1'"),/imutável/);
 f.sqlite.close();
});

test('snapshot auto-selects the most recent version when none is given, and returns an empty-but-valid response when the tenant has none yet', async () => {
 const f=setup();
 const empty = await budgetAnnualMapSnapshot(f.db,'t1',{versionId:null,organizationId:null,dimensionMemberId:null,currency:'AOA'});
 assert.equal(empty.version,null);
 assert.deepEqual(empty.tree,[]);
 line(f.sqlite,'t1','leaf','L');
 version(f.sqlite,'t1','v-old','Rascunho',2025);
 version(f.sqlite,'t1','v-new','Rascunho',2026);
 const snap = await budgetAnnualMapSnapshot(f.db,'t1',{versionId:null,organizationId:null,dimensionMemberId:null,currency:'AOA'});
 assert.equal(snap.version.id,'v-new','must resolve to the most recent fiscal year when no versionId is supplied');
 assert.equal(snap.versions.length,2);
 f.sqlite.close();
});
