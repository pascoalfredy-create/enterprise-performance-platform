import test from "node:test";
import assert from "node:assert/strict";
import {billingIntervalMonths,billingIntervalDiscountPct,EXTRA_FINANCIAL_MODEL_PROJECT_MONTHLY_MINOR,bundles,employeeTiers,employeeTierByCode,subscriptionTotal,tierForEmployeeCount} from "../lib/commercial-catalog.ts";

test("a single bundle is sold, priced entirely by employee-count tier",()=>{
 assert.equal(bundles.length,1);
 assert.equal(bundles[0].code,"ENTERPRISE");
});
test("approved employee-tier prices are stored in integer minor units",()=>{
 assert.deepEqual(employeeTiers.map(x=>[x.code,x.monthlyMinor]),[["T1",15_000_000],["T2",25_000_000],["T3",40_000_000],["T4",60_000_000]]);
 for(const tier of employeeTiers)assert.equal(Number.isInteger(tier.monthlyMinor),true);
});
test("tierForEmployeeCount resolves every boundary into exactly one tier",()=>{
 assert.equal(tierForEmployeeCount(1).code,"T1");
 assert.equal(tierForEmployeeCount(50).code,"T1");
 assert.equal(tierForEmployeeCount(51).code,"T2");
 assert.equal(tierForEmployeeCount(100).code,"T2");
 assert.equal(tierForEmployeeCount(101).code,"T3");
 assert.equal(tierForEmployeeCount(200).code,"T3");
 assert.equal(tierForEmployeeCount(201).code,"T4");
 assert.equal(tierForEmployeeCount(5000).code,"T4");
});
test("financial-model project allowances match the agreed packaging (1 / 2 / 4 / 4)",()=>{
 assert.deepEqual(employeeTiers.map(t=>t.includedFinancialModelProjects),[1,2,4,4]);
});
test("employeeTierByCode finds a real tier and rejects an unknown code",()=>{
 assert.equal(employeeTierByCode("T2")?.label,"51 a 100 colaboradores");
 assert.equal(employeeTierByCode("BOGUS"),undefined);
});
test("semiannual billing charges six months at a 10% discount",()=>{
 const tier=tierForEmployeeCount(30);
 const result=subscriptionTotal({tier,interval:"semiannual",extraFinancialModelProjects:0});
 assert.equal(billingIntervalMonths.semiannual,6);
 assert.equal(billingIntervalDiscountPct.semiannual,0.10);
 assert.equal(result.totalMinor,Math.round(tier.monthlyMinor*6*0.90));
});
test("annual billing charges twelve months at a 20% discount",()=>{
 const tier=tierForEmployeeCount(30);
 const result=subscriptionTotal({tier,interval:"annual",extraFinancialModelProjects:0});
 assert.equal(billingIntervalMonths.annual,12);
 assert.equal(billingIntervalDiscountPct.annual,0.20);
 assert.equal(result.totalMinor,Math.round(tier.monthlyMinor*12*0.80));
});
test("monthly billing applies no discount and charges exactly one period",()=>{
 const tier=tierForEmployeeCount(30);
 const result=subscriptionTotal({tier,interval:"monthly",extraFinancialModelProjects:0});
 assert.equal(billingIntervalDiscountPct.monthly,0);
 assert.equal(result.totalMinor,tier.monthlyMinor);
});
test("extra financial-model projects add a flat 500.000 Kz each and never go negative",()=>{
 const tier=tierForEmployeeCount(30);
 assert.deepEqual(subscriptionTotal({tier,interval:"monthly",extraFinancialModelProjects:2}),{monthlyMinor:tier.monthlyMinor+2*EXTRA_FINANCIAL_MODEL_PROJECT_MONTHLY_MINOR,discountPct:0,totalMinor:tier.monthlyMinor+2*EXTRA_FINANCIAL_MODEL_PROJECT_MONTHLY_MINOR});
 assert.equal(subscriptionTotal({tier,interval:"monthly",extraFinancialModelProjects:-5}).monthlyMinor,tier.monthlyMinor);
});
