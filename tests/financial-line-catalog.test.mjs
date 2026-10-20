import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const {buildCatalogTree,adoptLineCatalogTemplate,catalogTotals,duplicateLineValues,recomputeSubtreeLevels}=await import('../worker/financial-line-catalog.ts');

class Statement{constructor(db,sql){this.db=db;this.sql=sql;this.values=[]}bind(...values){this.values=values;return this}run(){const r=this.db.prepare(this.sql).run(...this.values);return {success:true,meta:{changes:r.changes}}}all(){return {results:this.db.prepare(this.sql).all(...this.values)}}first(){return this.db.prepare(this.sql).get(...this.values)||null}}
class D1{constructor(db){this.db=db}prepare(sql){return new Statement(this.db,sql)}}
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

test('a rubrica cannot be its own parent or part of a cycle (insert and reparent)',()=>{
 const f=setup();
 line(f.sqlite,'t1','a','A',{line_kind:'Agregação'});
 line(f.sqlite,'t1','b','B',{parent_id:'a',level:2});
 assert.throws(()=>f.sqlite.exec("UPDATE financial_line_catalog SET parent_id='b' WHERE id='a'"),/cycle/);
 assert.throws(()=>f.sqlite.exec("INSERT INTO financial_line_catalog (id,tenant_id,code,name,classification,cash_flow_category,sign_mode,status,created_by,created_at,parent_id) VALUES ('c','t1','C','C','Custo','Operacional','Natural','Ativa','u','now','nonexistent')"),/cycle|parent/);
 f.sqlite.close();
});

test('a parent from a different tenant is rejected',()=>{
 const f=setup();
 line(f.sqlite,'t1','a','A');
 assert.throws(()=>f.sqlite.exec("INSERT INTO financial_line_catalog (id,tenant_id,code,name,classification,cash_flow_category,sign_mode,status,created_by,created_at,parent_id) VALUES ('x','t2','X','X','Custo','Operacional','Natural','Ativa','u','now','a')"),/cycle|parent/);
 f.sqlite.close();
});

test('a rubrica with movements or sub-rubricas cannot be physically deleted, but renaming always works',()=>{
 const f=setup();
 line(f.sqlite,'t1','a','A',{line_kind:'Agregação'});
 line(f.sqlite,'t1','b','B',{parent_id:'a',level:2});
 assert.throws(()=>f.sqlite.exec("DELETE FROM financial_line_catalog WHERE id='a'"),/sub-rubricas/);
 f.sqlite.exec("INSERT INTO performance_entries VALUES ('e1','t1','now','o1','2026-01','Actual',NULL,'AOA','B','B',NULL,1000,'Manual',0)");
 assert.throws(()=>f.sqlite.exec("DELETE FROM financial_line_catalog WHERE id='b'"),/movimentos/);
 f.sqlite.exec("UPDATE financial_line_catalog SET name='Renamed B' WHERE id='b'");
 assert.equal(f.sqlite.prepare("SELECT name FROM financial_line_catalog WHERE id='b'").get().name,'Renamed B');
 f.sqlite.close();
});

test('buildCatalogTree nests by parent_id and sorts by display_order',()=>{
 const f=setup();
 line(f.sqlite,'t1','a','A',{line_kind:'Agregação',display_order:1});
 line(f.sqlite,'t1','b','B',{parent_id:'a',level:2,display_order:2});
 line(f.sqlite,'t1','c','C',{parent_id:'a',level:2,display_order:1});
 const rows=f.db.prepare("SELECT * FROM financial_line_catalog WHERE tenant_id='t1'").all().results;
 const tree=buildCatalogTree(rows);
 assert.equal(tree.length,1);
 assert.equal(tree[0].id,'a');
 assert.deepEqual(tree[0].children.map(c=>c.id),['c','b']);
 f.sqlite.close();
});

test('reparenting recomputes the level of the whole moved subtree',async()=>{
 const f=setup();
 line(f.sqlite,'t1','root1','R1',{line_kind:'Agregação'});
 line(f.sqlite,'t1','root2','R2',{line_kind:'Agregação'});
 line(f.sqlite,'t1','mid','M',{parent_id:'root1',level:2,line_kind:'Agregação'});
 line(f.sqlite,'t1','leaf','L',{parent_id:'mid',level:3});
 f.sqlite.exec("UPDATE financial_line_catalog SET parent_id='root2',level=2 WHERE id='mid'");
 await recomputeSubtreeLevels(f.db,'t1','mid',2);
 assert.equal(f.sqlite.prepare("SELECT level FROM financial_line_catalog WHERE id='leaf'").get().level,3);
 f.sqlite.close();
});

test('adopting the universal template library is idempotent and tenant-isolated',async()=>{
 const f=setup();
 const first=await adoptLineCatalogTemplate(f.db,'t1','u1');
 assert.ok(first.adopted>0);
 assert.equal(first.reused,0);
 const t1Rows=f.db.prepare("SELECT * FROM financial_line_catalog WHERE tenant_id='t1'").all().results;
 assert.equal(t1Rows.length,first.adopted);
 const t2Rows=f.db.prepare("SELECT * FROM financial_line_catalog WHERE tenant_id='t2'").all().results;
 assert.equal(t2Rows.length,0);
 const root=t1Rows.find(r=>r.code==='01');
 const child=t1Rows.find(r=>r.code==='01.01');
 assert.equal(child.parent_id,root.id);
 const second=await adoptLineCatalogTemplate(f.db,'t1','u1');
 assert.equal(second.adopted,0);
 assert.equal(second.reused,first.adopted);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM financial_line_catalog WHERE tenant_id='t1'").get().n,first.adopted);
 f.sqlite.close();
});

test('customising an adopted rubrica survives a second adoption of the same library',async()=>{
 const f=setup();
 await adoptLineCatalogTemplate(f.db,'t1','u1');
 f.sqlite.exec("UPDATE financial_line_catalog SET name='Nome Personalizado',hidden=1 WHERE tenant_id='t1' AND code='01.01.01'");
 await adoptLineCatalogTemplate(f.db,'t1','u1');
 const row=f.sqlite.prepare("SELECT name,hidden FROM financial_line_catalog WHERE tenant_id='t1' AND code='01.01.01'").get();
 assert.equal(row.name,'Nome Personalizado');
 assert.equal(row.hidden,1);
 f.sqlite.close();
});

test('catalogTotals sums each leaf once and rolls up through every ancestor without double counting',async()=>{
 const f=setup();
 line(f.sqlite,'t1','grp','01',{name:'Grupo',line_kind:'Agregação',display_order:1});
 line(f.sqlite,'t1','cat','01.01',{name:'Categoria',parent_id:'grp',level:2,line_kind:'Agregação',display_order:1});
 line(f.sqlite,'t1','leaf1','01.01.01',{name:'Rubrica 1',parent_id:'cat',level:3,display_order:1});
 line(f.sqlite,'t1','leaf2','01.01.02',{name:'Rubrica 2',parent_id:'cat',level:3,display_order:2});
 f.sqlite.exec("INSERT INTO performance_entries VALUES ('e1','t1','now','o1','2026-01','Actual',NULL,'AOA','01.01.01','R1',NULL,1000,'Manual',0)");
 f.sqlite.exec("INSERT INTO performance_entries VALUES ('e2','t1','now','o1','2026-01','Actual',NULL,'AOA','01.01.02','R2',NULL,500,'Manual',0)");
 const totals=await catalogTotals(f.db,'t1',{organizationId:'o1',period:'2026-01',currency:'AOA',scenario:'Actual'});
 const byCode=Object.fromEntries(totals.map(t=>[t.code,t]));
 assert.equal(byCode['01.01.01'].totalMinor,1000);
 assert.equal(byCode['01.01.02'].totalMinor,500);
 assert.equal(byCode['01.01'].totalMinor,1500);
 assert.equal(byCode['01'].totalMinor,1500);
 assert.equal(byCode['01.01'].directMinor,0);
 f.sqlite.close();
});

test('catalogTotals respects organization, period and currency scope',async()=>{
 const f=setup();
 line(f.sqlite,'t1','leaf','L',{display_order:1});
 f.sqlite.exec("INSERT INTO performance_entries VALUES ('e1','t1','now','o1','2026-01','Actual',NULL,'AOA','L','L',NULL,100,'Manual',0)");
 f.sqlite.exec("INSERT INTO performance_entries VALUES ('e2','t1','now','o1','2026-02','Actual',NULL,'AOA','L','L',NULL,200,'Manual',0)");
 f.sqlite.exec("INSERT INTO performance_entries VALUES ('e3','t1','now','o1','2026-01','Actual',NULL,'USD','L','L',NULL,9999,'Manual',0)");
 const totals=await catalogTotals(f.db,'t1',{organizationId:'o1',period:'2026-01',currency:'AOA',scenario:'Actual'});
 assert.equal(totals.find(t=>t.code==='L').totalMinor,100);
 f.sqlite.close();
});

test('duplicateLineValues copies fields into an independent row that can diverge afterwards',()=>{
 const source={id:'a',tenant_id:'t1',code:'A',name:'Original',classification:'Custo',cash_flow_category:'Operacional',sign_mode:'Natural',status:'Ativa',parent_id:null,level:1,display_order:3,hidden:0,line_kind:'Analítica',source_type:'Manual',manual_adjustment_allowed:1,description:'desc',formula_expression:null,template_id:null,created_by:'u',created_at:'now'};
 const copy=duplicateLineValues(source,'A-COPY','Copy of Original');
 assert.equal(copy.code,'A-COPY');
 assert.equal(copy.name,'Copy of Original');
 assert.equal(copy.classification,'Custo');
 assert.equal(copy.display_order,3);
});
