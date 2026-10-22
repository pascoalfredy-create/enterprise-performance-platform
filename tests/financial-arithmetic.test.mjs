import test from 'node:test';
import assert from 'node:assert/strict';
import {periodAdd,compoundMinor,applyBps} from '../lib/financial-arithmetic.ts';
import {compoundStep} from '../lib/budget-drivers.ts';
test('shared monthly arithmetic preserves year boundaries and signed half-away-from-zero rounding',()=>{
 assert.equal(periodAdd('2026-12',1),'2027-01');assert.equal(periodAdd('2026-01',-1),'2025-12');
 assert.equal(compoundMinor(101,5000,2),228);assert.equal(compoundMinor(-101,5000,2),-228);
 assert.equal(applyBps(101,5000),51);assert.equal(applyBps(-101,5000),-51);assert.equal(compoundMinor(101,5000,0),101);
});
test('budget normalization remains local while the business-plan integer contract remains strict',()=>{
 assert.equal(compoundStep(101.9,5000.7,2),228);
 assert.throws(()=>compoundMinor(101.9,5000,2),RangeError);
 assert.throws(()=>compoundMinor(101,5000.7,2),RangeError);
});
