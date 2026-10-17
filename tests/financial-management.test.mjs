import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const { financialDataApi, financialCockpitApi } = await import('../worker/financial-data.ts');
const { integrationsApi } = await import('../worker/integrations.ts');
const { financialStatementsApi, financialVarianceApi, financialTrendApi } = await import('../worker/financial-statements.ts');
class Statement { constructor(db,sql){this.db=db;this.sql=sql;this.values=[]} bind(...values){this.values=values;return this} first(){return this.db.prepare(this.sql).get(...this.values)} all(){return {results:this.db.prepare(this.sql).all(...this.values)}} run(){return {meta:{changes:Number(this.db.prepare(this.sql).run(...this.values).changes)}}} }
class D1 { constructor(sql){this.sql=sql} prepare(sql){return new Statement(this.sql,sql)} async batch(statements){this.sql.exec('BEGIN');try{const results=statements.map(s=>s.run());this.sql.exec('COMMIT');return results}catch(e){this.sql.exec('ROLLBACK');throw e}} }
function setup(){const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync(new URL('../drizzle',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));sql.exec("INSERT INTO tenants VALUES ('t','now','Tenant','tenant','Ativo');INSERT INTO organizations VALUES ('a','t','now','A','Org A','Empresa','AOA','Ativa'),('b','t','now','B','Org B','Empresa','USD','Ativa');INSERT INTO financial_line_catalog VALUES ('revenue','t','REV','Revenue','Receita','Operacional','Natural','Ativa','maker@test','now'),('cost','t','COST','Costs','Custo','Operacional','Natural','Ativa','maker@test','now'),('cash','t','CASH','Cash','Ativo','Não aplicável','Natural','Ativa','maker@test','now');INSERT INTO financial_source_mappings VALUES ('map','t','ERP','701','revenue',NULL,'maker@test','now')");return{sql,db:new D1(sql)}}
const maker={tenantId:'t',organizationId:null,email:'maker@test',role:'Financeiro'},checker={...maker,email:'checker@test'};
const request=(path,body)=>new Request('https://example.test'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});
const createPayload={type:'createBatch',organizationId:'a',period:'2026-08',currency:'AOA',sourceSystem:'ERP',fileName:'actual.csv',rows:JSON.stringify([{code:'701',description:'Sales',amount:'123.45'}])};
const entry=(sql,id,org,period,currency,code,amount,name='Line',scenario='Actual',version=null)=>sql.prepare("INSERT INTO performance_entries(id,tenant_id,created_at,organization_id,period,scenario,version_id,currency,line_code,line_name,amount_minor,source) VALUES (?,'t','now',?,?,?,?,?,?,?,?,'Test')").run(id,org,period,scenario,version,currency,code,name,amount);

const {treasuryApi}=await import('../worker/treasury.ts');
const {managementActualsApi}=await import('../worker/management-actuals.ts');
const {financialProfitabilityApi}=await import('../worker/financial-statements.ts');
const {feasibilityApi}=await import('../worker/feasibility.ts');
const {feasibility,feasibilityDefaults}=await import('../lib/feasibility-engine.ts');
test('bank balance 100000 can be corrected, stale correction rejected, deleted without falling back to old evidence',async()=>{
 const{sql,db}=setup(),path='/api/financial-data?resource=treasury&asOf=2026-10-15&currency=AOA';
 let r=await treasuryApi(request(path,{type:'createAccount',organizationId:'a',code:'BANK',name:'Bank',currency:'AOA'}),db,maker),body=await r.json(),accountId=body.accounts[0].id;
 for(const [amount,reference] of [['50.00','old'],['100000.00','manual']]){r=await treasuryApi(request(path,{type:'recordBalance',accountId,date:'2026-10-15',amount,reference}),db,maker);assert.equal(r.status,200)}
 body=await r.json();const balanceId=body.accounts[0].balance_id;
 const correction={type:'editBalance',accountId,balanceId,revision:'0',amount:'120000.00',reference:'Corrected'};
 r=await treasuryApi(request(path,correction),db,maker);assert.equal(r.status,200);body=await r.json();assert.equal(body.forecast.opening,12000000);
 assert.equal((await treasuryApi(request(path,correction),db,maker)).status,409);
 assert.equal((await treasuryApi(request(path,{...correction,revision:'1'}),db,{...maker,organizationId:'b'})).status,404);
 r=await treasuryApi(request(path,{type:'deleteBalance',accountId,balanceId,revision:'1'}),db,maker);assert.equal(r.status,200);assert.equal((await r.json()).forecast,null);
 const history=sql.prepare('SELECT * FROM treasury_balance_history ORDER BY revision').all();assert.equal(history.length,2);assert.equal(JSON.parse(history[0].before_json).amount,10000000);assert.equal(JSON.parse(history[0].after_json).amount,12000000);assert.equal(sql.prepare('SELECT COUNT(*) n FROM performance_entries').get().n,0);sql.close();
});
test('manual revenue and cost feed profitability and can be corrected/deleted with scope, audit and revision protection',async()=>{
 const{sql,db}=setup(),path='/api/financial-data?resource=actuals&period=2026-10&currency=AOA';
 for(const [classification,amount] of [['Receita','1000.00'],['Custo','300.00']]){const r=await financialDataApi(request(path,{type:'saveActual',organizationId:'a',description:classification,classification,amount,reference:'Manual '+classification}),db,maker);assert.equal(r.status,200)}
 const profit=async()=> (await financialProfitabilityApi(request('/api/profitability?period=2026-10&currency=AOA'),db,maker)).json();
 assert.equal((await profit()).units[0].margin,70000);
 let data=await (await managementActualsApi(request(path),db,maker)).json(),cost=data.rows.find(x=>x.classification==='Custo');
 const edit={type:'saveActual',id:cost.id,revision:'0',description:'Rent',classification:'Custo',amount:'400.00',reference:'Corrected'};
 assert.equal((await managementActualsApi(request(path,edit),db,{...maker,role:'Leitura'})).status,403);
 assert.equal((await managementActualsApi(request(path,edit),db,{...maker,organizationId:'b'})).status,404);
 assert.equal((await managementActualsApi(request(path,edit),db,maker)).status,200);assert.equal((await profit()).units[0].margin,60000);
 assert.equal((await managementActualsApi(request(path,edit),db,maker)).status,409);
 assert.equal((await managementActualsApi(request(path,{type:'deleteActual',id:cost.id,revision:'1'}),db,maker)).status,200);assert.equal((await profit()).units[0].margin,100000);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM audit_events WHERE entity_type='managementActual'").get().n,4);sql.close();
});
test('feasibility reconciles operating profit, tax, initial WC, terminal recovery and discounted cash flow',()=>{
 const input={...feasibilityDefaults,years:2,capex:1000,residual:100,units:100,price:10,unitCost:3,fixedCosts:200,taxRate:20,discountRate:10,receivableDays:36.5};
 const result=feasibility(input);assert.equal(result.initialWorkingCapital,100);assert.equal(result.initial,-1100);assert.equal(result.rows[0].ebitda,500);assert.equal(result.rows[0].depreciation,450);assert.equal(result.rows[0].tax,10);assert.equal(result.rows[0].flow,490);assert.equal(result.rows[1].terminal,200);assert.equal(result.rows[1].flow,690);assert.equal(result.npv,Math.round((-1100+490/1.1+690/1.21)*100)/100);assert.equal(result.rows[1].cumulative,80);assert.ok(result.irr>4&&result.irr<5);assert.ok(result.payback>1&&result.payback<2);assert.equal(result.discountedPayback,null);assert.ok(result.scenarios[0].npv<result.npv);assert.ok(result.scenarios[2].npv>result.npv);assert.throws(()=>feasibility({...input,years:0}));assert.throws(()=>feasibility({...input,capex:NaN}));assert.equal(feasibility({...input,price:0}).irr,null);
});
test('feasibility save persists assumptions, rejects stale updates and protects organization scope',async()=>{
 const{sql,db}=setup(),path='/api/financial-data?resource=feasibility',payload={name:'New facility',organizationId:'a',currency:'AOA',assumptions:{...feasibilityDefaults,capex:1000,units:100,price:10}};
 let r=await financialDataApi(request(path,payload),db,maker);assert.equal(r.status,200);let body=await r.json(),study=body.studies[0];assert.equal(body.savedStudyId,study.id);assert.equal(JSON.parse(study.assumptions_json).capex,1000);const read=await feasibilityApi(new Request('https://example.test'+path),db,maker);assert.equal((await read.json()).studies.find(x=>x.id===body.savedStudyId).name,payload.name);
 const edit={...payload,id:study.id,revision:0,name:'Revised facility'};assert.equal((await feasibilityApi(request(path,edit),db,maker)).status,200);assert.equal((await feasibilityApi(request(path,edit),db,maker)).status,409);assert.equal((await feasibilityApi(request(path,{...edit,revision:1}),db,{...maker,role:'Leitura'})).status,403);assert.equal((await feasibilityApi(request(path,{...edit,revision:1}),db,{...maker,organizationId:'b'})).status,409);assert.equal(sql.prepare("SELECT COUNT(*) n FROM audit_events WHERE entity_type='feasibility'").get().n,2);sql.close();
});

test('manual correction and feasibility save roll back when the audit insert fails',async()=>{
 const{sql,db}=setup(),path='/api/financial-data?resource=actuals&period=2026-10&currency=AOA';let r=await managementActualsApi(request(path,{type:'saveActual',organizationId:'a',classification:'Custo',description:'Rent',reference:'Rent',amount:'100.00'}),db,maker),body=await r.json(),row=body.rows[0];
 sql.exec("CREATE TRIGGER fail_management_audit BEFORE INSERT ON audit_events WHEN NEW.entity_type IN ('managementActual','feasibility') BEGIN SELECT RAISE(ABORT,'injected audit failure'); END");
 r=await managementActualsApi(request(path,{type:'saveActual',id:row.id,revision:'0',classification:'Custo',description:'Changed',reference:'Changed',amount:'200.00'}),db,maker);assert.equal(r.status,500);assert.equal(sql.prepare('SELECT revision FROM management_actuals').get().revision,0);assert.equal(sql.prepare('SELECT amount_minor FROM performance_entries').get().amount_minor,10000);assert.equal(sql.prepare("SELECT name FROM financial_line_catalog WHERE code LIKE 'MG_%'").get().name,'Rent');
 r=await feasibilityApi(request('/api/financial-data?resource=feasibility',{name:'Factory',organizationId:'a',currency:'AOA',assumptions:{...feasibilityDefaults,capex:1000}}),db,maker);assert.equal(r.status,500);assert.equal(sql.prepare('SELECT COUNT(*) n FROM feasibility_studies').get().n,0);sql.close();
});


test('management categories are independent of type and description and remain editable after saving',async()=>{
 const{sql,db}=setup(),path='/api/financial-data?resource=actuals&period=2026-10&currency=AOA';
 let r=await managementActualsApi(request(path,{type:'saveActual',organizationId:'a',classification:'Receita',category:'Serviços',description:'Consultoria mensal',reference:'SERV-1',amount:'1000.00'}),db,maker);assert.equal(r.status,200);let body=await r.json(),row=body.rows[0];assert.equal(row.category,'Serviços');assert.equal(body.analysis.revenue,100000);assert.equal(body.entries[0].manual_id,row.id);
 for(const [revision,classification,category] of [[0,'Custo','Pessoal'],[1,'Receita','Serviços']]){r=await managementActualsApi(request(path,{type:'saveActual',id:row.id,revision:String(revision),classification,category,description:'Consultoria mensal',reference:'SERV-1',amount:'1000.00'}),db,maker);assert.equal(r.status,200);body=await r.json();assert.equal(body.rows[0].classification,classification);assert.equal(body.rows[0].category,category);assert.equal(body.analysis.result,classification==='Receita'?100000:-100000)}
 r=await managementActualsApi(request(path,{type:'saveActual',organizationId:'a',classification:'Custo',category:'Pessoal',description:'Remunerações',reference:'SAL',amount:'200.00'}),db,maker);assert.equal(r.status,200);body=await r.json();assert.equal(body.analysis.result,80000);assert.equal(body.analysis.marginPct,80);assert.equal(body.analysis.categories.find(c=>c.name==='Pessoal').sharePct,100);
 // Imported / existing actual values appear beside manual entries, but have no manual mutation identifier.
 entry(sql,'imported-sale','a','2026-10','AOA','REV',50000,'Vendas ERP');body=await(await managementActualsApi(request(path),db,maker)).json();assert.equal(body.entries.length,3);assert.equal(body.entries.find(e=>e.entry_id==='imported-sale').manual_id,null);assert.equal(body.analysis.revenue,150000);
 const scoped=await(await managementActualsApi(request(path),db,{...maker,organizationId:'b'})).json();assert.equal(scoped.entries.length,0);assert.equal(scoped.categories.length,0);
 sql.close();
});
test('an unclassified income source blocks conclusions and category percentages use like-for-like denominators',async()=>{
 const{managementIncome}=await import('../lib/management-income.ts');const report=managementIncome([{classification:'Receita',category:'Vendas',amount_minor:10000},{classification:'Custo',category:'Pessoal',amount_minor:2000},{classification:'Custo',category:'Rendas',amount_minor:3000},{classification:'Ativo',category:'Banco',amount_minor:999999},{classification:'Por classificar',category:'Desconhecido',amount_minor:500}]);assert.equal(report.revenue,10000);assert.equal(report.costs,5000);assert.equal(report.result,null);assert.equal(report.marginPct,null);assert.equal(report.pending,1);assert.equal(report.categories.find(x=>x.name==='Pessoal').sharePct,40);assert.equal(report.categories.find(x=>x.name==='Vendas').sharePct,100);assert.equal(managementIncome([]).hasIncome,false);
});
test('a known financial line remains available for correcting its classification, including after moving it out of income',async()=>{
 const{sql,db}=setup();entry(sql,'actual-row','a','2026-10','AOA','REV',10000);for(const classification of ['Custo','Ativo','Receita']){let r=await financialDataApi(request('/api/financial-data',{type:'classifyLine',code:'REV',classification}),db,maker);assert.equal(r.status,200);r=await financialProfitabilityApi(request('/api/profitability?period=2026-10&currency=AOA'),db,maker);const body=await r.json();assert.equal(body.catalogLines.find(line=>line.code==='REV').classification,classification)}sql.close();
});

test('feasibility accepts explicit monthly inputs, preserves annual legacy studies and rejects unknown assumptions',async()=>{
 const {sql,db}=setup(),path='/api/financial-data?resource=feasibility',assumptions={...feasibilityDefaults,capex:1000,units:100,price:10,fixedCosts:100,activityPeriod:'month'};
 let response=await feasibilityApi(request(path,{name:'Monthly plan',organizationId:'a',currency:'AOA',assumptions}),db,maker);assert.equal(response.status,200);let saved=(await response.json()).studies[0];assert.equal(JSON.parse(saved.assumptions_json).activityPeriod,'month');assert.equal(feasibility(JSON.parse(saved.assumptions_json)).rows[0].revenue,12000);
 response=await feasibilityApi(request(path,{name:'Invalid',organizationId:'a',currency:'AOA',assumptions:{...assumptions,activityPeriod:'day'}}),db,maker);assert.equal(response.status,400);
 response=await feasibilityApi(request(path,{name:'Invalid',organizationId:'a',currency:'AOA',assumptions:{...assumptions,unexpected:1}}),db,maker);assert.equal(response.status,400);
 response=await feasibilityApi(request(path,{name:'Invalid currency',organizationId:'a',currency:'ZZZ',assumptions}),db,maker);assert.equal(response.status,400);assert.equal(sql.prepare('SELECT COUNT(*) n FROM feasibility_studies').get().n,1);sql.close();
});
test('integrated studies persist assumptions and reject invalid financial settings without losing legacy compatibility',async()=>{
 const {planningDefaults}=await import('../lib/feasibility-planning.ts');const {sql,db}=setup(),path='/api/financial-data?resource=feasibility',assumptions={...feasibilityDefaults,capex:10000,units:1200,price:20,unitCost:10,planning:{...planningDefaults,debt:6000,debtRate:12,debtMonths:24,capexEvents:[{month:6,amount:500}]}};
 let r=await feasibilityApi(request(path,{name:'Integrated',organizationId:'a',currency:'AOA',assumptions}),db,maker);assert.equal(r.status,200,JSON.stringify(await r.clone().json()));const b=await r.json();assert.deepEqual(JSON.parse(b.studies[0].assumptions_json).planning,assumptions.planning);
 r=await feasibilityApi(request(path,{name:'Invalid',organizationId:'a',currency:'AOA',assumptions:{...assumptions,planning:{...assumptions.planning,debtMonths:0}}}),db,maker);assert.equal(r.status,400);assert.equal(sql.prepare('SELECT COUNT(*) n FROM feasibility_studies').get().n,1);sql.close();
});


test('integrated studies with zero initial investment persist and reject negative investments',async()=>{
 const {planningDefaults}=await import('../lib/feasibility-planning.ts'),{sql,db}=setup(),path='/api/financial-data?resource=feasibility',assumptions={...feasibilityDefaults,capex:0,units:120,price:100,unitCost:20,planning:{...planningDefaults}};
 const r=await feasibilityApi(request(path,{name:'Services without initial CAPEX',organizationId:'a',currency:'AOA',assumptions}),db,maker);assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal(JSON.parse((await r.json()).studies[0].assumptions_json).capex,0);
 assert.equal((await feasibilityApi(request(path,{name:'Invalid',organizationId:'a',currency:'AOA',assumptions:{...assumptions,capex:-1}}),db,maker)).status,400);sql.close();
});
