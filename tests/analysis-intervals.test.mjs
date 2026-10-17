import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const {snapshotRangeReport,snapshotHistory,analysisMonthCount}=await import('../lib/analysis-automation.ts');
const {executiveFinance}=await import('../lib/executive-finance.ts');
const income=(revenue,cost=0)=>({REVENUE:revenue,COGS:cost,OPEX:0,DEPRECIATION:0,INTEREST:0,TAX:0});
const source=(period,values,period_basis='month')=>({id:period,period,values,period_basis,organization_id:'a',currency:'AOA',source_system:'ERP',file_name:'sample.csv',revision:0});
test('an isolated YTD source supplies totals and averages, never invented monthly results',()=>{
 const s=source('2026-08',income(80000000,16000000),'ytd'),ytd=snapshotRangeReport([s],'2026-01','2026-08');
 assert.equal(ytd.report.income.REVENUE,80000000);assert.equal(ytd.summary.months,8);assert.equal(ytd.summary.rows.find(r=>r.key==='REVENUE').average,10000000);
 assert.equal(ytd.report.startDate,'2026-01-01');assert.equal(ytd.report.asOf,'2026-08-31');
 const month=snapshotRangeReport([s],'2026-08','2026-08');assert.equal(month.quality.incomeComplete,false);assert.equal(month.summary.rows.find(r=>r.key==='REVENUE').total,null);
 assert.equal(executiveFinance(month.report).metrics.find(m=>m.key==='revenue').value,null);assert.equal(snapshotHistory([s])[0].covered,false);
});
test('successive cumulative observations derive a month and preserve negative corrections and explicit zeros',()=>{
 const july=source('2026-07',income(70000,14000),'ytd'),aug=source('2026-08',income(68000,14000),'ytd'),month=snapshotRangeReport([july,aug],'2026-08','2026-08');
 assert.equal(month.report.income.REVENUE,-2000);assert.equal(month.report.income.COGS,0);assert.equal(month.quality.incomeComplete,true);
 delete aug.values.TAX;assert.equal(snapshotRangeReport([july,aug],'2026-08','2026-08').quality.incomeComplete,false);
});
test('cumulative boundaries resolve quarters without fabricating their missing individual months',()=>{
 const march=source('2026-03',income(30000),'ytd'),june=source('2026-06',income(90000),'ytd'),view=snapshotRangeReport([march,june],'2026-04','2026-06');
 assert.equal(view.report.income.REVENUE,60000);assert.equal(view.summary.rows.find(r=>r.key==='REVENUE').average,20000);
 assert.equal(snapshotRangeReport([march,june],'2026-05','2026-06').quality.incomeComplete,false);
 const history=snapshotHistory([march,june]);assert.deepEqual(history.map(h=>h.period),['2026-03','2026-04','2026-05','2026-06']);assert.ok(history.every(h=>!h.covered));
});
test('monthly ranges sum flows, keep closing positions and recalculate margins instead of averaging them',()=>{
 const a=source('2026-07',{...income(10000,5000),CASH:1000}),b=source('2026-08',{...income(30000,6000),CASH:9000}),view=snapshotRangeReport([a,b],'2026-07','2026-08');
 assert.equal(view.report.income.REVENUE,40000);assert.equal(view.report.balance.accounts.CASH,9000);assert.equal(view.summary.rows.find(r=>r.key==='REVENUE').average,20000);
 assert.equal(executiveFinance(view.report).metrics.find(m=>m.key==='netMargin').value,72.5);assert.ok(!view.summary.rows.some(r=>r.key==='CASH'));
 assert.equal(snapshotRangeReport([a,b],'2026-06','2026-08').quality.incomeComplete,false);
});
test('cash flow uses period movements and prior boundary balances, with complete balance coverage',async()=>{
 const {balanceAccounts}=await import('../lib/financial-ledger.ts');
 const positions=(cash)=>Object.fromEntries([...balanceAccounts.filter(k=>!['CAPITAL','RETAINED'].includes(k)).map(k=>[k,k==='CASH'?cash:0]),['EQUITY',cash]]);
 const opening=source('2025-12',positions(100000000)),march=source('2026-03',{...positions(100000300),...income(300),CF_OPERATING:300,CF_INVESTING:0,CF_FINANCING:0},'ytd'),june=source('2026-06',{...positions(100000900),...income(900),CF_OPERATING:900,CF_INVESTING:0,CF_FINANCING:0},'ytd');
 const view=snapshotRangeReport([opening,march,june],'2026-04','2026-06');assert.equal(view.report.cashFlow.opening,100000300);assert.equal(view.report.cashFlow.closing,100000900);assert.equal(view.report.cashFlow.Operacional,600);assert.equal(view.report.cashFlow.difference,0);assert.equal(view.report.income.REVENUE,600);assert.equal(view.quality.complete,true);
});
test('mixed monthly/cumulative sources resolve known ranges without using observations after the selected end',()=>{
 const jan=source('2026-01',income(100)),aug=source('2026-08',income(800),'ytd'),sep=source('2026-09',income(900),'ytd');
 assert.equal(snapshotRangeReport([jan,aug],'2026-02','2026-08').report.income.REVENUE,700);
 assert.equal(snapshotRangeReport([aug,sep],'2026-08','2026-08').quality.incomeComplete,false);
});
test('cross-year ranges require observed flows in both years and reject unsafe or mixed source scopes',()=>{
 assert.equal(analysisMonthCount('2025-12','2026-02'),3);
 const sources=[source('2025-12',income(100)),source('2026-02',income(500),'ytd')];assert.equal(snapshotRangeReport(sources,'2025-12','2026-02').report.income.REVENUE,600);
 assert.throws(()=>analysisMonthCount('2026-08','2026-07'),/invalid/);assert.throws(()=>analysisMonthCount('2026-00','2026-07'),/invalid/);
 assert.throws(()=>snapshotRangeReport([...sources,{...sources[0]}],'2025-12','2026-02'),/scope/);
 assert.throws(()=>snapshotRangeReport([sources[0],{...sources[1],organization_id:'b'}],'2025-12','2026-02'),/scope/);
 assert.throws(()=>snapshotRangeReport([source('2026-01',income(Number.MAX_SAFE_INTEGER)),source('2026-02',income(1))],'2026-01','2026-02'),/range/);
});
