import { classifyDataError } from "../lib/api-error";

type Security = {
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
const periodAdd = (period: string, months: number) => {
  const [year, month] = period.split("-").map(Number),
    index = year * 12 + month - 1 + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
};
const compound = (base: number, growthBps: number, sequence: number) => {
  let value = BigInt(base);
  const numerator = BigInt(10000 + growthBps),
    denominator = 10000n;
  for (let i = 0; i < sequence; i++) {
    const product = value * numerator;
    value =
      product >= 0n
        ? (product + denominator / 2n) / denominator
        : -((-product + denominator / 2n) / denominator);
  }
  return Number(value);
};
const signed = (type: string, amount: number) =>
  ["Custo", "CAPEX", "Imposto"].includes(type) ? -Math.abs(amount) : amount;
const fail = (error: unknown) => {
  const x = classifyDataError(
    error,
    "Não foi possível processar o plano financeiro.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};

export async function financialModelsApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    const tenant = security.tenantId,
      scope = security.organizationId,
      url = new URL(request.url),
      selected = url.searchParams.get("model") || "",
      now = new Date().toISOString();
    const snapshot = async () => {
      const [models, organizations, lines, projections, audit] =
        await Promise.all([
          db
            .prepare(
              "SELECT m.*,o.name organization_name,(SELECT COUNT(*) FROM financial_model_lines l WHERE l.tenant_id=m.tenant_id AND l.model_id=m.id) line_count FROM financial_models m JOIN organizations o ON o.id=m.organization_id AND o.tenant_id=m.tenant_id WHERE m.tenant_id=? AND (? IS NULL OR m.organization_id=?) ORDER BY m.created_at DESC",
            )
            .bind(tenant, scope, scope)
            .all(),
          db
            .prepare(
              "SELECT id,code,name,currency FROM organizations WHERE tenant_id=? AND (? IS NULL OR id=?) AND status='Ativa' ORDER BY name",
            )
            .bind(tenant, scope, scope)
            .all(),
          selected
            ? db
                .prepare(
                  "SELECT * FROM financial_model_lines WHERE tenant_id=? AND model_id=? ORDER BY line_type,code",
                )
                .bind(tenant, selected)
                .all()
            : Promise.resolve({ results: [] }),
          selected
            ? db
                .prepare(
                  "SELECT p.*,l.code,l.name,l.line_type FROM financial_projections p JOIN financial_model_lines l ON l.id=p.line_id AND l.tenant_id=p.tenant_id JOIN financial_models m ON m.id=p.model_id AND m.tenant_id=p.tenant_id WHERE p.tenant_id=? AND p.model_id=? AND (? IS NULL OR m.organization_id=?) ORDER BY p.sequence_number,l.code",
                )
                .bind(tenant, selected, scope, scope)
                .all()
            : Promise.resolve({ results: [] }),
          scope
            ? Promise.resolve({ results: [] })
            : db
                .prepare(
                  "SELECT * FROM audit_events WHERE tenant_id=? AND entity_type='financialModel' ORDER BY created_at DESC LIMIT 15",
                )
                .bind(tenant)
                .all(),
        ]);
      const model =
          (models.results as Array<Record<string, unknown>>).find(
            (x) => x.id === selected,
          ) || null,
        monthly = new Map<
          string,
          {
            period: string;
            revenueMinor: number;
            costMinor: number;
            capexMinor: number;
            financingMinor: number;
            netIncomeMinor: number;
            netCashMinor: number;
            closingCashMinor: number;
          }
        >();
      if (model) {
        let cash = Number(model.opening_cash_minor);
        for (let i = 0; i < Number(model.horizon_months); i++) {
          const period = periodAdd(String(model.start_period), i),
            statement = (
              projections.results as Array<Record<string, unknown>>
            ).filter((x) => x.period === period),
            cashRows = (
              projections.results as Array<Record<string, unknown>>
            ).filter((x) => x.cash_period === period),
            sum = (type: string) =>
              statement
                .filter((x) => x.line_type === type)
                .reduce((n, x) => n + Number(x.statement_amount_minor), 0),
            netCash = cashRows.reduce(
              (n, x) => n + Number(x.cash_amount_minor),
              0,
            );
          cash += netCash;
          const revenue = sum("Receita"),
            cost = sum("Custo") + sum("Imposto"),
            capex = sum("CAPEX"),
            financing = sum("Financiamento");
          monthly.set(period, {
            period,
            revenueMinor: revenue,
            costMinor: cost,
            capexMinor: capex,
            financingMinor: financing,
            netIncomeMinor: revenue + cost,
            netCashMinor: netCash,
            closingCashMinor: cash,
          });
        }
      }
      return {
        models: models.results,
        organizations: organizations.results,
        selectedModel: model,
        lines: lines.results,
        projections: projections.results,
        monthly: [...monthly.values()],
        audit: audit.results,
      };
    };
    if (request.method === "GET") return Response.json(await snapshot());
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const body = (await request.json()) as Record<string, string>;
    let entityId = body.modelId || "";
    if (body.type === "createModel") {
      const organizationId = scope || body.organizationId,
        currency = body.currency?.trim().toUpperCase(),
        horizon = Number(body.horizonMonths),
        opening = Math.round(
          Number((body.openingCash || "0").replace(",", ".")) * 100,
        );
      if (
        !organizationId ||
        !body.name?.trim() ||
        !/^[A-Z]{3}$/.test(currency || "") ||
        !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(body.startPeriod || "") ||
        !Number.isInteger(horizon) ||
        horizon < 1 ||
        horizon > 240 ||
        !Number.isSafeInteger(opening)
      )
        return Response.json(
          {
            error:
              "Organização, nome, moeda, início e horizonte de 1 a 240 meses são obrigatórios.",
          },
          { status: 400 },
        );
      const previous = await db
        .prepare(
          "SELECT COALESCE(MAX(version_number),0) number FROM financial_models WHERE tenant_id=? AND organization_id=? AND name=?",
        )
        .bind(tenant, organizationId, body.name.trim())
        .first<Record<string, unknown>>();
      entityId = uid();
      await db
        .prepare(
          "INSERT INTO financial_models (id,tenant_id,organization_id,name,currency,start_period,horizon_months,opening_cash_minor,status,version_number,created_by,created_at) VALUES (?,?,?,?,?,?,?,?, 'Rascunho',?,?,?)",
        )
        .bind(
          entityId,
          tenant,
          organizationId,
          body.name.trim(),
          currency,
          body.startPeriod,
          horizon,
          opening,
          Number(previous?.number || 0) + 1,
          security.email,
          now,
        )
        .run();
    } else if (body.type === "addLine") {
      const amount = Math.round(
          Number((body.baseAmount || "").replace(",", ".")) * 100,
        ),
        growth = Math.round(
          Number((body.growthPercent || "0").replace(",", ".")) * 100,
        ),
        lag = Number(body.cashLagMonths || 0);
      if (
        !body.modelId ||
        !body.code?.trim() ||
        !body.name?.trim() ||
        ![
          "Receita",
          "Custo",
          "CAPEX",
          "Financiamento",
          "Imposto",
          "Outro",
        ].includes(body.lineType) ||
        !Number.isSafeInteger(amount) ||
        !Number.isInteger(growth) ||
        growth < -10000 ||
        growth > 100000 ||
        !Number.isInteger(lag) ||
        lag < 0 ||
        lag > 36
      )
        return Response.json(
          {
            error:
              "Linha, tipo, valor base, crescimento e prazo de caixa válidos são obrigatórios.",
          },
          { status: 400 },
        );
      await db
        .prepare(
          "INSERT INTO financial_model_lines VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          uid(),
          tenant,
          body.modelId,
          body.code.trim().toUpperCase(),
          body.name.trim(),
          body.lineType,
          amount,
          growth,
          lag,
          security.email,
          now,
        )
        .run();
    } else if (body.type === "calculateModel") {
      const model = await db
        .prepare(
          "SELECT * FROM financial_models WHERE id=? AND tenant_id=? AND status='Rascunho' AND (? IS NULL OR organization_id=?)",
        )
        .bind(body.modelId, tenant, scope, scope)
        .first<Record<string, unknown>>();
      if (!model)
        return Response.json(
          { error: "Plano financeiro editável não encontrado." },
          { status: 404 },
        );
      const lines = await db
        .prepare(
          "SELECT * FROM financial_model_lines WHERE tenant_id=? AND model_id=? ORDER BY code",
        )
        .bind(tenant, body.modelId)
        .all<Record<string, unknown>>();
      if (!lines.results.length)
        return Response.json(
          { error: "Adicione pelo menos uma linha antes de calcular." },
          { status: 409 },
        );
      const prepared = [] as Array<Record<string, unknown>>,
        statements = [];
      for (const line of lines.results)
        for (
          let sequence = 0;
          sequence < Number(model.horizon_months);
          sequence++
        ) {
          const amount = signed(
              String(line.line_type),
              compound(
                Number(line.base_amount_minor),
                Number(line.growth_bps),
                sequence,
              ),
            ),
            period = periodAdd(String(model.start_period), sequence),
            cashPeriod = periodAdd(period, Number(line.cash_lag_months)),
            formulaHash = await sha(
              `${line.id}|${line.base_amount_minor}|${line.growth_bps}|${sequence}|${amount}|${cashPeriod}`,
            );
          prepared.push({
            lineId: line.id,
            period,
            cashPeriod,
            sequence,
            amount,
            formulaHash,
          });
          statements.push(
            db
              .prepare(
                "INSERT INTO financial_projections VALUES (?,?,?,?,?,?,?,?,?,?)",
              )
              .bind(
                uid(),
                tenant,
                body.modelId,
                line.id,
                period,
                cashPeriod,
                sequence,
                amount,
                amount,
                formulaHash,
              ),
          );
        }
      const inputHash = await sha(JSON.stringify(prepared));
      statements.push(
        db
          .prepare(
            "UPDATE financial_models SET status='Calculado',input_hash=?,calculated_by=?,calculated_at=? WHERE id=? AND tenant_id=? AND status='Rascunho'",
          )
          .bind(inputHash, security.email, now, body.modelId, tenant),
      );
      await db.batch(statements);
    } else if (body.type === "approveModel") {
      if (!["Administrador", "Financeiro", "Gestor"].includes(security.role))
        return Response.json(
          { error: "A aprovação exige Administrador, Financeiro ou Gestor." },
          { status: 403 },
        );
      const model = await db
        .prepare(
          "SELECT * FROM financial_models WHERE id=? AND tenant_id=? AND status='Calculado' AND (? IS NULL OR organization_id=?)",
        )
        .bind(body.modelId, tenant, scope, scope)
        .first<Record<string, unknown>>();
      if (!model)
        return Response.json(
          { error: "Plano calculado não encontrado." },
          { status: 404 },
        );
      if (
        String(model.created_by).toLowerCase() ===
          security.email.toLowerCase() ||
        String(model.calculated_by).toLowerCase() ===
          security.email.toLowerCase()
      )
        return Response.json(
          {
            error:
              "Maker-checker: o aprovador deve ser independente do criador e calculador.",
          },
          { status: 403 },
        );
      const approvalHash = await sha(
          `${model.input_hash}|${security.email}|${now}`,
        ),
        result = await db
          .prepare(
            "UPDATE financial_models SET status='Aprovado',approved_by=?,approved_at=?,approval_hash=? WHERE id=? AND tenant_id=? AND status='Calculado'",
          )
          .bind(security.email, now, approvalHash, body.modelId, tenant)
          .run();
      if (!Number(result.meta.changes || 0))
        return Response.json(
          { error: "O plano foi atualizado em paralelo." },
          { status: 409 },
        );
    } else
      return Response.json(
        { error: "Operação de plano financeiro não suportada." },
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
        "financialModel",
        entityId,
        security.email,
        `Plano financeiro: ${body.type}`,
      )
      .run();
    return financialModelsApi(
      new Request(`${url.origin}${url.pathname}?model=${entityId}`, {
        method: "GET",
        headers: request.headers,
      }),
      db,
      security,
    );
  } catch (error) {
    return fail(error);
  }
}
