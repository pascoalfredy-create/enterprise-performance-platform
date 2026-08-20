import { classifyDataError } from "../lib/api-error";
type Security = {
  tenantId: string;
  organizationId: string | null;
  email: string;
  role: string;
};
const uid = () => crypto.randomUUID(),
  SCALE = 100000000n;
const sha = async (v: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const ratio = (a: number, b: number) =>
  b === 0
    ? null
    : Number(
        (BigInt(a) * 10000n +
          (BigInt(a) * BigInt(b) >= 0n
            ? BigInt(Math.abs(b)) / 2n
            : -BigInt(Math.abs(b)) / 2n)) /
          BigInt(b),
      );
const npv = (
  flows: Array<{ period: number; amount: number }>,
  rateBps: number,
) => {
  let factor = SCALE,
    total = 0n;
  const rate = BigInt(10000 + rateBps);
  for (const flow of flows) {
    if (flow.period) {
      factor = SCALE;
      for (let i = 0; i < flow.period; i++)
        factor = (factor * rate + 5000n) / 10000n;
    }
    const numerator = BigInt(flow.amount) * SCALE;
    total +=
      numerator >= 0n
        ? (numerator + factor / 2n) / factor
        : -((-numerator + factor / 2n) / factor);
  }
  return Number(total);
};
const irr = (flows: Array<{ period: number; amount: number }>) => {
  let lo = -9999,
    hi = 1000000;
  if (npv(flows, lo) < 0 || npv(flows, hi) > 0) return null;
  for (let i = 0; i < 48; i++) {
    const mid = Math.floor((lo + hi) / 2);
    if (npv(flows, mid) > 0) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
};
const fail = (e: unknown) => {
  const x = classifyDataError(
    e,
    "Não foi possível executar o diagnóstico financeiro.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};
const metricDefinitions = [
  ["CURRENT_RATIO", "Liquidez geral", "(Ativo corrente / Passivo corrente)"],
  [
    "QUICK_RATIO",
    "Liquidez reduzida",
    "((Ativo corrente - Inventários) / Passivo corrente)",
  ],
  ["CASH_RATIO", "Liquidez imediata", "(Caixa / Passivo corrente)"],
  ["SOLVENCY", "Solvabilidade", "(Ativos / Passivos)"],
  ["AUTONOMY", "Autonomia financeira", "(Capital próprio / Ativos)"],
  ["DEBT_RATIO", "Endividamento", "(Passivos / Ativos)"],
  ["NET_MARGIN", "Margem líquida", "(Resultado líquido / Receita)"],
  ["ROA", "Rentabilidade dos ativos", "(Resultado líquido / Ativos)"],
  [
    "ROE",
    "Rentabilidade do capital próprio",
    "(Resultado líquido / Capital próprio)",
  ],
  ["ASSET_TURNOVER", "Rotação dos ativos", "(Receita / Ativos)"],
  ["WORKING_CAPITAL", "Fundo de maneio", "Ativo corrente - Passivo corrente"],
  [
    "NWC_REQUIREMENT",
    "Necessidade de fundo de maneio",
    "Inventários + Clientes - Fornecedores",
  ],
  [
    "NET_TREASURY",
    "Tesouraria líquida",
    "Fundo de maneio - Necessidade de fundo de maneio",
  ],
] as const;

export async function financialDiagnosticsApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    const tenant = security.tenantId,
      scope = security.organizationId,
      url = new URL(request.url),
      runId = url.searchParams.get("run") || "",
      caseId = url.searchParams.get("case") || "",
      now = new Date().toISOString();
    const snapshot = async () => {
      const [
        roles,
        lines,
        frameworks,
        configs,
        rules,
        runs,
        results,
        cases,
        flows,
        sensitivities,
        organizations,
        audit,
        businessProfile,
        availableSectors,
        installations,
      ] = await Promise.all([
        db
          .prepare(
            "SELECT r.*,l.code line_code,l.name line_name FROM diagnostic_line_roles r JOIN financial_line_catalog l ON l.id=r.line_id AND l.tenant_id=r.tenant_id WHERE r.tenant_id=? ORDER BY r.role_code",
          )
          .bind(tenant)
          .all(),
        db
          .prepare(
            "SELECT id,code,name FROM financial_line_catalog WHERE tenant_id=? AND status='Ativa' ORDER BY code",
          )
          .bind(tenant)
          .all(),
        db
          .prepare(
            "SELECT f.*,(SELECT COALESCE(SUM(weight_bps),0) FROM diagnostic_metric_configs c WHERE c.framework_id=f.id AND c.tenant_id=f.tenant_id) total_weight_bps FROM diagnostic_frameworks f WHERE f.tenant_id=? ORDER BY f.created_at DESC",
          )
          .bind(tenant)
          .all(),
        db
          .prepare(
            "SELECT * FROM diagnostic_metric_configs WHERE tenant_id=? ORDER BY framework_id,metric_code",
          )
          .bind(tenant)
          .all(),
        db
          .prepare(
            "SELECT * FROM diagnostic_rules WHERE tenant_id=? ORDER BY framework_id,metric_code,min_value_bps",
          )
          .bind(tenant)
          .all(),
        db
          .prepare(
            "SELECT r.*,o.name organization_name,f.name framework_name FROM diagnostic_runs r JOIN organizations o ON o.id=r.organization_id AND o.tenant_id=r.tenant_id JOIN diagnostic_frameworks f ON f.id=r.framework_id AND f.tenant_id=r.tenant_id WHERE r.tenant_id=? AND (? IS NULL OR r.organization_id=?) ORDER BY r.created_at DESC",
          )
          .bind(tenant, scope, scope)
          .all(),
        runId
          ? db
              .prepare(
                "SELECT * FROM diagnostic_results WHERE tenant_id=? AND run_id=? ORDER BY metric_code",
              )
              .bind(tenant, runId)
              .all()
          : Promise.resolve({ results: [] }),
        db
          .prepare(
            "SELECT c.*,o.name organization_name,(SELECT COUNT(*) FROM investment_cash_flows f WHERE f.case_id=c.id AND f.tenant_id=c.tenant_id) flow_count FROM investment_cases c JOIN organizations o ON o.id=c.organization_id AND o.tenant_id=c.tenant_id WHERE c.tenant_id=? AND (? IS NULL OR c.organization_id=?) ORDER BY c.created_at DESC",
          )
          .bind(tenant, scope, scope)
          .all(),
        caseId
          ? db
              .prepare(
                "SELECT * FROM investment_cash_flows WHERE tenant_id=? AND case_id=? ORDER BY period_number",
              )
              .bind(tenant, caseId)
              .all()
          : Promise.resolve({ results: [] }),
        caseId
          ? db
              .prepare(
                "SELECT * FROM investment_sensitivities WHERE tenant_id=? AND case_id=? ORDER BY rate_bps",
              )
              .bind(tenant, caseId)
              .all()
          : Promise.resolve({ results: [] }),
        db
          .prepare(
            "SELECT id,code,name,currency FROM organizations WHERE tenant_id=? AND (? IS NULL OR id=?) AND status='Ativa' ORDER BY name",
          )
          .bind(tenant, scope, scope)
          .all(),
        scope
          ? Promise.resolve({ results: [] })
          : db
              .prepare(
                "SELECT * FROM audit_events WHERE tenant_id=? AND entity_type IN ('diagnosticFramework','diagnosticRun','investmentCase') ORDER BY created_at DESC LIMIT 20",
              )
              .bind(tenant)
              .all(),
        db
          .prepare(
            "SELECT b.*,s.name sector_name,p.name pack_name,p.description pack_description,p.methodology_name,p.version_number pack_version,p.status pack_status FROM tenant_business_profiles b JOIN industry_sectors s ON s.code=b.sector_code JOIN industry_packs p ON p.code=b.industry_pack_code WHERE b.tenant_id=?",
          )
          .bind(tenant)
          .first(),
        db
          .prepare(
            "SELECT s.code sector_code,s.name sector_name,p.code pack_code,p.name pack_name,p.description pack_description,p.methodology_name,p.version_number pack_version,p.status pack_status FROM industry_sectors s JOIN industry_packs p ON p.code=s.pack_code WHERE s.status='Ativo' AND p.status IN ('Ativo','Piloto') ORDER BY s.name",
          )
          .all(),
        db
          .prepare(
            "SELECT i.*,p.name pack_name,f.name framework_name,f.status framework_status FROM tenant_industry_pack_installations i JOIN industry_packs p ON p.code=i.pack_code LEFT JOIN diagnostic_frameworks f ON f.id=i.framework_id AND f.tenant_id=i.tenant_id WHERE i.tenant_id=? ORDER BY i.installed_at DESC",
          )
          .bind(tenant)
          .all(),
      ]);
      return {
        metricDefinitions: metricDefinitions.map((x) => ({
          code: x[0],
          label: x[1],
          formula: x[2],
        })),
        roles: roles.results,
        lines: lines.results,
        frameworks: frameworks.results,
        configs: configs.results,
        rules: rules.results,
        runs: runs.results,
        results: results.results,
        cases: cases.results,
        flows: flows.results,
        sensitivities: sensitivities.results,
        organizations: organizations.results,
        audit: audit.results,
        businessProfile,
        availableSectors: availableSectors.results,
        installations: installations.results,
      };
    };
    if (request.method === "GET") return Response.json(await snapshot());
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const body = (await request.json()) as Record<string, string>;
    let entityId = body.frameworkId || body.runId || body.caseId || "",
      entityType = "diagnosticRun";
    if (body.type === "applyIndustryPack") {
      if (scope)
        return Response.json(
          { error: "O Industry Pack exige âmbito de todo o tenant." },
          { status: 403 },
        );
      if (
        !body.sectorCode ||
        !body.coreBusiness?.trim() ||
        body.coreBusiness.trim().length < 10
      )
        return Response.json(
          {
            error:
              "Setor e descrição do core business com pelo menos 10 caracteres são obrigatórios.",
          },
          { status: 400 },
        );
      const industry = await db
        .prepare(
          "SELECT s.code sector_code,s.name sector_name,p.code pack_code,p.name pack_name,p.description pack_description,p.methodology_name,p.version_number pack_version FROM industry_sectors s JOIN industry_packs p ON p.code=s.pack_code WHERE s.code=? AND s.status='Ativo' AND p.status IN ('Ativo','Piloto')",
        )
        .bind(body.sectorCode)
        .first<Record<string, unknown>>();
      if (!industry)
        return Response.json(
          { error: "Setor ou Industry Pack indisponível." },
          { status: 404 },
        );
      const [packMetrics, packRules, previousProfile, order] =
        await Promise.all([
          db
            .prepare(
              "SELECT * FROM industry_pack_metrics WHERE pack_code=? ORDER BY metric_code",
            )
            .bind(industry.pack_code)
            .all<Record<string, unknown>>(),
          db
            .prepare(
              "SELECT * FROM industry_pack_rules ORDER BY metric_code,min_value_bps",
            )
            .all<Record<string, unknown>>(),
          db
            .prepare(
              "SELECT country_code FROM tenant_business_profiles WHERE tenant_id=?",
            )
            .bind(tenant)
            .first<Record<string, unknown>>(),
          db
            .prepare(
              "SELECT country_code FROM provisioning_orders WHERE tenant_id=? ORDER BY completed_at DESC LIMIT 1",
            )
            .bind(tenant)
            .first<Record<string, unknown>>(),
        ]);
      const totalWeight = packMetrics.results.reduce(
        (sum, x) => sum + Number(x.weight_bps),
        0,
      );
      if (!packMetrics.results.length || totalWeight !== 10000)
        return Response.json(
          {
            error:
              "O Industry Pack não passou a validação determinística de pesos (100%).",
          },
          { status: 409 },
        );
      const frameworkId = uid(),
        installationId = uid();
      entityId = frameworkId;
      entityType = "diagnosticFramework";
      const statements = [
        db
          .prepare(
            "INSERT INTO tenant_business_profiles (tenant_id,sector_code,industry_pack_code,core_business,country_code,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET sector_code=excluded.sector_code,industry_pack_code=excluded.industry_pack_code,core_business=excluded.core_business,updated_at=excluded.updated_at",
          )
          .bind(
            tenant,
            industry.sector_code,
            industry.pack_code,
            body.coreBusiness.trim(),
            previousProfile?.country_code || order?.country_code || "XX",
            now,
            now,
          ),
        db
          .prepare(
            "INSERT INTO diagnostic_frameworks (id,tenant_id,name,description,status,created_by,created_at) VALUES (?,?,?,?,'Rascunho',?,?)",
          )
          .bind(
            frameworkId,
            tenant,
            `${industry.methodology_name} · v${industry.pack_version}`,
            `${industry.pack_description} Core business: ${body.coreBusiness.trim()}`,
            security.email,
            now,
          ),
        db
          .prepare(
            "UPDATE tenant_industry_pack_installations SET status='Substituído' WHERE tenant_id=? AND status='Instalado'",
          )
          .bind(tenant),
        db
          .prepare(
            "INSERT INTO tenant_industry_pack_installations (id,tenant_id,pack_code,pack_version,framework_id,installed_by,installed_at,status) VALUES (?,?,?,?,?,?,?,'Instalado')",
          )
          .bind(
            installationId,
            tenant,
            industry.pack_code,
            industry.pack_version,
            frameworkId,
            security.email,
            now,
          ),
        ...packMetrics.results.map((m) =>
          db
            .prepare(
              "INSERT INTO diagnostic_metric_configs (id,tenant_id,framework_id,metric_code,weight_bps,created_at) VALUES (?,?,?,?,?,?)",
            )
            .bind(uid(), tenant, frameworkId, m.metric_code, m.weight_bps, now),
        ),
        ...packRules.results
          .filter((r) =>
            packMetrics.results.some((m) => m.metric_code === r.metric_code),
          )
          .map((r) =>
            db
              .prepare(
                "INSERT INTO diagnostic_rules (id,tenant_id,framework_id,metric_code,min_value_bps,max_value_bps,score_bps,severity,recommendation,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
              )
              .bind(
                uid(),
                tenant,
                frameworkId,
                r.metric_code,
                r.min_value_bps,
                r.max_value_bps,
                r.score_bps,
                r.severity,
                r.recommendation,
                now,
              ),
          ),
      ];
      await db.batch(statements);
    } else if (body.type === "assignRole") {
      if (scope)
        return Response.json(
          { error: "A semântica financeira exige âmbito de todo o tenant." },
          { status: 403 },
        );
      if (!body.lineId || !metricRole(body.roleCode))
        return Response.json(
          { error: "Linha e papel diagnóstico válidos são obrigatórios." },
          { status: 400 },
        );
      entityId = uid();
      entityType = "diagnosticFramework";
      await db
        .prepare("INSERT INTO diagnostic_line_roles VALUES (?,?,?,?,?,?)")
        .bind(entityId, tenant, body.lineId, body.roleCode, security.email, now)
        .run();
    } else if (body.type === "createFramework") {
      if (scope)
        return Response.json(
          { error: "O framework exige âmbito de todo o tenant." },
          { status: 403 },
        );
      if (!body.name?.trim())
        return Response.json(
          { error: "Nome do framework é obrigatório." },
          { status: 400 },
        );
      entityId = uid();
      entityType = "diagnosticFramework";
      await db
        .prepare(
          "INSERT INTO diagnostic_frameworks (id,tenant_id,name,description,status,created_by,created_at) VALUES (?,?,?,?,'Rascunho',?,?)",
        )
        .bind(
          entityId,
          tenant,
          body.name.trim(),
          body.description?.trim() || null,
          security.email,
          now,
        )
        .run();
    } else if (body.type === "addMetric") {
      const weight = Math.round(Number(body.weightPercent) * 100);
      if (
        !body.frameworkId ||
        !metricDefinitions.some((x) => x[0] === body.metricCode) ||
        !Number.isInteger(weight) ||
        weight <= 0 ||
        weight > 10000
      )
        return Response.json(
          { error: "Métrica e peso entre 0,01% e 100% são obrigatórios." },
          { status: 400 },
        );
      entityType = "diagnosticFramework";
      await db
        .prepare("INSERT INTO diagnostic_metric_configs VALUES (?,?,?,?,?,?)")
        .bind(uid(), tenant, body.frameworkId, body.metricCode, weight, now)
        .run();
    } else if (body.type === "addRule") {
      const min =
          body.minValue === "" || body.minValue == null
            ? null
            : Math.round(Number(body.minValue) * 100),
        max =
          body.maxValue === "" || body.maxValue == null
            ? null
            : Math.round(Number(body.maxValue) * 100),
        score = Math.round(Number(body.scorePercent) * 100);
      if (
        !body.frameworkId ||
        !metricDefinitions.some((x) => x[0] === body.metricCode) ||
        !Number.isInteger(score) ||
        score < 0 ||
        score > 10000 ||
        !["Saudável", "Atenção", "Crítica"].includes(body.severity) ||
        !body.recommendation?.trim() ||
        body.recommendation.trim().length < 10
      )
        return Response.json(
          {
            error:
              "Intervalo, score, severidade e recomendação são obrigatórios.",
          },
          { status: 400 },
        );
      entityType = "diagnosticFramework";
      await db
        .prepare("INSERT INTO diagnostic_rules VALUES (?,?,?,?,?,?,?,?,?,?)")
        .bind(
          uid(),
          tenant,
          body.frameworkId,
          body.metricCode,
          min,
          max,
          score,
          body.severity,
          body.recommendation.trim(),
          now,
        )
        .run();
    } else if (body.type === "activateFramework") {
      if (!["Administrador", "Financeiro"].includes(security.role))
        return Response.json(
          { error: "A ativação exige Administrador ou Financeiro." },
          { status: 403 },
        );
      const f = await db
        .prepare(
          "SELECT * FROM diagnostic_frameworks WHERE id=? AND tenant_id=? AND status='Rascunho'",
        )
        .bind(body.frameworkId, tenant)
        .first<Record<string, unknown>>();
      if (!f)
        return Response.json(
          { error: "Framework em rascunho não encontrado." },
          { status: 404 },
        );
      if (String(f.created_by).toLowerCase() === security.email.toLowerCase())
        return Response.json(
          {
            error:
              "Maker-checker: o criador não pode ativar o próprio framework.",
          },
          { status: 403 },
        );
      await db
        .prepare(
          "UPDATE diagnostic_frameworks SET status='Ativo',activated_by=?,activated_at=? WHERE id=? AND tenant_id=? AND status='Rascunho'",
        )
        .bind(security.email, now, body.frameworkId, tenant)
        .run();
      entityType = "diagnosticFramework";
    } else if (body.type === "calculateDiagnostic") {
      const org = scope || body.organizationId,
        currency = body.currency?.trim().toUpperCase();
      if (
        !org ||
        !body.frameworkId ||
        !/^[A-Z]{3}$/.test(currency || "") ||
        !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(body.period || "")
      )
        return Response.json(
          {
            error: "Organização, framework, período e moeda são obrigatórios.",
          },
          { status: 400 },
        );
      const framework = await db
        .prepare(
          "SELECT * FROM diagnostic_frameworks WHERE id=? AND tenant_id=? AND status='Ativo'",
        )
        .bind(body.frameworkId, tenant)
        .first();
      if (!framework)
        return Response.json(
          { error: "Framework ativo não encontrado." },
          { status: 404 },
        );
      const rows = await db
        .prepare(
          "SELECT r.role_code,SUM(ABS(e.amount_minor)) amount FROM performance_entries e JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code JOIN diagnostic_line_roles r ON r.line_id=l.id AND r.tenant_id=l.tenant_id WHERE e.tenant_id=? AND e.organization_id=? AND e.period=? AND e.currency=? AND e.scenario='Actual' GROUP BY r.role_code",
        )
        .bind(tenant, org, body.period, currency)
        .all<Record<string, unknown>>();
      if (!rows.results.length)
        return Response.json(
          {
            error:
              "Não existem dados Actual com papéis diagnósticos para o período.",
          },
          { status: 409 },
        );
      const a = new Map(
          rows.results.map((x) => [String(x.role_code), Number(x.amount)]),
        ),
        v = (x: string) => a.get(x) || 0,
        revenue = v("REVENUE"),
        netIncome = revenue - v("COGS") - v("OPEX") - v("INTEREST") - v("TAX"),
        currentAssets =
          v("CASH") +
          v("RECEIVABLES") +
          v("INVENTORY") +
          v("OTHER_CURRENT_ASSET"),
        assets = currentAssets + v("NONCURRENT_ASSET"),
        currentLiabilities =
          v("PAYABLES") + v("CURRENT_DEBT") + v("OTHER_CURRENT_LIABILITY"),
        liabilities =
          currentLiabilities +
          v("LONGTERM_DEBT") +
          v("OTHER_NONCURRENT_LIABILITY"),
        equity = v("EQUITY"),
        working = currentAssets - currentLiabilities,
        nwc = v("INVENTORY") + v("RECEIVABLES") - v("PAYABLES"),
        values = new Map<string, { value: number; scale: number }>([
          [
            "CURRENT_RATIO",
            {
              value: ratio(currentAssets, currentLiabilities) ?? 0,
              scale: 10000,
            },
          ],
          [
            "QUICK_RATIO",
            {
              value:
                ratio(currentAssets - v("INVENTORY"), currentLiabilities) ?? 0,
              scale: 10000,
            },
          ],
          [
            "CASH_RATIO",
            { value: ratio(v("CASH"), currentLiabilities) ?? 0, scale: 10000 },
          ],
          [
            "SOLVENCY",
            { value: ratio(assets, liabilities) ?? 0, scale: 10000 },
          ],
          ["AUTONOMY", { value: ratio(equity, assets) ?? 0, scale: 10000 }],
          [
            "DEBT_RATIO",
            { value: ratio(liabilities, assets) ?? 0, scale: 10000 },
          ],
          [
            "NET_MARGIN",
            { value: ratio(netIncome, revenue) ?? 0, scale: 10000 },
          ],
          ["ROA", { value: ratio(netIncome, assets) ?? 0, scale: 10000 }],
          ["ROE", { value: ratio(netIncome, equity) ?? 0, scale: 10000 }],
          [
            "ASSET_TURNOVER",
            { value: ratio(revenue, assets) ?? 0, scale: 10000 },
          ],
          ["WORKING_CAPITAL", { value: working, scale: 100 }],
          ["NWC_REQUIREMENT", { value: nwc, scale: 100 }],
          ["NET_TREASURY", { value: working - nwc, scale: 100 }],
        ]),
        configs = await db
          .prepare(
            "SELECT * FROM diagnostic_metric_configs WHERE tenant_id=? AND framework_id=?",
          )
          .bind(tenant, body.frameworkId)
          .all<Record<string, unknown>>(),
        prepared = [] as Array<Record<string, unknown>>;
      for (const config of configs.results) {
        const def = metricDefinitions.find((x) => x[0] === config.metric_code),
          value = values.get(String(config.metric_code));
        if (!def || !value) continue;
        const rule =
            value.scale === 10000
              ? await db
                  .prepare(
                    "SELECT * FROM diagnostic_rules WHERE tenant_id=? AND framework_id=? AND metric_code=? AND (? >= COALESCE(min_value_bps,-9223372036854775808)) AND (? <= COALESCE(max_value_bps,9223372036854775807)) ORDER BY score_bps DESC LIMIT 1",
                  )
                  .bind(
                    tenant,
                    body.frameworkId,
                    config.metric_code,
                    value.value,
                    value.value,
                  )
                  .first<Record<string, unknown>>()
              : null,
          inputHash = await sha(
            `${config.metric_code}|${value.value}|${value.scale}|${rule?.id || "unscored"}`,
          );
        prepared.push({
          code: config.metric_code,
          label: def[1],
          formula: def[2],
          value: value.value,
          scale: value.scale,
          weight: Number(config.weight_bps),
          score: rule ? Number(rule.score_bps) : null,
          severity: rule?.severity || null,
          recommendation: rule?.recommendation || null,
          inputHash,
        });
      }
      const unclassified = prepared.filter(
        (x) => x.scale === 10000 && x.score === null,
      );
      if (unclassified.length)
        return Response.json(
          {
            error: `Faltam intervalos de classificação para: ${unclassified.map((x) => x.label).join(", ")}.`,
          },
          { status: 409 },
        );
      const scored = prepared.filter((x) => x.score !== null),
        weight = scored.reduce((n, x) => n + Number(x.weight), 0);
      if (!weight)
        return Response.json(
          {
            error:
              "Nenhuma métrica encontrou uma regra de classificação configurada.",
          },
          { status: 409 },
        );
      const overall = Math.round(
          scored.reduce((n, x) => n + Number(x.score) * Number(x.weight), 0) /
            weight,
        ),
        inputHash = await sha(JSON.stringify({ aggregates: [...a], prepared })),
        previous = await db
          .prepare(
            "SELECT COALESCE(MAX(run_number),0) n FROM diagnostic_runs WHERE tenant_id=? AND organization_id=? AND framework_id=? AND period=? AND currency=?",
          )
          .bind(tenant, org, body.frameworkId, body.period, currency)
          .first<Record<string, unknown>>();
      entityId = uid();
      const statements = [
        db
          .prepare(
            "INSERT INTO diagnostic_runs (id,tenant_id,organization_id,framework_id,period,currency,run_number,status,overall_score_bps,input_hash,created_by,created_at) VALUES (?,?,?,?,?,?,?,'Calculado',?,?,?,?)",
          )
          .bind(
            entityId,
            tenant,
            org,
            body.frameworkId,
            body.period,
            currency,
            Number(previous?.n || 0) + 1,
            overall,
            inputHash,
            security.email,
            now,
          ),
      ];
      for (const x of prepared)
        statements.push(
          db
            .prepare(
              "INSERT INTO diagnostic_results VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              uid(),
              tenant,
              entityId,
              x.code,
              x.label,
              x.value,
              x.scale,
              x.score,
              x.severity,
              x.recommendation,
              x.formula,
              x.inputHash,
            ),
        );
      await db.batch(statements);
    } else if (body.type === "approveDiagnostic") {
      const run = await db
        .prepare(
          "SELECT * FROM diagnostic_runs WHERE id=? AND tenant_id=? AND status='Calculado' AND (? IS NULL OR organization_id=?)",
        )
        .bind(body.runId, tenant, scope, scope)
        .first<Record<string, unknown>>();
      if (!run)
        return Response.json(
          { error: "Diagnóstico calculado não encontrado." },
          { status: 404 },
        );
      if (String(run.created_by).toLowerCase() === security.email.toLowerCase())
        return Response.json(
          {
            error:
              "Maker-checker: o autor não pode aprovar o próprio diagnóstico.",
          },
          { status: 403 },
        );
      const hash = await sha(`${run.input_hash}|${security.email}|${now}`);
      await db
        .prepare(
          "UPDATE diagnostic_runs SET status='Aprovado',approved_by=?,approved_at=?,approval_hash=? WHERE id=? AND tenant_id=? AND status='Calculado'",
        )
        .bind(security.email, now, hash, body.runId, tenant)
        .run();
      entityId = body.runId;
    } else if (body.type === "createInvestmentCase") {
      const org = scope || body.organizationId,
        currency = body.currency?.trim().toUpperCase(),
        rate = Math.round(Number(body.discountRate) * 100);
      if (
        !org ||
        !body.name?.trim() ||
        !/^[A-Z]{3}$/.test(currency || "") ||
        !Number.isInteger(rate) ||
        rate <= -10000 ||
        rate > 100000
      )
        return Response.json(
          {
            error:
              "Organização, nome, moeda e taxa de desconto válida são obrigatórios.",
          },
          { status: 400 },
        );
      const previous = await db
        .prepare(
          "SELECT COALESCE(MAX(version_number),0) n FROM investment_cases WHERE tenant_id=? AND organization_id=? AND name=?",
        )
        .bind(tenant, org, body.name.trim())
        .first<Record<string, unknown>>();
      entityId = uid();
      entityType = "investmentCase";
      await db
        .prepare(
          "INSERT INTO investment_cases (id,tenant_id,organization_id,name,currency,discount_rate_bps,status,version_number,created_by,created_at) VALUES (?,?,?,?,?,?,'Rascunho',?,?,?)",
        )
        .bind(
          entityId,
          tenant,
          org,
          body.name.trim(),
          currency,
          rate,
          Number(previous?.n || 0) + 1,
          security.email,
          now,
        )
        .run();
    } else if (body.type === "addCashFlow") {
      const period = Number(body.periodNumber),
        amount = Math.round(
          Number(String(body.amount).replace(",", ".")) * 100,
        );
      if (
        !body.caseId ||
        !Number.isInteger(period) ||
        period < 0 ||
        period > 100 ||
        !Number.isSafeInteger(amount)
      )
        return Response.json(
          { error: "Caso, período e fluxo válido são obrigatórios." },
          { status: 400 },
        );
      entityType = "investmentCase";
      await db
        .prepare("INSERT INTO investment_cash_flows VALUES (?,?,?,?,?,?,?)")
        .bind(
          uid(),
          tenant,
          body.caseId,
          period,
          amount,
          body.note?.trim() || null,
          now,
        )
        .run();
    } else if (body.type === "calculateInvestment") {
      const item = await db
        .prepare(
          "SELECT * FROM investment_cases WHERE id=? AND tenant_id=? AND status='Rascunho' AND (? IS NULL OR organization_id=?)",
        )
        .bind(body.caseId, tenant, scope, scope)
        .first<Record<string, unknown>>();
      if (!item)
        return Response.json(
          { error: "Caso de investimento editável não encontrado." },
          { status: 404 },
        );
      const raw = await db
          .prepare(
            "SELECT period_number,amount_minor FROM investment_cash_flows WHERE tenant_id=? AND case_id=? ORDER BY period_number",
          )
          .bind(tenant, body.caseId)
          .all<Record<string, unknown>>(),
        flows = raw.results.map((x) => ({
          period: Number(x.period_number),
          amount: Number(x.amount_minor),
        }));
      if (
        flows.length < 2 ||
        !flows.some((x) => x.period === 0 && x.amount < 0) ||
        !flows.some((x) => x.amount > 0) ||
        flows.some((x) => x.period > 0 && x.amount < 0)
      )
        return Response.json(
          {
            error:
              "A TIR exige fluxo convencional: investimento inicial negativo e retornos posteriores não negativos.",
          },
          { status: 409 },
        );
      const resultNpv = npv(flows, Number(item.discount_rate_bps)),
        resultIrr = irr(flows);
      if (resultIrr === null)
        return Response.json(
          {
            error:
              "Os fluxos não produzem uma TIR única no intervalo suportado.",
          },
          { status: 409 },
        );
      let cumulative = 0;
      let payback: number | null = null;
      for (const x of flows) {
        cumulative += x.amount;
        if (cumulative >= 0 && payback === null) payback = x.period;
      }
      const inputHash = await sha(
          JSON.stringify({ flows, rate: item.discount_rate_bps }),
        ),
        rates = [
          Number(item.discount_rate_bps) - 500,
          Number(item.discount_rate_bps) - 200,
          Number(item.discount_rate_bps),
          Number(item.discount_rate_bps) + 200,
          Number(item.discount_rate_bps) + 500,
        ].filter((x) => x > -10000),
        statements = [];
      for (const rate of rates)
        statements.push(
          db
            .prepare(
              "INSERT INTO investment_sensitivities VALUES (?,?,?,?,?,?)",
            )
            .bind(uid(), tenant, body.caseId, rate, npv(flows, rate), now),
        );
      statements.push(
        db
          .prepare(
            "UPDATE investment_cases SET status='Calculado',npv_minor=?,irr_bps=?,payback_period=?,input_hash=?,calculated_by=?,calculated_at=? WHERE id=? AND tenant_id=? AND status='Rascunho'",
          )
          .bind(
            resultNpv,
            resultIrr,
            payback,
            inputHash,
            security.email,
            now,
            body.caseId,
            tenant,
          ),
      );
      await db.batch(statements);
      entityId = body.caseId;
      entityType = "investmentCase";
    } else if (body.type === "approveInvestment") {
      const item = await db
        .prepare(
          "SELECT * FROM investment_cases WHERE id=? AND tenant_id=? AND status='Calculado' AND (? IS NULL OR organization_id=?)",
        )
        .bind(body.caseId, tenant, scope, scope)
        .first<Record<string, unknown>>();
      if (!item)
        return Response.json(
          { error: "Avaliação calculada não encontrada." },
          { status: 404 },
        );
      if (
        [item.created_by, item.calculated_by].some(
          (x) => String(x).toLowerCase() === security.email.toLowerCase(),
        )
      )
        return Response.json(
          {
            error:
              "Maker-checker: o aprovador deve ser independente do criador e calculador.",
          },
          { status: 403 },
        );
      const hash = await sha(`${item.input_hash}|${security.email}|${now}`);
      await db
        .prepare(
          "UPDATE investment_cases SET status='Aprovado',approved_by=?,approved_at=?,approval_hash=? WHERE id=? AND tenant_id=? AND status='Calculado'",
        )
        .bind(security.email, now, hash, body.caseId, tenant)
        .run();
      entityId = body.caseId;
      entityType = "investmentCase";
    } else
      return Response.json(
        { error: "Operação de diagnóstico não suportada." },
        { status: 400 },
      );
    await db
      .prepare(
        "INSERT INTO audit_events (id,tenant_id,created_at,action,entity_type,entity_id,actor,summary) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(
        uid(),
        tenant,
        now,
        body.type,
        entityType,
        entityId,
        security.email,
        `Diagnóstico financeiro: ${body.type}`,
      )
      .run();
    return financialDiagnosticsApi(
      new Request(
        `${url.origin}${url.pathname}?${entityType === "investmentCase" ? `case=${entityId}` : `run=${entityId}`}`,
        { method: "GET", headers: request.headers },
      ),
      db,
      security,
    );
  } catch (e) {
    return fail(e);
  }
}
function metricRole(value: string) {
  return [
    "REVENUE",
    "COGS",
    "OPEX",
    "INTEREST",
    "TAX",
    "CASH",
    "RECEIVABLES",
    "INVENTORY",
    "OTHER_CURRENT_ASSET",
    "NONCURRENT_ASSET",
    "PAYABLES",
    "CURRENT_DEBT",
    "OTHER_CURRENT_LIABILITY",
    "LONGTERM_DEBT",
    "OTHER_NONCURRENT_LIABILITY",
    "EQUITY",
    "OPERATING_CASH_FLOW",
  ].includes(value);
}
