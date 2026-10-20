import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {DatabaseSync} from 'node:sqlite';import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const auth=await import('../worker/budget-authorization.ts'),integration=await import('../worker/budget-integration.ts'),annual=await import('../worker/budget-annual-map.ts');
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


const worker=fs.readFileSync(new URL('../worker/index.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('worker.ts',worker,ts.ScriptTarget.Latest,true),selected=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['budgetIntegrationApi','budgetAnnualMapApi'].includes(n.name?.text)).map(n=>n.getText(ast));
assert.equal(selected.length,2);
const context={exports:{},...auth,...integration,...annual,Request,Response,URL,actorEmail:()=> 'maker@test',apiFailure:(e)=>Response.json({error:e.message},{status:500})};
vm.runInNewContext(ts.transpileModule(selected.join('\n')+'\nexports.integration=budgetIntegrationApi;exports.annual=budgetAnnualMapApi;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
test('budget routes authorize company-scoped resource ids even when organizationId is omitted or replaced',async()=>{
 const f=setup();line(f.sqlite,'t1','l1','PAY');version(f.sqlite,'t1','v1');
 const mapping=await(await integration.createMapping(f.db,'t1','maker',{organizationId:'o1b',lineId:'l1',currency:'AOA',sourceModule:'RH',sourceReference:'plan'})).json();
 const assumption=await(await annual.createOrUpdateAssumption(f.db,'t1','maker',{versionId:'v1',lineId:'l1',organizationId:'o1b',currency:'AOA',method:'QuantidadePreco',params:{quantity:1,unitPriceMinor:10000}})).json();
 const post=(handler,body)=>handler(new Request('https://example.test/api',{method:'POST',body:JSON.stringify(body)}),f.db,'t1','o1');
 for(const type of ['applyMapping','setMappingStatus','checkForUpdates','confirmMovements']){const r=await post(context.exports.integration,{type,mappingId:mapping.id,versionId:'v1',status:'Inativo',values:[]});assert.equal(r.status,403,await r.clone().text());}
 assert.equal((await context.exports.integration(new Request('https://example.test/api?action=origin&organizationId=o1b&lineId=l1&versionId=v1&period=2026-01&currency=AOA'),f.db,'t1','o1')).status,403);
 assert.equal((await post(context.exports.annual,{type:'deleteAssumption',id:assumption.id})).status,403);
 assert.equal((await post(context.exports.annual,{type:'assumption',id:assumption.id,versionId:'v1',organizationId:'o1',lineId:'l1',currency:'AOA',method:'Manual',params:{}})).status,403);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM budget_assumptions').get().n,1);assert.equal(f.sqlite.prepare('SELECT status FROM financial_line_catalog_mappings').get().status,'Ativo');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM performance_entries').get().n,0);
 const allowed=await context.exports.integration(new Request('https://example.test/api',{method:'POST',body:JSON.stringify({type:'applyMapping',mappingId:mapping.id,versionId:'v1'})}),f.db,'t1',null);assert.equal(allowed.status,200,await allowed.clone().text());f.sqlite.close();
});
