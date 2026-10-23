import type { D1Database } from "../worker-configuration";

const uid = () => crypto.randomUUID();

export type FinancialLineRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  classification: string;
  cash_flow_category: string;
  sign_mode: string;
  status: string;
  parent_id: string | null;
  level: number;
  display_order: number;
  hidden: number;
  line_kind: string;
  source_type: string;
  manual_adjustment_allowed: number;
  description: string;
  formula_expression: string | null;
  template_id: string | null;
  created_by: string;
  created_at: string;
};

export type CatalogTreeNode = FinancialLineRow & { children: CatalogTreeNode[] };

// Fase 3.2 unificação: before the Universal Line Catalog existed, HR cost
// dashboards (HR Manager Suite, Cockpit CFO, Analytics) compared Actual vs.
// Budget personnel cost using the fixed literal line_code='WORKFORCE'. That
// Actual side is still fed correctly by the payroll-run transfer (untouched
// here); but nothing in real tenant use ever wrote a Budget-side
// 'WORKFORCE' row, since the Mapa Orçamental Anual and the RH integration
// both post to real Catálogo Universal rubricas instead. Rather than making
// the RH adapter write to the legacy code too (which the user explicitly
// ruled out, to avoid a second, competing definition of "custo de
// pessoal"), this subquery expands the read side: it resolves to whichever
// rubricas the tenant has actually configured as RH-integration targets
// (financial_line_catalog_mappings, source_module='RH', status='Ativo'),
// UNIONed with the legacy literal for historical/demo data that predates
// catalog adoption. The two sets cannot double-count the same cell: a given
// performance_entries row has exactly one line_code, and nothing (going
// forward) writes Budget-scenario 'WORKFORCE' rows any more.
//
// 4 positional binds, in this order: tenantId, tenantId, scopeOrganizationId
// (nullable), scopeOrganizationId (nullable, repeated for the IS NULL OR
// pattern already used throughout this codebase).
export const PERSONNEL_COST_LINE_CODES_SUBQUERY =
  "(SELECT code FROM financial_line_catalog WHERE tenant_id=? AND id IN (SELECT line_id FROM financial_line_catalog_mappings WHERE tenant_id=? AND source_module='RH' AND status='Ativo' AND (? IS NULL OR organization_id=?)) AND NOT EXISTS(SELECT 1 FROM budget_version_line_snapshots s WHERE s.tenant_id=performance_entries.tenant_id AND s.version_id=performance_entries.version_id AND s.personnel_organizations_json IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM budget_integration_values v WHERE v.tenant_id=performance_entries.tenant_id AND v.version_id=performance_entries.version_id AND v.source_module='RH') UNION SELECT s.code FROM budget_version_line_snapshots s WHERE s.tenant_id=performance_entries.tenant_id AND s.version_id=performance_entries.version_id AND (EXISTS(SELECT 1 FROM json_each(s.personnel_organizations_json) WHERE value=performance_entries.organization_id) OR (s.personnel_organizations_json IS NULL AND EXISTS(SELECT 1 FROM budget_integration_values v WHERE v.tenant_id=s.tenant_id AND v.version_id=s.version_id AND v.line_id=s.line_id AND v.organization_id=performance_entries.organization_id AND v.source_module='RH'))) UNION SELECT 'WORKFORCE')";

// Nests the flat, tenant-scoped rows into a tree by parent_id. Rows whose
// parent_id does not resolve within the given set (should not happen once
// the hierarchy guard triggers are in place, but a defensive read-side
// fallback costs nothing) are surfaced as additional roots rather than
// silently dropped.
export function buildCatalogTree(rows: FinancialLineRow[]): CatalogTreeNode[] {
  const byId = new Map<string, CatalogTreeNode>();
  for (const row of rows) byId.set(row.id, { ...row, children: [] });
  const roots: CatalogTreeNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    const parent = row.parent_id ? byId.get(row.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortTree = (nodes: CatalogTreeNode[]) => {
    nodes.sort((a, b) => a.display_order - b.display_order);
    for (const node of nodes) sortTree(node.children);
  };
  sortTree(roots);
  return roots;
}

// Adopting the universal reference library is a one-time copy, never a
// live sync: a code already present for this tenant (whether it was
// adopted before, or the tenant created it independently with the same
// code) is reused as the attachment point for its children and is never
// overwritten — so re-running this, or running it after the tenant has
// customised what it already adopted, can only ever add rows, never
// change existing ones.
export async function adoptLineCatalogTemplate(
  db: D1Database,
  tenantId: string,
  actor: string,
): Promise<{ adopted: number; reused: number }> {
  const templates = (
    await db
      .prepare(
        "SELECT * FROM financial_line_catalog_templates ORDER BY level,display_order",
      )
      .all<{
        id: string;
        code: string;
        name: string;
        classification: string;
        cash_flow_category: string;
        sign_mode: string;
        line_kind: string;
        parent_id: string | null;
        level: number;
        display_order: number;
        description: string;
      }>()
  ).results;
  const templateIdToLineId = new Map<string, string>();
  let adopted = 0,
    reused = 0;
  const createdAt = new Date().toISOString();
  for (const template of templates) {
    const existing = await db
      .prepare(
        "SELECT id FROM financial_line_catalog WHERE tenant_id=? AND (template_id=? OR code=?)",
      )
      .bind(tenantId, template.id, template.code)
      .first<{ id: string }>();
    if (existing) {
      templateIdToLineId.set(template.id, existing.id);
      reused += 1;
      continue;
    }
    const id = uid();
    const parentId = template.parent_id
      ? templateIdToLineId.get(template.parent_id) || null
      : null;
    await db
      .prepare(
        "INSERT INTO financial_line_catalog (id,tenant_id,code,name,classification,cash_flow_category,sign_mode,status,created_by,created_at,parent_id,level,display_order,hidden,line_kind,source_type,manual_adjustment_allowed,description,template_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        tenantId,
        template.code,
        template.name,
        template.classification,
        template.cash_flow_category,
        template.sign_mode,
        "Ativa",
        actor,
        createdAt,
        parentId,
        template.level,
        template.display_order,
        0,
        template.line_kind,
        "Manual",
        1,
        template.description,
        template.id,
      )
      .run();
    templateIdToLineId.set(template.id, id);
    adopted += 1;
  }
  return { adopted, reused };
}

export type CatalogTotalsScope = {
  organizationId: string | null;
  period: string;
  currency: string;
  scenario: "Actual" | "Budget";
  versionId?: string | null;
};

export type CatalogTotal = {
  id: string;
  code: string;
  name: string;
  level: number;
  directMinor: number;
  totalMinor: number;
};

// Read-only rollup over the EXISTING performance_entries data: each leaf's
// direct postings are counted exactly once, at that leaf, and every
// ancestor's total is the sum of its descendants — an aggregation node is
// never itself summed into its own parent twice, because it has no direct
// postings of its own to begin with (by convention: Fase 1 does not gate
// performance_entries writes, so this rollup is additive/demonstrative,
// not a replacement for any existing dashboard).
export async function catalogTotals(
  db: D1Database,
  tenantId: string,
  scope: CatalogTotalsScope,
): Promise<CatalogTotal[]> {
  const rows = (
    await db
      .prepare(
        "SELECT id,code,name,parent_id,level FROM financial_line_catalog WHERE tenant_id=? ORDER BY level,display_order",
      )
      .bind(tenantId)
      .all<{ id: string; code: string; name: string; parent_id: string | null; level: number }>()
  ).results;
  const entries = (
    await db
      .prepare(
        "SELECT line_code,SUM(amount_minor) total FROM performance_entries WHERE tenant_id=? AND (? IS NULL OR organization_id=?) AND period=? AND currency=? AND scenario=? AND (?<>'Budget' OR version_id=?) GROUP BY line_code",
      )
      .bind(
        tenantId,
        scope.organizationId,
        scope.organizationId,
        scope.period,
        scope.currency,
        scope.scenario,
        scope.scenario,
        scope.versionId || null,
      )
      .all<{ line_code: string; total: number }>()
  ).results;
  const directByCode = new Map<string, number>();
  for (const entry of entries) directByCode.set(entry.line_code, Number(entry.total) || 0);
  const directById = new Map<string, number>();
  const childrenById = new Map<string, string[]>();
  for (const row of rows) {
    directById.set(row.id, directByCode.get(row.code) || 0);
    if (row.parent_id) {
      const siblings = childrenById.get(row.parent_id) || [];
      siblings.push(row.id);
      childrenById.set(row.parent_id, siblings);
    }
  }
  const totalCache = new Map<string, number>();
  const rollup = (id: string): number => {
    const cached = totalCache.get(id);
    if (cached !== undefined) return cached;
    const own = directById.get(id) || 0;
    const children = childrenById.get(id) || [];
    const total = own + children.reduce((sum, childId) => sum + rollup(childId), 0);
    totalCache.set(id, total);
    return total;
  };
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    level: row.level,
    directMinor: directById.get(row.id) || 0,
    totalMinor: rollup(row.id),
  }));
}

// level is a denormalised convenience column (so a plain ORDER BY level
// works without a recursive query) — reparenting a branch can change the
// depth of everything under it, so this keeps every descendant's stored
// level honest after a move. Walks the subtree breadth-first with plain
// queries rather than a recursive CTE, since it also has to WRITE each
// level as it goes.
export async function recomputeSubtreeLevels(
  db: D1Database,
  tenantId: string,
  rootId: string,
  rootLevel: number,
): Promise<void> {
  let frontier = [{ id: rootId, level: rootLevel }];
  while (frontier.length) {
    const next: { id: string; level: number }[] = [];
    for (const node of frontier) {
      const children = (
        await db
          .prepare(
            "SELECT id FROM financial_line_catalog WHERE tenant_id=? AND parent_id=?",
          )
          .bind(tenantId, node.id)
          .all<{ id: string }>()
      ).results;
      for (const child of children) next.push({ id: child.id, level: node.level + 1 });
    }
    for (const child of next)
      await db
        .prepare(
          "UPDATE financial_line_catalog SET level=? WHERE tenant_id=? AND id=?",
        )
        .bind(child.level, tenantId, child.id)
        .run();
    frontier = next;
  }
}

// A duplicated rubrica is a fully independent row from the moment it is
// created: editing the copy never touches the original, and vice-versa.
export function duplicateLineValues(
  source: FinancialLineRow,
  newCode: string,
  newName: string,
) {
  return {
    code: newCode,
    name: newName,
    classification: source.classification,
    cash_flow_category: source.cash_flow_category,
    sign_mode: source.sign_mode,
    parent_id: source.parent_id,
    level: source.level,
    display_order: source.display_order,
    line_kind: source.line_kind,
    source_type: source.source_type,
    manual_adjustment_allowed: source.manual_adjustment_allowed,
    description: source.description,
  };
}
