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

// A fake RH-shaped batch: three components (salário, subsídio, encargos)
// for the same employee/month, all meant to roll up into one rubrica —
// stands in for a real adapter without touching any real module.
function syntheticRhValues(tenantId, orgId, overrides = {}) {
 const base = { salario: 700000, subsidio: 50000, encargos: 15000, period: '2026-01' };
 const v = { ...base, ...overrides };
 // the fingerprint tracks each component's OWN value independently — only
 // the component that actually changed should get a new fingerprint.
 return [
  { organizationId: orgId, sourceModule: 'RH', sourceReference: 'func:42:salario', componentLabel: 'Salário base', period: v.period, currency: 'AOA', dimensionMemberId: null, financialNature: 'Economico', amountMinor: v.salario, sourceStatus: 'Aprovado', sourceFingerprint: 'salario-' + v.salario },
  { organizationId: orgId, sourceModule: 'RH', sourceReference: 'func:42:subsidio', componentLabel: 'Subsídio', period: v.period, currency: 'AOA', dimensionMemberId: null, financialNature: 'Economico', amountMinor: v.subsidio, sourceStatus: 'Aprovado', sourceFingerprint: 'subsidio-' + v.subsidio },
  { organizationId: orgId, sourceModule: 'RH', sourceReference: 'func:42:encargos', componentLabel: 'Encargos patronais', period: v.period, currency: 'AOA', dimensionMemberId: null, financialNature: 'Economico', amountMinor: v.encargos, sourceStatus: 'Aprovado', sourceFingerprint: 'encargos-' + v.encargos },
 ];
}

test('tenant and organization isolation: a mapping/value never crosses either boundary', async () => {
 const f = setup();
 line(f.sqlite, 't1', 'l1', '03.01.01');
 line(f.sqlite, 't2', 'l2', '03.01.01');
 const m1 = await createMapping(f.db, 't1', 'u', { organizationId: 'o1', lineId: 'l1', currency: 'AOA', sourceModule: 'RH', sourceReference: 'plano:2026' });
 assert.equal(m1.status, 200);
 // wrong tenant for this org/line must be refused even with a syntactically valid body
 const cross = await createMapping(f.db, 't2', 'u', { organizationId: 'o1', lineId: 'l1', currency: 'AOA', sourceModule: 'RH', sourceReference: 'plano:2026' });
 assert.equal(cross.status, 400);
 const list1 = await (await listMappings(f.db, 't1', null)).json();
 const list2 = await (await listMappings(f.db, 't2', null)).json();
 assert.equal(list1.mappings.length, 1);
 assert.equal(list2.mappings.length, 0);
 f.sqlite.close();
});

test('movement identity vs aggregate identity: three RH components roll up into one cell, individually traceable', async () => {
 const f = setup();
 line(f.sqlite, 't1', 'l1', '03.01.01');
 version(f.sqlite, 't1', 'v1');
 const { id: mappingId } = await (await createMapping(f.db, 't1', 'u', { organizationId: 'o1', lineId: 'l1', currency: 'AOA', sourceModule: 'RH', sourceReference: 'plano:2026' })).json();
 const check = await (await checkForUpdates(f.db, 't1', mappingId, syntheticRhValues('t1', 'o1'))).json();
 assert.equal(check.created, 3);
 const apply = await (await applyMapping(f.db, 't1', 'u', { mappingId, versionId: 'v1' })).json();
 assert.equal(apply.applied, 12);
 const entry = f.sqlite.prepare("SELECT amount_minor,integration_amount_minor FROM performance_entries WHERE tenant_id='t1' AND line_code='03.01.01' AND period='2026-01'").get();
 assert.equal(entry.amount_minor, 700000 + 50000 + 15000);
 assert.equal(entry.integration_amount_minor, 765000);
 const origin = await (await getCellOrigin(f.db, 't1', { versionId: 'v1', lineId: 'l1', organizationId: 'o1', dimensionMemberId: null, period: '2026-01' })).json();
 assert.equal(origin.origin.integration.movementCount, 3);
 assert.equal(origin.origin.integration.movements.length, 3);
 f.sqlite.close();
});

test('idempotency: re-ingesting the same movements and re-applying never duplicates', async () => {
 const f = setup();
 line(f.sqlite, 't1', 'l1', '03.01.01');
 version(f.sqlite, 't1', 'v1');
 const { id: mappingId } = await (await createMapping(f.db, 't1', 'u', { organizationId: 'o1', lineId: 'l1', currency: 'AOA', sourceModule: 'RH', sourceReference: 'plano:2026' })).json();
 await checkForUpdates(f.db, 't1', mappingId, syntheticRhValues('t1', 'o1'));
 await applyMapping(f.db, 't1', 'u', { mappingId, versionId: 'v1' });
 const again = await (await checkForUpdates(f.db, 't1', mappingId, syntheticRhValues('t1', 'o1'))).json();
 assert.equal(again.created, 0);
 assert.equal(again.unchanged, 3);
 await applyMapping(f.db, 't1', 'u', { mappingId, versionId: 'v1' });
 const movementRows = f.sqlite.prepare("SELECT COUNT(*) n FROM budget_integration_movements WHERE tenant_id='t1'").get().n;
 const valueRows = f.sqlite.prepare("SELECT COUNT(*) n FROM budget_integration_values WHERE tenant_id='t1' AND period='2026-01'").get().n;
 const entryRows = f.sqlite.prepare("SELECT COUNT(*) n FROM performance_entries WHERE tenant_id='t1' AND line_code='03.01.01' AND period='2026-01'").get().n;
 assert.equal(movementRows, 3);
 assert.equal(valueRows, 1);
 assert.equal(entryRows, 1);
 f.sqlite.close();
});

test('relation policies: Exclusiva refuses a second active mapping, Soma allows coexistence, Substituicao deactivates its predecessor', async () => {
 const f = setup();
 line(f.sqlite, 't1', 'l1', '03.01.01');
 line(f.sqlite, 't1', 'l2', '03.01.02');
 const first = await (await createMapping(f.db, 't1', 'u', { organizationId: 'o1', lineId: 'l1', currency: 'AOA', sourceModule: 'RH', sourceReference: 'plano:2026', relationPolicy: 'Exclusiva' })).json();
 const conflict = await createMapping(f.db, 't1', 'u', { organizationId: 'o1', lineId: 'l1', currency: 'AOA', sourceModule: 'Financeiro', sourceReference: 'ledger:99', relationPolicy: 'Exclusiva' });
 assert.equal(conflict.status, 409);
 const soma1 = await createMapping(f.db, 't1', 'u', { organizationId: 'o1', lineId: 'l2', currency: 'AOA', sourceModule: 'RH', sourceReference: 'plano:a', relationPolicy: 'Soma' });
 const soma2 = await createMapping(f.db, 't1', 'u', { organizationId: 'o1', lineId: 'l2', currency: 'AOA', sourceModule: 'RH', sourceReference: 'plano:b', relationPolicy: 'Soma' });
 assert.equal(soma1.status, 200);
 assert.equal(soma2.status, 200);
 const replacement = await (await createMapping(f.db, 't1', 'u', { organizationId: 'o1', lineId: 'l1', currency: 'AOA', sourceModule: 'RH', sourceReference: 'plano:2027', relationPolicy: 'Substituicao', supersedesMappingId: first.id })).json();
 const oldStatus = f.sqlite.prepare("SELECT status FROM financial_line_catalog_mappings WHERE id=?").get(first.id).status;
 const newStatus = f.sqlite.prepare("SELECT status FROM financial_line_catalog_mappings WHERE id=?").get(replacement.id).status;
 assert.equal(oldStatus, 'Inativo');
 assert.equal(newStatus, 'Ativo');
 f.sqlite.close();
});

test('economic and cash perspectives never collide: a Financeiro mapping cannot be applied to the Budget grid', async () => {
 const f = setup();
 line(f.sqlite, 't1', 'l1', '04.01.01');
 version(f.sqlite, 't1', 'v1');
 const economico = await (await createMapping(f.db, 't1', 'u', { organizationId: 'o1', lineId: 'l1', currency: 'AOA', sourceModule: 'Investimentos', sourceReference: 'proj:1', financialNature: 'Economico' })).json();
 const financeiro = await (await createMapping(f.db, 't1', 'u', { organizationId: 'o1', lineId: 'l1', currency: 'AOA', sourceModule: 'Investimentos', sourceReference: 'proj:1-caixa', financialNature: 'Financeiro' })).json();
 assert.ok(economico.id && financeiro.id, 'both must be allowed to coexist — different natures, different buckets');
 await checkForUpdates(f.db, 't1', financeiro.id, [{ organizationId: 'o1', sourceModule: 'Investimentos', sourceReference: 'proj:1-caixa:jan', period: '2026-01', currency: 'AOA', dimensionMemberId: null, financialNature: 'Financeiro', amountMinor: 999999, sourceStatus: 'Aprovado', sourceFingerprint: 'f1' }]);
 const attempt = await applyMapping(f.db, 't1', 'u', { mappingId: financeiro.id, versionId: 'v1' });
 assert.equal(attempt.status, 409);
 const entry = f.sqlite.prepare("SELECT COUNT(*) n FROM performance_entries WHERE tenant_id='t1' AND line_code='04.01.01'").get();
 assert.equal(entry.n, 0, 'the cash-perspective value must never reach performance_entries');
 f.sqlite.close();
});

test('composition: Adicionar combines the integration amount with a manual adjustment, Bloquear freezes the cell, Substituir replaces it outright', async () => {
 const f = setup();
 line(f.sqlite, 't1', 'l1', '03.01.01');
 version(f.sqlite, 't1', 'v1');
 const { id: mappingId } = await (await createMapping(f.db, 't1', 'u', { organizationId: 'o1', lineId: 'l1', currency: 'AOA', sourceModule: 'RH', sourceReference: 'plano:2026' })).json();
 await checkForUpdates(f.db, 't1', mappingId, syntheticRhValues('t1', 'o1'));
 await applyMapping(f.db, 't1', 'u', { mappingId, versionId: 'v1' });

 const adj = await setAdjustment(f.db, 't1', 'u', { versionId: 'v1', lineId: 'l1', organizationId: 'o1', dimensionMemberId: null, currency: 'AOA', period: '2026-01', mode: 'Adicionar', manualAdjustmentMinor: 500000 });
 assert.equal((await adj.json()).effective, 765000 + 500000);
 // re-applying (same source) must not double the manual component
 await applyMapping(f.db, 't1', 'u', { mappingId, versionId: 'v1' });
 const afterReapply = f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE tenant_id='t1' AND line_code='03.01.01' AND period='2026-01'").get();
 assert.equal(afterReapply.amount_minor, 765000 + 500000);

 await setAdjustment(f.db, 't1', 'u', { versionId: 'v1', lineId: 'l1', organizationId: 'o1', dimensionMemberId: null, currency: 'AOA', period: '2026-02', mode: 'Bloquear', manualAdjustmentMinor: 0 });
 const blockResult = await (await applyMapping(f.db, 't1', 'u', { mappingId, versionId: 'v1' })).json();
 assert.equal(blockResult.blocked, 1);
 const blockedEntry = f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE tenant_id='t1' AND line_code='03.01.01' AND period='2026-02'").get();
 assert.equal(blockedEntry.amount_minor, 0, 'Bloquear must freeze at whatever value was already there (0, never touched by the integration)');

 await setAdjustment(f.db, 't1', 'u', { versionId: 'v1', lineId: 'l1', organizationId: 'o1', dimensionMemberId: null, currency: 'AOA', period: '2026-03', mode: 'Substituir', manualAdjustmentMinor: 1 });
 const replaced = f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE tenant_id='t1' AND line_code='03.01.01' AND period='2026-03'").get();
 assert.equal(replaced.amount_minor, 1);
 f.sqlite.close();
});

test('ComConfirmacao: a changed movement sits pending until explicitly confirmed, never silently applied', async () => {
 const f = setup();
 line(f.sqlite, 't1', 'l1', '03.01.01');
 version(f.sqlite, 't1', 'v1');
 const { id: mappingId } = await (await createMapping(f.db, 't1', 'u', { organizationId: 'o1', lineId: 'l1', currency: 'AOA', sourceModule: 'RH', sourceReference: 'plano:2026', syncPolicy: 'ComConfirmacao' })).json();
 await checkForUpdates(f.db, 't1', mappingId, syntheticRhValues('t1', 'o1'));
 await applyMapping(f.db, 't1', 'u', { mappingId, versionId: 'v1' });
 const before = f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE tenant_id='t1' AND period='2026-01'").get().amount_minor;

 const changed = await (await checkForUpdates(f.db, 't1', mappingId, syntheticRhValues('t1', 'o1', { salario: 900000 }))).json();
 assert.equal(changed.pendingConfirmation, 1); // only the salário component's fingerprint changed
 await applyMapping(f.db, 't1', 'u', { mappingId, versionId: 'v1' });
 const stillOld = f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE tenant_id='t1' AND period='2026-01'").get().amount_minor;
 assert.equal(stillOld, before, 'a pending movement must not be aggregated until confirmed');

 await confirmMovements(f.db, 't1', mappingId, null);
 await applyMapping(f.db, 't1', 'u', { mappingId, versionId: 'v1' });
 const afterConfirm = f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE tenant_id='t1' AND period='2026-01'").get().amount_minor;
 assert.equal(afterConfirm, 900000 + 50000 + 15000);
 f.sqlite.close();
});

test('immutability: once a version is approved, applying/ingesting/adjusting are all refused, and budget_integration_values cannot be hand-edited', async () => {
 const f = setup();
 line(f.sqlite, 't1', 'l1', '03.01.01');
 version(f.sqlite, 't1', 'v1');
 const { id: mappingId } = await (await createMapping(f.db, 't1', 'u', { organizationId: 'o1', lineId: 'l1', currency: 'AOA', sourceModule: 'RH', sourceReference: 'plano:2026' })).json();
 await checkForUpdates(f.db, 't1', mappingId, syntheticRhValues('t1', 'o1'));
 await applyMapping(f.db, 't1', 'u', { mappingId, versionId: 'v1' });
 const snapshotStatements = await buildApprovalLineSnapshotStatements(f.db, 't1', 'v1');
 await f.db.batch([...snapshotStatements, f.db.prepare("UPDATE budget_versions SET status='Aprovado',approved_at='now' WHERE id='v1'")]);

 const applyAttempt = await applyMapping(f.db, 't1', 'u', { mappingId, versionId: 'v1' });
 assert.equal(applyAttempt.status, 409);
 const adjustAttempt = await setAdjustment(f.db, 't1', 'u', { versionId: 'v1', lineId: 'l1', organizationId: 'o1', dimensionMemberId: null, currency: 'AOA', period: '2026-01', mode: 'Substituir', manualAdjustmentMinor: 1 });
 assert.equal(adjustAttempt.status, 409);
 assert.throws(() => f.sqlite.exec("UPDATE budget_integration_values SET integration_amount_minor=1 WHERE version_id='v1'"), /imutável|immutable/);

 // but the LIVE mapping configuration must still be editable — approval
 // freezes the applied values for v1, never the mapping itself.
 const statusChange = await setMappingStatus(f.db, 't1', mappingId, 'Inativo');
 assert.equal(statusChange.status, 200);
 f.sqlite.close();
});

test('the decisive end-to-end cycle: approve freezes exactly what existed at approval; a new draft picks up the reconfigured source', async () => {
 const f = setup();
 line(f.sqlite, 't1', 'l1', '03.01.01');
 version(f.sqlite, 't1', 'v1', 'Rascunho', 2026);
 const { id: mappingId } = await (await createMapping(f.db, 't1', 'u', { organizationId: 'o1', lineId: 'l1', currency: 'AOA', sourceModule: 'RH', sourceReference: 'plano:2026' })).json();

 // 1) sincroniza a fonte sintética
 await checkForUpdates(f.db, 't1', mappingId, syntheticRhValues('t1', 'o1'));
 await applyMapping(f.db, 't1', 'u', { mappingId, versionId: 'v1' });
 // 2) ajuste autorizado
 await setAdjustment(f.db, 't1', 'u', { versionId: 'v1', lineId: 'l1', organizationId: 'o1', dimensionMemberId: null, currency: 'AOA', period: '2026-01', mode: 'Adicionar', manualAdjustmentMinor: 500000 });
 const approvedCellBefore = f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE tenant_id='t1' AND period='2026-01'").get().amount_minor;
 assert.equal(approvedCellBefore, 765000 + 500000);
 // 3) aprova
 const snapshotStatements = await buildApprovalLineSnapshotStatements(f.db, 't1', 'v1');
 await f.db.batch([...snapshotStatements, f.db.prepare("UPDATE budget_versions SET status='Aprovado',approved_at='now' WHERE id='v1'")]);

 // 4) a fonte original altera os seus valores
 await checkForUpdates(f.db, 't1', mappingId, syntheticRhValues('t1', 'o1', { salario: 1200000 }));
 // 5) o mapeamento é reconfigurado (nova política, por exemplo)
 await setMappingStatus(f.db, 't1', mappingId, 'Inativo');
 const newMapping = await (await createMapping(f.db, 't1', 'u', { organizationId: 'o1', lineId: 'l1', currency: 'AOA', sourceModule: 'RH', sourceReference: 'plano:2026-revisto', relationPolicy: 'Substituicao', supersedesMappingId: mappingId })).json();

 // RESULTADO ESPERADO: a versão aprovada mantém exactamente os valores e a
 // composição existentes no momento da aprovação.
 const approvedSnapshot = await budgetAnnualMapSnapshot(f.db, 't1', { versionId: 'v1', organizationId: 'o1', dimensionMemberId: null, currency: 'AOA' });
 const flat = (n) => [n, ...(n.children || []).flatMap(flat)];
 const approvedLeaf = approvedSnapshot.tree.flatMap(flat).find((n) => n.code === '03.01.01');
 assert.equal(approvedLeaf.monthly[0].amountMinor, 765000 + 500000, 'a versão aprovada não reflecte a alteração posterior da fonte nem a reconfiguração do mapeamento');
 const approvedEntry = f.sqlite.prepare("SELECT amount_minor,integration_amount_minor,manual_adjustment_minor,adjustment_mode FROM performance_entries WHERE tenant_id='t1' AND period='2026-01'").get();
 assert.equal(approvedEntry.integration_amount_minor, 765000);
 assert.equal(approvedEntry.manual_adjustment_minor, 500000);
 assert.equal(approvedEntry.adjustment_mode, 'Adicionar');

 // 6) um novo orçamento em rascunho pode utilizar os dados e mapeamentos actualizados
 version(f.sqlite, 't1', 'v2', 'Rascunho', 2027);
 const check2027 = await (await checkForUpdates(f.db, 't1', newMapping.id, syntheticRhValues('t1', 'o1', { salario: 1200000, period: '2027-01' }))).json();
 assert.equal(check2027.created, 3);
 const apply2027 = await (await applyMapping(f.db, 't1', 'u', { mappingId: newMapping.id, versionId: 'v2' })).json();
 assert.equal(apply2027.applied, 12);
 const newDraftEntry = f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE tenant_id='t1' AND version_id='v2' AND period='2027-01'").get();
 assert.equal(newDraftEntry.amount_minor, 1200000 + 50000 + 15000, 'o novo rascunho usa os dados e o mapeamento actualizados, sem afectar a versão aprovada');

 // a versão aprovada continua intacta depois de tudo isto
 const stillApproved = f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE tenant_id='t1' AND version_id='v1' AND period='2026-01'").get();
 assert.equal(stillApproved.amount_minor, 765000 + 500000);
 f.sqlite.close();
});

test('Soma adds separately applied sources, is order independent, and applies a manual layer once',async()=>{
 const f=setup();line(f.sqlite,'t1','l1','PAY');version(f.sqlite,'t1','v1');
 const ids=[];
 for(const [ref,amount] of [['a',10000],['b',20000]]){
  const m=await(await createMapping(f.db,'t1','maker',{organizationId:'o1',lineId:'l1',currency:'AOA',sourceModule:'RH',sourceReference:ref,relationPolicy:'Soma'})).json();ids.push(m.id);
  await checkForUpdates(f.db,'t1',m.id,[{...syntheticRhValues('t1','o1')[0],amountMinor:amount,sourceFingerprint:ref}]);
  assert.equal((await applyMapping(f.db,'t1','maker',{mappingId:m.id,versionId:'v1'})).status,200);
 }
 const cell=()=>f.sqlite.prepare("SELECT amount_minor FROM performance_entries WHERE version_id='v1' AND period='2026-01'").get().amount_minor;
 assert.equal(cell(),30000);
 await setAdjustment(f.db,'t1','maker',{versionId:'v1',lineId:'l1',organizationId:'o1',dimensionMemberId:null,currency:'AOA',period:'2026-01',mode:'Adicionar',manualAdjustmentMinor:5000});
 for(const mappingId of [ids[1],ids[0],ids[1]])assert.equal((await applyMapping(f.db,'t1','maker',{mappingId,versionId:'v1'})).status,200);
 assert.equal(cell(),35000);
 const origin=await(await getCellOrigin(f.db,'t1',{versionId:'v1',lineId:'l1',organizationId:'o1',dimensionMemberId:null,currency:'AOA',period:'2026-01'})).json();
 assert.equal(origin.origin.integration.contributions.length,2);assert.equal(origin.origin.integration.movements.reduce((n,m)=>n+m.amount_minor,0),30000);
 f.sqlite.close();
});
test('approved origin evidence stays identical after source movements change or disappear',async()=>{
 const f=setup();line(f.sqlite,'t1','l1','PAY');version(f.sqlite,'t1','v1');
 const m=await(await createMapping(f.db,'t1','maker',{organizationId:'o1',lineId:'l1',currency:'AOA',sourceModule:'RH',sourceReference:'a'})).json();
 await checkForUpdates(f.db,'t1',m.id,syntheticRhValues('t1','o1'));await applyMapping(f.db,'t1','maker',{mappingId:m.id,versionId:'v1'});
 const input={versionId:'v1',lineId:'l1',organizationId:'o1',dimensionMemberId:null,currency:'AOA',period:'2026-01'},before=await(await getCellOrigin(f.db,'t1',input)).json();
 f.sqlite.exec("UPDATE budget_versions SET status='Aprovado',approved_at='now' WHERE id='v1'");
 await checkForUpdates(f.db,'t1',m.id,syntheticRhValues('t1','o1',{salario:999999}));
 assert.deepEqual(await(await getCellOrigin(f.db,'t1',input)).json(),before);
 assert.throws(()=>f.sqlite.exec("UPDATE budget_integration_values SET cell_snapshot_json='{}' WHERE version_id='v1'"),/immutable/);f.sqlite.close();
});
test('legacy evidence is explicitly unavailable instead of reconstructed from live movements',async()=>{
 const f=setup();line(f.sqlite,'t1','l1','PAY');version(f.sqlite,'t1','v1');
 const m=await(await createMapping(f.db,'t1','maker',{organizationId:'o1',lineId:'l1',currency:'AOA',sourceModule:'RH',sourceReference:'a'})).json();
 await checkForUpdates(f.db,'t1',m.id,syntheticRhValues('t1','o1'));await applyMapping(f.db,'t1','maker',{mappingId:m.id,versionId:'v1'});
 f.sqlite.exec("UPDATE budget_integration_values SET movements_json=NULL,cell_snapshot_json=NULL");
 const j=await(await getCellOrigin(f.db,'t1',{versionId:'v1',lineId:'l1',organizationId:'o1',dimensionMemberId:null,currency:'AOA',period:'2026-01'})).json();
 assert.equal(j.origin.integration.snapshotAvailable,false);assert.deepEqual(j.origin.integration.movements,[]);f.sqlite.close();
});
test('manual integration adjustments are isolated by currency',async()=>{
 const f=setup();line(f.sqlite,'t1','l1','PAY');version(f.sqlite,'t1','v1');
 const input={versionId:'v1',lineId:'l1',organizationId:'o1',dimensionMemberId:null,period:'2026-01',mode:'Substituir',manualAdjustmentMinor:10000};
 assert.equal((await setAdjustment(f.db,'t1','maker',{...input,currency:'AOA'})).status,200);
 assert.equal((await setAdjustment(f.db,'t1','maker',{...input,currency:'USD',manualAdjustmentMinor:20000})).status,200);
 const entries=f.sqlite.prepare("SELECT currency,amount_minor FROM performance_entries ORDER BY currency").all();
 assert.deepEqual(entries.map(e=>[e.currency,e.amount_minor]),[['AOA',10000],['USD',20000]]);
 assert.equal((await getCellOrigin(f.db,'t1',{versionId:'v1',lineId:'l1',organizationId:'o1',dimensionMemberId:null,period:'2026-01'})).status,409);
 const usd=await(await getCellOrigin(f.db,'t1',{versionId:'v1',lineId:'l1',organizationId:'o1',dimensionMemberId:null,period:'2026-01',currency:'USD'})).json();assert.equal(usd.origin.amountMinor,20000);f.sqlite.close();
});
