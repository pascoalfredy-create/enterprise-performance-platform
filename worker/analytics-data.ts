import { classifyDataError } from "../lib/api-error";
type Security = {
  tenantId: string;
  organizationId: string | null;
  email: string;
  role: string;
};
const fail = (error: unknown) => {
  const x = classifyDataError(
    error,
    "Não foi possível processar os dados do painel executivo.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};

export async function executiveCockpitApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    if (request.method !== "GET")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const tenant = security.tenantId,
      scope = security.organizationId,
      currency = "AOA";
    const [latest, activeEmployees, anyEmployees, vacancies] = await Promise.all([
      db
        .prepare(
          "SELECT MAX(period) period FROM performance_entries WHERE tenant_id=? AND scenario='Actual' AND currency=? AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, currency, scope, scope)
        .first<{ period: string | null }>(),
      db
        .prepare(
          "SELECT COUNT(*) n FROM employees WHERE tenant_id=? AND status='Ativo' AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ n: number }>(),
      db
        .prepare("SELECT 1 FROM employees WHERE tenant_id=? LIMIT 1")
        .bind(tenant)
        .first(),
      db
        .prepare(
          "SELECT COUNT(*) requisitions,COALESCE(SUM(positions),0) positions FROM recruitment_requisitions WHERE tenant_id=? AND status='Aberta' AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ requisitions: number; positions: number }>(),
    ]);
    const period = latest?.period ?? null;
    const classificationQuery =
      "SELECT COALESCE(l.classification,'Outro') classification,SUM(e.amount_minor) total FROM performance_entries e LEFT JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE e.tenant_id=? AND e.scenario='Actual' AND e.period=? AND e.currency=? AND (? IS NULL OR e.organization_id=?) AND e.version_id IS NULL GROUP BY classification";
    const actualRows = period
      ? await db
          .prepare(classificationQuery)
          .bind(tenant, period, currency, scope, scope)
          .all<{ classification: string; total: number }>()
      : { results: [] as { classification: string; total: number }[] };
    const sum = (cls: string) =>
      actualRows.results.find((r) => r.classification === cls)?.total ?? 0;
    const revenue = sum("Receita"),
      costs = sum("Custo"),
      net = revenue - Math.abs(costs);
    return Response.json({
      finance: {
        hasData: period !== null && actualRows.results.length > 0,
        period,
        currency,
        revenue,
        costs,
        net,
      },
      hr: {
        hasData: Boolean(anyEmployees),
        activeEmployees: activeEmployees?.n ?? 0,
        openVacancies: {
          requisitions: vacancies?.requisitions ?? 0,
          positions: vacancies?.positions ?? 0,
        },
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function moduleHealthApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    if (request.method !== "GET")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const tenant = security.tenantId,
      scope = security.organizationId,
      currency = "AOA";
    const [
      latestPeriod,
      activeEmployees,
      latestPayroll,
      approvedBudget,
      finalizedReviews,
      openTasks,
      criticalTasks,
      integrationTotals,
      documentTotals,
    ] = await Promise.all([
      db
        .prepare(
          "SELECT MAX(period) period FROM performance_entries WHERE tenant_id=? AND scenario='Actual' AND currency=? AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, currency, scope, scope)
        .first<{ period: string | null }>(),
      db
        .prepare(
          "SELECT COUNT(*) n FROM employees WHERE tenant_id=? AND status='Ativo' AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT period,currency,gross_minor FROM payroll_runs WHERE tenant_id=? AND status='Fechado' ORDER BY period DESC LIMIT 1",
        )
        .bind(tenant)
        .first<{ period: string; currency: string; gross_minor: number }>(),
      db
        .prepare(
          "SELECT id FROM budget_versions WHERE tenant_id=? AND status='Aprovado' ORDER BY approved_at DESC LIMIT 1",
        )
        .bind(tenant)
        .first<{ id: string }>(),
      db
        .prepare(
          "SELECT COUNT(*) n FROM performance_reviews WHERE tenant_id=? AND status='Finalizada' AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) n FROM workflow_tasks WHERE tenant_id=? AND status IN ('Aberta','Em curso') AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) n FROM workflow_tasks WHERE tenant_id=? AND status IN ('Aberta','Em curso') AND priority='Crítica' AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT COALESCE(SUM(record_count),0) total,COALESCE(SUM(accepted_count),0) accepted,COALESCE(SUM(rejected_count),0) rejected FROM integration_runs WHERE tenant_id=? AND status='Aprovada' AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ total: number; accepted: number; rejected: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) total,SUM(CASE WHEN status='Validado' THEN 1 ELSE 0 END) validated FROM module_documents WHERE tenant_id=? AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ total: number; validated: number }>(),
    ]);
    const period = latestPeriod?.period ?? null;
    let financeRevenue = 0,
      hasFinanceData = false,
      workforceVarianceBps: number | null = null;
    if (period) {
      const rows = await db
        .prepare(
          "SELECT COALESCE(l.classification,'Outro') classification,SUM(e.amount_minor) total FROM performance_entries e LEFT JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE e.tenant_id=? AND e.scenario='Actual' AND e.period=? AND e.currency=? AND (? IS NULL OR e.organization_id=?) AND e.version_id IS NULL GROUP BY classification",
        )
        .bind(tenant, period, currency, scope, scope)
        .all<{ classification: string; total: number }>();
      hasFinanceData = rows.results.length > 0;
      financeRevenue = rows.results.find((r) => r.classification === "Receita")?.total ?? 0;
    }
    if (approvedBudget) {
      const [actual, budget] = await Promise.all([
        db
          .prepare(
            "SELECT COALESCE(SUM(total_minor),0) total FROM workforce_cost_postings WHERE tenant_id=? AND (? IS NULL OR organization_id=?)",
          )
          .bind(tenant, scope, scope)
          .first<{ total: number }>(),
        db
          .prepare(
            "SELECT COALESCE(SUM(amount_minor),0) total FROM performance_entries WHERE tenant_id=? AND scenario='Budget' AND version_id=? AND line_code='WORKFORCE' AND (? IS NULL OR organization_id=?)",
          )
          .bind(tenant, approvedBudget.id, scope, scope)
          .first<{ total: number }>(),
      ]);
      if (budget && budget.total > 0)
        workforceVarianceBps = Math.round(
          (((actual?.total ?? 0) - budget.total) / budget.total) * 10000,
        );
    }
    return Response.json({
      finance: { hasData: hasFinanceData, currency, revenueMinor: financeRevenue },
      hcm: { activeEmployees: activeEmployees?.n ?? 0 },
      payroll: latestPayroll
        ? { period: latestPayroll.period, currency: latestPayroll.currency, grossMinor: latestPayroll.gross_minor }
        : null,
      workforce: { hasBudget: Boolean(approvedBudget), varianceBps: workforceVarianceBps },
      performance: { finalizedReviews: finalizedReviews?.n ?? 0 },
      workflow: { openTasks: openTasks?.n ?? 0, criticalTasks: criticalTasks?.n ?? 0 },
      integrations: {
        totalRecords: integrationTotals?.total ?? 0,
        accepted: integrationTotals?.accepted ?? 0,
        rejected: integrationTotals?.rejected ?? 0,
      },
      documents: { total: documentTotals?.total ?? 0, validated: documentTotals?.validated ?? 0 },
    });
  } catch (error) {
    return fail(error);
  }
}
