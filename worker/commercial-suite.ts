type Security = {
  tenantId: string;
  organizationId: string | null;
  role: string;
  modules: string[];
};
const number = (row: Record<string, unknown> | null, key = "n") =>
  Number(row?.[key] || 0);
export async function commercialSuiteApi(
  request: Request,
  db: D1Database,
  s: Security,
) {
  if (request.method !== "GET")
    return Response.json({ error: "Método não permitido." }, { status: 405 });
  const t = s.tenantId,
    org = s.organizationId,
    scope = org ? " AND organization_id=?" : "",
    bind = (sql: string) =>
      org ? db.prepare(sql).bind(t, org) : db.prepare(sql).bind(t);
  const [
    employees,
    payroll,
    actual,
    budget,
    goals,
    reviews,
    actions,
    recruitment,
    attendance,
    workforce,
    integrations,
    reports,
    workflow,
    diagnostics,
    investments,
  ] = await Promise.all([
    bind(
      `SELECT COUNT(*) n FROM employees WHERE tenant_id=? AND status='Ativo'${scope}`,
    ).first<Record<string, unknown>>(),
    db
      .prepare(
        "SELECT COUNT(*) n,COALESCE(SUM(gross_minor+employer_minor),0) total FROM payroll_runs r LEFT JOIN payroll_run_scopes x ON x.run_id=r.id AND x.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.status='Fechado' AND (? IS NULL OR x.organization_id=?)",
      )
      .bind(t, org, org)
      .first<Record<string, unknown>>(),
    bind(
      `SELECT COALESCE(SUM(amount_minor),0) total FROM performance_entries WHERE tenant_id=? AND scenario='Actual' AND period='2026-08'${scope}`,
    ).first<Record<string, unknown>>(),
    bind(
      `SELECT COALESCE(SUM(amount_minor),0) total FROM performance_entries WHERE tenant_id=? AND scenario='Budget' AND period='2026-08'${scope}`,
    ).first<Record<string, unknown>>(),
    bind(
      `SELECT COUNT(*) n FROM performance_goals WHERE tenant_id=? AND status IN ('Ativo','Concluído')${scope}`,
    ).first<Record<string, unknown>>(),
    bind(
      `SELECT COUNT(*) n,COALESCE(AVG(final_score_bps),0) score FROM performance_reviews WHERE tenant_id=? AND status='Finalizada'${scope}`,
    ).first<Record<string, unknown>>(),
    bind(
      `SELECT COUNT(*) n FROM performance_actions WHERE tenant_id=? AND status IN ('Aberta','Em curso')${scope}`,
    ).first<Record<string, unknown>>(),
    bind(
      `SELECT COUNT(*) n FROM recruitment_requisitions WHERE tenant_id=? AND status='Aberta'${scope}`,
    ).first<Record<string, unknown>>(),
    db
      .prepare(
        "SELECT COUNT(*) n,COALESCE(SUM(overtime_minutes),0) overtime FROM attendance_timesheets a JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id WHERE a.tenant_id=? AND a.status='Aprovado' AND (? IS NULL OR e.organization_id=?)",
      )
      .bind(t, org, org)
      .first<Record<string, unknown>>(),
    bind(
      `SELECT COALESCE(SUM(headcount),0) headcount,COALESCE(SUM(headcount*monthly_cost_minor),0) cost FROM workforce_plan_lines l JOIN workforce_plans p ON p.id=l.plan_id AND p.tenant_id=l.tenant_id WHERE l.tenant_id=? AND p.status='Aprovado'${org ? " AND p.organization_id=?" : ""}`,
    ).first<Record<string, unknown>>(),
    db
      .prepare(
        "SELECT COUNT(*) n,COALESCE(SUM(accepted_count),0) accepted,COALESCE(SUM(rejected_count),0) rejected FROM integration_runs WHERE tenant_id=? AND status='Aprovada'",
      )
      .bind(t)
      .first<Record<string, unknown>>(),
    db
      .prepare(
        "SELECT COUNT(*) n FROM management_reports WHERE tenant_id=? AND status='Emitido'",
      )
      .bind(t)
      .first<Record<string, unknown>>(),
    db
      .prepare(
        "SELECT COUNT(*) n FROM workflow_tasks WHERE tenant_id=? AND status IN ('Aberta','Em curso') AND (? IS NULL OR organization_id IS NULL OR organization_id=?)",
      )
      .bind(t, org, org)
      .first<Record<string, unknown>>(),
    bind(
      `SELECT COUNT(*) n,COALESCE(AVG(overall_score_bps),0) score FROM diagnostic_runs WHERE tenant_id=? AND status='Aprovado'${scope}`,
    ).first<Record<string, unknown>>(),
    bind(
      `SELECT COUNT(*) n,COALESCE(SUM(npv_minor),0) npv FROM investment_cases WHERE tenant_id=? AND status='Aprovado'${scope}`,
    ).first<Record<string, unknown>>(),
  ]);
  const actualTotal = number(actual, "total"),
    budgetTotal = number(budget, "total"),
    variance = actualTotal - budgetTotal;
  const metrics = {
    employees: number(employees),
    payrollCost: number(payroll, "total"),
    actual: actualTotal,
    budget: budgetTotal,
    variance,
    varianceBps: budgetTotal
      ? Math.trunc((variance * 10000) / budgetTotal)
      : null,
    goals: number(goals),
    reviewScore: number(reviews, "score"),
    openActions: number(actions),
    openRecruitment: number(recruitment),
    approvedTimesheets: number(attendance),
    overtimeMinutes: number(attendance, "overtime"),
    plannedHeadcount: number(workforce, "headcount"),
    plannedWorkforceCost: number(workforce, "cost"),
    integrationRuns: number(integrations),
    integrationAccepted: number(integrations, "accepted"),
    integrationRejected: number(integrations, "rejected"),
    reports: number(reports),
    workflowTasks: number(workflow),
    diagnosticScore: number(diagnostics, "score"),
    investmentNpv: number(investments, "npv"),
  };
  const profiles = [
    {
      code: "EXECUTIVO",
      name: "Executivo",
      focus: "Valor, risco e execução",
      kpis: [
        "actual",
        "varianceBps",
        "diagnosticScore",
        "openActions",
        "investmentNpv",
      ],
    },
    {
      code: "CFO",
      name: "CFO",
      focus: "Performance, caixa e capital",
      kpis: ["actual", "budget", "variance", "payrollCost", "investmentNpv"],
    },
    {
      code: "CONTROLLER",
      name: "Controller",
      focus: "Controlo, integridade e fecho",
      kpis: [
        "actual",
        "budget",
        "reports",
        "integrationRejected",
        "workflowTasks",
      ],
    },
    {
      code: "FPA",
      name: "FP&A",
      focus: "Plano, forecast e drivers",
      kpis: [
        "budget",
        "varianceBps",
        "plannedWorkforceCost",
        "plannedHeadcount",
        "openActions",
      ],
    },
    {
      code: "RH",
      name: "Recursos Humanos",
      focus: "Pessoas, talento e capacidade",
      kpis: [
        "employees",
        "openRecruitment",
        "reviewScore",
        "goals",
        "approvedTimesheets",
      ],
    },
    {
      code: "PAYROLL",
      name: "Payroll",
      focus: "Processamento, custo e exceções",
      kpis: [
        "payrollCost",
        "employees",
        "overtimeMinutes",
        "workflowTasks",
        "integrationRejected",
      ],
    },
    {
      code: "GESTOR",
      name: "Gestor",
      focus: "Objetivos, equipa e ações",
      kpis: [
        "goals",
        "reviewScore",
        "openActions",
        "plannedHeadcount",
        "workflowTasks",
      ],
    },
  ];
  const reportsCatalog = [
    [
      "FIN-01",
      "Demonstração de Resultados Gerencial",
      "Finance & FP&A",
      "CFO / Controller",
      "Mensal",
      "PDF, CSV",
    ],
    [
      "FIN-02",
      "Actual vs Budget vs Forecast",
      "Finance & FP&A",
      "CFO / FP&A",
      "Mensal",
      "PDF, CSV",
    ],
    [
      "FIN-03",
      "Fluxo de Caixa e Runway",
      "Finance & FP&A",
      "CFO / Tesouraria",
      "Semanal",
      "PDF, CSV",
    ],
    [
      "FIN-04",
      "Consolidação Multimoeda",
      "Finance & FP&A",
      "Controller",
      "Mensal",
      "PDF, CSV",
    ],
    [
      "DIA-01",
      "Diagnóstico Financeiro Integral",
      "Analytics",
      "CFO / Conselho",
      "Trimestral",
      "PDF",
    ],
    [
      "INV-01",
      "Atratividade e Viabilidade do Investimento",
      "Analytics",
      "Conselho / Investidor",
      "Por projeto",
      "PDF, CSV",
    ],
    [
      "HCM-01",
      "Headcount e Movimentos",
      "HCM",
      "RH / Gestores",
      "Mensal",
      "PDF, CSV",
    ],
    [
      "HCM-02",
      "Assiduidade, Ausências e Horas Extra",
      "HCM",
      "RH / Payroll",
      "Mensal",
      "PDF, CSV",
    ],
    [
      "PAY-01",
      "Resumo e Reconciliação de Payroll",
      "Payroll",
      "Payroll / CFO",
      "Mensal",
      "PDF, CSV",
    ],
    [
      "PAY-02",
      "Mapa de Pagamentos e Payslips",
      "Payroll",
      "Payroll / Tesouraria",
      "Mensal",
      "PDF, CSV",
    ],
    [
      "WFP-01",
      "Workforce Plan e Custo Projetado",
      "Workforce",
      "RH / FP&A",
      "Mensal",
      "PDF, CSV",
    ],
    [
      "PER-01",
      "Objetivos, Avaliações e Talento",
      "Performance",
      "RH / Gestores",
      "Trimestral",
      "PDF, CSV",
    ],
    [
      "WF-01",
      "SLA, Aprovações e Exceções",
      "Workflow",
      "Controller / Admin",
      "Semanal",
      "PDF, CSV",
    ],
    [
      "INT-01",
      "Qualidade e Integridade das Integrações",
      "Integration Hub",
      "TI / Controller",
      "Diário",
      "PDF, CSV",
    ],
  ].map(([code, name, module, audience, frequency, exports]) => ({
    code,
    name,
    module,
    audience,
    frequency,
    exports,
  }));
  return Response.json({
    generatedAt: new Date().toISOString(),
    period: "2026-08",
    currency: "AOA",
    role: s.role,
    modules: s.modules,
    metrics,
    profiles,
    reportsCatalog,
    commercialReadiness: {
      score: 100,
      phases: [
        "Módulos validados",
        "Dashboards por perfil",
        "Catálogo de relatórios",
        "Cockpit executivo",
        "Demo guiada",
        "Exportações",
        "Onboarding comercial",
        "Auditoria E2E",
      ],
    },
  });
}
