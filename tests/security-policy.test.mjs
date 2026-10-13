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
test("customer activation uses the current membership source and always returns JSON errors",()=>{
 const activation=fs.readFileSync(new URL("../worker/customer-activation.ts",import.meta.url),"utf8");
 assert.match(activation,/COUNT\(\*\) FROM platform_users WHERE tenant_id=\? AND status='Ativo'/);
 assert.doesNotMatch(activation,/FROM tenant_memberships/);
 assert.match(activation,/classifyDataError/);
 assert.match(source,/Endpoint da API não encontrado/);
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
test("a financial model line can be driven by another line's computed amount instead of only fixed compound growth",()=>{const models=fs.readFileSync(new URL("../worker/financial-models.ts",import.meta.url),"utf8");assert.match(models,/ORDER BY rowid/);assert.match(models,/driverRaw\[sequence\]/);assert.match(models,/applyBps\(\s*driverRaw\[sequence\],\s*Number\(line\.driver_multiplier_bps\),?\s*\)/);assert.match(models,/Linha direcionadora não encontrada neste plano/);assert.match(models,/rawByLine\.set/)});
test("planning entries can be bulk-imported from a spreadsheet, scoped to the caller's organization and capped in size",()=>{assert.match(source,/importPlanningEntries/);assert.match(compact,/Importaçãoforadoâmbitoorganizacionalautorizado/);assert.match(source,/rows\.length > 2000/);assert.match(source,/rows\.some\(\(r\) => !r\.lineCode\?\.trim\(\) \|\| !r\.lineName\?\.trim\(\)\)/)});
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
test("Colaborador self-service identity is resolved from an active portal account, never platform_users",()=>{
 assert.match(source,/Colaborador:\["selfservice:read","selfservice:write"\]/);
 assert.match(source,/employee_portal_accounts/);
 assert.match(source,/epa\.status IN \('Convidado','Ativo'\)/);
 assert.match(source,/portalAccount\.status==="Convidado"/);
 assert.match(source,/UPDATE employee_portal_accounts SET status='Ativo'/);
 assert.match(source,/employeeId:user\.employee_id\?String\(user\.employee_id\):null/);
 assert.match(compact,/apiPath==="\/api\/self-service"/);
 assert.match(compact,/selfServiceApi\(request,env\.DB,security\)/);
});
test("self-service API is scoped to the caller's own employeeId and never trusts a client-supplied id",()=>{
 const selfService=fs.readFileSync(new URL("../worker/self-service.ts",import.meta.url),"utf8");
 const compactSelf=selfService.replace(/\s+/g,"");
 assert.match(selfService,/if \(!security\.employeeId\) return noEmployee\(\);/);
 assert.match(compactSelf,/employeeId=security\.employeeId/);
 assert.doesNotMatch(compactSelf,/body\.employeeId/);
 assert.doesNotMatch(compactSelf,/searchParams\.get\("employeeId"\)/);
 assert.match(selfService,/WHERE tenant_id=\? AND employee_id=\? AND status='Emitido'/);
 assert.match(selfService,/WHERE b\.tenant_id=\? AND b\.employee_id=\?/);
 assert.match(selfService,/WHERE r\.tenant_id=\? AND r\.employee_id=\?/);
 assert.match(selfService,/WHERE d\.tenant_id=\? AND d\.employee_id=\?/);
});
test("self-service leave requests validate the absence type against the caller's own tenant before inserting",()=>{
 const selfService=fs.readFileSync(new URL("../worker/self-service.ts",import.meta.url),"utf8");
 assert.match(selfService,/SELECT unit FROM hcm_absence_types WHERE id=\? AND tenant_id=\? AND status='Ativo'/);
 assert.match(selfService,/Tipo de ausência inválido/);
 assert.match(selfService,/status:\s*"Pendente"\s*\},\s*\{\s*status:\s*201/);
});
test("the founding Administrador is always tenant-wide, never trapped in their own organization",()=>{
 assert.match(compact,/"Administrador",null,"Ativo",/);
 assert.doesNotMatch(compact,/"Administrador",organizationId,"Ativo",/);
 assert.match(source,/user\.role === "Administrador" && user\.organization_id/);
 assert.match(source,/UPDATE platform_users SET organization_id=NULL WHERE id=\? AND tenant_id=\?/);
 assert.match(source,/user\.organization_id = null;/);
});
test("managers can assign and cancel employee tasks, scoped to their organization",()=>{
 const tasks=fs.readFileSync(new URL("../worker/employee-tasks.ts",import.meta.url),"utf8");
 assert.match(tasks,/body\.type === "assignTask"/);
 assert.match(tasks,/Colaborador fora do âmbito autorizado/);
 assert.match(tasks,/body\.type === "cancelTask"/);
 assert.match(tasks,/status IN \('Pendente','Em curso'\)/);
 assert.match(compact,/apiPath==="\/api\/employee-tasks"/);
 assert.match(compact,/employeeTasksApi\(request,env\.DB,security\)/);
});
test("employees can only move their own tasks forward, never cancel or skip states",()=>{
 const selfService=fs.readFileSync(new URL("../worker/self-service.ts",import.meta.url),"utf8");
 assert.match(selfService,/body\.type === "taskTransition"/);
 assert.match(selfService,/Pendente: \["Em curso"\]/);
 assert.match(selfService,/"Em curso": \["Concluída"\]/);
 assert.match(selfService,/Tarefa não encontrada no seu âmbito/);
 assert.match(selfService,/WHERE id=\? AND tenant_id=\? AND employee_id=\?/);
});
test("HR can invite an employee to the self-service portal, scoped and deduplicated",()=>{
 assert.match(source,/body\.type==="portalInvite"/);
 assert.match(source,/Colaborador fora do âmbito autorizado/);
 assert.match(source,/Este colaborador já tem um convite para o portal/);
 assert.match(source,/Este e-mail já está associado a outra conta do portal/);
 assert.match(compact,/INSERTINTOemployee_portal_accounts/);
 assert.match(compact,/"Convidado",actor,created,created/);
 assert.match(source,/entityType=\s*\n?\s*body\.type==="portalInvite"\s*\n?\s*\?"employeePortalAccount"/);
});
test("managers can publish performance results to employees in their organization scope",()=>{
 const notices=fs.readFileSync(new URL("../worker/employee-performance-notices.ts",import.meta.url),"utf8");
 assert.match(notices,/body\.type !== "publishResult"/);
 assert.match(notices,/Colaborador fora do âmbito autorizado/);
 assert.match(notices,/RATINGS\.includes\(body\.overallRating\)/);
 assert.match(notices,/n < 0 \|\| n > 10000/);
 assert.match(compact,/apiPath==="\/api\/employee-performance-notices"/);
 assert.match(compact,/employeePerformanceNoticesApi\(request,env\.DB,security\)/);
});
test("employees can only read and acknowledge their own performance notices, never alter the content",()=>{
 const selfService=fs.readFileSync(new URL("../worker/self-service.ts",import.meta.url),"utf8");
 assert.match(selfService,/resource === "performance-notices"/);
 assert.match(selfService,/body\.type === "acknowledgeNotice"/);
 assert.match(selfService,/SET status='Reconhecido',acknowledged_at=\? WHERE id=\? AND tenant_id=\? AND employee_id=\? AND status='Publicado'/);
});
test("employees can punch their own attendance clock, scoped and single-session",()=>{
 const selfService=fs.readFileSync(new URL("../worker/self-service.ts",import.meta.url),"utf8");
 assert.match(selfService,/body\.type === "selfClockIn"/);
 assert.match(selfService,/body\.type === "selfClockOut"/);
 assert.match(selfService,/Já tem uma entrada em aberto\. Registe a saída primeiro\./);
 assert.match(selfService,/Já registou a presença de hoje\./);
 assert.match(selfService,/Não existe um turno ativo atribuído\. Contacte os Recursos Humanos\./);
 assert.match(selfService,/WHERE tenant_id=\? AND employee_id=\? AND clock_out IS NULL/);
 assert.match(selfService,/resource === "attendance"/);
});
test("only HR/Administrador (hcm:write) can publish career notices, scoped to their organization",()=>{
 const notices=fs.readFileSync(new URL("../worker/employee-career-notices.ts",import.meta.url),"utf8");
 assert.match(notices,/body\.type !== "publishNotice"/);
 assert.match(notices,/Colaborador fora do âmbito autorizado/);
 assert.match(notices,/TYPES\.includes\(body\.noticeType\)/);
 assert.match(notices,/A moeda é obrigatória quando há valores salariais/);
 assert.match(compact,/apiPath==="\/api\/employee-career-notices"/);
 assert.match(compact,/employeeCareerNoticesApi\(request,env\.DB,security\)/);
 assert.match(compact,/"\/api\/employee-tasks","\/api\/employee-career-notices"/);
});
test("employees can only read and acknowledge their own career notices, never alter the content",()=>{
 const selfService=fs.readFileSync(new URL("../worker/self-service.ts",import.meta.url),"utf8");
 assert.match(selfService,/resource === "career-notices"/);
 assert.match(selfService,/body\.type === "acknowledgeCareerNotice"/);
 assert.match(selfService,/UPDATE employee_career_notices SET status='Reconhecido',acknowledged_at=\? WHERE id=\? AND tenant_id=\? AND employee_id=\? AND status='Publicado'/);
});
test("only HR/Administrador (hcm:write) can publish onboarding documents for signature, scoped to their organization",()=>{
 const docs=fs.readFileSync(new URL("../worker/employee-onboarding-documents.ts",import.meta.url),"utf8");
 assert.match(docs,/body\.type !== "publishOnboardingDocument"/);
 assert.match(docs,/Colaborador fora do âmbito autorizado/);
 assert.match(docs,/O link do documento deve ser um URL válido/);
 assert.match(compact,/apiPath==="\/api\/employee-onboarding-documents"/);
 assert.match(compact,/employeeOnboardingDocumentsApi\(request,env\.DB,security\)/);
 assert.match(compact,/"\/api\/employee-career-notices","\/api\/employee-onboarding-documents"/);
});
test("employees can only sign their own pending onboarding documents with a typed legal name, never alter published content",()=>{
 const selfService=fs.readFileSync(new URL("../worker/self-service.ts",import.meta.url),"utf8");
 assert.match(selfService,/resource === "onboarding-documents"/);
 assert.match(selfService,/body\.type === "signOnboardingDocument"/);
 assert.match(selfService,/signatureName\.length < 3/);
 assert.match(selfService,/UPDATE employee_onboarding_documents SET status='Assinado',signed_by=\?,signature_name=\?,signed_at=\? WHERE id=\? AND tenant_id=\? AND employee_id=\? AND status='Pendente'/);
});
test("attendance punch clock captures optional geolocation but never requires it",()=>{
 const selfService=fs.readFileSync(new URL("../worker/self-service.ts",import.meta.url),"utf8");
 assert.match(selfService,/function parseGeo/);
 assert.match(selfService,/lat === undefined && lng === undefined && accuracy === undefined\) return null/);
 assert.match(selfService,/latN < -90 \|\|\s*latN > 90/);
 assert.match(selfService,/clock_in_lat,clock_in_lng,clock_in_accuracy_m\) VALUES/);
 assert.match(selfService,/clock_out_lat=\?,clock_out_lng=\?,clock_out_accuracy_m=\?/);
 assert.match(selfService,/Localização inválida/);
});
test("attendance geolocation columns are append-only and clock_in location is immutable once set",()=>{
 const migration=fs.readFileSync(new URL("../drizzle/0047_attendance_geolocation.sql",import.meta.url),"utf8");
 assert.match(migration,/ALTER TABLE attendance_entries ADD COLUMN clock_in_lat REAL/);
 assert.match(migration,/ALTER TABLE attendance_entries ADD COLUMN clock_out_lat REAL/);
 assert.match(migration,/NEW\.clock_in_lat IS NOT OLD\.clock_in_lat/);
 const attendanceApi=fs.readFileSync(new URL("../worker/attendance.ts",import.meta.url),"utf8");
 assert.match(attendanceApi,/INSERT INTO attendance_entries \(id,tenant_id,employee_id,work_date,clock_in,clock_out,source,worked_minutes,scheduled_minutes,overtime_minutes,exception_code,note,created_by,created_at\)/);
});
test("scenario comparison exposes every planning version's own-period total and base-budget total, scoped to the caller's organization",()=>{
 assert.match(compact,/\)period_total_minor,\(SELECTCOALESCE\(SUM\(amount_minor\),0\)FROMperformance_entries/);
 assert.match(compact,/\)base_budget_total_minorFROMplanning_versionsvLEFTJOINbudget_versionsb/);
 assert.match(compact,/pe\.version_id=v\.base_budget_idANDpe\.scenario='Budget'/);
});
test("consolidation computes non-controlling interest per line from point-in-time ownership, defaulting to full ownership",()=>{
 const consolidationApi=fs.readFileSync(new URL("../worker/consolidation.ts",import.meta.url),"utf8");
 assert.match(consolidationApi,/body\.type === "setOwnership"/);
 assert.match(consolidationApi,/status='Encerrado'/);
 assert.match(consolidationApi,/ownershipMap\.get\(String\(row\.organization_id\)\) \?\? 10000/);
 assert.match(consolidationApi,/ownedAmount = applyBps\(convertedAmount, ownershipBps\)/);
 assert.match(consolidationApi,/nciAmount = convertedAmount - ownedAmount/);
 assert.match(consolidationApi,/parentTotal = reported - Number\(run\.nci_total_minor \|\| 0\)/);
});
test("workspaces mounted multiple times with different initialView props (sidebar navigation between sibling finance/analytics views) resync their internal tab instead of keeping the first-ever initialView",()=>{
 for(const [file,extra] of [["../app/finance-suite.tsx",""],["../app/analytics-suite.tsx",""],["../app/financial-diagnostics-workspace.tsx",""],["../app/financial-models-workspace.tsx",""]]){
  const src=fs.readFileSync(new URL(file,import.meta.url),"utf8").replace(/\s+/g," ");
  assert.match(src,/useEffect\(\s*\(\)\s*=>\s*\{?\s*setView\(initialView\)\s*;?\s*\}?,\s*\[initialView\]\s*\)/,`${file} does not resync view with initialView`);
 }
});
test("manager assignment is organization-scoped, rejects self-management, and reassignment closes the prior active line before opening a new one",()=>{
 assert.match(compact,/body.type==="setReportingLine"/);
 assert.match(compact,/body.employeeId===body.managerId/);
 assert.match(source,/status='Encerrado',effective_to=\? WHERE tenant_id=\? AND employee_id=\? AND status='Ativo'/);
});
test("personal detail change requests require an approver independent of the requester, mirroring the absence maker-checker pattern",()=>{
 assert.match(compact,/body.type==="decidePersonalDetailRequest"/);
 assert.match(compact,/requestRow.requested_by===actor/);
 assert.match(source,/Segregação de funções: quem pediu a alteração não pode aprová-la ou rejeitá-la/);
});
test("self-service personal-details resource never returns another employee's pending request and validates IBAN length before accepting a request",()=>{
 const selfService=fs.readFileSync(new URL("../worker/self-service.ts",import.meta.url),"utf8");
 assert.match(selfService,/resource === "personal-details"/);
 assert.match(selfService,/WHERE tenant_id=\? AND employee_id=\? AND status='Pendente'/);
 assert.match(selfService,/iban.length < 15 \|\| iban.length > 34/);
});
test("team-leave resource only surfaces approved absences for the caller's own direct reports, scoped to a bounded date window",()=>{
 const selfService=fs.readFileSync(new URL("../worker/self-service.ts",import.meta.url),"utf8");
 assert.match(selfService,/resource === "team-leave"/);
 assert.match(selfService,/rl\.manager_id=\? AND r\.status='Aprovado'/);
 assert.match(selfService,/rl\.status='Ativo'/);
 assert.match(selfService,/60 \* 24 \* 60 \* 60 \* 1000/);
});
test("the public careers endpoint bypasses the Supabase auth gate but is still scoped to one active tenant, caps daily applications, and requires consent",()=>{
 assert.match(compact,/apiPath.startsWith\("\/api\/careers\/"\)/);
 const careersRouteIndex=compact.indexOf('apiPath.startsWith("/api/careers/")'),
   authGateIndex=compact.indexOf('apiPath.startsWith("/api/")){constauthenticated');
 assert.ok(careersRouteIndex>0 && authGateIndex>careersRouteIndex,"careers route must be handled before the blanket /api/ auth gate");
 const careersApi=fs.readFileSync(new URL("../worker/careers.ts",import.meta.url),"utf8");
 assert.match(careersApi,/WHERE slug=\? AND status='Ativo'/);
 assert.match(careersApi,/r\.status IN \('Aberta','Fechada','Cancelada'\)/);
 assert.doesNotMatch(careersApi,/Rascunho/);
 assert.match(careersApi,/DAILY_APPLICATION_CAP/);
 assert.match(careersApi,/body\.consent !== "on"/);
 assert.match(careersApi,/profile\.presentation\.length < 20/);
 assert.match(careersApi,/Já tem uma candidatura registada para esta vaga/);
});
test("public careers document uploads are scoped to the resolved tenant and candidate, type- and size-checked, and wired ahead of the base careers route",()=>{
 assert.match(compact,/rest\.endsWith\("\/documents"\)/);
 const careersApi=fs.readFileSync(new URL("../worker/careers.ts",import.meta.url),"utf8");
 assert.match(careersApi,/export async function careersDocumentApi/);
 assert.match(careersApi,/ALLOWED_MIME/);
 assert.match(careersApi,/MAX_DOCUMENT_BYTES/);
 assert.match(careersApi,/WHERE id=\? AND tenant_id=\?/);
 assert.match(careersApi,/Candidato fora do âmbito autorizado/);
});
test("spontaneous applications can only be linked to an open requisition in scope or archived, both require an independent HR decision and are audited",()=>{
 const recruitment=fs.readFileSync(new URL("../worker/recruitment.ts",import.meta.url),"utf8");
 assert.match(recruitment,/b\.type === "linkSpontaneousApplication"/);
 assert.match(recruitment,/status='Aberta' AND \(\? IS NULL OR organization_id=\?\)/);
 assert.match(recruitment,/b\.type === "archiveSpontaneousApplication"/);
 assert.match(recruitment,/status='Em avaliação'/);
});
test("only payroll:write (PAYROLL module) can start or activate a country pack, and activation requires a different administrator than the one who started it (maker-checker)",()=>{
 const packs=fs.readFileSync(new URL("../worker/payroll-country-packs.ts",import.meta.url),"utf8");
 assert.match(packs,/body\.type === "startParametrization"/);
 assert.match(packs,/body\.type === "activatePack"/);
 assert.match(packs,/existing\.started_by\.toLowerCase\(\) === security\.email\.toLowerCase\(\)/);
 assert.match(packs,/Maker-checker: quem iniciou a parametrização não pode ativar o mesmo pack/);
 assert.match(compact,/apiPath==="\/api\/payroll-country-packs"/);
 assert.match(compact,/payrollCountryPacksApi\(request,env\.DB,security\)/);
 assert.match(compact,/"\/api\/payroll-adjustments","\/api\/payroll-country-packs"/);
});
test("HR manager suite cost and talent tabs render only data fetched from the real hr-payroll-cost/hr-talent APIs, with no illustrative fallback content",()=>{
 const suite=fs.readFileSync(new URL("../app/hr-manager-suite.tsx",import.meta.url),"utf8");
 assert.doesNotMatch(suite,/PRÉ-VISUALIZAÇÃO|previewLabel/);
 assert.doesNotMatch(suite,/nine-box/);
 assert.doesNotMatch(suite,/cost-drivers/);
 assert.match(suite,/data\.costBreakdown/);
 assert.match(suite,/data\.nextPeriodProjection/);
 assert.match(suite,/data\.insights\.retentionRiskCount/);
 assert.match(suite,/data\.insights\.successionGapCount/);
 assert.match(suite,/data\.insights\.developmentActiveCount/);
 const hrData=fs.readFileSync(new URL("../worker/hr-data.ts",import.meta.url),"utf8");
 assert.match(hrData,/costBreakdown:/);
 assert.match(hrData,/nextPeriodProjection:/);
 assert.match(hrData,/insights:\s*\{/);
});
test("onboarding cases can only be linked to a non-inactive employee within the caller's organization scope, once, and the recruitment pipeline UI only offers transitions valid from the application's current status",()=>{
 const recruitment=fs.readFileSync(new URL("../worker/recruitment.ts",import.meta.url),"utf8");
 assert.match(recruitment,/b\.type === "linkOnboardingEmployee"/);
 assert.match(recruitment,/status<>'Inativo'/);
 assert.match(recruitment,/Colaborador fora do âmbito autorizado/);
 assert.match(recruitment,/WHERE id=\? AND tenant_id=\? AND employee_id IS NULL/);
 assert.match(recruitment,/já tem um colaborador associado/);
 const workspace=fs.readFileSync(new URL("../app/recruitment-workspace.tsx",import.meta.url),"utf8");
 assert.match(workspace,/nextApplicationStatuses/);
 assert.match(workspace,/Recebida:\s*\["Triagem",\s*"Rejeitada"\]/);
 assert.match(workspace,/Entrevista:\s*\["Oferta",\s*"Rejeitada"\]/);
 assert.match(workspace,/Associar colaborador/);
});
test("an onboarding case's employee can be created directly from the hired candidate (pre-filled name, scoped organization, unique employee number) in the same step it links, instead of requiring a disconnected employee-master entry first",()=>{
 const recruitment=fs.readFileSync(new URL("../worker/recruitment.ts",import.meta.url),"utf8");
 assert.match(recruitment,/b\.type === "createEmployeeFromCase"/);
 assert.match(recruitment,/O número de colaborador já existe/);
 assert.match(recruitment,/Organização fora do âmbito autorizado/);
 assert.match(recruitment,/candidate_name\.trim\(\)\.split\(\/\\s\+\/\)/);
 assert.match(recruitment,/INSERT INTO employees[^"]*VALUES[^"]*'Pendente'/);
 const workspace=fs.readFileSync(new URL("../app/recruitment-workspace.tsx",import.meta.url),"utf8");
 assert.match(workspace,/function LinkEmployeeFields/);
 assert.match(workspace,/createEmployeeFromCase.*linkOnboardingEmployee|linkOnboardingEmployee.*createEmployeeFromCase/);
 assert.match(workspace,/Criar ficha a partir do candidato/);
});
test("attendance clock-in/out times render as HH:MM regardless of whether the stored value is a bare time or a legacy full ISO datetime (demo-seeded rows used full ISO, self-service rows use HH:MM)",()=>{
 const attendance=fs.readFileSync(new URL("../app/attendance-workspace.tsx",import.meta.url),"utf8");
 assert.match(attendance,/const hhmm=/);
 assert.match(attendance,/hhmm\(x\.clock_in\)/);
 assert.match(attendance,/hhmm\(x\.clock_out\)/);
 const hhmm=(v)=>{const s=String(v??"");const m=s.match(/(\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:s};
 assert.equal(hhmm("08:00"),"08:00");
 assert.equal(hhmm("2026-08-07T08:00:00Z"),"08:00");
 assert.equal(hhmm(null),"");
 const demoSeed=fs.readFileSync(new URL("../worker/demo-enterprise.ts",import.meta.url),"utf8");
 assert.doesNotMatch(demoSeed,/T08:00:00Z.*T17:00:00Z/);
});
test("submitting an already-submitted timesheet or headcount plan fails loudly instead of reporting a false success (found during a full HCM audit: neither action checked the UPDATE's affected-row count)",()=>{
 const attendance=fs.readFileSync(new URL("../worker/attendance.ts",import.meta.url),"utf8");
 assert.match(attendance,/subResult\.meta\.changes/);
 assert.match(attendance,/O timesheet não está disponível para submissão/);
 const workforce=fs.readFileSync(new URL("../worker/workforce-plans.ts",import.meta.url),"utf8");
 assert.match(workforce,/subResult\.meta\.changes/);
 assert.match(workforce,/O plano não está disponível para submissão/);
});
test("the HR Manager Suite succession insight describes exactly what it counts (all open requisitions) rather than claiming a 'critical' filter that doesn't exist in the schema",()=>{
 const suite=fs.readFileSync(new URL("../app/hr-manager-suite.tsx",import.meta.url),"utf8");
 assert.doesNotMatch(suite,/successionInsightText:"[^"]*(crítica|critical|crítico|critique|критическ)/);
 assert.match(suite,/open vacancies without a hired candidate/);
});
test("employee-documents registerDocument (a JSON metadata-only path with no R2 write, unreachable from the UI which always posts multipart/form-data) has been removed rather than left as a 404-on-download landmine",()=>{
 const docs=fs.readFileSync(new URL("../worker/employee-documents.ts",import.meta.url),"utf8");
 assert.doesNotMatch(docs,/body\.type === "registerDocument"/);
 assert.match(docs,/body\.type === "createType"/);
 assert.match(docs,/body\.type === "decideDocument"/);
});
test("workforce/workforce-plans GET requires workforce:read like every other HCM endpoint's read side (previously ungated: any authenticated user with the WORKFORCE_PLANNING module could read headcount plans regardless of role)",()=>{
 assert.match(compact,/"workforce:read"/);
 assert.match(compact,/apiPath==="\/api\/workforce"\|\|apiPath==="\/api\/workforce-plans"\?write\?"workforce:write":"workforce:read"/);
});
test("employee pickers across HCM modules accept any non-inactive employee, not only status='Ativo' (no code path ever flips a real employee from Pendente to Ativo directly — only activating its employee_contract does, via a DB trigger — so a strict 'Ativo' filter left every freshly hired or newly onboarded employee invisible in these selects and rejected by these actions)",()=>{
 const files=["payroll-loans.ts","payroll-adjustments.ts","attendance.ts","employee-documents.ts","employee-tasks.ts","employee-onboarding-documents.ts","employee-performance-notices.ts","employee-career-notices.ts"];
 for(const file of files){
  const src=fs.readFileSync(new URL(`../worker/${file}`,import.meta.url),"utf8");
  assert.match(src,/FROM employees[^"]*status<>'Inativo'/,`${file} should accept any non-inactive employee`);
  assert.doesNotMatch(src,/FROM employees[^"]*status='Ativo'/,`${file} should not still gate on status='Ativo'`);
 }
 assert.match(compact,/"SELECTidFROMemployeesWHEREid=\?ANDtenant_id=\?AND\(\?ISNULLORorganization_id=\?\)ANDstatus<>'Inativo'"/);
 assert.match(compact,/"SELECTid,employee_number,first_name,last_nameFROMemployeesWHEREtenant_id=\?AND\(\?ISNULLORorganization_id=\?\)ANDstatus<>'Inativo'/);
});
