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
