-- Fase 3.1 — Motor Comum de Integração Orçamental. Additive only: extends
-- the Fase 1 mapping table (never written to until now) and adds two new
-- tables. No existing table is rebuilt; financial_line_catalog_mappings
-- keeps its original columns and unique constraint untouched.

-- The mapping is configuration: which rubrica, for which company/dimension/
-- currency/nature, is fed by which external source, under which relation
-- and sync policy. It stays editable at any time (see 0081's values table
-- below for what actually freezes) — approving a budget version must never
-- block a mapping from evolving for future exercises.
ALTER TABLE financial_line_catalog_mappings ADD COLUMN organization_id TEXT NOT NULL DEFAULT '' REFERENCES organizations(id);
ALTER TABLE financial_line_catalog_mappings ADD COLUMN dimension_member_id TEXT REFERENCES dimension_members(id);
ALTER TABLE financial_line_catalog_mappings ADD COLUMN currency TEXT NOT NULL DEFAULT '';
-- Competência (Economico) and caixa (Financeiro) are different perspectives
-- on the same fact, never two separate costs — kept apart so nothing ever
-- sums them into the same budgeted cell.
ALTER TABLE financial_line_catalog_mappings ADD COLUMN financial_nature TEXT NOT NULL DEFAULT 'Economico' CHECK(financial_nature IN ('Economico','Financeiro'));
-- "Automatica" here means "applied immediately the next time a sync check
-- runs" (an explicit API call) — there is no background scheduler or
-- source-side webhook yet. Documented, not just implied, in worker code.
ALTER TABLE financial_line_catalog_mappings ADD COLUMN sync_policy TEXT NOT NULL DEFAULT 'Manual' CHECK(sync_policy IN ('Automatica','ComConfirmacao','Manual'));
-- Soma: components of the same rubrica, meant to add up (e.g. salário +
-- subsídios + encargos from RH), any number may be simultaneously active.
-- Exclusiva: represents the same cost as any other active mapping on the
-- same (rubrica,empresa,dimensão,moeda,natureza) — the system refuses a
-- second one. Alternativa: same refusal, framed as a user choice rather
-- than a system-detected duplicate (distinct error message upstream).
-- Substituicao: activating this one is expected to deactivate whichever
-- mapping previously held that tuple, in the same transaction.
ALTER TABLE financial_line_catalog_mappings ADD COLUMN relation_policy TEXT NOT NULL DEFAULT 'Exclusiva' CHECK(relation_policy IN ('Soma','Exclusiva','Alternativa','Substituicao'));
ALTER TABLE financial_line_catalog_mappings ADD COLUMN status TEXT NOT NULL DEFAULT 'Ativo' CHECK(status IN ('Ativo','Inativo'));
ALTER TABLE financial_line_catalog_mappings ADD COLUMN updated_at TEXT;

-- At most one ACTIVE non-Soma mapping per (rubrica, empresa, dimensão,
-- moeda, natureza) — Soma mappings are exempt (they are meant to coexist
-- and add up). COALESCE normalises a NULL dimension so two company-wide
-- mappings (no dimension) correctly collide instead of SQL's usual
-- "every NULL is distinct" behaviour.
CREATE UNIQUE INDEX IF NOT EXISTS financial_line_catalog_mappings_exclusive
  ON financial_line_catalog_mappings(tenant_id, line_id, organization_id, COALESCE(dimension_member_id,''), currency, financial_nature)
  WHERE status='Ativo' AND relation_policy<>'Soma';
CREATE INDEX IF NOT EXISTS financial_line_catalog_mappings_scope
  ON financial_line_catalog_mappings(tenant_id, organization_id, status);

-- One row per individual record pulled from a source (e.g. one employee's
-- one salary component for one month) — the "movement identity" the
-- homologation review asked to keep separate from the aggregated value
-- that lands on the rubrica. Re-ingesting the same movement for the same
-- period updates this row in place (the UNIQUE constraint below), never
-- duplicates it. Movements are NOT version-scoped — they describe the
-- source's current state, independent of which draft budget consumes them,
-- so they are never frozen by a version's approval.
CREATE TABLE IF NOT EXISTS budget_integration_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  mapping_id TEXT NOT NULL REFERENCES financial_line_catalog_mappings(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  source_movement_reference TEXT NOT NULL,
  component_label TEXT NOT NULL DEFAULT '',
  period TEXT NOT NULL,
  dimension_member_id TEXT REFERENCES dimension_members(id),
  currency TEXT NOT NULL,
  financial_nature TEXT NOT NULL CHECK(financial_nature IN ('Economico','Financeiro')),
  amount_minor INTEGER NOT NULL,
  source_status TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  sync_state TEXT NOT NULL DEFAULT 'Atualizado' CHECK(sync_state IN ('Atualizado','PendenteConfirmacao','Obsoleto','Conflito','Erro')),
  -- Under ComConfirmacao, a detected change never overwrites amount_minor
  -- directly — it lands here until confirmMovements promotes it. The row's
  -- CURRENT amount_minor (the last confirmed value) keeps contributing to
  -- applyMapping's aggregate the whole time: "pending confirmation" flags a
  -- change for review, it never silently drops an already-committed cost
  -- from the budget.
  pending_amount_minor INTEGER,
  pending_source_status TEXT,
  pending_fingerprint TEXT,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- A plain UNIQUE(...) column list would not do: SQLite treats every NULL as
-- distinct from every other NULL in a UNIQUE constraint, so two movements
-- that both have no dimension would never collide and ON CONFLICT could
-- never match them. COALESCE normalises NULL to '' so they correctly do.
CREATE UNIQUE INDEX IF NOT EXISTS budget_integration_movements_identity
  ON budget_integration_movements(tenant_id, mapping_id, source_movement_reference, period, COALESCE(dimension_member_id,''));
CREATE INDEX IF NOT EXISTS budget_integration_movements_scope
  ON budget_integration_movements(tenant_id, mapping_id, period);

-- One row per (mapping, versão, período, dimensão, natureza) — the sum of
-- that mapping's "Atualizado" movements at the moment it was last applied
-- to a specific draft budget version, plus a frozen copy of the mapping
-- configuration that produced it (source_module/source_reference/
-- relation_policy/sync_policy), so a later change to the LIVE mapping can
-- never alter what an approved version shows it was computed from — the
-- same principle as 0080's catalog-hierarchy snapshot, applied here to
-- integration configuration instead of catalog hierarchy.
CREATE TABLE IF NOT EXISTS budget_integration_values (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  mapping_id TEXT NOT NULL REFERENCES financial_line_catalog_mappings(id),
  version_id TEXT NOT NULL REFERENCES budget_versions(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  line_id TEXT NOT NULL REFERENCES financial_line_catalog(id),
  period TEXT NOT NULL,
  dimension_member_id TEXT REFERENCES dimension_members(id),
  currency TEXT NOT NULL,
  financial_nature TEXT NOT NULL CHECK(financial_nature IN ('Economico','Financeiro')),
  integration_amount_minor INTEGER NOT NULL,
  movement_count INTEGER NOT NULL DEFAULT 0,
  source_module TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  relation_policy TEXT NOT NULL,
  sync_policy TEXT NOT NULL,
  applied_entry_id TEXT,
  sync_state TEXT NOT NULL DEFAULT 'Atualizado' CHECK(sync_state IN ('Atualizado','PendenteConfirmacao','Obsoleto','Conflito','Erro')),
  applied_by TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
-- Same NULL-normalising reasoning as budget_integration_movements above —
-- this expression index is also the ON CONFLICT target applyMapping's
-- upsert uses, so the two must stay in lockstep.
CREATE UNIQUE INDEX IF NOT EXISTS budget_integration_values_identity
  ON budget_integration_values(tenant_id, mapping_id, version_id, period, COALESCE(dimension_member_id,''), financial_nature);
CREATE INDEX IF NOT EXISTS budget_integration_values_version ON budget_integration_values(tenant_id, version_id);

CREATE TRIGGER IF NOT EXISTS budget_integration_values_insert_frozen_guard
BEFORE INSERT ON budget_integration_values
WHEN EXISTS(SELECT 1 FROM budget_versions v WHERE v.id=NEW.version_id AND v.status='Aprovado')
BEGIN SELECT RAISE(ABORT, 'budget version is approved and immutable'); END;
CREATE TRIGGER IF NOT EXISTS budget_integration_values_update_frozen_guard
BEFORE UPDATE ON budget_integration_values
WHEN EXISTS(SELECT 1 FROM budget_versions v WHERE v.id=OLD.version_id AND v.status='Aprovado')
BEGIN SELECT RAISE(ABORT, 'budget version is approved and immutable'); END;
CREATE TRIGGER IF NOT EXISTS budget_integration_values_delete_frozen_guard
BEFORE DELETE ON budget_integration_values
WHEN EXISTS(SELECT 1 FROM budget_versions v WHERE v.id=OLD.version_id AND v.status='Aprovado')
BEGIN SELECT RAISE(ABORT, 'budget version is approved and immutable'); END;

-- performance_entries gains the composition model requested in the
-- homologation review: the automatic (integration-sourced) component and
-- the manual adjustment stay separately identifiable, combined per an
-- explicit mode, instead of one flag that silently replaces the other.
-- amount_minor remains the single effective value every existing reader
-- (grid, totals, exports, catalogTotals) already uses — nothing downstream
-- needs to change. A cell with integration_amount_minor NULL behaves
-- exactly as before (a plain manual cell, Fase 2 behaviour unchanged).
ALTER TABLE performance_entries ADD COLUMN integration_amount_minor INTEGER;
ALTER TABLE performance_entries ADD COLUMN manual_adjustment_minor INTEGER NOT NULL DEFAULT 0;
-- Substituir: manual_adjustment_minor REPLACES the integration amount in
-- amount_minor (the integration amount is kept, not erased, for audit).
-- Adicionar: amount_minor = integration_amount_minor + manual_adjustment_minor.
-- Bloquear: the integration engine must skip this cell entirely on its next
-- apply — functionally the same guarantee manual_override already gives
-- plain manual cells, generalised to integration-managed ones.
ALTER TABLE performance_entries ADD COLUMN adjustment_mode TEXT CHECK(adjustment_mode IN ('Substituir','Adicionar','Bloquear'));
ALTER TABLE performance_entries ADD COLUMN integration_value_id TEXT REFERENCES budget_integration_values(id);
-- performance_entries_update_frozen_guard / _delete_frozen_guard (0079)
-- already block any UPDATE/DELETE once the version is Aprovado regardless
-- of which column changes, so these new columns inherit that protection
-- with no new trigger needed.
