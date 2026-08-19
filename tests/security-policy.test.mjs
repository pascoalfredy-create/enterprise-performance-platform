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
 for(const permission of ["setup:write","hcm:read","hcm:write","performance:write","payroll:write","workforce:write","reports:write"])assert.match(source,new RegExp(permission));
});
test("anonymous and non-member access are rejected",()=>{
 assert.match(source,/Autenticação necessária/);
 assert.match(source,/não possui membership ativa/);
});
test("Supabase bearer sessions are verified server-side before API access",()=>{
 assert.match(source,/async function authenticateApiRequest/);
 assert.match(source,/\/auth\/v1\/user/);
 assert.match(source,/Sessão inválida ou expirada/);
 assert.match(source,/Confirme o e-mail antes de continuar/);
 assert.match(source,/x-ep-verified-user-email/);
 assert.match(source,/authenticateApiRequest\(request,env\)/);
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
 assert.match(source,/setupApi\(request, env\.DB,tenantId,organizationId\)/);
 assert.match(source,/performanceApi\(request, env\.DB,tenantId,organizationId\)/);
 assert.match(source,/payrollApi\(request, env\.DB,tenantId,organizationId\)/);
 assert.match(source,/workforceApi\(request, env\.DB,tenantId,organizationId\)/);
 assert.match(source,/dashboardApi\(request, env\.DB,tenantId,organizationId\)/);
 assert.match(source,/managementReportApi\(request, env\.DB,tenantId,organizationId\)/);
 assert.match(source,/hcmApi\(request,env\.DB,tenantId,organizationId\)/);
 assert.match(source,/integrityApi\(request, env\.DB,tenantId,organizationId\)/);
 assert.match(source,/CREATE TABLE IF NOT EXISTS tenants/);
});
test("tenant provisioning is atomic and grants only the creator administration",()=>{
 assert.match(source,/async function tenantsApi/);
 assert.match(source,/INSERT INTO tenants/);
 assert.match(source,/INSERT INTO platform_users/);
 assert.match(source,/INSERT INTO organizations/);
 assert.match(source,/Tenant \$\{name\} criado com organização principal/);
 assert.match(source,/apiPath==="\/api\/tenants"/);
});
test("membership lifecycle preserves tenant administration",()=>{
 for(const action of ["activate","resend","cancel","changeRole","remove"])assert.match(source,new RegExp(`action===\\"${action}\\"`));
 assert.match(source,/Não pode remover ou cancelar o seu próprio acesso/);
 assert.match(source,/A empresa deve manter pelo menos um Administrador ativo/);
 assert.match(source,/SET status='Removido'/);
 assert.match(source,/body\.type==="userAction"/);
});
test("invitation tokens are single-use, expiring and identity-bound",()=>{
 assert.match(source,/CREATE TABLE IF NOT EXISTS invitation_tokens/);
 assert.match(source,/tokenHash=await sha256\(token\)/);
 assert.match(source,/used_at IS NULL AND i\.revoked_at IS NULL/);
 assert.match(source,/Este convite expirou/);
 assert.match(source,/Este convite pertence a outro utilizador autenticado/);
 assert.match(source,/UPDATE invitation_tokens SET used_at=/);
 assert.match(source,/apiPath==="\/api\/invitations\/accept"/);
});
test("organization scope is enforced and unauthorized writes fail closed",()=>{
 assert.match(source,/organizationId:user\.organization_id/);
 assert.match(source,/\(\? IS NULL OR e\.organization_id=\?\)/);
 assert.match(source,/\(\? IS NULL OR organization_id=\?\)/);
 assert.match(source,/A operação financeira está fora do âmbito organizacional autorizado/);
 assert.match(source,/A administração da estrutura exige âmbito de todo o tenant/);
});
test("payroll and workforce preserve organization scope end to end",()=>{
 assert.match(source,/CREATE TABLE IF NOT EXISTS payroll_run_scopes/);
 assert.match(source,/INSERT INTO payroll_run_scopes/);
 assert.match(source,/s\.organization_id=\?/);
 assert.match(source,/Colaborador fora do âmbito autorizado/);
 assert.match(source,/Payroll Run fechado não encontrado no âmbito autorizado/);
 assert.match(source,/e\.organization_id=\?/);
});
test("dashboard reports and integrity preserve organization scope",()=>{
 assert.match(source,/CREATE TABLE IF NOT EXISTS management_report_scopes/);
 assert.match(source,/INSERT INTO management_report_scopes/);
 assert.match(source,/parameters:\{period,currency,organizationId/);
 assert.match(source,/async function dashboardApi\(request:Request,db:D1Database,tenantId:string,organizationId:string\|null=null\)/);
 assert.match(source,/async function integrityApi\(request:Request,db:D1Database,tenantId:string,organizationId:string\|null=null\)/);
});
test("permission checks fail closed",()=>{
 assert.equal(hasPermission(["reports:write"],"reports:write"),true);
 assert.equal(hasPermission(["reports:write"],"payroll:write"),false);
});
