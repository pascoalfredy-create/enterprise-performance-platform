import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const page = fs.readFileSync(
  new URL("../app/page.tsx", import.meta.url),
  "utf8",
);
const client = fs.readFileSync(
  new URL("../lib/api-client.ts", import.meta.url),
  "utf8",
);
const layout = fs.readFileSync(
  new URL("../app/layout.tsx", import.meta.url),
  "utf8",
);
const typography = fs.readFileSync(
  new URL("../app/ui-typography.css", import.meta.url),
  "utf8",
);
const cardLayout = fs.readFileSync(
  new URL("../app/enterprise-layout.css", import.meta.url),
  "utf8",
);
const navigationRefresh = fs.readFileSync(
  new URL("../app/navigation-refresh.css", import.meta.url),
  "utf8",
);
test("browser API client propagates identity and selected tenant", () => {
  assert.match(client, /Bearer \$\{token\}/);
  assert.match(client, /x-tenant-id/);
  assert.match(client, /ep_active_tenant/);
});
test("portal navigation is driven by entitlements", () => {
  for (const code of [
    "ANALYTICS_REPORTING",
    "FINANCE_FP&A",
    "HCM",
    "PAYROLL",
    "WORKFORCE_PLANNING",
    "CORE",
  ])
    assert.match(page, new RegExp(code));
  assert.match(page, /sessao\.modules\.includes/);
});
test("the whole platform inherits only the 10 12 14 enterprise UI scale", () => {
  assert.match(layout, /ui-typography\.css/);
  assert.match(layout, /ui-scale/);
  for (const size of ["10px", "12px", "14px"])
    assert.match(typography, new RegExp(`:${size}`));
  for (const forbidden of [
    "11px",
    "13px",
    "15px",
    "16px",
    "18px",
    "20px",
    "30px",
  ])
    assert.doesNotMatch(typography, new RegExp(`:${forbidden}`));
  assert.match(typography, /ui-scale\.ui-scale\.ui-scale/);
});
test("enterprise cards share one responsive geometry system", () => {
  assert.match(layout, /enterprise-layout\.css/);
  for (const token of [
    "--ui-card-radius",
    "--ui-card-padding",
    "--ui-card-gap",
    "--ui-card-border",
    "--ui-card-shadow",
  ])
    assert.match(cardLayout, new RegExp(token));
  assert.match(cardLayout, /repeat\(auto-fit,minmax\(190px,1fr\)\)/);
  assert.match(cardLayout, /min-height:112px/);
  assert.match(cardLayout, /grid-template-columns:1fr!important/);
});
test("modules fit the available width without horizontal scrolling", () => {
  assert.match(layout, /navigation-refresh\.css/);
  assert.doesNotMatch(layout, /visual-refresh\.css/);
  assert.match(navigationRefresh, /\.workspace-layout\{display:block/);
  assert.match(
    navigationRefresh,
    /\.module-sidebar>nav\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(118px,1fr\)\)/,
  );
  assert.match(
    navigationRefresh,
    /\.domain\{position:relative;width:100%;min-width:0/,
  );
  assert.match(navigationRefresh, /\.domain-items\{position:absolute/);
  assert.doesNotMatch(navigationRefresh, /overflow-x:auto/);
  assert.match(navigationRefresh, /max-width:1880px/);
});
test("contracted modules expose governed submodules and documents", () => {
  const i18n = fs.readFileSync(new URL("../lib/platform-i18n.ts", import.meta.url), "utf8");
  assert.match(page, /const moduleCatalog/);
  assert.match(page, /document:\s*true/);
  assert.match(page, /Em preparação/);
  assert.match(i18n, /"shell\.subscribedModules":"MÓDULOS CONTRATADOS"/);
  assert.match(page, /msg\("shell\.subscribedModules"\)/);
  assert.doesNotMatch(i18n, /function translate/);
});
test("portal no longer creates tenants outside commerce", () => {
  assert.doesNotMatch(page, /api\/v1\/tenants/);
  assert.doesNotMatch(page, /Criar nova empresa/);
});
test("people workspace uses the audited HCM contract API", () => {
  assert.match(page, /function PeopleWorkspace/);
  assert.match(page, /api\/v1\/hcm/);
  assert.match(page, /activateContract/);
  assert.match(page, /endContract/);
});
test("new tenants are guided by real onboarding state without illustrative company data", () => {
  assert.match(page, /TenantOnboarding/);
  assert.match(page, /body\.onboarding\?\.complete/);
  assert.doesNotMatch(page, /Ana Manuel/);
  assert.doesNotMatch(page, /8,42 M USD/);
});
test("portal exposes deterministic readiness and next action per engine", () => {
  assert.match(page, /function EngineReadiness/);
  assert.match(page, /api\/v1\/readiness/);
  assert.match(page, /Preparação dos motores/);
  assert.match(page, /Próxima ação/);
});
test("payroll documents are issued and opened from the real payroll workspace", () => {
  assert.match(page, /issuePayslips/);
  assert.match(page, /Documentos salariais emitidos/);
  assert.match(page, /Hash SHA-256/);
  assert.doesNotMatch(page, /Payslips",future:true/);
});
test("payment batches are operational and no longer marked future", () => {
  assert.match(page, /prepararLote/);
  assert.match(page, /transitarLote/);
  assert.match(page, /Lotes reconciliados e aprovados/);
  assert.doesNotMatch(page, /label:"Payment batches",future:true/);
});
test("absence management is a functional governed HCM workspace", () => {
  assert.match(page, /AbsenceWorkspace/);
  assert.match(page, /Ausências com saldo e decisão controlada/);
  assert.match(page, /decideAbsence/);
  assert.doesNotMatch(page, /label:"Assiduidade e ausências",future:true/);
});
test("workflow is a real cross-engine decision inbox", () => {
  assert.match(page, /WorkflowInbox/);
  assert.match(page, /Decisões pendentes num único lugar/);
  assert.match(page, /Abrir origem/);
  assert.doesNotMatch(page, /label:"Tarefas e aprovações",future:true/);
});
test("performance action plans are operational and evidence governed", () => {
  assert.match(page, /ActionPlans/);
  assert.match(page, /Transformar explicação em responsabilidade/);
  assert.match(page, /completion_evidence/);
  assert.doesNotMatch(page, /label:"Planos de ação",future:true/);
});
test("forecast and scenarios are a functional FP&A workspace", () => {
  assert.match(page, /ScenariosWorkspace/);
  assert.match(page, /Antecipar resultados sem alterar o Actual/);
  assert.match(page, /approvePlanningVersion/);
  assert.doesNotMatch(page, /label:"Forecast e cenários",future:true/);
});
test("performance goals are measurable and check-in governed", () => {
  assert.match(page, /GoalsWorkspace/);
  assert.match(page, /Objetivos mensuráveis, progresso verificável/);
  assert.match(page, /goalCheckin/);
  assert.doesNotMatch(page, /label:"Objetivos",future:true/);
});
test("performance reviews expose governed evaluation and development", () => {
  assert.match(page, /ReviewsWorkspace/);
  assert.match(page, /Avaliar com evidência, calibrar com independência/);
  assert.match(page, /60% objetivos · 40% competências/);
  assert.doesNotMatch(page, /label:"Avaliações",future:true/);
});
test("competency frameworks and feedback 360 are operational", () => {
  const workspace = fs.readFileSync(
    new URL("../app/competencies-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /CompetenciesWorkspace/);
  assert.match(page, /Competências e 360°/);
  assert.match(
    workspace,
    /Competências próprias, feedback de múltiplas perspetivas/,
  );
  assert.match(workspace, /submitFeedback/);
});
test("platform owner console manages SaaS without customer data access", () => {
  const control = fs.readFileSync(
    new URL("../app/platform/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(control, /Empresas, receita e acessos sob controlo/);
  assert.match(
    control,
    /O Control Plane gere subscrições e módulos sem abrir os dados\s+operacionais/,
  );
  assert.match(control, /requestChange/);
  assert.match(control, /decideChange/);
});
test("multicurrency consolidation exposes governed versions and source drill-down", () => {
  const workspace = fs.readFileSync(
    new URL("../app/consolidation-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /ConsolidationWorkspace/);
  assert.match(page, /Consolidação e câmbio/);
  assert.match(workspace, /versão \{r\.run_number\}/);
  assert.match(workspace, /source_hash/);
  assert.match(workspace, /approveRateSet/);
  assert.match(workspace, /approveRun/);
});
test("business planning connects drivers results financing and cash flow", () => {
  const workspace = fs.readFileSync(
    new URL("../app/financial-models-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /FinancialModelsWorkspace/);
  assert.match(page, /Drivers e plano de negócios/);
  assert.match(page, /Cash-flow e financiamento/);
  assert.match(workspace, /Do pressuposto à liquidez/);
  assert.match(workspace, /calculateModel/);
  assert.match(workspace, /approveModel/);
});
test("financial data ingestion maps validates and publishes Actual", () => {
  const workspace = fs.readFileSync(
    new URL("../app/financial-data-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /FinancialDataWorkspace/);
  assert.match(page, /Dados, catálogo e mappings/);
  assert.match(workspace, /Dados de qualquer ERP/);
  assert.match(workspace, /validateBatch/);
  assert.match(workspace, /postBatch/);
  assert.match(workspace, /DRILL-THROUGH/);
});
test("financial diagnostics and investment intelligence are operational", () => {
  const workspace = fs.readFileSync(
    new URL("../app/financial-diagnostics-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /FinancialDiagnosticsWorkspace/);
  assert.match(page, /Diagnóstico financeiro/);
  assert.match(page, /Atratividade de investimento/);
  assert.match(workspace, /Da situação financeira à decisão de investimento/);
  assert.match(workspace, /calculateDiagnostic/);
  assert.match(workspace, /calculateInvestment/);
  assert.match(workspace, /VPL por taxa/);
});
test("industry packs align onboarding and methodology to the core business", () => {
  const workspace = fs.readFileSync(
      new URL("../app/financial-diagnostics-workspace.tsx", import.meta.url),
      "utf8",
    ),
    onboarding = fs.readFileSync(
      new URL("../app/onboarding/empresa/page.tsx", import.meta.url),
      "utf8",
    );
  assert.match(onboarding, /sectorCode/);
  assert.match(onboarding, /coreBusiness/);
  assert.match(workspace, /applyIndustryPack/);
  assert.match(workspace, /Trocar Industry Pack/);
  assert.match(workspace, /segundo utilizador\s+autorizado/);
});
test("approved diagnostics become formal reports and governed actions", () => {
  const workspace = fs.readFileSync(
    new URL("../app/financial-diagnostics-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workspace, /issueDiagnosticReport/);
  assert.match(workspace, /Emitir relatório formal/);
  assert.match(workspace, /createImprovementAction/);
  assert.match(workspace, /Evidência de conclusão/);
});
test("headcount planning is operational and no longer future", () => {
  const workspace = fs.readFileSync(
    new URL("../app/workforce-plans-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /WorkforcePlansWorkspace/);
  assert.doesNotMatch(page, /label:"Headcount plan",future:true/);
  assert.match(workspace, /Pessoas certas, custo previsto, decisão governada/);
  assert.match(workspace, /submitPlan/);
  assert.match(workspace, /approvePlan/);
});
test("recruitment and onboarding are operational with enterprise card typography", () => {
  const workspace = fs.readFileSync(
      new URL("../app/recruitment-workspace.tsx", import.meta.url),
      "utf8",
    ),
    type = fs.readFileSync(
      new URL("../app/enterprise-cards.css", import.meta.url),
      "utf8",
    );
  assert.match(page, /RecruitmentWorkspace/);
  assert.doesNotMatch(page, /label:"Recrutamento e onboarding",future:true/);
  assert.match(workspace, /Da necessidade à integração do colaborador/);
  assert.match(workspace, /transitionApplication/);
  for (const size of ["12px", "14px", "16px"])
    assert.match(type, new RegExp(size));
});
test("time attendance is operational and payroll-ready", () => {
  const workspace = fs.readFileSync(
    new URL("../app/attendance-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /AttendanceWorkspace/);
  assert.doesNotMatch(page, /label:"Assiduidade e timesheets",future:true/);
  assert.match(workspace, /Tempo certo, custo explicável/);
  assert.match(workspace, /buildTimesheet/);
  assert.match(workspace, /decideTimesheet/);
});
test("loans and advances are operational and reconciled to payroll", () => {
  const workspace = fs.readFileSync(
    new URL("../app/payroll-loans-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /PayrollLoansWorkspace/);
  assert.doesNotMatch(page, /label:"Empréstimos e adiantamentos",future:true/);
  assert.match(workspace, /Crédito ao colaborador sob controlo/);
  assert.match(workspace, /requestLoan/);
  assert.match(workspace, /decideLoan/);
});
test("retroactive adjustments preserve closed payroll history", () => {
  const workspace = fs.readFileSync(
    new URL("../app/payroll-adjustments-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /PayrollAdjustmentsWorkspace/);
  assert.doesNotMatch(page, /label:"Retroativos e ajustes",future:true/);
  assert.match(workspace, /Corrigir sem reescrever o passado/);
  assert.match(workspace, /requestAdjustment/);
  assert.match(workspace, /decideAdjustment/);
});
test("integration hub orchestrates governed sources mappings and runs", () => {
  const workspace = fs.readFileSync(
      new URL("../app/integrations-workspace.tsx", import.meta.url),
      "utf8",
    ),
    api = fs.readFileSync(
      new URL("../worker/integrations.ts", import.meta.url),
      "utf8",
    );
  assert.match(page, /IntegrationsWorkspace/);
  assert.doesNotMatch(page, /label:"Fontes de dados",future:true/);
  assert.match(workspace, /Dados conectados, validação antes da verdade/);
  assert.match(api, /idempotencyKey/);
  assert.match(api, /validateRun/);
  assert.match(api, /decideRun/);
  assert.match(api, /validated_by<>\?/);
});
test("employee documents preserve governed versions validity evidence and private files", () => {
  const workspace = fs.readFileSync(
      new URL("../app/employee-documents-workspace.tsx", import.meta.url),
      "utf8",
    ),
    api = fs.readFileSync(
      new URL("../worker/employee-documents.ts", import.meta.url),
      "utf8",
    ),
    hosting = fs.readFileSync(
      new URL("../.openai/hosting.json", import.meta.url),
      "utf8",
    );
  assert.match(page, /EmployeeDocumentsWorkspace/);
  assert.doesNotMatch(page, /label:"Documentos do colaborador",future:true/);
  assert.match(workspace, /Dossiê documental, validade e evidência/);
  assert.match(workspace, /type="file"/);
  assert.match(api, /version_number/);
  assert.match(api, /digestBytes/);
  assert.match(api, /bucket\.put/);
  assert.match(api, /bucket\.get/);
  assert.match(api, /private, no-store/);
  assert.match(api, /submitted_by<>\?/);
  assert.match(hosting, /"r2": "BUCKET"/);
});
test("notification bell exposes real governed alerts", () => {
  const center = fs.readFileSync(
      new URL("../app/notifications-center.tsx", import.meta.url),
      "utf8",
    ),
    api = fs.readFileSync(
      new URL("../worker/notifications.ts", import.meta.url),
      "utf8",
    );
  assert.match(page, /NotificationsCenter/);
  assert.match(page, /notificationCount/);
  assert.match(center, /api\/v1\/notifications/);
  assert.match(center, /O que exige atenção/);
  assert.match(api, /employee_documents/);
  assert.match(api, /integration_runs/);
  assert.match(api, /payroll_runs/);
  assert.match(api, /security\.modules\.includes/);
});
test("alerts become governed workflow tasks", () => {
  const center = fs.readFileSync(
      new URL("../app/notifications-center.tsx", import.meta.url),
      "utf8",
    ),
    api = fs.readFileSync(
      new URL("../worker/notifications.ts", import.meta.url),
      "utf8",
    );
  assert.match(center, /Assumir/);
  assert.match(center, /type:"claim"/);
  assert.match(api, /INSERT INTO workflow_tasks/);
  assert.match(api, /completion_evidence/);
  assert.match(api, /workflowTask/);
});
test("enterprise shell exposes search profile help and legal trust surfaces", () => {
  const command = fs.readFileSync(
      new URL("../app/enterprise-command-center.tsx", import.meta.url),
      "utf8",
    ),
    layout = fs.readFileSync(
      new URL("../app/layout.tsx", import.meta.url),
      "utf8",
    );
  assert.match(page, /EnterpriseCommandCenter/);
  assert.match(page, /setCommandMode\("search"\)/);
  assert.match(page, /setCommandMode\("profile"\)/);
  assert.match(command, /CENTRO DE AJUDA/);
  assert.match(command, /\/termos/);
  assert.match(command, /\/privacidade/);
  assert.doesNotMatch(layout, /codex-preview/);
});
test("top enterprise shortcuts and help are functional", () => {
  for (const target of ["Visão geral", "Planeamento", "RH Dashboard", "Workflow"])
    assert.match(page, new RegExp(`setModulo\\([\\s\\S]{0,180}${target}`));
  assert.match(page, /setCommandMode\("help"\)/);
  assert.match(page, /ctrlKey\s*\|\|\s*e\.metaKey/);
});
test("RH presents Payroll as a governed submodule", () => {
  assert.match(page, /name: "RH"/);
  assert.match(page, /accessCodes: \["HCM", "PAYROLL"\]/);
  assert.match(page, /Payroll Runs[\s\S]{0,100}requires: "PAYROLL"/);
  assert.doesNotMatch(page, /name: "Payroll"/);
  assert.match(page, /HrManagerSuite/);
});

test("every operational RH workspace uses the authored five-language catalogue", () => {
  const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const i18n = fs.readFileSync(new URL("../app/hr-localized-surface.tsx", import.meta.url), "utf8");
  assert.match(page, /<PlatformLocalizedSurface>[\s\S]*?<RecruitmentWorkspace \/>[\s\S]*?<PayrollFoundation \/>[\s\S]*?<PayrollAdjustmentsWorkspace \/>[\s\S]*?<\/PlatformLocalizedSurface>/);
  for (const locale of ["pt", "en", "es", "fr", "ru"])
    assert.match(i18n, new RegExp(`${locale}:\\d`));
  assert.match(i18n, /business codes and API values are never changed/);
});

test("all modules cards and accessibility labels inherit platform localization", () => {
  const i18n = fs.readFileSync(new URL("../app/hr-localized-surface.tsx", import.meta.url), "utf8");
  assert.match(page, /<PlatformLocalizedSurface>[\s\S]*?<EnterpriseCommandCenter[\s\S]*?<\/PlatformLocalizedSurface>/);
  assert.match(i18n, /SHOW_TEXT/);
  assert.match(i18n, /\[placeholder\],\[title\],\[aria-label\]/);
  assert.match(i18n, /const wordRows:Array/);
  assert.match(i18n, /function translateText/);
});
test("registration records acceptance against accessible legal documents", () => {
  const registration = fs.readFileSync(
    new URL("../app/registar/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(registration, /href="\/termos"/);
  assert.match(registration, /href="\/privacidade"/);
  assert.match(registration, /terms_version:"2026-08-21"/);
});
test("Cálculo Sutil receives an idempotent integrated demonstration portfolio", () => {
  const loader = fs.readFileSync(
      new URL("../app/demo-portfolio-loader.tsx", import.meta.url),
      "utf8",
    ),
    api = fs.readFileSync(
      new URL("../worker/demo-portfolio.ts", import.meta.url),
      "utf8",
    );
  assert.match(page, /DemoPortfolioLoader/);
  assert.match(loader, /api\/v1\/demo-portfolio/);
  assert.match(loader, /window\.location\.reload/);
  assert.match(api, /Budget Demonstração 2026/);
  assert.match(api, /workforce_cost_postings/);
  assert.match(api, /management_reports/);
  assert.match(api, /demo_portfolio_installations/);
});
test("demo administrator may install while an organization is selected", () => {
  const api = fs.readFileSync(
    new URL("../worker/demo-portfolio.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(api, /s\.role!=="Administrador"\|\|s\.organizationId/);
  assert.match(api, /s\.role!=="Administrador"/);
});
test("commercial center covers role dashboards reports tour exports and readiness", () => {
  const ui = fs.readFileSync(
      new URL("../app/commercial-suite.tsx", import.meta.url),
      "utf8",
    ),
    api = fs.readFileSync(
      new URL("../worker/commercial-suite.ts", import.meta.url),
      "utf8",
    );
  for (const term of [
    "Cockpit por perfil",
    "Relatórios",
    "Demo guiada",
    "Prontidão comercial",
    "Exportar catálogo CSV",
    "Exportar PDF / imprimir",
  ])
    assert.match(ui, new RegExp(term));
  for (const role of [
    "Executivo",
    "CFO",
    "Controller",
    "FP&A",
    "Recursos Humanos",
    "Payroll",
    "Gestor",
  ])
    assert.match(api, new RegExp(role));
  assert.match(page, /CommercialSuite/);
});
test("download templates and enterprise document hub are operational", () => {
  const commercial = fs.readFileSync(
      new URL("../app/commercial-suite.tsx", import.meta.url),
      "utf8",
    ),
    hub = fs.readFileSync(
      new URL("../app/document-hub-workspace.tsx", import.meta.url),
      "utf8",
    ),
    api = fs.readFileSync(
      new URL("../worker/document-hub.ts", import.meta.url),
      "utf8",
    );
  assert.match(commercial, /downloadTemplate/);
  assert.match(commercial, /actual_budget\.csv/);
  assert.match(page, /DocumentHubWorkspace/);
  assert.match(hub, /new FormData/);
  assert.match(api, /OCR_API_URL/);
  assert.match(api, /ocr_confidence_bps/);
  assert.match(api, /evidence_hash/);
});

test("guided commercial demonstration has eight persistent narrative stages", () => {
  const commercial = fs.readFileSync(
    new URL("../app/commercial-suite.tsx", import.meta.url),
    "utf8",
  );
  assert.match(commercial, /Iniciar demonstração guiada/);
  assert.match(commercial, /PERGUNTA DE DESCOBERTA/);
  assert.match(commercial, /Próximo passo/);
  assert.match(commercial, /Concluir demonstração/);
  assert.match(commercial, /Da demonstração ao plano de adoção/);
});

test("customer activation center exposes adoption subscription imports and honest maturity", () => {
  const activation = fs.readFileSync(
    new URL("../app/customer-activation-workspace.tsx", import.meta.url),
    "utf8",
  );
  const api = fs.readFileSync(
    new URL("../worker/customer-activation.ts", import.meta.url),
    "utf8",
  );
  assert.match(page, /CustomerActivationWorkspace/);
  assert.match(activation, /ROTEIRO DE ATIVAÇÃO/);
  assert.match(activation, /IMPORTAÇÃO ASSISTIDA/);
  assert.match(activation, /MATRIZ DE COMPLETUDE/);
  assert.match(api, /subscription_change_requests/);
  assert.match(api, /Contratado, ainda sem evidência operacional/);
});
