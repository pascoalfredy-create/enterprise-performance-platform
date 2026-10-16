import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const {feasibility,feasibilityDefaults,netPresentValue,internalRateOfReturn}=await import('../lib/feasibility-engine.ts');
const {formatNumberValue,numberDraft,pastedNumber,typedDecimal}=await import('../lib/number-input.ts');
const base={...feasibilityDefaults,years:2,capex:1000,units:10,price:100,unitCost:40,discountRate:10};
test('independent annuity benchmark discounts year zero once and IRR solves the same flows',()=>{
 const result=feasibility(base);assert.deepEqual(result.flows,[-1000,600,600]);assert.equal(result.npv,41.32);assert.ok(Math.abs(result.irr-13.06623862918075)<1e-9);assert.ok(Math.abs(netPresentValue(result.flows,result.irr/100))<1e-8);assert.equal(netPresentValue([-1000,1100],.1),-1000+1100/1.1);assert.equal(internalRateOfReturn([-1000,1000]),0);assert.equal(internalRateOfReturn([-1000,0,0]),null);assert.equal(internalRateOfReturn([-1000,2000,-100]),null);
});
test('monthly activity normalizes volume and fixed cost once, leaving unit prices and annual rates unchanged',()=>{
 const monthly=feasibility({...base,years:5,units:100,fixedCosts:100,activityPeriod:'month',volumeGrowth:10});const annual=feasibility({...base,years:5,units:1200,fixedCosts:1200,volumeGrowth:10});assert.deepEqual(monthly.flows,annual.flows);assert.equal(monthly.npv,annual.npv);assert.equal(monthly.irr,annual.irr);assert.equal(monthly.rows[0].price,100);assert.equal(monthly.initial,-1000);assert.equal(monthly.rows[1].units,1320);
});
test('supplier credit is not a cash grant at t0 and is settled on project closure',()=>{
 const result=feasibility({...base,units:100,price:8,unitCost:3,payableDays:365});assert.equal(result.rawInitialWorkingCapital,-300);assert.equal(result.initialWorkingCapital,0);assert.deepEqual(result.flows,[-1000,800,200]);assert.equal(result.npv,-107.44);assert.ok(result.flags.includes('tradeCredit'));assert.equal(result.flows.reduce((s,v)=>s+v,0),0);
});
test('genuine high IRR is preserved and flagged; no artificial return cap is applied',()=>{
 const result=feasibility({...base,units:20,unitCost:0});assert.ok(Math.abs(result.irr-Math.sqrt(3)*100)<1e-8);assert.ok(result.flags.includes('highReturn'));assert.ok(result.flags.includes('noVariable'));
});
test('depreciation reconciles down to cents and economic break-even includes depreciation',()=>{
 const result=feasibility({...base,capex:.15,years:30});assert.equal(Math.round(result.rows.reduce((s,row)=>s+row.depreciation,0)*100),15);assert.ok(result.rows.every(row=>row.depreciation>=0));const normal=feasibility({...base,fixedCosts:60});assert.equal(normal.cashBreakEvenUnits,1);assert.equal(normal.breakEvenUnits,560/60);assert.throws(()=>feasibility({...base,capex:.001}));assert.throws(()=>feasibility({...base,capex:1.005}));assert.throws(()=>feasibility({...base,activityPeriod:'day'}));
});
test('numeric drafts group thousands without changing decimal magnitude',()=>{
 assert.equal(formatNumberValue(1000000.5,'pt'),'1.000.000,50');assert.equal(formatNumberValue(1000000.5,'en'),'1,000,000.50');assert.equal(formatNumberValue(1250,'ru'),'1\u202f250,00');assert.equal(numberDraft('1000000,50','pt').value,1000000.5);assert.equal(numberDraft('1000000,','pt').text,'1.000.000,');assert.equal(numberDraft('1.000.000,50','pt').value,1000000.5);assert.equal(numberDraft('-12,5','pt',4,true).value,-12.5);assert.equal(numberDraft('-12,5','pt',4,false).valid,false);assert.equal(numberDraft('','pt').valid,false);assert.equal(numberDraft('1,234','pt',2).valid,false);assert.equal(typedDecimal('1.000.',6,'.','pt'),'1.000,');assert.equal(typedDecimal('1,000,',6,',','en'),'1,000.');assert.equal(typedDecimal('1.000,50',8,null,'pt'),'1.000,50');
});
test('pasted amounts support both decimal conventions and reject malformed grouping',()=>{
 for(const raw of ['1.000.000,50','1,000,000.50','1 000 000,50','1000000.50'])assert.equal(pastedNumber(raw,'pt').value,1000000.5,raw);assert.equal(pastedNumber('1.000.000,50','en').value,1000000.5);assert.equal(pastedNumber('1..000','pt').valid,false);assert.equal(pastedNumber('not a value','pt').valid,false);assert.equal(numberDraft('9999999999999999999999','pt').valid,false);
});

const {formatPaybackDuration}=await import('../lib/payback-duration.ts');
test('payback display converts decimal years to rounded months without changing calculations',()=>{
 assert.equal(formatPaybackDuration(1+2/12),'1 ano e 2 meses');
 assert.equal(formatPaybackDuration(1+11/12),'1 ano e 11 meses');
 assert.equal(formatPaybackDuration(1.62),'1 ano e 7 meses');
 assert.equal(formatPaybackDuration(1.9),'1 ano e 11 meses');
 assert.equal(formatPaybackDuration(1.999),'2 anos');
 assert.equal(formatPaybackDuration(1/12),'1 mês');
 assert.equal(formatPaybackDuration(.01),'Menos de 1 mês');
 assert.equal(formatPaybackDuration(0),'0 meses');
 assert.equal(formatPaybackDuration(null),'Não recuperado no horizonte');
 assert.equal(formatPaybackDuration(1+2/12,'en'),'1 year and 2 months');
 assert.equal(formatPaybackDuration(1+11/12,'ru'),'1 год и 11 месяцев');
});
