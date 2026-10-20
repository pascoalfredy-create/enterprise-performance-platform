// Fase 3.1 — Motor Comum de Integração Orçamental.
//
// This module is a bridge, not a sixth financial engine: it maps a rubrica
// to an external source, ingests that source's individual records as
// "movements" (idempotent, one row per source record — e.g. one employee's
// one salary component for one month), aggregates the currently-current
// movements per (rubrica, período, dimensão, natureza), and applies that
// aggregate into performance_entries — the exact same table and scenario
// Fase 2's grid already reads. No source module is read from directly here;
// a SourceAdapter (built per module in Fase 3.2+) is the only thing that
// ever touches RH/Investimentos/Financeiro/Forecast data, and it only ever
// hands this module plain SourceValue records.
//
// "Automática" does not mean a background job exists yet — it means a
// changed movement becomes immediately eligible for the next applyMapping
// call, with no separate confirmation step. Nothing in this file runs on a
// schedule or a webhook; every ingest and every apply is an explicit call.
import type { D1Database, D1PreparedStatement } from "../worker-configuration";
import { requireDraftVersion, fiscalYearPeriods } from "./budget-annual-map";

const uid = () => crypto.randomUUID();

export type FinancialNature = "Economico" | "Financeiro";
export type SyncPolicy = "Automatica" | "ComConfirmacao" | "Manual";
export type RelationPolicy = "Soma" | "Exclusiva" | "Alternativa" | "Substituicao";
export type SyncState = "Atualizado" | "PendenteConfirmacao" | "Obsoleto" | "Conflito" | "Erro";
export type SourceModule = "RH" | "Investimentos" | "Financeiro" | "Forecast";

// The contract every real adapter (Fase 3.2+) must implement. Nothing in
// this file calls a real module — only the synthetic adapter used by tests
// implements this today.
export type SourceValue = {
  organizationId: string;
  sourceModule: SourceModule;
  sourceReference: string; // stable id of the individual movement (e.g. "employee:42:salario")
  componentLabel?: string;
  period: string; // "YYYY-MM"
  currency: string;
  dimensionMemberId: string | null;
  financialNature: FinancialNature;
  amountMinor: number;
  sourceStatus: string; // e.g. "Aprovado" — the state of the SOURCE plan, not of this mapping
  sourceFingerprint: string; // changes whenever the source record itself changes
};
export type SourceAdapter = {
  module: SourceModule;
  fetchValues(tenantId: string, mapping: MappingRow): Promise<SourceValue[]>;
};

type MappingRow = {
  id: string;
  tenant_id: string;
  line_id: string;
  organization_id: string;
  dimension_member_id: string | null;
  currency: string;
  source_module: SourceModule;
  source_reference: string;
  financial_nature: FinancialNature;
  sync_policy: SyncPolicy;
  relation_policy: RelationPolicy;
  status: "Ativo" | "Inativo";
  created_by: string;
  created_at: string;
  updated_at: string | null;
};

const SOURCE_MODULES: SourceModule[] = ["RH", "Investimentos", "Financeiro", "Forecast"];

async function findExclusivityConflict(
  db: D1Database,
  tenantId: string,
  params: { lineId: string; organizationId: string; dimensionMemberId: string | null; currency: string; financialNature: FinancialNature },
) {
  return db
    .prepare(
      "SELECT id,relation_policy,source_module,source_reference FROM financial_line_catalog_mappings WHERE tenant_id=? AND line_id=? AND organization_id=? AND (dimension_member_id IS ? OR dimension_member_id=?) AND currency=? AND financial_nature=? AND status='Ativo' AND relation_policy<>'Soma'",
    )
    .bind(tenantId, params.lineId, params.organizationId, params.dimensionMemberId, params.dimensionMemberId, params.currency, params.financialNature)
    .first<{ id: string; relation_policy: RelationPolicy; source_module: string; source_reference: string }>();
}

export async function createMapping(db: D1Database, tenantId: string, actor: string, body: Record<string, unknown>) {
  const organizationId = String(body.organizationId || "");
  const org = await db.prepare("SELECT id FROM organizations WHERE id=? AND tenant_id=?").bind(organizationId, tenantId).first();
  if (!org) return Response.json({ error: "Empresa inválida ou fora do âmbito do tenant." }, { status: 400 });

  const dimensionMemberId = body.dimensionMemberId ? String(body.dimensionMemberId) : null;
  if (dimensionMemberId) {
    const dim = await db.prepare("SELECT id FROM dimension_members WHERE id=? AND tenant_id=?").bind(dimensionMemberId, tenantId).first();
    if (!dim) return Response.json({ error: "Dimensão inválida ou fora do âmbito do tenant." }, { status: 400 });
  }

  const lineId = String(body.lineId || "");
  const line = await db.prepare("SELECT id,line_kind FROM financial_line_catalog WHERE id=? AND tenant_id=?").bind(lineId, tenantId).first<{ id: string; line_kind: string }>();
  if (!line) return Response.json({ error: "Rubrica inválida ou fora do âmbito do tenant." }, { status: 400 });
  if (line.line_kind !== "Analítica") return Response.json({ error: "Só é possível mapear rubricas Analíticas (não Agregação/Calculada)." }, { status: 400 });

  const currency = String(body.currency || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return Response.json({ error: "Moeda inválida." }, { status: 400 });

  const sourceModule = String(body.sourceModule || "") as SourceModule;
  if (!SOURCE_MODULES.includes(sourceModule)) return Response.json({ error: "Módulo de origem inválido." }, { status: 400 });

  const sourceReference = String(body.sourceReference || "").trim();
  if (!sourceReference) return Response.json({ error: "Referência de origem é obrigatória." }, { status: 400 });

  const financialNature: FinancialNature = body.financialNature === "Financeiro" ? "Financeiro" : "Economico";
  const syncPolicy: SyncPolicy = ["Automatica", "ComConfirmacao", "Manual"].includes(String(body.syncPolicy)) ? (body.syncPolicy as SyncPolicy) : "Manual";
  const relationPolicy: RelationPolicy = ["Soma", "Exclusiva", "Alternativa", "Substituicao"].includes(String(body.relationPolicy))
    ? (body.relationPolicy as RelationPolicy)
    : "Exclusiva";

  if (relationPolicy !== "Soma") {
    const conflict = await findExclusivityConflict(db, tenantId, { lineId, organizationId, dimensionMemberId, currency, financialNature });
    const supersedes = body.supersedesMappingId ? String(body.supersedesMappingId) : null;
    if (conflict && !(relationPolicy === "Substituicao" && supersedes === conflict.id)) {
      const label = conflict.relation_policy === "Alternativa" ? "uma fonte alternativa" : "um mapeamento exclusivo";
      return Response.json(
        {
          error: `Já existe ${label} activo (${conflict.source_module}/${conflict.source_reference}) para esta combinação de rubrica, empresa, dimensão, moeda e natureza. Desactive-o, escolha a política 'Soma', ou use 'Substituição' indicando supersedesMappingId.`,
        },
        { status: 409 },
      );
    }
  }

  const id = uid(),
    now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (relationPolicy === "Substituicao" && body.supersedesMappingId) {
    statements.push(
      db
        .prepare("UPDATE financial_line_catalog_mappings SET status='Inativo',updated_at=? WHERE id=? AND tenant_id=?")
        .bind(now, String(body.supersedesMappingId), tenantId),
    );
  }
  statements.push(
    db
      .prepare(
        "INSERT INTO financial_line_catalog_mappings (id,tenant_id,line_id,source_module,source_reference,created_by,created_at,organization_id,dimension_member_id,currency,financial_nature,sync_policy,relation_policy,status,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(id, tenantId, lineId, sourceModule, sourceReference, actor, now, organizationId, dimensionMemberId, currency, financialNature, syncPolicy, relationPolicy, "Ativo", now),
  );
  try {
    await db.batch(statements);
  } catch (error) {
    if (/UNIQUE/i.test(String((error as Error).message || error)))
      return Response.json({ error: "Conflito de concorrência: outro mapeamento activo e exclusivo foi criado em simultâneo para a mesma combinação." }, { status: 409 });
    throw error;
  }
  return Response.json({ id });
}

// Mappings are deliberately NEVER frozen by a version's approval — only the
// budget_integration_values rows produced FROM a mapping, for a specific
// version, are. A mapping may keep evolving for future exercises at any
// time; its own frozen triggers (none exist) would otherwise block exactly
// the evolution the homologation review asked to keep open.
export async function setMappingStatus(db: D1Database, tenantId: string, mappingId: string, status: "Ativo" | "Inativo") {
  const now = new Date().toISOString();
  try {
    const result = await db
      .prepare("UPDATE financial_line_catalog_mappings SET status=?,updated_at=? WHERE id=? AND tenant_id=?")
      .bind(status, now, mappingId, tenantId)
      .run();
    if (!result.meta.changes) return Response.json({ error: "Mapeamento não encontrado." }, { status: 404 });
  } catch (error) {
    if (/UNIQUE/i.test(String((error as Error).message || error)))
      return Response.json({ error: "Já existe outro mapeamento activo e exclusivo para a mesma combinação." }, { status: 409 });
    throw error;
  }
  return Response.json({ ok: true });
}

export async function listMappings(db: D1Database, tenantId: string, organizationId: string | null) {
  const result = await db
    .prepare("SELECT * FROM financial_line_catalog_mappings WHERE tenant_id=? AND (? IS NULL OR organization_id=?) ORDER BY created_at DESC")
    .bind(tenantId, organizationId, organizationId)
    .all<MappingRow>();
  return Response.json({ mappings: result.results });
}

// Ingests a source's current records as movements — idempotent per
// (mapping, source_movement_reference, período, dimensão): re-ingesting an
// unchanged movement is a no-op; a changed one updates the stored row in
// place. Never writes to performance_entries. A movement present before but
// absent from this batch (for a period this batch actually covers) is
// marked Obsoleto, never deleted, preserving the audit trail.
export async function checkForUpdates(db: D1Database, tenantId: string, mappingId: string, values: SourceValue[]) {
  const mapping = await db.prepare("SELECT * FROM financial_line_catalog_mappings WHERE id=? AND tenant_id=?").bind(mappingId, tenantId).first<MappingRow>();
  if (!mapping) return Response.json({ error: "Mapeamento não encontrado." }, { status: 404 });
  if (mapping.status !== "Ativo") return Response.json({ error: "O mapeamento está inactivo." }, { status: 409 });

  const now = new Date().toISOString();
  const existing = await db
    .prepare("SELECT id,source_movement_reference,period,dimension_member_id,source_fingerprint,sync_state FROM budget_integration_movements WHERE tenant_id=? AND mapping_id=?")
    .bind(tenantId, mapping.id)
    .all<{ id: string; source_movement_reference: string; period: string; dimension_member_id: string | null; source_fingerprint: string; sync_state: SyncState }>();
  const byKey = new Map(existing.results.map((row) => [`${row.source_movement_reference}|${row.period}|${row.dimension_member_id || ""}`, row]));
  const seen = new Set<string>();
  const periodsInBatch = new Set(values.map((v) => v.period));
  const statements: D1PreparedStatement[] = [];
  let created = 0,
    updated = 0,
    unchanged = 0,
    skipped = 0,
    pendingConfirmation = 0;

  for (const v of values) {
    if (v.organizationId !== mapping.organization_id) {
      skipped++;
      continue;
    }
    if (v.currency.toUpperCase() !== mapping.currency) {
      skipped++; // never silently convert currency — a mismatch is rejected, not coerced
      continue;
    }
    if (v.financialNature !== mapping.financial_nature) {
      skipped++; // never let a cash-perspective value land on an economic mapping or vice-versa
      continue;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v.period)) {
      skipped++;
      continue;
    }
    const key = `${v.sourceReference}|${v.period}|${v.dimensionMemberId || ""}`;
    seen.add(key);
    const prior = byKey.get(key);
    if (prior && prior.source_fingerprint === v.sourceFingerprint) {
      unchanged++;
      continue;
    }
    if (prior) {
      updated++;
      if (mapping.sync_policy === "ComConfirmacao") {
        // Hold the change in the pending_* columns — amount_minor and
        // source_fingerprint (the last CONFIRMED value) stay untouched, so
        // applyMapping keeps aggregating the old figure until someone
        // explicitly confirms. A detected change must never silently drop
        // an already-committed cost from the draft budget.
        pendingConfirmation++;
        statements.push(
          db
            .prepare(
              "UPDATE budget_integration_movements SET sync_state='PendenteConfirmacao',pending_amount_minor=?,pending_source_status=?,pending_fingerprint=?,fetched_at=?,updated_at=? WHERE id=? AND tenant_id=?",
            )
            .bind(v.amountMinor, v.sourceStatus, v.sourceFingerprint, now, now, prior.id, tenantId),
        );
      } else {
        statements.push(
          db
            .prepare(
              "UPDATE budget_integration_movements SET component_label=?,amount_minor=?,source_status=?,source_fingerprint=?,sync_state='Atualizado',pending_amount_minor=NULL,pending_source_status=NULL,pending_fingerprint=NULL,fetched_at=?,updated_at=? WHERE id=? AND tenant_id=?",
            )
            .bind(v.componentLabel || "", v.amountMinor, v.sourceStatus, v.sourceFingerprint, now, now, prior.id, tenantId),
        );
      }
    } else {
      created++;
      statements.push(
        db
          .prepare(
            "INSERT INTO budget_integration_movements (id,tenant_id,mapping_id,organization_id,source_movement_reference,component_label,period,dimension_member_id,currency,financial_nature,amount_minor,source_status,source_fingerprint,sync_state,fetched_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            uid(),
            tenantId,
            mapping.id,
            mapping.organization_id,
            v.sourceReference,
            v.componentLabel || "",
            v.period,
            v.dimensionMemberId,
            mapping.currency,
            v.financialNature,
            v.amountMinor,
            v.sourceStatus,
            v.sourceFingerprint,
            "Atualizado",
            now,
            now,
            now,
          ),
      );
    }
  }
  let obsoleted = 0;
  for (const [key, prior] of byKey) {
    if (seen.has(key)) continue;
    if (!periodsInBatch.has(prior.period)) continue;
    if (prior.sync_state === "Obsoleto") continue;
    obsoleted++;
    statements.push(db.prepare("UPDATE budget_integration_movements SET sync_state='Obsoleto',updated_at=? WHERE id=? AND tenant_id=?").bind(now, prior.id, tenantId));
  }
  if (statements.length) await db.batch(statements);
  return Response.json({ created, updated, unchanged, skipped, pendingConfirmation, obsoleted });
}

// ComConfirmacao workflow: promotes a pending change into the movement's
// current value (amount_minor/source_fingerprint), clearing the pending_*
// columns and the PendenteConfirmacao flag. Until this runs, applyMapping
// keeps using the OLD confirmed amount — see checkForUpdates above.
export async function confirmMovements(db: D1Database, tenantId: string, mappingId: string, period: string | null) {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      "UPDATE budget_integration_movements SET amount_minor=pending_amount_minor,source_status=pending_source_status,source_fingerprint=pending_fingerprint,sync_state='Atualizado',pending_amount_minor=NULL,pending_source_status=NULL,pending_fingerprint=NULL,updated_at=? WHERE tenant_id=? AND mapping_id=? AND sync_state='PendenteConfirmacao' AND (? IS NULL OR period=?)",
    )
    .bind(now, tenantId, mappingId, period, period)
    .run();
  return Response.json({ confirmed: result.meta.changes });
}

// Aggregates this mapping's current movements (Atualizado and
// PendenteConfirmacao — a pending one still contributes its last CONFIRMED
// amount_minor, never the unconfirmed pending_amount_minor) per period, and
// applies the sum to performance_entries for the given DRAFT version.
// Always an explicit call — see the module header on what "Automática"
// means today. Respects a cell's adjustment_mode: Bloquear is skipped entirely;
// Substituir/Adicionar compose with manual_adjustment_minor; a plain
// integration-managed cell (no mode) is simply replaced.
export async function applyMapping(db: D1Database, tenantId: string, actor: string, input: { mappingId: string; versionId: string }) {
  const draft = await requireDraftVersion(db, tenantId, input.versionId);
  if (draft.error) return draft.error;
  const version = draft.version!;
  const mapping = await db.prepare("SELECT * FROM financial_line_catalog_mappings WHERE id=? AND tenant_id=?").bind(input.mappingId, tenantId).first<MappingRow>();
  if (!mapping) return Response.json({ error: "Mapeamento não encontrado." }, { status: 404 });
  if (mapping.status !== "Ativo") return Response.json({ error: "O mapeamento está inactivo." }, { status: 409 });
  // performance_entries has no financial_nature column — it is, today, an
  // economic (competência) budget only. Applying a "Financeiro" (caixa)
  // mapping here would silently land on the exact same cell as an
  // "Economico" one for the same rubrica/período, which is precisely the
  // double-counting the architecture review prohibited. Cash-perspective
  // movements are still ingested and tracked in budget_integration_values
  // for the future Tesouraria module to consume — they are just never
  // applied to the Mapa Orçamental Anual until that module exists.
  if (mapping.financial_nature !== "Economico")
    return Response.json(
      { error: "Apenas mapeamentos de natureza Económica podem ser aplicados ao Mapa Orçamental Anual nesta fase. A natureza Financeira fica preparada para a futura Tesouraria previsional." },
      { status: 409 },
    );

  if (mapping.relation_policy !== "Soma") {
    const conflict = await findExclusivityConflict(db, tenantId, {
      lineId: mapping.line_id,
      organizationId: mapping.organization_id,
      dimensionMemberId: mapping.dimension_member_id,
      currency: mapping.currency,
      financialNature: mapping.financial_nature,
    });
    if (conflict && conflict.id !== mapping.id)
      return Response.json({ error: `Conflito: ${conflict.source_module}/${conflict.source_reference} também está activo e exclusivo para a mesma combinação.` }, { status: 409 });
  }

  const line = await db.prepare("SELECT code,name FROM financial_line_catalog WHERE id=? AND tenant_id=?").bind(mapping.line_id, tenantId).first<{ code: string; name: string }>();
  if (!line) return Response.json({ error: "Rubrica não encontrada." }, { status: 404 });

  const periods = fiscalYearPeriods(version.fiscal_year);
  const movements = await db
    .prepare(
      "SELECT period,amount_minor FROM budget_integration_movements WHERE tenant_id=? AND mapping_id=? AND sync_state IN ('Atualizado','PendenteConfirmacao') AND dimension_member_id IS ? AND period BETWEEN ? AND ?",
    )
    .bind(tenantId, mapping.id, mapping.dimension_member_id, periods[0], periods[11])
    .all<{ period: string; amount_minor: number }>();
  const sumByPeriod = new Map<string, { sum: number; count: number }>();
  for (const m of movements.results) {
    const row = sumByPeriod.get(m.period) || { sum: 0, count: 0 };
    row.sum += m.amount_minor;
    row.count += 1;
    sumByPeriod.set(m.period, row);
  }

  const existingEntries = await db
    .prepare(
      "SELECT id,period,amount_minor,manual_adjustment_minor,adjustment_mode FROM performance_entries WHERE tenant_id=? AND scenario='Budget' AND version_id=? AND line_code=? AND organization_id=? AND currency=? AND dimension_member_id IS ?",
    )
    .bind(tenantId, input.versionId, line.code, mapping.organization_id, mapping.currency, mapping.dimension_member_id)
    .all<{ id: string; period: string; amount_minor: number; manual_adjustment_minor: number; adjustment_mode: string | null }>();
  const entryByPeriod = new Map(existingEntries.results.map((row) => [row.period, row]));

  const existingValues = await db
    .prepare(
      "SELECT id,period FROM budget_integration_values WHERE tenant_id=? AND mapping_id=? AND version_id=? AND dimension_member_id IS ? AND financial_nature=?",
    )
    .bind(tenantId, mapping.id, input.versionId, mapping.dimension_member_id, mapping.financial_nature)
    .all<{ id: string; period: string }>();
  const valueIdByPeriod = new Map(existingValues.results.map((row) => [row.period, row.id]));

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let applied = 0,
    blocked = 0;
  for (const period of periods) {
    const agg = sumByPeriod.get(period) || { sum: 0, count: 0 };
    const existing = entryByPeriod.get(period);
    if (existing?.adjustment_mode === "Bloquear") {
      blocked++;
      continue;
    }
    const mode = existing?.adjustment_mode || null;
    const manualAdj = existing?.manual_adjustment_minor || 0;
    const effective = mode === "Substituir" ? manualAdj : mode === "Adicionar" ? agg.sum + manualAdj : agg.sum;
    const entryId = existing?.id || uid();
    // Reuse the SAME budget_integration_values row across repeated applies
    // for this (mapping,version,period) — a fresh id each time would leave
    // performance_entries.integration_value_id pointing at a row that was
    // never actually written (upsert keeps the pre-existing row's PK).
    const valueId = valueIdByPeriod.get(period) || uid();
    if (valueIdByPeriod.has(period)) {
      statements.push(
        db
          .prepare(
            "UPDATE budget_integration_values SET integration_amount_minor=?,movement_count=?,applied_entry_id=?,sync_state='Atualizado',applied_by=?,applied_at=? WHERE id=? AND tenant_id=?",
          )
          .bind(agg.sum, agg.count, entryId, actor, now, valueId, tenantId),
      );
    } else {
      statements.push(
        db
          .prepare(
            "INSERT INTO budget_integration_values (id,tenant_id,mapping_id,version_id,organization_id,line_id,period,dimension_member_id,currency,financial_nature,integration_amount_minor,movement_count,source_module,source_reference,relation_policy,sync_policy,applied_entry_id,sync_state,applied_by,applied_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            valueId,
            tenantId,
            mapping.id,
            input.versionId,
            mapping.organization_id,
            mapping.line_id,
            period,
            mapping.dimension_member_id,
            mapping.currency,
            mapping.financial_nature,
            agg.sum,
            agg.count,
            mapping.source_module,
            mapping.source_reference,
            mapping.relation_policy,
            mapping.sync_policy,
            entryId,
            "Atualizado",
            actor,
            now,
          ),
      );
    }
    if (existing) {
      statements.push(
        db
          .prepare("UPDATE performance_entries SET amount_minor=?,integration_amount_minor=?,integration_value_id=? WHERE id=? AND tenant_id=?")
          .bind(effective, agg.sum, valueId, existing.id, tenantId),
      );
    } else {
      statements.push(
        db
          .prepare(
            "INSERT INTO performance_entries (id,tenant_id,organization_id,period,scenario,version_id,currency,line_code,line_name,dimension_member_id,amount_minor,source,created_at,manual_override,integration_amount_minor,manual_adjustment_minor,adjustment_mode,integration_value_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,0,NULL,?)",
          )
          .bind(entryId, tenantId, mapping.organization_id, period, "Budget", input.versionId, mapping.currency, line.code, line.name, mapping.dimension_member_id, effective, `Integração ${mapping.source_module}`, now, agg.sum, valueId),
      );
    }
    applied++;
  }
  await db.batch(statements);
  return Response.json({ applied, blocked, periods: periods.length });
}

// Sets (or clears, with manualAdjustmentMinor=0 and mode="Adicionar") the
// manual adjustment layer on a cell, independent of whatever the
// integration last computed for it. Works even before any sync has run
// (e.g. a user pre-emptively blocking a cell).
export async function setAdjustment(
  db: D1Database,
  tenantId: string,
  actor: string,
  input: {
    versionId: string;
    lineId: string;
    organizationId: string;
    dimensionMemberId: string | null;
    currency: string;
    period: string;
    mode: "Substituir" | "Adicionar" | "Bloquear";
    manualAdjustmentMinor: number;
  },
) {
  const draft = await requireDraftVersion(db, tenantId, input.versionId);
  if (draft.error) return draft.error;
  if (!["Substituir", "Adicionar", "Bloquear"].includes(input.mode)) return Response.json({ error: "Modo de ajuste inválido." }, { status: 400 });
  const line = await db.prepare("SELECT code,name FROM financial_line_catalog WHERE id=? AND tenant_id=?").bind(input.lineId, tenantId).first<{ code: string; name: string }>();
  if (!line) return Response.json({ error: "Rubrica não encontrada." }, { status: 400 });

  const existing = await db
    .prepare(
      "SELECT id,amount_minor,integration_amount_minor FROM performance_entries WHERE tenant_id=? AND scenario='Budget' AND version_id=? AND line_code=? AND period=? AND organization_id=? AND dimension_member_id IS ?",
    )
    .bind(tenantId, input.versionId, line.code, input.period, input.organizationId, input.dimensionMemberId)
    .first<{ id: string; amount_minor: number; integration_amount_minor: number | null }>();
  const adjMinor = Math.trunc(Number(input.manualAdjustmentMinor) || 0);
  const integrationAmount = existing?.integration_amount_minor ?? 0;
  const effective =
    input.mode === "Substituir" ? adjMinor : input.mode === "Adicionar" ? integrationAmount + adjMinor : existing?.amount_minor ?? 0;
  const now = new Date().toISOString();
  if (existing) {
    await db
      .prepare("UPDATE performance_entries SET amount_minor=?,manual_adjustment_minor=?,adjustment_mode=? WHERE id=? AND tenant_id=?")
      .bind(effective, adjMinor, input.mode, existing.id, tenantId)
      .run();
  } else {
    await db
      .prepare(
        "INSERT INTO performance_entries (id,tenant_id,organization_id,period,scenario,version_id,currency,line_code,line_name,dimension_member_id,amount_minor,source,created_at,manual_override,integration_amount_minor,manual_adjustment_minor,adjustment_mode) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)",
      )
      .bind(uid(), tenantId, input.organizationId, input.period, "Budget", input.versionId, input.currency, line.code, line.name, input.dimensionMemberId, effective, "Ajuste manual", now, null, adjMinor, input.mode)
      .run();
  }
  return Response.json({ ok: true, effective });
}

// Read-only traceability: for one cell, what produced it — the mapping's
// source, the source plan's status at application time, and (for an
// integration-managed cell) every movement that contributed to the sum.
export async function getCellOrigin(
  db: D1Database,
  tenantId: string,
  input: { versionId: string; lineId: string; organizationId: string; dimensionMemberId: string | null; period: string },
) {
  const line = await db.prepare("SELECT code FROM financial_line_catalog WHERE id=? AND tenant_id=?").bind(input.lineId, tenantId).first<{ code: string }>();
  if (!line) return Response.json({ error: "Rubrica não encontrada." }, { status: 404 });
  const entry = await db
    .prepare(
      "SELECT amount_minor,integration_amount_minor,manual_adjustment_minor,adjustment_mode,integration_value_id,source FROM performance_entries WHERE tenant_id=? AND scenario='Budget' AND version_id=? AND line_code=? AND period=? AND organization_id=? AND dimension_member_id IS ?",
    )
    .bind(tenantId, input.versionId, line.code, input.period, input.organizationId, input.dimensionMemberId)
    .first<{
      amount_minor: number;
      integration_amount_minor: number | null;
      manual_adjustment_minor: number;
      adjustment_mode: string | null;
      integration_value_id: string | null;
      source: string;
    }>();
  if (!entry) return Response.json({ origin: null });
  let integration: Record<string, unknown> | null = null;
  if (entry.integration_value_id) {
    const value = await db
      .prepare("SELECT * FROM budget_integration_values WHERE id=? AND tenant_id=?")
      .bind(entry.integration_value_id, tenantId)
      .first<{ mapping_id: string; source_module: string; source_reference: string; sync_state: SyncState; applied_at: string; movement_count: number }>();
    if (value) {
      const movements = await db
        .prepare(
          "SELECT source_movement_reference,component_label,amount_minor,source_status,sync_state,pending_amount_minor FROM budget_integration_movements WHERE tenant_id=? AND mapping_id=? AND period=? AND dimension_member_id IS ? AND sync_state IN ('Atualizado','PendenteConfirmacao')",
        )
        .bind(tenantId, value.mapping_id, input.period, input.dimensionMemberId)
        .all();
      integration = {
        sourceModule: value.source_module,
        sourceReference: value.source_reference,
        syncState: value.sync_state,
        appliedAt: value.applied_at,
        movementCount: value.movement_count,
        movements: movements.results,
      };
    }
  }
  return Response.json({
    origin: {
      amountMinor: entry.amount_minor,
      integrationAmountMinor: entry.integration_amount_minor,
      manualAdjustmentMinor: entry.manual_adjustment_minor,
      adjustmentMode: entry.adjustment_mode,
      source: entry.source,
      integration,
    },
  });
}
