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
  try {
    const tenant = security.tenantId,
      scope = security.organizationId,
      url = new URL(request.url),
      selected = url.searchParams.get("batch") || "",
      now = new Date().toISOString();
    const snapshot = async () => {
      const [lines, mappings, batches, rows, organizations, members, audit] =
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
        ]);
      return {
        lines: lines.results,
        mappings: mappings.results,
        batches: batches.results,
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
    if (body.type === "createLine") {
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
          "INSERT INTO financial_line_catalog VALUES (?,?,?,?,?,?,?,?,?,?,?)",
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
          amount = Math.round(
            Number(String(input[i].amount ?? "").replace(",", ".")) * 100,
          );
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
      const inputHash = await sha(JSON.stringify(prepared)),
        total = prepared.reduce((n, x) => n + Number(x.amount), 0),
        statements = [
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
      if (
        String(batch.created_by).toLowerCase() === security.email.toLowerCase()
      )
        return Response.json(
          {
            error:
              "Maker-checker: o autor do lote não pode publicá-lo no Actual.",
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
