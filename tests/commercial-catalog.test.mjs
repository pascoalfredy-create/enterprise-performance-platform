import test from "node:test";
import assert from "node:assert/strict";
import {ANNUAL_MONTHS_CHARGED,bundles,subscriptionTotal} from "../lib/commercial-catalog.ts";

test("approved Angola launch prices are stored in integer minor units",()=>{
 assert.deepEqual(bundles.map(x=>[x.code,x.monthlyMinor]),[["FINANCE",4_990_000],["PEOPLE",5_990_000],["PERFORMANCE",9_990_000],["ENTERPRISE",14_990_000]]);
 for(const bundle of bundles)assert.equal(Number.isInteger(bundle.monthlyMinor),true);
});
test("annual billing charges exactly ten monthly periods",()=>{const bundle=bundles.find(x=>x.code==="FINANCE");const result=subscriptionTotal({bundle,interval:"annual",users:5,employees:0});assert.equal(ANNUAL_MONTHS_CHARGED,10);assert.equal(result.totalMinor,bundle.monthlyMinor*10)});
test("usage overages are deterministic and never negative",()=>{const people=bundles.find(x=>x.code==="PEOPLE");assert.deepEqual(subscriptionTotal({bundle:people,interval:"monthly",users:7,employees:30}),{monthlyMinor:6_990_000,totalMinor:6_990_000,extraUsers:2,extraEmployees:5});assert.equal(subscriptionTotal({bundle:people,interval:"monthly",users:1,employees:1}).monthlyMinor,people.monthlyMinor)});
