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
    "Não foi possível processar os dados financeiros.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};
const num = (map: Map<string, number>, key: string) => map.get(key) || 0;

export async function financialTrendApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    if (request.method !== "GET")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const tenant = security.tenantId,
      scope = security.organizationId,
      url = new URL(request.url),
      currency = (url.searchParams.get("currency") || "AOA").toUpperCase();
    const periodsRow = await db
      .prepare(
        "SELECT DISTINCT period FROM performance_entries WHERE tenant_id=? AND scenario='Actual' AND currency=? AND (? IS NULL OR organization_id=?) ORDER BY period DESC LIMIT 8",
      )
      .bind(tenant, currency, scope, scope)
      .all<{ period: string }>();
    const periods = periodsRow.results.map((r) => r.period).sort();
    if (!periods.length)
      return Response.json({ hasData: false, currency, periods: [] });
    const approvedBudget = await db
      .prepare(
        "SELECT id FROM budget_versions WHERE tenant_id=? AND status='Aprovado' ORDER BY approved_at DESC LIMIT 1",
      )
      .bind(tenant)
      .first<{ id: string }>();
    const placeholders = periods.map(() => "?").join(",");
    const classificationByPeriod =
      "SELECT e.period,COALESCE(l.classification,'Outro') classification,SUM(e.amount_minor) total FROM performance_entries e LEFT JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE e.tenant_id=? AND e.scenario=? AND e.currency=? AND (? IS NULL OR e.organization_id=?) AND e.period IN (" +
      placeholders +
      ")";
    const [actualRows, budgetRows] = await Promise.all([
      db
        .prepare(`${classificationByPeriod} AND e.version_id IS NULL GROUP BY e.period,classification`)
        .bind(tenant, "Actual", currency, scope, scope, ...periods)
        .all<{ period: string; classification: string; total: number }>(),
      approvedBudget
        ? db
            .prepare(`${classificationByPeriod} AND e.version_id=? GROUP BY e.period,classification`)
            .bind(tenant, "Budget", currency, scope, scope, ...periods, approvedBudget.id)
            .all<{ period: string; classification: string; total: number }>()
        : Promise.resolve({ results: [] as { period: string; classification: string; total: number }[] }),
    ]);
    const netByPeriod = (
      rows: { period: string; classification: string; total: number }[],
    ) => {
      const byPeriod = new Map<string, Map<string, number>>();
      for (const r of rows) {
        if (!byPeriod.has(r.period)) byPeriod.set(r.period, new Map());
        byPeriod.get(r.period)!.set(r.classification, r.total);
      }
      return (period: string) => {
        const m = byPeriod.get(period) || new Map();
        return {
          revenue: num(m, "Receita"),
          costs: num(m, "Custo"),
          net: num(m, "Receita") - Math.abs(num(m, "Custo")),
        };
      };
    };
    const actualAt = netByPeriod(actualRows.results),
      budgetAt = netByPeriod(budgetRows.results);
    return Response.json({
      hasData: true,
      currency,
      hasBudget: Boolean(approvedBudget),
      series: periods.map((period) => ({
        period,
        actual: actualAt(period),
        budget: budgetAt(period),
      })),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function financialStatementsApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    if (request.method !== "GET")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const tenant = security.tenantId,
      scope = security.organizationId,
      url = new URL(request.url),
      currency = (url.searchParams.get("currency") || "AOA").toUpperCase();
    const latest = await db
      .prepare(
        "SELECT MAX(period) period FROM performance_entries WHERE tenant_id=? AND scenario='Actual' AND currency=? AND (? IS NULL OR organization_id=?)",
      )
      .bind(tenant, currency, scope, scope)
      .first<{ period: string | null }>();
    const period = url.searchParams.get("period") || latest?.period || null;
    if (!period)
      return Response.json({ hasData: false, currency, period: null });
    const [classificationRows, roleRows, cashFlowRows] = await Promise.all([
      db
        .prepare(
          "SELECT COALESCE(l.classification,'Outro') classification,SUM(e.amount_minor) total FROM performance_entries e LEFT JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE e.tenant_id=? AND e.scenario='Actual' AND e.period=? AND e.currency=? AND (? IS NULL OR e.organization_id=?) AND e.version_id IS NULL GROUP BY classification",
        )
        .bind(tenant, period, currency, scope, scope)
        .all<{ classification: string; total: number }>(),
      db
        .prepare(
          "SELECT r.role_code,SUM(e.amount_minor) total FROM performance_entries e JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code JOIN diagnostic_line_roles r ON r.line_id=l.id AND r.tenant_id=l.tenant_id WHERE e.tenant_id=? AND e.scenario='Actual' AND e.period=? AND e.currency=? AND (? IS NULL OR e.organization_id=?) GROUP BY r.role_code",
        )
        .bind(tenant, period, currency, scope, scope)
        .all<{ role_code: string; total: number }>(),
      db
        .prepare(
          "SELECT COALESCE(l.cash_flow_category,'Não aplicável') category,SUM(e.amount_minor) total FROM performance_entries e LEFT JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE e.tenant_id=? AND e.scenario='Actual' AND e.period=? AND e.currency=? AND (? IS NULL OR e.organization_id=?) GROUP BY category",
        )
        .bind(tenant, period, currency, scope, scope)
        .all<{ category: string; total: number }>(),
    ]);
    const cls = new Map(
        classificationRows.results.map((r) => [r.classification, r.total]),
      ),
      roles = new Map(roleRows.results.map((r) => [r.role_code, r.total])),
      cash = new Map(cashFlowRows.results.map((r) => [r.category, r.total]));
    const revenue = num(cls, "Receita"),
      costs = Math.abs(num(cls, "Custo")),
      netSimple = revenue - costs,
      hasIncome = classificationRows.results.length > 0;
    const hasRoles = roleRows.results.length > 0;
    const r = (k: string) => Math.abs(num(roles, k));
    const income = hasRoles
      ? {
          precise: true,
          revenue: r("REVENUE"),
          cogs: r("COGS"),
          grossMargin: r("REVENUE") - r("COGS"),
          opex: r("OPEX"),
          operatingResult: r("REVENUE") - r("COGS") - r("OPEX"),
          netResult:
            r("REVENUE") - r("COGS") - r("OPEX") - r("INTEREST") - r("TAX"),
        }
      : hasIncome
        ? { precise: false, revenue, costs, netResult: netSimple }
        : null;
    const currentAssets =
        r("CASH") + r("RECEIVABLES") + r("INVENTORY") + r("OTHER_CURRENT_ASSET"),
      assets = currentAssets + r("NONCURRENT_ASSET"),
      currentLiabilities =
        r("PAYABLES") + r("CURRENT_DEBT") + r("OTHER_CURRENT_LIABILITY"),
      liabilities =
        currentLiabilities + r("LONGTERM_DEBT") + r("OTHER_NONCURRENT_LIABILITY"),
      equity = r("EQUITY"),
      grossDebt = r("CURRENT_DEBT") + r("LONGTERM_DEBT"),
      netDebt = grossDebt - r("CASH");
    const hasBalance = hasRoles && assets > 0;
    const balanceSheet = hasBalance
      ? { assets, liabilities, equity, netDebt, grossDebt, cash: r("CASH") }
      : null;
    const hasWorkingCapital = hasRoles && r("REVENUE") > 0;
    let workingCapital: { dso: number; dio: number; dpo: number; ccc: number } | null = null;
    if (hasWorkingCapital) {
      const dso = (r("RECEIVABLES") / r("REVENUE")) * 30,
        dio = r("COGS") > 0 ? (r("INVENTORY") / r("COGS")) * 30 : 0,
        dpo = r("COGS") > 0 ? (r("PAYABLES") / r("COGS")) * 30 : 0;
      workingCapital = { dso, dio, dpo, ccc: dso + dio - dpo };
    }
    const operational = num(cash, "Operacional"),
      investing = num(cash, "Investimento"),
      financing = num(cash, "Financiamento"),
      hasCashFlow = cashFlowRows.results.some(
        (c) => c.category !== "Não aplicável",
      );
    const cashFlow = hasCashFlow
      ? {
          operational,
          investing,
          financing,
          net: operational + investing + financing,
        }
      : null;
    return Response.json({
      hasData: true,
      period,
      currency,
      income,
      balanceSheet,
      cashFlow,
      workingCapital,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function financialProfitabilityApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    if (request.method !== "GET")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const tenant = security.tenantId,
      scope = security.organizationId,
      url = new URL(request.url),
      currency = (url.searchParams.get("currency") || "AOA").toUpperCase();
    const latest = await db
      .prepare(
        "SELECT MAX(period) period FROM performance_entries WHERE tenant_id=? AND scenario='Actual' AND currency=? AND (? IS NULL OR organization_id=?)",
      )
      .bind(tenant, currency, scope, scope)
      .first<{ period: string | null }>();
    const period = url.searchParams.get("period") || latest?.period || null;
    if (!period)
      return Response.json({ hasData: false, currency, period: null, units: [] });
    const rows = await db
      .prepare(
        "SELECT o.id organization_id,o.name organization_name,COALESCE(l.classification,'Outro') classification,SUM(e.amount_minor) total FROM performance_entries e JOIN organizations o ON o.id=e.organization_id AND o.tenant_id=e.tenant_id LEFT JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE e.tenant_id=? AND e.scenario='Actual' AND e.period=? AND e.currency=? AND (? IS NULL OR e.organization_id=?) AND e.version_id IS NULL GROUP BY o.id,classification",
      )
      .bind(tenant, period, currency, scope, scope)
      .all<{
        organization_id: string;
        organization_name: string;
        classification: string;
        total: number;
      }>();
    const byOrg = new Map<string, { name: string; revenue: number; costs: number }>();
    for (const row of rows.results) {
      if (!byOrg.has(row.organization_id))
        byOrg.set(row.organization_id, {
          name: row.organization_name,
          revenue: 0,
          costs: 0,
        });
      const entry = byOrg.get(row.organization_id)!;
      if (row.classification === "Receita") entry.revenue += row.total;
      else if (row.classification === "Custo") entry.costs += Math.abs(row.total);
    }
    const units = Array.from(byOrg.values())
      .filter((u) => u.revenue !== 0 || u.costs !== 0)
      .map((u) => ({
        name: u.name,
        revenue: u.revenue,
        costs: u.costs,
        margin: u.revenue - u.costs,
        marginPct: u.revenue > 0 ? ((u.revenue - u.costs) / u.revenue) * 100 : null,
      }))
      .sort((a, b) => b.revenue - a.revenue);
    return Response.json({
      hasData: units.length > 0,
      period,
      currency,
      units,
    });
  } catch (error) {
    return fail(error);
  }
}
