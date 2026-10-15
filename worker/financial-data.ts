import {financialLedgerApi} from './financial-ledger';
import {feasibilityApi} from './feasibility';
import {managementActualsApi} from './management-actuals';
import { treasuryApi } from "./treasury";
import type {D1Database} from "../worker-configuration";
import { financialScope } from "./financial-scope";
import { financialBatchActions } from "../lib/approval-policy";
import {parseMoneyMinor} from "../lib/money";
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

export async function financialDataApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  if (new URL(request.url).searchParams.get("resource") === "treasury") return treasuryApi(request, db, security);
  if (new URL(request.url).searchParams.get("resource") === "actuals") return managementActualsApi(request,db,security);
  if (new URL(request.url).searchParams.get("resource") === "feasibility") return feasibilityApi(request,db,security);
  if (new URL(request.url).searchParams.get("resource") === "ledger") return financialLedgerApi(request,db,security);
  try {
    const tenant = security.tenantId,
      scope = security.organizationId,
      url = new URL(request.url),
      selected = url.searchParams.get("batch") || "",
      now = new Date().toISOString();
    const snapshot = async () => {
      const [lines, mappings, batches, rows, organizations, members, audit, reportingPeriods, reportingCurrencies] =
        await Promise.all([
          db
            .prepare(
              "SELECT * FROM financial_line_catalog WHERE tenant_id=? ORDER BY code",
            )
            .bind(tenant)
            .all(),
          db
            .prepare(
              "SELECT m.*,l.code line_code,l.name line_name,d.name dimension_name FROM financial_source_mappings m JOIN financial_line_catalog l ON l.id=m.line_id AND l.tenant_id=m.tenant_id LEFT JOIN dimension_members d ON d.id=m.dimension_member_id AND d.tenant_id=m.tenant_id WHERE m.tenant_id=? ORDER BY m.source_system,m.source_code",
            )
            .bind(tenant)
            .all(),
          db
            .prepare(
              "SELECT b.*,o.name organization_name,(SELECT COUNT(*) FROM financial_import_rows r WHERE r.tenant_id=b.tenant_id AND r.batch_id=b.id AND r.mapping_status='Pendente') pending_snapshot FROM financial_import_batches b JOIN organizations o ON o.id=b.organization_id AND o.tenant_id=b.tenant_id WHERE b.tenant_id=? AND (? IS NULL OR b.organization_id=?) ORDER BY b.created_at DESC",
            )
            .bind(tenant, scope, scope)
            .all(),
          selected
            ? db
                .prepare(
                  "SELECT r.*,COALESCE(l.code,mapped.code) line_code,COALESCE(l.name,mapped.name) line_name FROM financial_import_rows r JOIN financial_import_batches b ON b.id=r.batch_id AND b.tenant_id=r.tenant_id LEFT JOIN financial_line_catalog l ON l.id=r.line_id AND l.tenant_id=r.tenant_id LEFT JOIN financial_source_mappings sm ON sm.tenant_id=r.tenant_id AND sm.source_system=b.source_system AND sm.source_code=r.source_code LEFT JOIN financial_line_catalog mapped ON mapped.id=sm.line_id AND mapped.tenant_id=sm.tenant_id WHERE r.tenant_id=? AND r.batch_id=? AND (? IS NULL OR b.organization_id=?) ORDER BY r.row_number",
                )
                .bind(tenant, selected, scope, scope)
                .all()
            : Promise.resolve({ results: [] }),
          db
            .prepare(
              "SELECT id,code,name,currency FROM organizations WHERE tenant_id=? AND (? IS NULL OR id=?) AND status='Ativa' ORDER BY name",
            )
            .bind(tenant, scope, scope)
            .all(),
          db
            .prepare(
              "SELECT m.id,m.code,m.name,d.name dimension_name FROM dimension_members m JOIN financial_dimensions d ON d.id=m.dimension_id AND d.tenant_id=m.tenant_id WHERE m.tenant_id=? AND m.status='Ativo' ORDER BY d.name,m.code",
            )
            .bind(tenant)
            .all(),
          scope
            ? Promise.resolve({ results: [] })
            : db
                .prepare(
                  "SELECT * FROM audit_events WHERE tenant_id=? AND entity_type IN ('financialLine','financialMapping','financialImport') ORDER BY created_at DESC LIMIT 15",
                )
                .bind(tenant)
                .all(),
          db.prepare("SELECT DISTINCT period FROM performance_entries WHERE tenant_id=? AND scenario='Actual' AND version_id IS NULL AND (? IS NULL OR organization_id=?) ORDER BY period DESC").bind(tenant,scope,scope).all(),
          db.prepare("SELECT DISTINCT currency FROM performance_entries WHERE tenant_id=? AND (? IS NULL OR organization_id=?) ORDER BY currency").bind(tenant,scope,scope).all(),
        ]);
      return {
        reportingPeriods: reportingPeriods.results.map(row=>row.period),
        reportingCurrencies: reportingCurrencies.results.map(row=>row.currency),
        lines: lines.results,
        mappings: mappings.results,
        batches: batches.results.map((batch) => ({ ...batch, actions: financialBatchActions(batch as { status: string; created_by: unknown }, security.email, security.role) })),
        capabilities: { canWrite: ["Administrador", "Financeiro", "Gestor"].includes(security.role), canConfigure: !scope && ["Administrador", "Financeiro", "Gestor"].includes(security.role) },
        rows: rows.results,
        organizations: organizations.results,
        members: members.results,
        audit: audit.results,
      };
    };
    if (request.method === "GET") return Response.json(await snapshot());
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const body = (await request.json()) as Record<string, string>;
    let entityId = "",
      entityType = "financialImport";
    if (body.type === "classifyLine") {
      if (scope || !["Administrador", "Financeiro", "Gestor"].includes(security.role)) return Response.json({ error: "A classificação financeira exige permissão de configuração e âmbito de todo o tenant." }, { status: 403 });
      const code=body.code?.trim();
      if (!code || !["Receita","Custo","Ativo","Passivo","Capital","Caixa","Outro"].includes(body.classification)) return Response.json({error:"Código e classificação válidos são obrigatórios."},{status:400});
      const existing=await db.prepare("SELECT id FROM financial_line_catalog WHERE tenant_id=? AND code=?").bind(tenant,code).first<{id:string}>();
      const source=await db.prepare("SELECT line_name FROM performance_entries WHERE tenant_id=? AND line_code=? ORDER BY created_at DESC LIMIT 1").bind(tenant,code).first<{line_name:string}>();
      if(!existing&&!source)return Response.json({error:"Rubrica não encontrada."},{status:404});
      entityId=existing?.id||uid();entityType="financialLine";
      await db.batch([existing?db.prepare("UPDATE financial_line_catalog SET classification=? WHERE id=? AND tenant_id=?").bind(body.classification,entityId,tenant):db.prepare("INSERT INTO financial_line_catalog VALUES (?,?,?,?,?,?,?,?,?,?)").bind(entityId,tenant,code,source!.line_name,body.classification,"Não aplicável","Natural","Ativa",security.email,now),db.prepare("INSERT INTO audit_events (id,tenant_id,created_at,action,entity_type,entity_id,actor,summary) VALUES (?,?,?,?,?,?,?,?)").bind(uid(),tenant,now,"classifyLine",entityType,entityId,security.email,code+": "+body.classification)]);
      return financialDataApi(new Request(request.url),db,security);
    } else if (body.type === "createLine") {
      if (scope)
        return Response.json(
          { error: "O catálogo financeiro exige âmbito de todo o tenant." },
          { status: 403 },
        );
      if (
        !body.code?.trim() ||
        !body.name?.trim() ||
        ![
          "Receita",
          "Custo",
          "Ativo",
          "Passivo",
          "Capital",
          "Caixa",
          "Outro",
        ].includes(body.classification) ||
        ![
          "Operacional",
          "Investimento",
          "Financiamento",
          "Não aplicável",
        ].includes(body.cashFlowCategory) ||
        !["Natural", "Inverter"].includes(body.signMode)
      )
        return Response.json(
          {
            error:
              "Código, nome, classificação, cash-flow e sinal são obrigatórios.",
          },
          { status: 400 },
        );
      entityId = uid();
      entityType = "financialLine";
      await db
        .prepare(
          "INSERT INTO financial_line_catalog (id,tenant_id,code,name,classification,cash_flow_category,sign_mode,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          entityId,
          tenant,
          body.code.trim().toUpperCase(),
          body.name.trim(),
          body.classification,
          body.cashFlowCategory,
          body.signMode,
          "Ativa",
          security.email,
          now,
        )
        .run();
    } else if (body.type === "createMapping") {
      if (scope)
        return Response.json(
          { error: "Os mappings exigem âmbito de todo o tenant." },
          { status: 403 },
        );
      if (
        !body.sourceSystem?.trim() ||
        !body.sourceCode?.trim() ||
        !body.lineId
      )
        return Response.json(
          {
            error:
              "Sistema, código de origem e linha financeira são obrigatórios.",
          },
          { status: 400 },
        );
      entityId = uid();
      entityType = "financialMapping";
      await db
        .prepare(
          "INSERT INTO financial_source_mappings VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(
          entityId,
          tenant,
          body.sourceSystem.trim(),
          body.sourceCode.trim().toUpperCase(),
          body.lineId,
          body.dimensionMemberId || null,
          security.email,
          now,
        )
        .run();
    } else if (body.type === "createBatch") {
      const organizationId = scope || body.organizationId,
        currency = body.currency?.trim().toUpperCase();
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.rows || "[]");
      } catch {
        return Response.json(
          { error: "As linhas importadas não são JSON válido." },
          { status: 400 },
        );
      }
      const input = Array.isArray(parsed)
        ? (parsed as Array<Record<string, unknown>>)
        : [];
      if (
        !organizationId ||
        !body.sourceSystem?.trim() ||
        !body.fileName?.trim() ||
        !/^[A-Z]{3}$/.test(currency || "") ||
        !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(body.period || "") ||
        !input.length ||
        input.length > 5000
      )
        return Response.json(
          {
            error:
              "Organização, origem, ficheiro, período, moeda e 1–5000 linhas são obrigatórios.",
          },
          { status: 400 },
        );
      const prepared = [] as Array<Record<string, unknown>>;
      for (let i = 0; i < input.length; i++) {
        const code = String(input[i].code || "")
            .trim()
            .toUpperCase(),
          description = String(input[i].description || code).trim(),
          amount = parseMoneyMinor(String(input[i].amount ?? ""));
        if (!code || !description || !Number.isSafeInteger(amount))
          return Response.json(
            {
              error: `Linha ${i + 1}: código, descrição e valor válido são obrigatórios.`,
            },
            { status: 400 },
          );
        const mapping = await db
          .prepare(
            "SELECT line_id,dimension_member_id FROM financial_source_mappings WHERE tenant_id=? AND source_system=? AND source_code=?",
          )
          .bind(tenant, body.sourceSystem.trim(), code)
          .first<Record<string, unknown>>();
        prepared.push({
          row: i + 1,
          code,
          description,
          amount,
          lineId: mapping?.line_id || null,
          dimensionId: mapping?.dimension_member_id || null,
          status: mapping ? "Mapeado" : "Pendente",
        });
      }
      entityId = uid();
      const inputHash = await sha(JSON.stringify(prepared));
      let total = 0;
      for (const row of prepared) {
        total += Number(row.amount);
        if (!Number.isSafeInteger(total)) return Response.json({ error: "O total do lote excede o limite numérico permitido." }, { status: 400 });
      }
      const statements = [
          db
            .prepare(
              "INSERT INTO financial_import_batches VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              entityId,
              tenant,
              organizationId,
              body.period,
              currency,
              body.sourceSystem.trim(),
              body.fileName.trim(),
              "Carregado",
              prepared.length,
              total,
              inputHash,
              security.email,
              now,
              null,
              null,
              null,
              null,
            ),
        ];
      for (const row of prepared)
        statements.push(
          db
            .prepare(
              "INSERT INTO financial_import_rows VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              uid(),
              tenant,
              entityId,
              row.row,
              row.code,
              row.description,
              row.amount,
              row.lineId,
              row.dimensionId,
              row.status,
              await sha(`${inputHash}|${row.row}|${row.code}|${row.amount}`),
            ),
        );
      await db.batch(statements);
    } else if (body.type === "validateBatch") {
      const batch = await db
        .prepare(
          "SELECT * FROM financial_import_batches WHERE id=? AND tenant_id=? AND status='Carregado' AND (? IS NULL OR organization_id=?)",
        )
        .bind(body.batchId, tenant, scope, scope)
        .first<Record<string, unknown>>();
      if (!batch)
        return Response.json(
          { error: "Lote carregado não encontrado." },
          { status: 404 },
        );
      const action = financialBatchActions(batch as { status: string; created_by: unknown }, security.email, security.role).validate;
      if (!action.allowed) return Response.json({ error: action.reason, code: "APPROVAL_BLOCKED" }, { status: 403 });
      const missing = await db
        .prepare(
          "SELECT COUNT(*) n FROM financial_import_rows r WHERE r.tenant_id=? AND r.batch_id=? AND NOT EXISTS(SELECT 1 FROM financial_source_mappings m WHERE m.tenant_id=r.tenant_id AND m.source_system=? AND m.source_code=r.source_code)",
        )
        .bind(tenant, body.batchId, batch.source_system)
        .first<Record<string, unknown>>();
      if (Number(missing?.n || 0))
        return Response.json(
          { error: `Existem ${missing?.n} código(s) sem mapping.` },
          { status: 409 },
        );
      const result = await db
        .prepare(
          "UPDATE financial_import_batches SET status='Validado',validated_by=?,validated_at=? WHERE id=? AND tenant_id=? AND status='Carregado'",
        )
        .bind(security.email, now, body.batchId, tenant)
        .run();
      if (!Number(result.meta.changes || 0))
        return Response.json(
          { error: "O lote foi atualizado em paralelo." },
          { status: 409 },
        );
      entityId = body.batchId;
    } else if (body.type === "postBatch") {
      const batch = await db
        .prepare(
          "SELECT * FROM financial_import_batches WHERE id=? AND tenant_id=? AND status='Validado' AND (? IS NULL OR organization_id=?)",
        )
        .bind(body.batchId, tenant, scope, scope)
        .first<Record<string, unknown>>();
      if (!batch)
        return Response.json(
          { error: "Lote validado não encontrado." },
          { status: 404 },
        );
      const action = financialBatchActions(batch as { status: string; created_by: unknown }, security.email, security.role).publish;
      if (!action.allowed)
        return Response.json(
          {
            error:
              action.reason || "Maker-checker: o autor do lote não pode publicá-lo no Actual.",
          },
          { status: 403 },
        );
      const rows = await db
        .prepare(
          "SELECT r.*,m.line_id,m.dimension_member_id,l.code line_code,l.name line_name,l.sign_mode FROM financial_import_rows r JOIN financial_source_mappings m ON m.tenant_id=r.tenant_id AND m.source_system=? AND m.source_code=r.source_code JOIN financial_line_catalog l ON l.id=m.line_id AND l.tenant_id=m.tenant_id WHERE r.tenant_id=? AND r.batch_id=? ORDER BY r.row_number",
        )
        .bind(batch.source_system, tenant, body.batchId)
        .all<Record<string, unknown>>();
      if (rows.results.length !== Number(batch.row_count))
        return Response.json(
          {
            error:
              "O mapping mudou ou está incompleto; volte a validar o lote.",
          },
          { status: 409 },
        );
      const statements = [];
      for (const row of rows.results) {
        const amount =
            String(row.sign_mode) === "Inverter"
              ? -Number(row.amount_minor)
              : Number(row.amount_minor),
          entryId = uid();
        statements.push(
          db
            .prepare(
              "INSERT INTO performance_entries (id,tenant_id,created_at,organization_id,period,scenario,version_id,currency,line_code,line_name,amount_minor,dimension_member_id,source) VALUES (?,?,?,?,?,'Actual',NULL,?,?,?,?,?,?)",
            )
            .bind(
              entryId,
              tenant,
              now,
              batch.organization_id,
              batch.period,
              batch.currency,
              row.line_code,
              row.line_name,
              amount,
              row.dimension_member_id,
              `Import:${body.batchId}`,
            ),
        );
        statements.push(
          db
            .prepare(
              "INSERT INTO financial_import_postings VALUES (?,?,?,?,?,?)",
            )
            .bind(uid(), tenant, body.batchId, row.id, entryId, now),
        );
      }
      statements.push(
        db
          .prepare(
            "UPDATE financial_import_batches SET status='Publicado',posted_by=?,posted_at=? WHERE id=? AND tenant_id=? AND status='Validado'",
          )
          .bind(security.email, now, body.batchId, tenant),
      );
      await db.batch(statements);
      entityId = body.batchId;
    } else
      return Response.json(
        { error: "Operação de dados financeiros não suportada." },
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
        `Dados financeiros: ${body.type}`,
      )
      .run();
    return financialDataApi(
      new Request(
        `${url.origin}${url.pathname}${entityId ? `?batch=${entityId}` : ""}`,
        { method: "GET", headers: request.headers },
      ),
      db,
      security,
    );
  } catch (error) {
    return fail(error);
  }
}

// Real, data-backed replacement for the Cockpit CFO view in
// app/finance-suite.tsx, which previously showed the same hardcoded
// numbers for every tenant regardless of what they'd actually entered.
// Aggregates performance_entries directly rather than inventing a
// synthetic P&L: classification (Receita/Custo/...) comes from
// financial_line_catalog when a line was imported through the mapped CSV
// pipeline in this file, but entries created by hand via /api/performance
// (worker/index.ts's performanceApi) carry only a free-text line_code with
// no catalog row, so the LEFT JOIN intentionally falls back to "Outro"
// instead of excluding them.
export async function financialCockpitApi(
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
    const [latest, anyData] = await Promise.all([
      db
        .prepare(
          "SELECT MAX(period) period FROM performance_entries WHERE tenant_id=? AND scenario='Actual' AND currency=? AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, currency, scope, scope)
        .first<{ period: string | null }>(),
      db
        .prepare("SELECT 1 FROM performance_entries WHERE tenant_id=? AND currency=? AND scenario='Actual' AND version_id IS NULL AND (? IS NULL OR organization_id=?) LIMIT 1")
        .bind(tenant, currency, scope, scope)
        .first(),
    ]);
    const period =
      url.searchParams.get("period") ||
      latest?.period ||
      new Date().toISOString().slice(0, 7);
    const approvedBudget = await db
      .prepare(
        "SELECT id,name FROM budget_versions WHERE tenant_id=? AND status='Aprovado' AND fiscal_year=? ORDER BY approved_at DESC LIMIT 1",
      )
      .bind(tenant, Number(period.slice(0,4)))
      .first<{ id: string; name: string }>();
    const classificationQuery =
      "SELECT COALESCE(l.classification,'Outro') classification,SUM(e.amount_minor) total FROM performance_entries e LEFT JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE e.tenant_id=? AND e.scenario=? AND e.period=? AND e.currency=? AND (? IS NULL OR e.organization_id=?)";
    const [actualRows, budgetRows] = await Promise.all([
      db
        .prepare(`${classificationQuery} AND e.version_id IS NULL GROUP BY classification`)
        .bind(tenant, "Actual", period, currency, scope, scope)
        .all<{ classification: string; total: number }>(),
      approvedBudget
        ? db
            .prepare(`${classificationQuery} AND e.version_id=? GROUP BY classification`)
            .bind(tenant, "Budget", period, currency, scope, scope, approvedBudget.id)
            .all<{ classification: string; total: number }>()
        : Promise.resolve({ results: [] as { classification: string; total: number }[] }),
    ]);
    const rubrics = await db.prepare("SELECT e.line_code code,COALESCE(l.name,MAX(e.line_name)) name,COALESCE(l.classification,'Outro') classification,SUM(CASE WHEN e.scenario='Actual' AND e.version_id IS NULL THEN e.amount_minor ELSE 0 END) actual,SUM(CASE WHEN e.scenario='Budget' AND e.version_id=? THEN e.amount_minor ELSE 0 END) budget,COUNT(DISTINCT e.source) sourceCount FROM performance_entries e LEFT JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE e.tenant_id=? AND e.period=? AND e.currency=? AND (? IS NULL OR e.organization_id=?) AND ((e.scenario='Actual' AND e.version_id IS NULL) OR (e.scenario='Budget' AND e.version_id=?)) GROUP BY e.line_code,l.name,l.classification ORDER BY e.line_code").bind(approvedBudget?.id||"",tenant,period,currency,scope,scope,approvedBudget?.id||"").all();
    const sum = (
      rows: { classification: string; total: number }[],
      cls: string,
    ) => rows.find((r) => r.classification === cls)?.total ?? 0;
    // Sign-agnostic on purpose: a mapped import line can store costs as
    // negative (per its financial_line_catalog sign_mode), but a manually
    // typed /api/performance entry has no sign convention at all — abs()
    // makes "revenue minus the size of costs" correct either way.
    const net = (rows: { classification: string; total: number }[]) =>
      sum(rows, "Receita") - Math.abs(sum(rows, "Custo"));
    return Response.json({
      period,
      currency,
      rubrics: rubrics.results,
      hasData: Boolean(anyData),
      hasPeriodData: actualRows.results.length > 0,
      hasBudget: budgetRows.results.length > 0,
      budgetVersionName: approvedBudget?.name ?? null,
      actual: {
        revenue: sum(actualRows.results, "Receita"),
        costs: sum(actualRows.results, "Custo"),
        net: net(actualRows.results),
        classifications: actualRows.results,
      },
      budget: {
        revenue: sum(budgetRows.results, "Receita"),
        costs: sum(budgetRows.results, "Custo"),
        net: net(budgetRows.results),
        classifications: budgetRows.results,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

