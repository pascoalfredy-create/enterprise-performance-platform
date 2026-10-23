import test from 'node:test';
import assert from 'node:assert/strict';
import {depreciationCategories, depreciationPlan, depreciationReference} from '../lib/depreciation-reference.ts';
const plan = (extra = {}) => depreciationPlan({categoryId:'AO207-15-G-4.1.2',costMinor:12000000,residualMinor:0,inServicePeriod:'2026-03',fromPeriod:'2026-01',months:12,...extra});

test('general table preserves 81 distinct published rates and reference', () => {
 assert.equal(depreciationCategories.length,81);
 assert.equal(new Set(depreciationCategories.map(c=>c.id)).size,81);
 assert.match(depreciationReference.instrument,/207\/15/);
 for(const [code,rate,life] of [['3.1',3333,3],['4.1.1',1667,6],['4.1.2',2500,4],['3.15',1667,6],['2.7',1666,6],['1.4',200,50],['5.5.1',1667,6],['5.12',2500,4]]) {
  const item=depreciationCategories.find(c=>c.code===code);
  assert.equal(item?.annualRateBps,rate);assert.equal(item?.publishedLifeYears,life);
 }
 assert.equal(new Set(depreciationCategories.map(c=>c.category)).size,5);
});
test('monthly quotas start in service month and do not generate cash',()=>{
 const result=plan();
 assert.deepEqual(result.rows.map(r=>r.depreciationMinor),[0,0,...Array(10).fill(250000)]);
 assert.equal(result.rows.at(-1).netBookMinor,9500000);
 assert.equal('cash' in result,false);
});
test('residual and accumulated rounding cap lifetime charges without missing prior years',()=>{
 const result=plan({costMinor:10001,residualMinor:1,months:60});
 assert.equal(result.rows.reduce((s,r)=>s+r.depreciationMinor,0),10000);
 assert.equal(result.rows.at(-1).netBookMinor,1);
 const slice=plan({costMinor:10001,residualMinor:1,fromPeriod:'2028-01',months:12});
 assert.deepEqual(slice.rows,result.rows.slice(24,36));
 assert.ok(result.rows.every(r=>Number.isInteger(r.depreciationMinor)&&r.depreciationMinor>=0&&r.netBookMinor>=1));
});
test('33.33 is not silently replaced by one third; rounded-life residue is retained',()=>{
 const result=plan({categoryId:'AO207-15-G-3.1',costMinor:12000000,inServicePeriod:'2026-01',months:37});
 assert.equal(result.rows[35].accumulatedMinor,11998800);
 assert.equal(result.rows[36].depreciationMinor,1200);
 assert.equal(result.rows[36].netBookMinor,0);
});
test('zero base, periods before service and exhausted assets stay zero',()=>{
 assert.ok(plan({residualMinor:12000000}).rows.every(r=>r.depreciationMinor===0));
 assert.ok(plan({inServicePeriod:'2028-01'}).rows.every(r=>r.depreciationMinor===0));
 assert.ok(plan({inServicePeriod:'2010-01'}).rows.every(r=>r.depreciationMinor===0));
});
test('rejects unsupported assets and invalid money, dates or horizons',()=>{
 for(const extra of [{categoryId:'land'},{costMinor:-1},{costMinor:1.5},{costMinor:NaN},{costMinor:Number.MAX_SAFE_INTEGER+1},{residualMinor:12000001},{inServicePeriod:'2026-13'},{fromPeriod:'2026-1'},{fromPeriod:'0000-01'},{months:0},{months:361},{months:2.5},{fromPeriod:'2200-12',months:2}]) assert.throws(()=>plan(extra));
});
test('large valid amounts retain exact cumulative cent conservation',()=>{
 const result=plan({costMinor:Number.MAX_SAFE_INTEGER,residualMinor:123,months:120});
 assert.equal(result.rows.reduce((s,r)=>s+BigInt(r.depreciationMinor),0n),BigInt(Number.MAX_SAFE_INTEGER)-123n);
 assert.equal(result.rows.at(-1).netBookMinor,123);
});
