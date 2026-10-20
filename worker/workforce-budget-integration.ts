// Fase 3.2 — adaptador RH sobre o Motor Comum de Integração (budget-integration.ts).
//
// Este ficheiro não lê nem escreve nada que o Motor Comum (0081) e o
// Planeamento de Pessoal (0029) já não suportem. A única peça nova é a
// orquestração: resolver um plano de pessoal aprovado em SourceValue[],
// agrupados por dimensão financeira, e gerir um mapeamento por grupo
// (financial_line_catalog_mappings só suporta UMA dimensão por mapeamento —
// ver 0081 — pelo que orçamentar por departamento exige um mapeamento por
// departamento resolvido, não um único mapeamento "do plano").
//
// Por decisão explícita do utilizador, não existe nenhuma correspondência
// automática entre department_code e dimension_members: um código só entra
// na sincronização depois de uma decisão humana registada em
// workforce_department_dimension_decisions (0082). Uma linha sem
// department_code (não um código desconhecido — a ausência de departamento)
// é tratada como pertencendo à célula ao nível da empresa, sem decisão
// necessária, por não haver ali nenhuma ambiguidade a resolver.
import type { D1Database } from "../worker-configuration";
import { classifyDataError } from "../lib/api-error";
import {
  createMapping,
  setMappingStatus,
  checkForUpdates,
  applyMapping,
  type SourceValue,
} from "./budget-integration";

const uid = () => crypto.randomUUID();

// financial_line_catalog_mappings still carries its original Fase 1
// constraint UNIQUE(tenant_id,line_id,source_module,source_reference) — a
// table-rebuild-only SQLite autoindex this additive-only project cannot
// drop. One RH integration legitimately needs several mappings that share
// the same line_id/source_module/plan (one per resolved department), so
// source_reference encodes the dimension into the plan id rather than
// repeating it bare — distinct per mapping, while still starting with the
// real plan id for traceability and for recovering it on read.
const PLAN_SOURCE_REFERENCE_SEPARATOR = "::";
function encodePlanSourceReference(planId: string, dimensionKey: string): string {
  return dimensionKey ? `${planId}${PLAN_SOURCE_REFERENCE_SEPARATOR}${dimensionKey}` : planId;
}
function planIdFromSourceReference(sourceReference: string): string {
  const i = sourceReference.indexOf(PLAN_SOURCE_REFERENCE_SEPARATOR);
  return i === -1 ? sourceReference : sourceReference.slice(0, i);
}

type PlanRow = {
  id: string;
  tenant_id: string;
  organization_id: string;
  name: string;
  currency: string;
  start_period: string;
  end_period: string;
  version_number: number;
  status: string;
  approved_at: string | null;
};

type PlanLineRow = {
  id: string;
  plan_id: string;
  job_title: string;
  department_code: string | null;
  period: string;
  headcount: number;
  monthly_cost_minor: number;
  movement_type: string;
};

async function jsonOf<T>(response: Response): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  if (response.status >= 400) return { ok: false, response };
  return { ok: true, data: (await response.json()) as T };
}

// scopeOrganizationId is the caller's security-context organization scope
// (null for a holding-level user allowed across every company). It is
// always authoritative over whatever organizationId a request body or
// query string claims — a plan belonging to another company under the
// same tenant must 404, not merely be filtered out somewhere downstream.
async function requireApprovedPlan(db: D1Database, tenantId: string, scopeOrganizationId: string | null, planId: string) {
  const plan = await db
    .prepare("SELECT * FROM workforce_plans WHERE id=? AND tenant_id=? AND (? IS NULL OR organization_id=?)")
    .bind(planId, tenantId, scopeOrganizationId, scopeOrganizationId)
    .first<PlanRow>();
  if (!plan) return { error: Response.json({ error: "Plano de pessoal não encontrado." }, { status: 404 }) };
  if (plan.status !== "Aprovado")
    return { error: Response.json({ error: "Só um plano de pessoal Aprovado pode alimentar o orçamento." }, { status: 409 }) };
  return { plan };
}

// Distinct department_code values for a plan, each annotated with whatever
// decision already exists for it (reused across every plan, never scoped
// to one), plus the headcount/custo at stake so the UI can show impact
// before asking the user to decide.
export async function workforcePlanDepartments(db: D1Database, tenantId: string, organizationId: string | null, planId: string) {
  const approved = await requireApprovedPlan(db, tenantId, organizationId, planId);
  if (approved.error) return approved.error;
  const rows = await db
    .prepare(
      "SELECT l.department_code,COUNT(*) line_count,SUM(l.headcount) total_headcount,SUM(l.headcount*l.monthly_cost_minor) total_cost_minor,d.decision,d.dimension_member_id,m.name dimension_member_name FROM workforce_plan_lines l LEFT JOIN workforce_department_dimension_decisions d ON d.tenant_id=l.tenant_id AND d.department_code=l.department_code LEFT JOIN dimension_members m ON m.id=d.dimension_member_id WHERE l.tenant_id=? AND l.plan_id=? GROUP BY l.department_code ORDER BY l.department_code",
    )
    .bind(tenantId, planId)
    .all<{
      department_code: string | null;
      line_count: number;
      total_headcount: number;
      total_cost_minor: number;
      decision: string | null;
      dimension_member_id: string | null;
      dimension_member_name: string | null;
    }>();
  return Response.json({ departments: rows.results });
}

export async function recordDepartmentDecision(
  db: D1Database,
  tenantId: string,
  actor: string,
  body: Record<string, unknown>,
) {
  const departmentCode = String(body.departmentCode || "").trim();
  if (!departmentCode) return Response.json({ error: "Código de departamento é obrigatório." }, { status: 400 });
  const decision = body.decision === "SemDimensao" ? "SemDimensao" : body.decision === "Mapeado" ? "Mapeado" : null;
  if (!decision) return Response.json({ error: "Decisão inválida. Use 'Mapeado' ou 'SemDimensao'." }, { status: 400 });
  let dimensionMemberId: string | null = null;
  if (decision === "Mapeado") {
    dimensionMemberId = String(body.dimensionMemberId || "");
    const dim = await db
      .prepare("SELECT id FROM dimension_members WHERE id=? AND tenant_id=? AND status='Ativo'")
      .bind(dimensionMemberId, tenantId)
      .first();
    if (!dim) return Response.json({ error: "Dimensão financeira inválida ou inactiva." }, { status: 400 });
  }
  const now = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO workforce_department_dimension_decisions (id,tenant_id,department_code,decision,dimension_member_id,decided_by,decided_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(tenant_id,department_code) DO UPDATE SET decision=excluded.decision,dimension_member_id=excluded.dimension_member_id,decided_by=excluded.decided_by,decided_at=excluded.decided_at",
    )
    .bind(uid(), tenantId, departmentCode, decision, dimensionMemberId, actor, now)
    .run();
  return Response.json({ ok: true });
}

type SourceGroups = {
  // key "" is the company-wide, no-dimension group (explicit SemDimensao
  // decisions AND lines with no department_code at all converge here).
  groups: Map<string, SourceValue[]>;
  pendingDepartments: { departmentCode: string; lineCount: number; totalCostMinor: number }[];
  plan: PlanRow;
};

// Pure resolution: plan lines -> SourceValue[], grouped by the ONE dimension
// a financial_line_catalog_mappings row can hold. Never mutates anything;
// safe to call for a preview with no mapping created yet.
async function buildWorkforceSourceGroups(db: D1Database, tenantId: string, plan: PlanRow): Promise<SourceGroups> {
  const lines = await db
    .prepare("SELECT * FROM workforce_plan_lines WHERE tenant_id=? AND plan_id=? ORDER BY period,job_title")
    .bind(tenantId, plan.id)
    .all<PlanLineRow>();
  const codes = Array.from(new Set(lines.results.map((l) => l.department_code).filter((c): c is string => !!c)));
  const decisions = codes.length
    ? await db
        .prepare(
          `SELECT department_code,decision,dimension_member_id FROM workforce_department_dimension_decisions WHERE tenant_id=? AND department_code IN (${codes.map(() => "?").join(",")})`,
        )
        .bind(tenantId, ...codes)
        .all<{ department_code: string; decision: string; dimension_member_id: string | null }>()
    : { results: [] as { department_code: string; decision: string; dimension_member_id: string | null }[] };
  const decisionByCode = new Map(decisions.results.map((d) => [d.department_code, d]));

  const groups = new Map<string, SourceValue[]>();
  const addToGroup = (key: string, value: SourceValue) => {
    const bucket = groups.get(key);
    if (bucket) bucket.push(value);
    else groups.set(key, [value]);
  };
  const pendingByCode = new Map<string, { lineCount: number; totalCostMinor: number }>();
  for (const line of lines.results) {
    const totalMinor = line.headcount * line.monthly_cost_minor;
    if (!line.department_code) {
      addToGroup("", sourceValueFor(plan, line, null, totalMinor));
      continue;
    }
    const decision = decisionByCode.get(line.department_code);
    if (!decision) {
      const prior = pendingByCode.get(line.department_code) || { lineCount: 0, totalCostMinor: 0 };
      prior.lineCount++;
      prior.totalCostMinor += totalMinor;
      pendingByCode.set(line.department_code, prior);
      continue;
    }
    const resolvedDimension = decision.decision === "SemDimensao" ? null : decision.dimension_member_id;
    addToGroup(resolvedDimension || "", sourceValueFor(plan, line, resolvedDimension, totalMinor));
  }
  const pendingDepartments = Array.from(pendingByCode.entries()).map(([departmentCode, v]) => ({ departmentCode, ...v }));
  return { groups, pendingDepartments, plan };
}

function sourceValueFor(plan: PlanRow, line: PlanLineRow, dimensionMemberId: string | null, amountMinor: number): SourceValue {
  return {
    organizationId: plan.organization_id,
    sourceModule: "RH",
    sourceReference: line.id,
    componentLabel: `${line.job_title} (${line.movement_type})`,
    period: line.period,
    currency: plan.currency,
    dimensionMemberId,
    financialNature: "Economico",
    amountMinor,
    sourceStatus: plan.status,
    sourceFingerprint: `${line.id}:${amountMinor}`,
  };
}

// Preview before anything is created: monthly totals per group plus the
// departments still blocking a decision. No mapping required.
export async function previewWorkforceIntegration(db: D1Database, tenantId: string, organizationId: string | null, planId: string) {
  const approved = await requireApprovedPlan(db, tenantId, organizationId, planId);
  if (approved.error) return approved.error;
  const { groups, pendingDepartments } = await buildWorkforceSourceGroups(db, tenantId, approved.plan);
  const byDimensionAndPeriod: Record<string, Record<string, number>> = {};
  for (const [dimensionKey, values] of groups) {
    const byPeriod: Record<string, number> = {};
    for (const v of values) byPeriod[v.period] = (byPeriod[v.period] || 0) + v.amountMinor;
    byDimensionAndPeriod[dimensionKey || "(sem dimensão)"] = byPeriod;
  }
  return Response.json({ plan: approved.plan, byDimension: byDimensionAndPeriod, pendingDepartments });
}

// planId, when given, matches every mapping encoded from it regardless of
// which department's dimension suffix it carries (see
// encodePlanSourceReference) — the bare id itself (the no-dimension group)
// or "<planId>::<dimensionKey>" (every per-department group).
async function findActiveRhMappings(db: D1Database, tenantId: string, organizationId: string, lineId: string, planId?: string) {
  const result = await db
    .prepare(
      "SELECT * FROM financial_line_catalog_mappings WHERE tenant_id=? AND organization_id=? AND line_id=? AND source_module='RH' AND status='Ativo' AND (? IS NULL OR source_reference=? OR source_reference LIKE ?)",
    )
    .bind(tenantId, organizationId, lineId, planId ?? null, planId ?? null, planId ? `${planId}${PLAN_SOURCE_REFERENCE_SEPARATOR}%` : null)
    .all<{ id: string; dimension_member_id: string | null; source_reference: string; currency: string; sync_policy: string }>();
  return result.results;
}

// Creates (or, if a group already has a mapping for this exact plan,
// refreshes) one mapping per resolved dimension group, then ingests each
// group's current SourceValues. supersedes, when given, maps an OLD plan's
// group mappings (by dimension) to the new ones being created, so the
// relation policy 'Substituicao' deactivates the right predecessor —
// used by switchWorkforceVersion; omitted for a first-time createIntegration.
async function ensureDepartmentMappings(
  db: D1Database,
  tenantId: string,
  actor: string,
  input: {
    plan: PlanRow;
    lineId: string;
    syncPolicy: string;
    relationPolicy: string;
    supersedes?: Map<string, string>; // dimensionKey ("" for none) -> old mapping id
  },
) {
  const { groups, pendingDepartments } = await buildWorkforceSourceGroups(db, tenantId, input.plan);
  const existing = await findActiveRhMappings(db, tenantId, input.plan.organization_id, input.lineId, input.plan.id);
  const existingByDimension = new Map(existing.map((m) => [m.dimension_member_id || "", m.id]));

  const createdByDimension: Record<string, string> = {};
  const errors: string[] = [];
  for (const [dimensionKey, values] of groups) {
    let mappingId = existingByDimension.get(dimensionKey);
    if (!mappingId) {
      const supersedesId = input.supersedes?.get(dimensionKey);
      const created = await jsonOf<{ id: string }>(
        await createMapping(db, tenantId, actor, {
          organizationId: input.plan.organization_id,
          lineId: input.lineId,
          dimensionMemberId: dimensionKey || null,
          currency: input.plan.currency,
          sourceModule: "RH",
          sourceReference: encodePlanSourceReference(input.plan.id, dimensionKey),
          financialNature: "Economico",
          syncPolicy: input.syncPolicy,
          relationPolicy: supersedesId ? "Substituicao" : input.relationPolicy,
          supersedesMappingId: supersedesId,
        }),
      );
      if (!created.ok) {
        errors.push(`Dimensão ${dimensionKey || "(sem dimensão)"}: não foi possível criar o mapeamento.`);
        continue;
      }
      mappingId = created.data.id;
    }
    createdByDimension[dimensionKey || "(sem dimensão)"] = mappingId;
    await checkForUpdates(db, tenantId, mappingId, values);
  }

  // Dimensions the OLD plan covered but the new one no longer resolves to
  // any group (e.g. a department vanished between versions) have nothing
  // to supersede them — deactivate them explicitly so they are never
  // mistaken for "still the active source" of that cell.
  if (input.supersedes) {
    for (const [dimensionKey, oldMappingId] of input.supersedes) {
      if (!groups.has(dimensionKey)) await setMappingStatus(db, tenantId, oldMappingId, "Inativo");
    }
  }

  return Response.json({ mappingsByDimension: createdByDimension, pendingDepartments, errors });
}

export async function createWorkforceIntegration(
  db: D1Database,
  tenantId: string,
  actor: string,
  scopeOrganizationId: string | null,
  body: Record<string, unknown>,
) {
  const planId = String(body.planId || "");
  const lineId = String(body.lineId || "");
  if (!planId || !lineId) return Response.json({ error: "Plano e rubrica são obrigatórios." }, { status: 400 });
  const approved = await requireApprovedPlan(db, tenantId, scopeOrganizationId, planId);
  if (approved.error) return approved.error;
  const otherActive = await findActiveRhMappings(db, tenantId, approved.plan.organization_id, lineId);
  const conflicting = otherActive.find((m) => planIdFromSourceReference(m.source_reference) !== planId);
  if (conflicting)
    return Response.json(
      { error: "Esta rubrica já tem uma integração RH activa com outro plano/versão. Use a substituição de versão em vez de criar uma nova." },
      { status: 409 },
    );
  return ensureDepartmentMappings(db, tenantId, actor, {
    plan: approved.plan,
    lineId,
    syncPolicy: String(body.syncPolicy || "Manual"),
    relationPolicy: String(body.relationPolicy || "Exclusiva"),
  });
}

export async function syncWorkforceIntegration(db: D1Database, tenantId: string, actor: string, body: Record<string, unknown>) {
  const organizationId = String(body.organizationId || "");
  const lineId = String(body.lineId || "");
  const active = await findActiveRhMappings(db, tenantId, organizationId, lineId);
  if (!active.length) return Response.json({ error: "Nenhuma integração RH activa para esta rubrica/empresa." }, { status: 404 });
  const planId = planIdFromSourceReference(active[0].source_reference);
  const approved = await requireApprovedPlan(db, tenantId, organizationId, planId);
  if (approved.error) return approved.error;
  return ensureDepartmentMappings(db, tenantId, actor, {
    plan: approved.plan,
    lineId,
    syncPolicy: active[0].sync_policy ?? "Manual",
    relationPolicy: "Soma",
  });
}

// Pure comparison, no mutation: is there an Aprovado version of the same
// plan (same organização+nome) newer than the one currently configured?
export async function checkWorkforceVersionUpdate(db: D1Database, tenantId: string, organizationId: string, lineId: string) {
  const active = await findActiveRhMappings(db, tenantId, organizationId, lineId);
  if (!active.length) return Response.json({ error: "Nenhuma integração RH activa para esta rubrica/empresa." }, { status: 404 });
  const currentPlanId = planIdFromSourceReference(active[0].source_reference);
  const current = await db.prepare("SELECT * FROM workforce_plans WHERE id=? AND tenant_id=?").bind(currentPlanId, tenantId).first<PlanRow>();
  if (!current) return Response.json({ error: "Plano de origem já não existe." }, { status: 404 });
  const latest = await db
    .prepare(
      "SELECT * FROM workforce_plans WHERE tenant_id=? AND organization_id=? AND name=? AND status='Aprovado' AND version_number>? ORDER BY version_number DESC LIMIT 1",
    )
    .bind(tenantId, current.organization_id, current.name, current.version_number)
    .first<PlanRow>();
  if (!latest) return Response.json({ hasUpdate: false, currentVersion: current.version_number });
  const [currentGroups, latestGroups] = await Promise.all([
    buildWorkforceSourceGroups(db, tenantId, current),
    buildWorkforceSourceGroups(db, tenantId, latest),
  ]);
  const totalOf = (g: SourceGroups) => Array.from(g.groups.values()).flat().reduce((sum, v) => sum + v.amountMinor, 0);
  return Response.json({
    hasUpdate: true,
    currentVersion: current.version_number,
    latestVersion: latest.version_number,
    latestPlanId: latest.id,
    currentTotalMinor: totalOf(currentGroups),
    latestTotalMinor: totalOf(latestGroups),
  });
}

// The controlled substitution: creates/refreshes mappings for the new plan,
// 'Substituicao'-linked by dimension to whichever mapping of the OLD plan
// held that same cell, and deactivates any old mapping left with no
// successor. Does not touch any already-approved budget version — only a
// later applyIntegration on a DRAFT version will reflect the switch.
export async function switchWorkforceVersion(db: D1Database, tenantId: string, actor: string, body: Record<string, unknown>) {
  const organizationId = String(body.organizationId || "");
  const lineId = String(body.lineId || "");
  const newPlanId = String(body.newPlanId || "");
  const active = await findActiveRhMappings(db, tenantId, organizationId, lineId);
  if (!active.length) return Response.json({ error: "Nenhuma integração RH activa para esta rubrica/empresa." }, { status: 404 });
  const oldPlanId = planIdFromSourceReference(active[0].source_reference);
  const approvedNew = await requireApprovedPlan(db, tenantId, organizationId, newPlanId);
  if (approvedNew.error) return approvedNew.error;
  const oldPlan = await db.prepare("SELECT * FROM workforce_plans WHERE id=? AND tenant_id=?").bind(oldPlanId, tenantId).first<PlanRow>();
  if (!oldPlan || oldPlan.organization_id !== approvedNew.plan.organization_id || oldPlan.name !== approvedNew.plan.name)
    return Response.json({ error: "O novo plano tem de ser outra versão do mesmo plano (mesma empresa e nome)." }, { status: 400 });
  const supersedes = new Map(active.map((m) => [m.dimension_member_id || "", m.id]));
  return ensureDepartmentMappings(db, tenantId, actor, {
    plan: approvedNew.plan,
    lineId,
    syncPolicy: active[0].sync_policy ?? "Manual",
    relationPolicy: "Substituicao",
    supersedes,
  });
}

// Applies every active mapping of this RH integration group to the given
// DRAFT version — one applyMapping call per department, aggregated here
// into a single result. Reuses applyMapping's own guards verbatim: a
// version that is not Rascunho, or a cell blocked with adjustment_mode
// 'Bloquear', behave exactly as they would from the generic endpoint.
export async function applyWorkforceIntegration(db: D1Database, tenantId: string, actor: string, body: Record<string, unknown>) {
  const organizationId = String(body.organizationId || "");
  const lineId = String(body.lineId || "");
  const versionId = String(body.versionId || "");
  const active = await findActiveRhMappings(db, tenantId, organizationId, lineId);
  if (!active.length) return Response.json({ error: "Nenhuma integração RH activa para esta rubrica/empresa." }, { status: 404 });
  let applied = 0,
    blocked = 0;
  for (const mapping of active) {
    const result = await jsonOf<{ applied: number; blocked: number }>(await applyMapping(db, tenantId, actor, { mappingId: mapping.id, versionId }));
    if (!result.ok) return result.response;
    applied += result.data.applied;
    blocked += result.data.blocked;
  }
  return Response.json({ applied, blocked, mappings: active.length });
}

export async function listApprovedWorkforcePlans(db: D1Database, tenantId: string, organizationId: string | null) {
  const result = await db
    .prepare(
      "SELECT id,organization_id,name,currency,start_period,end_period,version_number,approved_at FROM workforce_plans WHERE tenant_id=? AND status='Aprovado' AND (? IS NULL OR organization_id=?) ORDER BY name,version_number DESC",
    )
    .bind(tenantId, organizationId, organizationId)
    .all<PlanRow>();
  return Response.json({ plans: result.results });
}

const fail = (error: unknown) => {
  const x = classifyDataError(error, "Não foi possível processar a integração RH → Orçamento.");
  return Response.json({ error: x.message, code: x.code }, { status: x.status });
};

export async function workforceIntegrationApi(
  request: Request,
  db: D1Database,
  tenantId: string,
  organizationId: string | null,
  actor: string,
) {
  try {
    const url = new URL(request.url);
    // The security-context organizationId (scope) is always authoritative
    // when set — a holding-level user (scope null) may still pass one
    // explicitly via query string or body, but a company-scoped user can
    // never widen their own scope by passing a different one.
    const scopedOrg = (claimed: string | null) => organizationId || claimed;
    if (request.method === "GET") {
      const action = url.searchParams.get("action") || "";
      if (action === "candidates") return listApprovedWorkforcePlans(db, tenantId, organizationId);
      if (action === "departments") return workforcePlanDepartments(db, tenantId, organizationId, url.searchParams.get("planId") || "");
      if (action === "preview") return previewWorkforceIntegration(db, tenantId, organizationId, url.searchParams.get("planId") || "");
      if (action === "versionUpdate")
        return checkWorkforceVersionUpdate(db, tenantId, scopedOrg(url.searchParams.get("organizationId")) || "", url.searchParams.get("lineId") || "");
      return Response.json({ error: "Acção não suportada." }, { status: 400 });
    }
    if (request.method !== "POST") return Response.json({ error: "Método não permitido." }, { status: 405 });
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.organizationId !== "undefined" || organizationId) body.organizationId = scopedOrg(body.organizationId ? String(body.organizationId) : null);
    if (body.type === "recordDepartmentDecision") return recordDepartmentDecision(db, tenantId, actor, body);
    if (body.type === "createIntegration") return createWorkforceIntegration(db, tenantId, actor, organizationId, body);
    if (body.type === "syncIntegration") return syncWorkforceIntegration(db, tenantId, actor, body);
    if (body.type === "applyIntegration") return applyWorkforceIntegration(db, tenantId, actor, body);
    if (body.type === "switchVersion") return switchWorkforceVersion(db, tenantId, actor, body);
    return Response.json({ error: "Operação de integração RH não suportada." }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}
