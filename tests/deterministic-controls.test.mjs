import test from "node:test";
import assert from "node:assert/strict";
import {percentageAmount,workforceTotal,variance,varianceBps} from "../lib/deterministic.ts";

test("percentage components use integer basis points and deterministic rounding",()=>{
 assert.equal(percentageAmount(100_000,350),3_500);
 assert.equal(percentageAmount(99_999,333),3_330);
});
test("workforce cost reconciles gross plus employer cost",()=>assert.equal(workforceTotal(100_000,10_000),110_000));
test("variance and percentage are reproducible",()=>{
 assert.equal(variance(230_000,100_000),130_000);
 assert.equal(varianceBps(230_000,100_000),13_000);
 assert.equal(varianceBps(10,0),null);
});
