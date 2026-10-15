import type {D1Database} from "../worker-configuration";
import { financialScope } from "./financial-scope";
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
      url = new URL(request.url),
      { scope, currency } = await financialScope(request, db, security);
    const periodsRow = await db
      .prepare(
        "SELECT DISTINCT period FROM performance_entries WHERE tenant_id=? AND scenario='Actual' AND version_id IS NULL AND currency=? AND (? IS NULL OR organization_id=?) AND (? IS NULL OR period<=?) ORDER BY period DESC LIMIT 8",
      )
      .bind(tenant, currency, scope, scope, url.searchParams.get("period"), url.searchParams.get("period"))
      .all<{ period: string }>();
    const periods = periodsRow.results.map((r) => r.period).sort();
    if (!periods.length)
      return Response.json({ hasData: false, currency, periods: [] });
    const approvedBudget = await db
      .prepare(
        "SELECT id FROM budget_versions WHERE tenant_id=? AND status='Aprovado' AND fiscal_year=? ORDER BY approved_at DESC LIMIT 1",
      )
      .bind(tenant, Number(periods[periods.length-1].slice(0,4)))
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
      hasBudget: budgetRows.results.length > 0,
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
      url = new URL(request.url),
      { scope, currency } = await financialScope(request, db, security);
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
          "SELECT r.role_code,SUM(e.amount_minor) total FROM performance_entries e JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code JOIN diagnostic_line_roles r ON r.line_id=l.id AND r.tenant_id=l.tenant_id WHERE e.tenant_id=? AND e.scenario='Actual' AND e.period=? AND e.currency=? AND (? IS NULL OR e.organization_id=?) AND e.version_id IS NULL GROUP BY r.role_code",
        )
        .bind(tenant, period, currency, scope, scope)
        .all<{ role_code: string; total: number }>(),
      db
        .prepare(
          "SELECT COALESCE(l.cash_flow_category,'Não aplicável') category,SUM(e.amount_minor) total FROM performance_entries e LEFT JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE e.tenant_id=? AND e.scenario='Actual' AND e.period=? AND e.currency=? AND (? IS NULL OR e.organization_id=?) AND e.version_id IS NULL GROUP BY category",
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
      hasIncome = classificationRows.results.some(row=>row.classification === "Receita" || row.classification === "Custo");
    const hasRoles = roleRows.results.length > 0;
    const r = (k: string) => Math.abs(num(roles, k));
    const coverage = await db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN r.role_code IN ('REVENUE','COGS','OPEX','INTEREST','TAX') THEN 1 ELSE 0 END) covered FROM performance_entries e JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code LEFT JOIN diagnostic_line_roles r ON r.tenant_id=l.tenant_id AND r.line_id=l.id WHERE e.tenant_id=? AND e.organization_id=COALESCE(?,e.organization_id) AND e.period=? AND e.currency=? AND e.scenario='Actual' AND e.version_id IS NULL AND l.classification IN ('Receita','Custo')").bind(tenant,scope,period,currency).first<{total:number;covered:number}>();
    const income = hasIncome && Number(coverage?.total)>0 && coverage?.total===coverage?.covered
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
    const hasWorkingCapital = hasRoles && r("REVENUE") > 0 && r("COGS") > 0 && ["RECEIVABLES", "INVENTORY", "PAYABLES"].every(role=>roles.has(role));
    let workingCapital: { dso: number; dio: number; dpo: number; ccc: number } | null = null;
    if (hasWorkingCapital) {
      const days = new Date(Date.UTC(Number(period.slice(0,4)), Number(period.slice(5,7)), 0)).getUTCDate();
      const dso = (r("RECEIVABLES") / r("REVENUE")) * days,
        dio = (r("INVENTORY") / r("COGS")) * days,
        dpo = (r("PAYABLES") / r("COGS")) * days;
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
      hasData: classificationRows.results.length > 0,
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
      url = new URL(request.url),
      { scope, currency } = await financialScope(request, db, security);
    const latest = await db
      .prepare(
        "SELECT MAX(period) period FROM performance_entries WHERE tenant_id=? AND scenario='Actual' AND currency=? AND (? IS NULL OR organization_id=?)",
      )
      .bind(tenant, currency, scope, scope)
      .first<{ period: string | null }>();
    const period = url.searchParams.get("period") || latest?.period || null;
    if (!period)
      return Response.json({ hasData: false, currency, period: null, units: [] });
    const rows=await db.prepare("SELECT o.id organization_id,o.name organization_name,e.line_code code,MAX(e.line_name) name,COALESCE(l.classification,'Outro') classification,CASE WHEN l.id IS NULL THEN 1 ELSE 0 END unclassified,SUM(e.amount_minor) total,COUNT(*) entry_count FROM performance_entries e JOIN organizations o ON o.id=e.organization_id AND o.tenant_id=e.tenant_id LEFT JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE e.tenant_id=? AND e.scenario='Actual' AND e.period=? AND e.currency=? AND (? IS NULL OR e.organization_id=?) AND e.version_id IS NULL GROUP BY o.id,e.line_code,l.classification,l.id ORDER BY o.name,e.line_code").bind(tenant,period,currency,scope,scope).all<{organization_id:string;organization_name:string;code:string;name:string;classification:string;unclassified:number;total:number;entry_count:number}>();
    const grouped=new Map<string,{id:string;name:string;revenue:number;costs:number;incomeRows:number;unclassified:number;lines:typeof rows.results}>();
    for(const row of rows.results){let unit=grouped.get(row.organization_id);if(!unit){unit={id:row.organization_id,name:row.organization_name,revenue:0,costs:0,incomeRows:0,unclassified:0,lines:[]};grouped.set(row.organization_id,unit)}unit.lines.push(row);unit.unclassified+=row.unclassified;if(row.classification==='Receita'){unit.revenue+=row.total;unit.incomeRows+=row.entry_count}else if(row.classification==='Custo'){unit.costs+=row.total;unit.incomeRows+=row.entry_count}}
    const units=[...grouped.values()].filter(unit=>unit.incomeRows>0).map(unit=>({id:unit.id,name:unit.name,revenue:unit.revenue,costs:Math.abs(unit.costs),margin:unit.unclassified?null:unit.revenue-Math.abs(unit.costs),marginPct:!unit.unclassified&&unit.revenue>0?(unit.revenue-Math.abs(unit.costs))/unit.revenue*100:null,complete:unit.unclassified===0,lines:unit.lines})).sort((a,b)=>b.revenue-a.revenue);
    const pending=new Map<string,{code:string;name:string;amount:number}>();for(const row of rows.results.filter(row=>row.unclassified)){const previous=pending.get(row.code);pending.set(row.code,{code:row.code,name:row.name,amount:(previous?.amount||0)+row.total})}
    return Response.json({hasData:rows.results.length>0,hasIncomeData:units.length>0,period,currency,units,unclassified:[...pending.values()],canClassify:!scope&&['Administrador','Financeiro','Gestor'].includes(security.role),summary:{revenue:units.reduce((sum,u)=>sum+u.revenue,0),costs:units.reduce((sum,u)=>sum+u.costs,0),complete:pending.size===0}});
  } catch (error) {
    return fail(error);
  }
}

export async function financialVarianceApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    if (request.method !== "GET")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const tenant = security.tenantId,
      url = new URL(request.url),
      { scope, currency } = await financialScope(request, db, security);
    const latest = await db
      .prepare(
        "SELECT MAX(period) period FROM performance_entries WHERE tenant_id=? AND scenario='Actual' AND currency=? AND (? IS NULL OR organization_id=?)",
      )
      .bind(tenant, currency, scope, scope)
      .first<{ period: string | null }>();
    const period = url.searchParams.get("period") || latest?.period || null;
    const approvedBudget = period
      ? await db
          .prepare(
            "SELECT id FROM budget_versions WHERE tenant_id=? AND status='Aprovado' AND fiscal_year=? ORDER BY approved_at DESC LIMIT 1",
          )
          .bind(tenant, Number(period.slice(0,4)))
          .first<{ id: string }>()
      : null;
    if (!period || !approvedBudget)
      return Response.json({
        hasData: false,
        period,
        currency,
        hasBudget: Boolean(approvedBudget),
      });
    const byLine =
      "SELECT e.line_code,e.line_name,COALESCE(l.classification,'Outro') classification,SUM(e.amount_minor) total FROM performance_entries e LEFT JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE e.tenant_id=? AND e.scenario=? AND e.period=? AND e.currency=? AND (? IS NULL OR e.organization_id=?)";
    const [actualRows, budgetRows] = await Promise.all([
      db
        .prepare(`${byLine} AND e.version_id IS NULL GROUP BY e.line_code,e.line_name,classification`)
        .bind(tenant, "Actual", period, currency, scope, scope)
        .all<{
          line_code: string;
          line_name: string;
          classification: string;
          total: number;
        }>(),
      db
        .prepare(`${byLine} AND e.version_id=? GROUP BY e.line_code,e.line_name,classification`)
        .bind(tenant, "Budget", period, currency, scope, scope, approvedBudget.id)
        .all<{
          line_code: string;
          line_name: string;
          classification: string;
          total: number;
        }>(),
    ]);
    if (!budgetRows.results.length) return Response.json({ hasData: false, period, currency, hasBudget: false });
    if (!actualRows.results.length && !budgetRows.results.length)
      return Response.json({
        hasData: false,
        period,
        currency,
        hasBudget: true,
      });
    type Line = { name: string; classification: string; actual: number; budget: number };
    const lines = new Map<string, Line>();
    for (const r of actualRows.results)
      { const previous = lines.get(r.line_code); if (previous) previous.actual += r.total; else lines.set(r.line_code, { name: r.line_name, classification: r.classification, actual: r.total, budget: 0 }); }
    for (const r of budgetRows.results) {
      const existing = lines.get(r.line_code);
      if (existing) existing.budget += r.total;
      else
        lines.set(r.line_code, {
          name: r.line_name,
          classification: r.classification,
          actual: 0,
          budget: r.total,
        });
    }
    const contribution = (line: Line) =>
      line.classification === "Custo"
        ? Math.abs(line.budget) - Math.abs(line.actual)
        : line.actual - line.budget;
    const sum = (rows: { classification: string; total: number }[], cls: string) =>
      rows.filter((r) => r.classification === cls).reduce((a, r) => a + r.total, 0);
    const net = (rows: { classification: string; total: number }[]) =>
      sum(rows, "Receita") - Math.abs(sum(rows, "Custo"));
    const actualNet = net(actualRows.results),
      budgetNet = net(budgetRows.results);
    const drivers = Array.from(lines.entries())
      .map(([code, line]) => ({
        lineCode: code,
        lineName: line.name,
        classification: line.classification,
        contribution: contribution(line),
      }))
      // actualNet/budgetNet (and therefore the variance being explained) only
      // ever sum Receita/Custo lines, so a balance-sheet line (Ativo, Passivo,
      // Capital, Caixa...) must never be offered as a "driver" of that
      // variance even if its own actual-vs-budget delta happens to be large.
      .filter(
        (d) =>
          (d.classification === "Receita" || d.classification === "Custo") &&
          d.contribution !== 0,
      )
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    const topDrivers = drivers.slice(0, 6);
    const topContribution = topDrivers.reduce((a, d) => a + d.contribution, 0);
    const residual = actualNet - budgetNet - topContribution;
    return Response.json({
      hasData: true,
      period,
      currency,
      hasBudget: true,
      actualNet,
      budgetNet,
      netVariance: actualNet - budgetNet,
      drivers: topDrivers,
      residual,
    });
  } catch (error) {
    return fail(error);
  }
}
