import type { D1Database, D1PreparedStatement } from "../worker-configuration";
import { parseMoneyMinor } from "../lib/money";
import {
  composeMonthlyValues,
  periodAdd,
  type Assumption,
  type AssumptionMethod,
} from "../lib/budget-drivers";
import { buildCatalogTree, type FinancialLineRow } from "./financial-line-catalog";

type Security = { tenantId: string; organizationId: string | null; email: string; role: string };
const uid = () => crypto.randomUUID();

// The methods the worker will actually let a new/updated assumption use.
// Percentagem/Historico are schema-ready (see 0079's CHECK constraint) but
// not operational yet — Fase 3 — so they are rejected here with a clear
// message rather than silently accepted and never computed.
const OPERATIONAL_METHODS: AssumptionMethod[] = [
  "Manual",
  "QuantidadePreco",
  "Crescimento",
  "Sazonalidade",
  "Contrato",
];
const PERIODICITIES = ["Mensal", "Trimestral", "Anual", "Pontual"];

function fiscalYearPeriods(fiscalYear: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${fiscalYear}-${String(i + 1).padStart(2, "0")}`);
}

type SnapshotLineRow = {
  id: string; // = the live financial_line_catalog.id, so assumption/monthly joins keep working
  code: string;
  name: string;
  parent_code: string | null;
  level: number;
  display_order: number;
  classification: string;
  cash_flow_category: string;
  sign_mode: string;
  line_kind: string;
  hidden: number;
};

// Approved-version rows don't carry a parent_id (the snapshot only knows
// the parent's *code*, taken at approval time), so nesting is resolved here
// by code instead — against this same frozen set, never the live catalog.
function snapshotRowsToLineRows(rows: SnapshotLineRow[]): FinancialLineRow[] {
  const idByCode = new Map(rows.map((row) => [row.code, row.id]));
  return rows.map((row) => ({
    id: row.id,
    tenant_id: "",
    code: row.code,
    name: row.name,
    classification: row.classification,
    cash_flow_category: row.cash_flow_category,
    sign_mode: row.sign_mode,
    status: "Ativa",
    parent_id: row.parent_code ? idByCode.get(row.parent_code) || null : null,
    level: row.level,
    display_order: row.display_order,
    hidden: row.hidden,
    line_kind: row.line_kind,
    source_type: "Manual",
    manual_adjustment_allowed: 1,
    description: "",
    formula_expression: null,
    template_id: null,
    created_by: "",
    created_at: "",
  }));
}

// Called once, at the moment a version is approved (see approveBudget in
// worker/index.ts). Walks, in the *live* catalog, from every rubrica that
// has a Budget entry in this version up through its ancestors, and freezes
// each one's structural fields (name/hierarchy/classification/kind) into
// budget_version_line_snapshots. A later rename, reclassify or reparent in
// financial_line_catalog can then never change how this version's totals
// group or add up — budgetAnnualMapSnapshot reads from this frozen set,
// never the live catalog, once the version is Aprovado.
export async function buildApprovalLineSnapshotStatements(
  db: D1Database,
  tenantId: string,
  versionId: string,
): Promise<D1PreparedStatement[]> {
  const usedCodes = await db
    .prepare(
      "SELECT DISTINCT line_code FROM performance_entries WHERE tenant_id=? AND scenario='Budget' AND version_id=?",
    )
    .bind(tenantId, versionId)
    .all<{ line_code: string }>();
  if (!usedCodes.results.length) return [];
  const allLines = await db
    .prepare(
      "SELECT id,code,name,parent_id,level,display_order,classification,cash_flow_category,sign_mode,line_kind,hidden FROM financial_line_catalog WHERE tenant_id=?",
    )
    .bind(tenantId)
    .all<{
      id: string;
      code: string;
      name: string;
      parent_id: string | null;
      level: number;
      display_order: number;
      classification: string;
      cash_flow_category: string;
      sign_mode: string;
      line_kind: string;
      hidden: number;
    }>();
  const byCode = new Map(allLines.results.map((line) => [line.code, line]));
  const byId = new Map(allLines.results.map((line) => [line.id, line]));
  const toSnapshot = new Map<string, (typeof allLines.results)[number]>();
  for (const { line_code } of usedCodes.results) {
    let current = byCode.get(line_code);
    while (current && !toSnapshot.has(current.code)) {
      toSnapshot.set(current.code, current);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
  }
  const now = new Date().toISOString();
  return Array.from(toSnapshot.values()).map((line) => {
    const parent = line.parent_id ? byId.get(line.parent_id) : undefined;
    return db
      .prepare(
        "INSERT OR IGNORE INTO budget_version_line_snapshots (id,tenant_id,version_id,line_id,code,name,parent_code,level,display_order,classification,cash_flow_category,sign_mode,line_kind,hidden,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        uid(),
        tenantId,
        versionId,
        line.id,
        line.code,
        line.name,
        parent ? parent.code : null,
        line.level,
        line.display_order,
        line.classification,
        line.cash_flow_category,
        line.sign_mode,
        line.line_kind,
        line.hidden,
        now,
      );
  });
}

async function requireDraftVersion(db: D1Database, tenantId: string, versionId: string) {
  const version = await db
    .prepare("SELECT id,fiscal_year,status FROM budget_versions WHERE id=? AND tenant_id=?")
    .bind(versionId, tenantId)
    .first<{ id: string; fiscal_year: number; status: string }>();
  if (!version) return { error: Response.json({ error: "Versão orçamental não encontrada." }, { status: 404 }) };
  if (version.status !== "Rascunho")
    return {
      error: Response.json(
        { error: "A versão está aprovada e é completamente imutável." },
        { status: 409 },
      ),
    };
  return { version };
}

export async function budgetAnnualMapSnapshot(
  db: D1Database,
  tenantId: string,
  params: {
    versionId: string | null;
    organizationId: string | null;
    dimensionMemberId: string | null;
    currency: string;
  },
) {
  const [organizations, members, versions] = await Promise.all([
    db
      .prepare("SELECT id,name,code,currency FROM organizations WHERE tenant_id=? AND status='Ativa' ORDER BY name")
      .bind(tenantId)
      .all(),
    db
      .prepare(
        "SELECT m.id,m.name,m.code,d.name AS dimension_name FROM dimension_members m JOIN financial_dimensions d ON d.id=m.dimension_id WHERE m.tenant_id=? AND m.status='Ativo' ORDER BY d.name,m.code",
      )
      .bind(tenantId)
      .all(),
    db
      .prepare("SELECT id,name,fiscal_year,status FROM budget_versions WHERE tenant_id=? ORDER BY fiscal_year DESC,created_at DESC")
      .bind(tenantId)
      .all<{ id: string; name: string; fiscal_year: number; status: string }>(),
  ]);
  // The client doesn't always know a versionId up front (e.g. on first
  // load) — fall back to the tenant's most recent version so the grid has
  // something to show without a separate round trip just to list versions.
  const versionId = params.versionId || versions.results[0]?.id || null;
  if (!versionId)
    return {
      version: null,
      periods: [],
      tree: [],
      organizations: organizations.results,
      members: members.results,
      versions: versions.results,
    };
  const version = await db
    .prepare("SELECT * FROM budget_versions WHERE id=? AND tenant_id=?")
    .bind(versionId, tenantId)
    .first<{ id: string; name: string; fiscal_year: number; status: string }>();
  if (!version) return { error: "Versão orçamental não encontrada." };
  const periods = fiscalYearPeriods(version.fiscal_year);
  const isApproved = version.status === "Aprovado";
  const [lines, entries, assumptions] = await Promise.all([
    isApproved
      ? db
          .prepare(
            "SELECT line_id AS id,code,name,parent_code,level,display_order,classification,cash_flow_category,sign_mode,line_kind,hidden FROM budget_version_line_snapshots WHERE tenant_id=? AND version_id=? ORDER BY level,display_order,code",
          )
          .bind(tenantId, versionId)
          .all<SnapshotLineRow>()
      : db
          .prepare("SELECT * FROM financial_line_catalog WHERE tenant_id=? ORDER BY level,display_order,code")
          .bind(tenantId)
          .all<FinancialLineRow>(),
    db
      .prepare(
        "SELECT line_code,period,amount_minor,manual_override FROM performance_entries WHERE tenant_id=? AND scenario='Budget' AND version_id=? AND currency=? AND (? IS NULL OR organization_id=?) AND (? IS NULL OR dimension_member_id=?) AND period BETWEEN ? AND ?",
      )
      .bind(
        tenantId,
        versionId,
        params.currency,
        params.organizationId,
        params.organizationId,
        params.dimensionMemberId,
        params.dimensionMemberId,
        periods[0],
        periods[11],
      )
      .all<{ line_code: string; period: string; amount_minor: number; manual_override: number }>(),
    db
      .prepare(
        "SELECT * FROM budget_assumptions WHERE tenant_id=? AND version_id=? AND (? IS NULL OR organization_id=?) AND (? IS NULL OR dimension_member_id=?) ORDER BY precedence",
      )
      .bind(
        tenantId,
        versionId,
        params.organizationId,
        params.organizationId,
        params.dimensionMemberId,
        params.dimensionMemberId,
      )
      .all<Record<string, unknown>>(),
  ]);
  const entriesByLine = new Map<string, { period: string; amountMinor: number; manualOverride: boolean }[]>();
  for (const row of entries.results) {
    const list = entriesByLine.get(row.line_code) || [];
    list.push({ period: row.period, amountMinor: row.amount_minor, manualOverride: !!row.manual_override });
    entriesByLine.set(row.line_code, list);
  }
  const assumptionsByLine = new Map<string, Record<string, unknown>[]>();
  for (const row of assumptions.results) {
    const list = assumptionsByLine.get(String(row.line_id)) || [];
    list.push(row);
    assumptionsByLine.set(String(row.line_id), list);
  }
  const lineRows: FinancialLineRow[] = isApproved
    ? snapshotRowsToLineRows(lines.results as unknown as SnapshotLineRow[])
    : (lines.results as FinancialLineRow[]);
  const rows: (FinancialLineRow & {
    monthly: { period: string; amountMinor: number; manualOverride: boolean }[];
    automatic: number[] | null;
    assumptions: Record<string, unknown>[];
  })[] = lineRows.map((line) => {
    const monthlyByPeriod = new Map((entriesByLine.get(line.code) || []).map((m) => [m.period, m]));
    const monthly = periods.map(
      (period) => monthlyByPeriod.get(period) || { period, amountMinor: 0, manualOverride: false },
    );
    const lineAssumptions = assumptionsByLine.get(line.id) || [];
    const asAssumption: Assumption[] = lineAssumptions.map((a) => ({
      method: a.method as AssumptionMethod,
      status: a.status as "Ativo" | "Inativo",
      precedence: Number(a.precedence),
      params: JSON.parse(String(a.params || "{}")),
    }));
    let automatic: number[] | null = null;
    try {
      automatic = composeMonthlyValues(periods, asAssumption);
    } catch {
      automatic = null;
    }
    return { ...line, monthly, automatic, assumptions: lineAssumptions };
  });
  return {
    version,
    periods,
    tree: buildCatalogTree(rows as unknown as FinancialLineRow[]),
    organizations: organizations.results,
    members: members.results,
    versions: versions.results,
  };
}

export async function batchSaveBudgetCells(
  db: D1Database,
  tenantId: string,
  actor: string,
  input: {
    versionId: string;
    organizationId: string;
    cells: {
      code: string;
      lineName: string;
      dimensionMemberId: string | null;
      period: string;
      currency: string;
      amount: string;
      manualOverride?: boolean;
    }[];
  },
) {
  const draft = await requireDraftVersion(db, tenantId, input.versionId);
  if (draft.error) return draft.error;
  if (!(await db.prepare("SELECT id FROM organizations WHERE id=? AND tenant_id=?").bind(input.organizationId, tenantId).first()))
    return Response.json({ error: "Organização inválida." }, { status: 400 });
  if (!input.cells.length) return Response.json({ error: "Nenhuma célula para gravar." }, { status: 400 });
  for (const cell of input.cells)
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(cell.period) || !cell.code?.trim() || !cell.currency?.match(/^[A-Za-z]{3}$/))
      return Response.json({ error: "Célula orçamental inválida." }, { status: 400 });
  const existing = await db
    .prepare(
      "SELECT id,line_code,period,dimension_member_id FROM performance_entries WHERE tenant_id=? AND scenario='Budget' AND version_id=? AND organization_id=?",
    )
    .bind(tenantId, input.versionId, input.organizationId)
    .all<{ id: string; line_code: string; period: string; dimension_member_id: string | null }>();
  const existingByKey = new Map(
    existing.results.map((row) => [`${row.line_code}|${row.period}|${row.dimension_member_id || ""}`, row.id]),
  );
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const cell of input.cells) {
    const code = cell.code.trim().toUpperCase(),
      key = `${code}|${cell.period}|${cell.dimensionMemberId || ""}`,
      amountMinor = parseMoneyMinor(cell.amount),
      manualOverride = cell.manualOverride ? 1 : 0,
      existingId = existingByKey.get(key);
    if (existingId)
      statements.push(
        db
          .prepare(
            "UPDATE performance_entries SET amount_minor=?,line_name=?,manual_override=? WHERE id=? AND tenant_id=?",
          )
          .bind(amountMinor, cell.lineName.trim(), manualOverride, existingId, tenantId),
      );
    else
      statements.push(
        db
          .prepare(
            "INSERT INTO performance_entries (id,tenant_id,organization_id,period,scenario,version_id,currency,line_code,line_name,dimension_member_id,amount_minor,source,created_at,manual_override) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            uid(),
            tenantId,
            input.organizationId,
            cell.period,
            "Budget",
            input.versionId,
            cell.currency.toUpperCase(),
            code,
            cell.lineName.trim(),
            cell.dimensionMemberId || null,
            amountMinor,
            "Mapa anual",
            now,
            manualOverride,
          ),
      );
  }
  await db.batch(statements);
  return Response.json({ saved: statements.length });
}

export async function createOrUpdateAssumption(
  db: D1Database,
  tenantId: string,
  actor: string,
  body: Record<string, unknown>,
) {
  const method = String(body.method || "");
  if (!OPERATIONAL_METHODS.includes(method as AssumptionMethod))
    return Response.json(
      { error: `O método '${method}' ainda não está disponível nesta fase.` },
      { status: 400 },
    );
  const versionId = String(body.versionId || "");
  const draft = await requireDraftVersion(db, tenantId, versionId);
  if (draft.error) return draft.error;
  const lineId = String(body.lineId || ""),
    organizationId = String(body.organizationId || ""),
    currency = String(body.currency || ""),
    dimensionMemberId = body.dimensionMemberId ? String(body.dimensionMemberId) : null,
    periodicity = body.periodicity ? String(body.periodicity) : null,
    precedence = Number.isInteger(Number(body.precedence)) ? Number(body.precedence) : 0,
    status = body.status === "Inativo" ? "Inativo" : "Ativo";
  if (!lineId || !organizationId || !currency?.match(/^[A-Za-z]{3}$/))
    return Response.json({ error: "Rubrica, empresa e moeda são obrigatórias." }, { status: 400 });
  if (periodicity && !PERIODICITIES.includes(periodicity))
    return Response.json({ error: "Periodicidade inválida." }, { status: 400 });
  let params: string;
  try {
    params = JSON.stringify(body.params ?? {});
  } catch {
    return Response.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }
  const now = new Date().toISOString();
  if (body.id) {
    const result = await db
      .prepare(
        "UPDATE budget_assumptions SET method=?,status=?,precedence=?,periodicity=?,params=?,updated_at=? WHERE id=? AND tenant_id=? AND version_id=?",
      )
      .bind(method, status, precedence, periodicity, params, now, String(body.id), tenantId, versionId)
      .run();
    if (!result.meta.changes)
      return Response.json({ error: "Pressuposto não encontrado." }, { status: 404 });
    return Response.json({ id: body.id });
  }
  const id = uid();
  try {
    await db
      .prepare(
        "INSERT INTO budget_assumptions (id,tenant_id,version_id,line_id,organization_id,dimension_member_id,currency,method,status,precedence,periodicity,params,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        tenantId,
        versionId,
        lineId,
        organizationId,
        dimensionMemberId,
        currency.toUpperCase(),
        method,
        status,
        precedence,
        periodicity,
        params,
        actor,
        now,
        now,
      )
      .run();
  } catch {
    return Response.json({ error: "Pressuposto inválido para esta rubrica/empresa." }, { status: 400 });
  }
  return Response.json({ id });
}

export async function deleteAssumption(db: D1Database, tenantId: string, id: string) {
  const row = await db
    .prepare("SELECT version_id FROM budget_assumptions WHERE id=? AND tenant_id=?")
    .bind(id, tenantId)
    .first<{ version_id: string }>();
  if (!row) return Response.json({ error: "Pressuposto não encontrado." }, { status: 404 });
  const draft = await requireDraftVersion(db, tenantId, row.version_id);
  if (draft.error) return draft.error;
  await db.prepare("DELETE FROM budget_assumptions WHERE id=? AND tenant_id=?").bind(id, tenantId).run();
  return Response.json({ deleted: true });
}

export async function recalculateLine(
  db: D1Database,
  tenantId: string,
  input: {
    versionId: string;
    lineId: string;
    organizationId: string;
    dimensionMemberId: string | null;
    currency: string;
  },
) {
  const draft = await requireDraftVersion(db, tenantId, input.versionId);
  if (draft.error) return draft.error;
  const version = draft.version!;
  const line = await db
    .prepare("SELECT code,name FROM financial_line_catalog WHERE id=? AND tenant_id=?")
    .bind(input.lineId, tenantId)
    .first<{ code: string; name: string }>();
  if (!line) return Response.json({ error: "Rubrica não encontrada." }, { status: 404 });
  const assumptionRows = await db
    .prepare(
      "SELECT method,status,precedence,params FROM budget_assumptions WHERE tenant_id=? AND version_id=? AND line_id=? AND organization_id=? AND (? IS NULL OR dimension_member_id=?)",
    )
    .bind(tenantId, input.versionId, input.lineId, input.organizationId, input.dimensionMemberId, input.dimensionMemberId)
    .all<{ method: string; status: string; precedence: number; params: string }>();
  const periods = fiscalYearPeriods(version.fiscal_year);
  const assumptions: Assumption[] = assumptionRows.results.map((a) => ({
    method: a.method as AssumptionMethod,
    status: a.status as "Ativo" | "Inativo",
    precedence: a.precedence,
    params: JSON.parse(a.params || "{}"),
  }));
  let computed: number[] | null;
  try {
    computed = composeMonthlyValues(periods, assumptions);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Não foi possível calcular os pressupostos." },
      { status: 400 },
    );
  }
  if (!computed) return Response.json({ updated: 0 });
  const existing = await db
    .prepare(
      "SELECT id,period,manual_override FROM performance_entries WHERE tenant_id=? AND scenario='Budget' AND version_id=? AND organization_id=? AND line_code=? AND currency=? AND (? IS NULL OR dimension_member_id=?)",
    )
    .bind(tenantId, input.versionId, input.organizationId, line.code, input.currency, input.dimensionMemberId, input.dimensionMemberId)
    .all<{ id: string; period: string; manual_override: number }>();
  const existingByPeriod = new Map(existing.results.map((row) => [row.period, row]));
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let updated = 0;
  for (let i = 0; i < periods.length; i++) {
    const period = periods[i],
      found = existingByPeriod.get(period);
    if (found?.manual_override) continue; // ajuste manual protegido — nunca recalculado silenciosamente
    updated += 1;
    if (found)
      statements.push(
        db
          .prepare("UPDATE performance_entries SET amount_minor=? WHERE id=? AND tenant_id=?")
          .bind(computed[i], found.id, tenantId),
      );
    else
      statements.push(
        db
          .prepare(
            "INSERT INTO performance_entries (id,tenant_id,organization_id,period,scenario,version_id,currency,line_code,line_name,dimension_member_id,amount_minor,source,created_at,manual_override) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0)",
          )
          .bind(
            uid(),
            tenantId,
            input.organizationId,
            period,
            "Budget",
            input.versionId,
            input.currency.toUpperCase(),
            line.code,
            line.name,
            input.dimensionMemberId || null,
            computed[i],
            "Motor de pressupostos",
            now,
          ),
      );
  }
  if (statements.length) await db.batch(statements);
  return Response.json({ updated });
}
