-- Fase 2 — Mapa Orçamental Anual e Motor de Pressupostos.
--
-- budget_assumptions holds the "ficha de pressupostos": zero or more
-- combinable factors per rubrica (Manual/QuantidadePreco/Crescimento/
-- Sazonalidade/Contrato now; Percentagem/Historico are schema-ready but
-- the worker layer never lets them be created yet — Fase 3). Each row
-- belongs to exactly one budget_versions row: assumptions never leak
-- across versions, and freeze the moment their version is Aprovado,
-- exactly like performance_entries already does for inserts.
CREATE TABLE IF NOT EXISTS budget_assumptions (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 version_id TEXT NOT NULL,
 line_id TEXT NOT NULL,
 organization_id TEXT NOT NULL,
 dimension_member_id TEXT,
 currency TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('Manual','QuantidadePreco','Crescimento','Sazonalidade','Contrato','Percentagem','Historico')),
 status TEXT NOT NULL CHECK(status IN ('Ativo','Inativo')) DEFAULT 'Ativo',
 precedence INTEGER NOT NULL DEFAULT 0,
 periodicity TEXT CHECK(periodicity IN ('Mensal','Trimestral','Anual','Pontual')),
 params TEXT NOT NULL DEFAULT '{}',
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 FOREIGN KEY(version_id) REFERENCES budget_versions(id),
 FOREIGN KEY(line_id) REFERENCES financial_line_catalog(id),
 FOREIGN KEY(organization_id) REFERENCES organizations(id),
 FOREIGN KEY(dimension_member_id) REFERENCES dimension_members(id)
);
CREATE INDEX IF NOT EXISTS budget_assumptions_scope_idx ON budget_assumptions(tenant_id,version_id,line_id,organization_id);

CREATE TRIGGER IF NOT EXISTS budget_assumptions_scope_guard BEFORE INSERT ON budget_assumptions
WHEN NOT EXISTS(SELECT 1 FROM budget_versions v WHERE v.id=NEW.version_id AND v.tenant_id=NEW.tenant_id)
 OR NOT EXISTS(SELECT 1 FROM financial_line_catalog l WHERE l.id=NEW.line_id AND l.tenant_id=NEW.tenant_id)
 OR NOT EXISTS(SELECT 1 FROM organizations o WHERE o.id=NEW.organization_id AND o.tenant_id=NEW.tenant_id)
 OR (NEW.dimension_member_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dimension_members d WHERE d.id=NEW.dimension_member_id AND d.tenant_id=NEW.tenant_id))
BEGIN SELECT RAISE(ABORT,'invalid budget assumption scope'); END;

-- Uma versão aprovada é completamente imutável: os pressupostos que lhe
-- pertencem também congelam (inserção, alteração e eliminação).
CREATE TRIGGER IF NOT EXISTS budget_assumptions_insert_frozen_guard BEFORE INSERT ON budget_assumptions
WHEN EXISTS(SELECT 1 FROM budget_versions v WHERE v.id=NEW.version_id AND v.status='Aprovado')
BEGIN SELECT RAISE(ABORT,'budget version is approved and immutable'); END;

CREATE TRIGGER IF NOT EXISTS budget_assumptions_update_frozen_guard BEFORE UPDATE ON budget_assumptions
WHEN EXISTS(SELECT 1 FROM budget_versions v WHERE v.id=OLD.version_id AND v.status='Aprovado')
BEGIN SELECT RAISE(ABORT,'budget version is approved and immutable'); END;

CREATE TRIGGER IF NOT EXISTS budget_assumptions_delete_frozen_guard BEFORE DELETE ON budget_assumptions
WHEN EXISTS(SELECT 1 FROM budget_versions v WHERE v.id=OLD.version_id AND v.status='Aprovado')
BEGIN SELECT RAISE(ABORT,'budget version is approved and immutable'); END;

-- performance_entries already blocks INSERTing a Budget-scenario row
-- unless its version is still Rascunho (0009's budget_entries_require_
-- draft) — but nothing stopped UPDATE/DELETE on a row already written
-- before its version got approved. The Mapa Anual's cell editing and
-- recalculation are the first features that would actually exercise that
-- gap, so it is closed here, additively, alongside this feature.
-- Actual-scenario rows (version_id IS NULL) are never affected.
CREATE TRIGGER IF NOT EXISTS performance_entries_update_frozen_guard BEFORE UPDATE ON performance_entries
WHEN OLD.version_id IS NOT NULL AND EXISTS(SELECT 1 FROM budget_versions v WHERE v.id=OLD.version_id AND v.status='Aprovado')
BEGIN SELECT RAISE(ABORT,'budget version is approved and immutable'); END;

CREATE TRIGGER IF NOT EXISTS performance_entries_delete_frozen_guard BEFORE DELETE ON performance_entries
WHEN OLD.version_id IS NOT NULL AND EXISTS(SELECT 1 FROM budget_versions v WHERE v.id=OLD.version_id AND v.status='Aprovado')
BEGIN SELECT RAISE(ABORT,'budget version is approved and immutable'); END;

-- A cell the user has explicitly protected with "ajuste manual" is never
-- silently overwritten by a recalculation from its rubrica's pressupostos.
ALTER TABLE performance_entries ADD COLUMN manual_override INTEGER NOT NULL DEFAULT 0 CHECK(manual_override IN (0,1));
