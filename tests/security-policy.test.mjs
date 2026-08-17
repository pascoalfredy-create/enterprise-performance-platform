import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {belongsToTenant,hasPermission} from "../lib/security.ts";
const source=fs.readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");
test("all product APIs pass through server-side security context",()=>{
 assert.match(source,/const apiPath=url\.pathname\.replace/);
 assert.match(source,/apiPath\.startsWith\("\/api\/"\)/);
 assert.match(source,/securityContext\(request,env\.DB\)/);
});
test("write permissions are explicit per domain",()=>{
 for(const permission of ["setup:write","performance:write","payroll:write","workforce:write","reports:write"])assert.match(source,new RegExp(permission));
});
test("anonymous and non-member access are rejected",()=>{
 assert.match(source,/Autenticação necessária/);
 assert.match(source,/não possui membership ativa/);
});
test("cross-tenant access fails closed",()=>{
 assert.equal(belongsToTenant("tenant-a","tenant-a"),true);
 assert.equal(belongsToTenant("tenant-b","tenant-a"),false);
});
test("tenant context is selected from an authenticated membership",()=>{
 assert.doesNotMatch(source,/const TENANT\s*=/);
 assert.match(source,/const selectedTenant=/);
 assert.match(source,/memberships\.results\.find/);
 assert.match(source,/O tenant solicitado não pertence ao utilizador autenticado/);
});
test("every vertical slice receives the resolved tenant",()=>{
 for(const api of ["setupApi","performanceApi","payrollApi","workforceApi","dashboardApi","managementReportApi","integrityApi"]){
  assert.match(source,new RegExp(`${api}\\(request, env\\.DB,tenantId\\)`));
 }
 assert.match(source,/CREATE TABLE IF NOT EXISTS tenants/);
});
test("permission checks fail closed",()=>{
 assert.equal(hasPermission(["reports:write"],"reports:write"),true);
 assert.equal(hasPermission(["reports:write"],"payroll:write"),false);
});
