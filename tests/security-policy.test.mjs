import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {belongsToTenant,hasPermission} from "../lib/security.ts";
const rawSource=fs.readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");
const compact=rawSource.replace(/\s+/g,"");
const source=rawSource+"\n"+compact;
test("all product APIs pass through server-side security context",()=>{
 assert.match(rawSource,/const\s+apiPath\s*=\s*url\.pathname\.replace/);
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
 assert.match(compact,/authenticateApiRequest\(request,env\)/);
});
test("browser receives only the public identity configuration at runtime",()=>{
 assert.match(compact,/apiPath==="\/api\/auth\/config"/);
 assert.match(source,/publishableKey:env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
 assert.doesNotMatch(source,/service_role/);
});
test("checkout is server-priced idempotent and precedes tenant provisioning",()=>{
 assert.match(source,/async function commerceCheckoutApi/);
 assert.match(rawSource,/subscriptionTotal\(\s*\{\s*bundle,\s*interval:\s*interval!,\s*users,\s*employees/);
 assert.match(source,/SELECT \* FROM checkout_sessions WHERE idempotency_key=/);
 assert.match(source,/checkout\.draft_created/);
 assert.match(source,/apiPath==="\/api\/commerce\/checkout"/);
});
test("test payment confirmation is segregated from customer checkout",()=>{
 assert.match(source,/async function paymentIntentApi/);
 assert.match(compact,/provider:\"PAYPAY_SANDBOX\"/);
 assert.match(source,/Pagamentos reais nunca podem ser confirmados pelo simulador/);
 assert.match(source,/async function testConfirmationApi/);
 assert.match(source,/role='Platform Owner'/);
 assert.match(source,/payment\.confirmed/);
 assert.match(source,/status='Pendente'/);
});
test("cross-tenant access fails closed",()=>{
 assert.equal(belongsToTenant("tenant-a","tenant-a"),true);
 assert.equal(belongsToTenant("tenant-b","tenant-a"),false);
});
test("tenant context is selected from an authenticated membership",()=>{
 assert.doesNotMatch(source,/const TENANT\s*=/);
 assert.match(rawSource,/const\s+selectedTenant\s*=/);
 assert.match(source,/memberships\.results\.find/);
 assert.match(source,/O tenant solicitado não pertence ao utilizador autenticado/);
});
test("every vertical slice receives the resolved tenant",()=>{
 assert.match(compact,/setupApi\(request,env\.DB,tenantId,organizationId\)/);
 assert.match(rawSource,/performanceApi\(\s*request,\s*env\.DB,\s*tenantId,\s*organizationId/);
 assert.match(rawSource,/payrollApi\(\s*request,\s*env\.DB,\s*tenantId,\s*organizationId/);
 for(const api of ["workforceApi","dashboardApi","managementReportApi","hcmApi","integrityApi"])
  assert.match(rawSource,new RegExp(`${api}\\(\\s*request,\\s*env\\.DB,\\s*tenantId,\\s*organizationId`));
 assert.match(source,/CREATE TABLE IF NOT EXISTS tenants/);
});
test("paid tenant provisioning is atomic and grants only purchased modules",()=>{
 assert.match(source,/async function provisionTenantApi/);
 assert.match(compact,/payment_status!=="Confirmado"/);
 assert.match(source,/c\.account_id=\?/);
 assert.match(source,/INSERT INTO tenants/);
 assert.match(source,/INSERT INTO platform_users/);
 assert.match(source,/INSERT INTO organizations/);
 assert.match(source,/INSERT INTO subscriptions/);
 assert.match(source,/INSERT INTO module_entitlements/);
 assert.match(source,/tenant\.provisioned/);
 assert.match(source,/apiPath==="\/api\/commerce\/provision"/);
 assert.match(source,/A criação de empresas exige checkout e pagamento confirmado/);
});
test("module access is enforced from active entitlements",()=>{
 assert.match(source,/SELECT module_code FROM module_entitlements WHERE tenant_id=\? AND status='Ativo'/);
 assert.match(source,/moduleRequired/);
 assert.match(source,/Módulo não contratado/);
});
test("session exposes deterministic tenant onboarding readiness",()=>{
 assert.match(rawSource,/onboarding:\s*\{[\s\S]{0,180}organizations:\s*number;[\s\S]{0,180}complete:\s*boolean/);
 assert.match(source,/SELECT COUNT\(\*\) n FROM financial_dimensions/);
 assert.match(source,/onboarding\.complete=onboarding\.organizations>0/);
});
test("operational readiness is derived by engine and reports fail closed",()=>{
 assert.match(source,/async function readinessApi/);
 for(const field of ["active_contracts","salary_profiles","approved_budgets","comparable_scenarios","closed_payroll","workforce_postings"])assert.match(source,new RegExp(field));
 assert.match(source,/O relatório exige Actual, uma versão Budget aprovada/);
 assert.match(source,/apiPath === "\/api\/readiness"/);
});
test("payslip issuance is closed-run only idempotent and auditable",()=>{
 assert.match(compact,/body\.type==="issuePayslips"/);
 assert.match(source,/r\.status='Fechado'/);
 assert.match(source,/SELECT COUNT\(\*\) n FROM payroll_payslips/);
 assert.match(source,/documentType:"PAYSLIP"/);
 assert.match(source,/entity_type,entity_id/);
 assert.match(source,/payroll:read/);
});

test("payment batches reconcile closed payroll and enforce sequential approval",()=>{assert.match(source,/preparePaymentBatch/);assert.match(source,/slips\.results\.length!==Number\(run\.employee_count\)\|\|total!==Number\(run\.net_minor\)/);assert.match(source,/transitionPaymentBatch/);assert.match(source,/security\.role!=="Administrador"/);assert.match(source,/Preparado.*Aprovado.*Exportado/s);assert.match(source,/paymentBatch/)});
test("absence decisions enforce scope balance and maker checker",()=>{assert.match(source,/absenceRequest/);assert.match(source,/decideAbsence/);assert.match(source,/Saldo de ausência insuficiente/);assert.match(source,/quem criou o pedido não pode aprová-lo/);assert.match(source,/O pedido foi decidido por outro utilizador/)});
test("workflow inbox filters entitlement scope role and SLA",()=>{assert.match(source,/workflow:read/);assert.match(source,/modules\.includes\("HCM"\)/);assert.match(source,/modules\.includes\("PAYROLL"\)/);assert.match(source,/modules\.includes\("FINANCE_FP&A"\)/);assert.match(source,/modules\.includes\("PERFORMANCE_MANAGEMENT"\)/);assert.match(source,/performance_reviews/);assert.match(source,/Calibrar avaliação/);assert.match(source,/hours<0\?"Crítica"/);assert.match(source,/requiredRoles\.includes\(role\)/);assert.match(source,/x\.owner_email/)});
test("action plans enforce scope ownership evidence and compare-and-set",()=>{assert.match(source,/action:read/);assert.match(source,/action:write/);assert.match(source,/Apenas o responsável ou Administrador/);assert.match(source,/A conclusão exige evidência/);assert.match(source,/status=\?/);assert.match(source,/A ação foi atualizada em paralelo/)});
test("forecast scenarios enforce scope maker checker and immutable sources",()=>{assert.match(source,/scenario:read/);assert.match(source,/scenario:write/);assert.match(source,/Segregação de funções: o criador não pode aprovar/);assert.match(source,/A versão precisa de pelo menos uma entrada/);assert.match(source,/A versão foi alterada em paralelo/);assert.match(source,/forecastVsActualMinor/)});
test("goals enforce ownership maker checker and deterministic progress",()=>{assert.match(source,/goal:read/);assert.match(source,/goal:write/);assert.match(source,/A ativação exige maker-checker/);assert.match(source,/Apenas o responsável ou Administrador pode registar check-in/);assert.match(source,/progress_bps/);assert.match(source,/O objetivo ainda não atingiu a meta/)});
test("reviews enforce actor segregation immutable evidence and deterministic weights",()=>{const reviews=fs.readFileSync(new URL("../worker/reviews.ts",import.meta.url),"utf8");assert.match(source,/review:read/);assert.match(source,/review:write/);assert.match(reviews,/A autoavaliação pertence exclusivamente ao colaborador avaliado/);assert.match(reviews,/A decisão pertence exclusivamente ao gestor designado/);assert.match(reviews,/O calibrador deve ser independente/);assert.match(reviews,/goalScore\*6000\+competency\*4000/)});
test("consolidation is fixed-point tenant-wide and maker-checker governed",()=>{const consolidation=fs.readFileSync(new URL("../worker/consolidation.ts",import.meta.url),"utf8");assert.match(source,/consolidation:read/);assert.match(source,/consolidation:write/);assert.match(consolidation,/BigInt/);assert.match(consolidation,/A consolidação exige âmbito de todo o tenant/);assert.match(consolidation,/Maker-checker: o criador não pode aprovar/);assert.match(consolidation,/Maker-checker: o autor não pode aprovar/);assert.match(consolidation,/approvalHash/)});
test("business planning is fixed-point scoped and independently approved",()=>{const models=fs.readFileSync(new URL("../worker/financial-models.ts",import.meta.url),"utf8");assert.match(source,/financial-model:read/);assert.match(source,/financial-model:write/);assert.match(models,/BigInt/);assert.match(models,/horizon\s*<\s*1[\s\S]*horizon\s*>\s*240/);assert.match(models,/Maker-checker: o aprovador deve ser independente/);assert.match(models,/formulaHash/);assert.match(models,/organization_id=\?/)});
test("financial ingestion is scoped idempotent mapped and maker-checker posted",()=>{const data=fs.readFileSync(new URL("../worker/financial-data.ts",import.meta.url),"utf8");assert.match(source,/financial-data:read/);assert.match(source,/financial-data:write/);assert.match(data,/inputHash/);assert.match(data,/Existem \$\{missing\?\.n\} código\(s\) sem mapping/);assert.match(data,/Maker-checker: o autor do lote não pode publicá-lo/);assert.match(data,/Import:\$\{body\.batchId\}/);assert.match(data,/organization_id=\?/)});
test("diagnostics expose formulas configurable scoring and fixed-point investment math",()=>{const diagnostics=fs.readFileSync(new URL("../worker/financial-diagnostics.ts",import.meta.url),"utf8");assert.match(source,/diagnostic:read/);assert.match(source,/diagnostic:write/);assert.match(diagnostics,/CURRENT_RATIO/);assert.match(diagnostics,/WORKING_CAPITAL/);assert.match(diagnostics,/BigInt/);assert.match(diagnostics,/const irr/);assert.match(diagnostics,/Maker-checker: o criador não pode ativar/);assert.match(diagnostics,/Maker-checker: o aprovador deve ser independente/);assert.match(diagnostics,/fluxo convencional/)});
test("360 feedback enforces identity maker checker completeness and weighted consolidation",()=>{const competencies=fs.readFileSync(new URL("../worker/competencies.ts",import.meta.url),"utf8");assert.match(source,/competency:read/);assert.match(source,/competency:write/);assert.match(competencies,/o criador não pode ativar o próprio framework/);assert.match(competencies,/lower\(p\.evaluator_email\)=lower\(\?\)/);assert.match(competencies,/Responda uma vez a todas as competências/);assert.match(competencies,/rating_bps\*p\.weight_bps/)});
test("control plane is operator isolated reasoned and maker checker governed",()=>{const control=fs.readFileSync(new URL("../worker/control-plane.ts",import.meta.url),"utf8");assert.match(source,/apiPath==="\/api\/control-plane"/);assert.match(control,/Acesso reservado a operadores autorizados/);assert.match(control,/Support Auditor possui acesso apenas de leitura/);assert.match(control,/o solicitante não pode decidir/);assert.match(control,/motivo com pelo menos 10 caracteres/);assert.match(control,/e\.module_code<>'CORE'/);assert.match(control,/db\.batch\(statements\)/)});
test("membership lifecycle preserves tenant administration",()=>{
 for(const action of ["activate","resend","cancel","changeRole","remove"])assert.match(source,new RegExp(`action===\\"${action}\\"`));
 assert.match(source,/Não pode remover ou cancelar o seu próprio acesso/);
 assert.match(source,/A empresa deve manter pelo menos um Administrador ativo/);
 assert.match(source,/SET status='Removido'/);
 assert.match(source,/body\.type==="userAction"/);
});
test("invitation tokens are single-use, expiring and identity-bound",()=>{
 assert.match(source,/CREATE TABLE IF NOT EXISTS invitation_tokens/);
 assert.match(rawSource,/tokenHash\s*=\s*await\s+sha256\(token\)/);
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
 assert.match(rawSource,/async function dashboardApi\(\s*request:\s*Request,\s*db:\s*D1Database,\s*tenantId:\s*string,\s*organizationId:\s*string\s*\|\s*null\s*=\s*null/);
 assert.match(rawSource,/async function integrityApi\(\s*request:\s*Request,\s*db:\s*D1Database,\s*tenantId:\s*string,\s*organizationId:\s*string\s*\|\s*null\s*=\s*null/);
});

test("integrity distinguishes missing setup from real reconciliation failures",()=>{
 assert.match(source,/payrollExpected===0\?"warn":payrollExpected===payrollPosted\?"pass":"fail"/);
 assert.match(source,/financePosted===0&&financeActual===0\?"warn":financePosted===financeActual\?"pass":"fail"/);
 assert.match(source,/!rows\[8\]\?"warn":reportValid\?"pass":"fail"/);
 assert.match(source,/Configuração pendente: registe o primeiro colaborador/);
});
test("permission checks fail closed",()=>{
 assert.equal(hasPermission(["reports:write"],"reports:write"),true);
 assert.equal(hasPermission(["reports:write"],"payroll:write"),false);
});
