import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const {financialLedger}=await import('../lib/financial-ledger.ts');
const {executiveFinance,resultBridge,whatIf,enterpriseValuation,monthSequence}=await import('../lib/executive-finance.ts');
const {peopleBridge}=await import('../lib/people-health.ts');
const book={id:'book',organization_id:'a',currency:'AOA',opening_date:'2026-01-01',balances_json:JSON.stringify({CASH:100000,FIXED:900000,CAPITAL:1000000}),reference:'ERP',revision:0};
const op=(kind,amount,cost_role='OPEX',id=crypto.randomUUID())=>({id,book_id:'book',operation_date:'2026-01-15',kind,amount_minor:amount,tax_minor:0,due_date:null,tax_due_date:null,party:'Company',category:'Operations',description:'ERP',reference:id,target_id:null,cash_activity:'Operacional',actual_entry_id:null,cost_role});
const current=financialLedger(book,[op('saleCash',200000),op('costCash',50000,'COGS'),op('costCash',50000),op('depreciation',10000),op('costCash',5000,'INTEREST'),op('costCash',15000,'TAX')],'2026-01');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('DuPont, ROIC and EVA independently reconcile with average capital and period WACC charge',()=>{
 const m=executiveFinance(current,10,20),at=k=>m.metrics.find(x=>x.key===k).value;
 assert.equal(current.income.net,70000);assert.equal(m.days,31);assert.equal(m.averageAssets,1035000);assert.equal(m.averageInvested,895000);
 close(at('roe'),70000/1035000*365/31*100);close(m.duPont.margin*m.duPont.turnover*m.duPont.multiplier*100,at('roe'));close(at('roic'),72000/895000*365/31*100);close(at('eva'),72000-895000*.1*31/365);close(at('spread'),at('roic')-10);assert.equal(at('current'),null);assert.equal(at('solvency'),null);
});
test('missing tax/WACC, nonpositive denominators and uncovered periods do not manufacture indicators',()=>{
 const m=executiveFinance(current);assert.equal(m.metrics.find(x=>x.key==='eva').value,null);assert.equal(m.metrics.find(x=>x.key==='nopat').value,null);assert.ok(executiveFinance({...current,covered:false},10,20).metrics.every(x=>x.value===null));assert.equal(executiveFinance(current,NaN,NaN).metrics.find(x=>x.key==='eva').value,null);
});
test('result bridge sums exactly to the reported profit change, including tax and depreciation',()=>{
 const previous=financialLedger(book,[op('saleCash',100000),op('costCash',60000)],'2026-01');assert.equal(previous.income.net+resultBridge(current,previous).reduce((sum,row)=>sum+row.value,0),current.income.net);
});
test('what-if applies volume and unit-cost effects separately and taxes only positive pre-tax profit',()=>{
 const s=whatIf(current,{sales:10,variableCost:2,fixedCost:5,depreciation:10,interest:0,taxRate:20});close(s.revenue,220000);close(s.cogs,56100);close(s.opex,52500);close(s.net,(220000-56100-52500-11000-5000)*.8);assert.throws(()=>whatIf(current,{sales:0,variableCost:0,fixedCost:0,depreciation:0,interest:0,taxRate:NaN}));
});
test('independent level-perpetuity DCF benchmark equals 200 / 10% without double counting terminal',()=>{
 const base={revenue:1000,nopatMargin:20,depreciationPct:2,capexPct:2,workingPct:10,netDebt:500,wacc:10,growth:0,terminalGrowth:0,years:5},v=enterpriseValuation(base);close(v.enterprise,2000);close(v.equity,1500);assert.ok(v.rows.every(r=>r.flow===200));close(v.terminalValue,2000);assert.throws(()=>enterpriseValuation({...base,terminalGrowth:10}));assert.throws(()=>enterpriseValuation({...base,wacc:0}));assert.throws(()=>enterpriseValuation({...base,revenue:NaN}));assert.ok(enterpriseValuation({...base,nopatMargin:-20}).enterprise<0);
});
test('history crosses years without mixing months and people bridge reconciles inclusive final-day exits',()=>{
 assert.deepEqual(monthSequence('2026-02',3),['2025-12','2026-01','2026-02']);const b=peopleBridge({start:10,end:10,hires:1,exits:2});assert.equal(b.boundary,1);assert.equal(b.opening+b.hires+b.exits+b.boundary,b.closing);
});
const {workforceWhatIf}=await import('../lib/people-health.ts');
test('workforce scenario reconciles salary, hiring and exits, rejects over-exits and never posts data',()=>{
 const r=workforceWhatIf({headcount:10,payroll:100000,hires:2,exits:1,loadedCost:10000,salaryGrowth:5});assert.equal(r.headcount,11);assert.equal(r.cost,115000);assert.equal(100000+r.salaryEffect+r.hiringEffect+r.exitEffect,r.cost);assert.throws(()=>workforceWhatIf({headcount:1,payroll:100,hires:0,exits:2,loadedCost:50,salaryGrowth:0}));assert.throws(()=>workforceWhatIf({headcount:1,payroll:100,hires:0,exits:0,loadedCost:NaN,salaryGrowth:0}));
});
