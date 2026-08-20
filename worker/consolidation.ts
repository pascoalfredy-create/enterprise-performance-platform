import { classifyDataError } from "../lib/api-error";

type ConsolidationSecurity = {
  tenantId: string;
  organizationId: string | null;
  email: string;
  role: string;
};
const uid = () => crypto.randomUUID();
const sha = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const convert = (amount: number, rate: number) => {
  const n = BigInt(Math.trunc(amount)) * BigInt(Math.trunc(rate)),
    d = 100000000n;
  return Number(n >= 0n ? (n + d / 2n) / d : -((-n + d / 2n) / d));
};
const fail = (error: unknown) => {
  const x = classifyDataError(
    error,
    "Não foi possível processar a consolidação.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};

export async function consolidationApi(
  request: Request,
  db: D1Database,
  security: ConsolidationSecurity,
) {
  try {
    const tenant = security.tenantId,
      scope = security.organizationId,
      now = new Date().toISOString(),
      url = new URL(request.url),
      selected = url.searchParams.get("run") || "";
    const snapshot = async () => {
      const [sets, rates, runs, lines, adjustments, currencies, audit] =
        await Promise.all([
          db
            .prepare(
              "SELECT s.*,(SELECT COUNT(*) FROM fx_rates r WHERE r.tenant_id=s.tenant_id AND r.rate_set_id=s.id) rate_count FROM fx_rate_sets s WHERE s.tenant_id=? ORDER BY s.period DESC,s.created_at DESC",
            )
            .bind(tenant)
            .all(),
          db
            .prepare(
              "SELECT * FROM fx_rates WHERE tenant_id=? ORDER BY rate_set_id,source_currency",
            )
            .bind(tenant)
            .all(),
          db
            .prepare(
              "SELECT * FROM consolidation_runs WHERE tenant_id=? ORDER BY period DESC,created_at DESC",
            )
            .bind(tenant)
            .all(),
          selected
            ? db
                .prepare(
                  "SELECT l.*,o.name organization_name FROM consolidation_lines l JOIN organizations o ON o.id=l.organization_id AND o.tenant_id=l.tenant_id WHERE l.tenant_id=? AND l.run_id=? AND (? IS NULL OR l.organization_id=?) ORDER BY l.line_code,o.name,l.source_currency",
                )
                .bind(tenant, selected, scope, scope)
                .all()
            : Promise.resolve({ results: [] }),
          selected
            ? db
                .prepare(
                  "SELECT * FROM consolidation_adjustments WHERE tenant_id=? AND run_id=? ORDER BY created_at",
                )
                .bind(tenant, selected)
                .all()
            : Promise.resolve({ results: [] }),
          db
            .prepare(
              "SELECT DISTINCT currency FROM performance_entries WHERE tenant_id=? AND scenario='Actual' ORDER BY currency",
            )
            .bind(tenant)
            .all(),
          scope
            ? Promise.resolve({ results: [] })
            : db
                .prepare(
                  "SELECT * FROM audit_events WHERE tenant_id=? AND entity_type IN ('fxRateSet','consolidationRun') ORDER BY created_at DESC LIMIT 15",
                )
                .bind(tenant)
                .all(),
        ]);
      return {
        rateSets: sets.results,
        rates: rates.results,
        runs: runs.results,
        lines: lines.results,
        adjustments: adjustments.results,
        currencies: currencies.results.map((x) => x.currency),
        audit: audit.results,
      };
    };
    if (request.method === "GET") return Response.json(await snapshot());
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    if (scope)
      return Response.json(
        { error: "A consolidação exige âmbito de todo o tenant." },
        { status: 403 },
      );
    const body = (await request.json()) as Record<string, string>;
    const baseCurrency = body.baseCurrency?.trim().toUpperCase(),
      sourceCurrency = body.sourceCurrency?.trim().toUpperCase();
    let entityId = body.rateSetId || body.runId || "",
      entityType = "consolidationRun";
    if (body.type === "createRateSet") {
      if (
        !body.name?.trim() ||
        !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(body.period || "") ||
        !/^[A-Z]{3}$/.test(baseCurrency || "")
      )
        return Response.json(
          { error: "Nome, período e moeda de reporte são obrigatórios." },
          { status: 400 },
        );
      entityId = uid();
      entityType = "fxRateSet";
      await db
        .prepare(
          "INSERT INTO fx_rate_sets (id,tenant_id,name,period,base_currency,status,created_by,created_at) VALUES (?,?,?,?,?,'Rascunho',?,?)",
        )
        .bind(
          entityId,
          tenant,
          body.name.trim(),
          body.period,
          baseCurrency,
          security.email,
          now,
        )
        .run();
    } else if (body.type === "addRate") {
      const rate = Number((body.rate || "").replace(",", ".")),
        scaled = Math.round(rate * 100000000);
      if (
        !body.rateSetId ||
        !/^[A-Z]{3}$/.test(sourceCurrency || "") ||
        !Number.isSafeInteger(scaled) ||
        scaled <= 0
      )
        return Response.json(
          { error: "Conjunto, moeda e taxa positiva são obrigatórios." },
          { status: 400 },
        );
      entityType = "fxRateSet";
      const set = await db
        .prepare(
          "SELECT base_currency FROM fx_rate_sets WHERE id=? AND tenant_id=? AND status='Rascunho'",
        )
        .bind(body.rateSetId, tenant)
        .first<Record<string, unknown>>();
      if (!set)
        return Response.json(
          { error: "Conjunto em rascunho não encontrado." },
          { status: 404 },
        );
      await db
        .prepare(
          "INSERT INTO fx_rates (id,tenant_id,rate_set_id,source_currency,target_currency,rate_scaled,scale,created_at) VALUES (?,?,?,?,?,?,100000000,?)",
        )
        .bind(
          uid(),
          tenant,
          body.rateSetId,
          sourceCurrency,
          String(set.base_currency),
          scaled,
          now,
        )
        .run();
    } else if (body.type === "approveRateSet") {
      if (!["Administrador", "Financeiro", "Gestor"].includes(security.role))
        return Response.json(
          { error: "A aprovação exige Administrador, Financeiro ou Gestor." },
          { status: 403 },
        );
      const set = await db
        .prepare(
          "SELECT * FROM fx_rate_sets WHERE id=? AND tenant_id=? AND status='Rascunho'",
        )
        .bind(body.rateSetId, tenant)
        .first<Record<string, unknown>>();
      if (!set)
        return Response.json(
          { error: "Conjunto em rascunho não encontrado." },
          { status: 404 },
        );
      if (String(set.created_by).toLowerCase() === security.email.toLowerCase())
        return Response.json(
          {
            error:
              "Maker-checker: o criador não pode aprovar as próprias taxas.",
          },
          { status: 403 },
        );
      const used = await db
          .prepare(
            "SELECT DISTINCT currency FROM performance_entries WHERE tenant_id=? AND period=? AND scenario='Actual' AND currency<>?",
          )
          .bind(tenant, set.period, set.base_currency)
          .all<Record<string, unknown>>(),
        missing = [];
      for (const x of used.results)
        if (
          !(await db
            .prepare(
              "SELECT id FROM fx_rates WHERE tenant_id=? AND rate_set_id=? AND source_currency=? AND target_currency=?",
            )
            .bind(tenant, body.rateSetId, x.currency, set.base_currency)
            .first())
        )
          missing.push(String(x.currency));
      if (missing.length)
        return Response.json(
          { error: `Faltam taxas para: ${missing.join(", ")}.` },
          { status: 409 },
        );
      const result = await db
        .prepare(
          "UPDATE fx_rate_sets SET status='Aprovado',approved_by=?,approved_at=? WHERE id=? AND tenant_id=? AND status='Rascunho'",
        )
        .bind(security.email, now, body.rateSetId, tenant)
        .run();
      if (!Number(result.meta.changes || 0))
        return Response.json(
          { error: "O conjunto foi atualizado em paralelo." },
          { status: 409 },
        );
      entityType = "fxRateSet";
    } else if (body.type === "calculateRun") {
      const set = await db
        .prepare(
          "SELECT * FROM fx_rate_sets WHERE id=? AND tenant_id=? AND status='Aprovado'",
        )
        .bind(body.rateSetId, tenant)
        .first<Record<string, unknown>>();
      if (!set)
        return Response.json(
          { error: "Conjunto de taxas aprovado não encontrado." },
          { status: 404 },
        );
      const sources = await db
        .prepare(
          "SELECT organization_id,currency,line_code,MAX(line_name) line_name,SUM(amount_minor) amount_minor,COUNT(*) source_count FROM performance_entries WHERE tenant_id=? AND period=? AND scenario='Actual' GROUP BY organization_id,currency,line_code ORDER BY organization_id,currency,line_code",
        )
        .bind(tenant, set.period)
        .all<Record<string, unknown>>();
      if (!sources.results.length)
        return Response.json(
          {
            error: "Não existem lançamentos Actual para o período selecionado.",
          },
          { status: 409 },
        );
      const rates = await db
          .prepare(
            "SELECT source_currency,rate_scaled FROM fx_rates WHERE tenant_id=? AND rate_set_id=?",
          )
          .bind(tenant, body.rateSetId)
          .all<Record<string, unknown>>(),
        map = new Map(
          rates.results.map((x) => [
            String(x.source_currency),
            Number(x.rate_scaled),
          ]),
        ),
        prepared = [] as Array<Record<string, unknown>>;
      for (const row of sources.results) {
        const currency = String(row.currency),
          rate = currency === set.base_currency ? 100000000 : map.get(currency);
        if (!rate)
          return Response.json(
            { error: `Taxa ausente para ${currency}/${set.base_currency}.` },
            { status: 409 },
          );
        const sourceAmount = Number(row.amount_minor);
        if (!Number.isSafeInteger(sourceAmount))
          return Response.json(
            {
              error: `O saldo ${row.line_code} excede o intervalo de cálculo auditável.`,
            },
            { status: 422 },
          );
        const sourceHash = await sha(
          `${row.organization_id}|${currency}|${row.line_code}|${row.amount_minor}|${row.source_count}`,
        );
        prepared.push({
          ...row,
          rate_scaled: rate,
          converted_amount_minor: convert(sourceAmount, rate),
          source_hash: sourceHash,
        });
      }
      const runId = uid(),
        previous = await db
          .prepare(
            "SELECT COALESCE(MAX(run_number),0) number FROM consolidation_runs WHERE tenant_id=? AND period=? AND target_currency=?",
          )
          .bind(tenant, set.period, set.base_currency)
          .first<Record<string, unknown>>(),
        runNumber = Number(previous?.number || 0) + 1,
        inputHash = await sha(JSON.stringify(prepared)),
        total = prepared.reduce(
          (n, x) => n + Number(x.converted_amount_minor),
          0,
        ),
        orgs = new Set(prepared.map((x) => x.organization_id)).size,
        currencyCount = new Set(prepared.map((x) => x.currency)).size;
      const statements = [
        db
          .prepare(
            "INSERT INTO consolidation_runs (id,tenant_id,rate_set_id,period,target_currency,run_number,status,source_count,organization_count,currency_count,converted_total_minor,adjustment_total_minor,reported_total_minor,input_hash,created_by,created_at) VALUES (?,?,?,?,?,?,'Calculado',?,?,?,?,0,?,?,?,?)",
          )
          .bind(
            runId,
            tenant,
            body.rateSetId,
            set.period,
            set.base_currency,
            runNumber,
            sources.results.reduce((n, x) => n + Number(x.source_count), 0),
            orgs,
            currencyCount,
            total,
            total,
            inputHash,
            security.email,
            now,
          ),
      ];
      for (const row of prepared)
        statements.push(
          db
            .prepare(
              "INSERT INTO consolidation_lines VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              uid(),
              tenant,
              runId,
              row.organization_id,
              row.currency,
              set.base_currency,
              row.line_code,
              row.line_name,
              row.amount_minor,
              row.rate_scaled,
              row.converted_amount_minor,
              row.source_count,
              row.source_hash,
            ),
        );
      await db.batch(statements);
      entityId = runId;
    } else if (body.type === "addAdjustment") {
      if (
        !body.runId ||
        !body.lineCode?.trim() ||
        !body.lineName?.trim() ||
        !["Eliminação", "Ajustamento"].includes(body.adjustmentType) ||
        !body.reason?.trim() ||
        body.reason.trim().length < 10 ||
        !body.evidence?.trim()
      )
        return Response.json(
          { error: "Run, linha, tipo, motivo e evidência são obrigatórios." },
          { status: 400 },
        );
      const amount = Math.round(
        Number((body.amount || "").replace(",", ".")) * 100,
      );
      if (!Number.isSafeInteger(amount) || amount === 0)
        return Response.json(
          { error: "Montante diferente de zero é obrigatório." },
          { status: 400 },
        );
      await db
        .prepare(
          "INSERT INTO consolidation_adjustments VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          uid(),
          tenant,
          body.runId,
          body.lineCode.trim().toUpperCase(),
          body.lineName.trim(),
          amount,
          body.adjustmentType,
          body.reason.trim(),
          body.evidence.trim(),
          security.email,
          now,
        )
        .run();
    } else if (body.type === "approveRun") {
      if (!["Administrador", "Financeiro", "Gestor"].includes(security.role))
        return Response.json(
          { error: "A aprovação exige Administrador, Financeiro ou Gestor." },
          { status: 403 },
        );
      const run = await db
        .prepare(
          "SELECT * FROM consolidation_runs WHERE id=? AND tenant_id=? AND status='Calculado'",
        )
        .bind(body.runId, tenant)
        .first<Record<string, unknown>>();
      if (!run)
        return Response.json(
          { error: "Consolidação calculada não encontrada." },
          { status: 404 },
        );
      if (String(run.created_by).toLowerCase() === security.email.toLowerCase())
        return Response.json(
          {
            error:
              "Maker-checker: o autor não pode aprovar a própria consolidação.",
          },
          { status: 403 },
        );
      const adj = await db
          .prepare(
            "SELECT COALESCE(SUM(amount_minor),0) total FROM consolidation_adjustments WHERE tenant_id=? AND run_id=?",
          )
          .bind(tenant, body.runId)
          .first<Record<string, unknown>>(),
        adjustment = Number(adj?.total || 0),
        reported = Number(run.converted_total_minor) + adjustment,
        approvalHash = await sha(
          `${run.input_hash}|${adjustment}|${reported}|${security.email}|${now}`,
        ),
        result = await db
          .prepare(
            "UPDATE consolidation_runs SET status='Aprovado',adjustment_total_minor=?,reported_total_minor=?,approved_by=?,approved_at=?,approval_hash=? WHERE id=? AND tenant_id=? AND status='Calculado'",
          )
          .bind(
            adjustment,
            reported,
            security.email,
            now,
            approvalHash,
            body.runId,
            tenant,
          )
          .run();
      if (!Number(result.meta.changes || 0))
        return Response.json(
          { error: "A consolidação foi atualizada em paralelo." },
          { status: 409 },
        );
    } else
      return Response.json(
        { error: "Operação de consolidação não suportada." },
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
        `Consolidação: ${body.type}`,
      )
      .run();
    return Response.json(await snapshot(), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
