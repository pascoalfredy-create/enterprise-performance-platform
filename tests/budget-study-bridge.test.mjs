import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const {compareStudyYearOne}=await import('../lib/budget-study-bridge.ts');
const {buildPlanningModel,planningDefaults}=await import('../lib/feasibility-planning.ts');
const {feasibilityDefaults}=await import('../lib/feasibility-engine.ts');
const model=buildPlanningModel({...feasibilityDefaults,years:2,units:1200,price:20,unitCost:10,fixedCosts:1200,capex:10000,activityPeriod:'year',planning:{...planningDefaults,capexEvents:[{month:2,amount:500}]}});
const source={organizationId:'a',currency:'AOA',monthly:model.monthly};
const target={organizationId:'a',currency:'AOA',dimensionMemberId:'__NONE__',classification:'Receita',cashFlowCategory:'Operacional',monthly:Array.from({length:12},(_,i)=>({period:`2027-${String(i+1).padStart(2,'0')}`,amountMinor:210000}))};
test('calendar alignment compares actual model months and distinguishes absence from zero',()=>{
 const result=compareStudyYearOne(source,target,'2027-03','revenue');
 assert.equal(result.rows[0].studyMinor,null);assert.equal(result.rows[0].deltaMinor,null);
 assert.equal(result.rows[2].studyMinor,200000);assert.equal(result.rows[2].deltaMinor,10000);
 assert.deepEqual(result.outsideMonths,[11,12]);assert.equal(result.initialPeriod,'2027-02');assert.equal(result.initialCapexMinor,1000000);
});
test('year-one bridge uses positive economic magnitudes without repeating initial CAPEX',()=>{
 const result=compareStudyYearOne(source,{...target,classification:'Ativo',cashFlowCategory:'Investimento'},'2027-01','capex');
 assert.equal(result.rows[0].studyMinor,0);assert.equal(result.rows[1].studyMinor,50000);
 assert.equal(result.rows.reduce((sum,r)=>sum+r.studyMinor,0),50000);assert.equal(result.initialCapexMinor,1000000);
 const costs=compareStudyYearOne(source,{...target,classification:'Custo'},'2027-01','variable');
 assert.equal(costs.rows[0].studyMinor,100000);
});
test('rejects cross-company, FX conversion, implicit cost-centre distribution and incompatible lines',()=>{
 for(const patch of [{organizationId:'b'},{currency:'USD'},{dimensionMemberId:''},{dimensionMemberId:'cost-centre-a'},{classification:'Custo'}])assert.throws(()=>compareStudyYearOne(source,{...target,...patch},'2027-01','revenue'));
 assert.throws(()=>compareStudyYearOne(source,target,'2027-13','revenue'));
 assert.throws(()=>compareStudyYearOne(source,{...target,monthly:[target.monthly[0],target.monthly[0]]},'2027-01','revenue'));
});
test('second model year is never silently presented as the first budget year and missing evidence remains null',()=>{
 const r=compareStudyYearOne(source,target,'2026-01','revenue');assert.ok(r.rows.every(row=>row.studyMinor===null));assert.equal(r.outsideMonths.length,12);
 const missing=compareStudyYearOne({...source,monthly:model.monthly.filter(m=>m.month!==2)},target,'2027-01','revenue');assert.equal(missing.rows[1].studyMinor,null);
});

test('rejects differences outside exact minor-unit arithmetic',()=>{assert.throws(()=>compareStudyYearOne({...source,monthly:[{month:1,dre:{revenue:Number.MAX_SAFE_INTEGER/100}}]},{...target,monthly:[{period:'2027-01',amountMinor:-Number.MAX_SAFE_INTEGER}]},'2027-01','revenue'),/Unsafe/);});
