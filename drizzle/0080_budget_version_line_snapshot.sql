-- Freezes the catalog hierarchy/classification each budget version's
-- rubricas had at the moment of approval, so a later rename, reclassify or
-- reparent in financial_line_catalog cannot change how an already-approved
-- version's totals group or add up. line_id keeps pointing at the live
-- financial_line_catalog row (for the assumption/monthly joins, which are
-- already frozen by their own guards) — only the structural fields used to
-- build the tree and roll up subtotals are captured here.
CREATE TABLE IF NOT EXISTS budget_version_line_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  line_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_code TEXT,
  level INTEGER NOT NULL,
  display_order INTEGER NOT NULL,
  classification TEXT NOT NULL,
  cash_flow_category TEXT NOT NULL,
  sign_mode TEXT NOT NULL,
  line_kind TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (version_id) REFERENCES budget_versions(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS budget_version_line_snapshots_unique
  ON budget_version_line_snapshots(version_id, code);
CREATE INDEX IF NOT EXISTS budget_version_line_snapshots_version
  ON budget_version_line_snapshots(tenant_id, version_id);

CREATE TRIGGER IF NOT EXISTS budget_version_line_snapshots_no_update
BEFORE UPDATE ON budget_version_line_snapshots
BEGIN
  SELECT RAISE(ABORT, 'o snapshot de uma versão aprovada é imutável');
END;

CREATE TRIGGER IF NOT EXISTS budget_version_line_snapshots_no_delete
BEFORE DELETE ON budget_version_line_snapshots
BEGIN
  SELECT RAISE(ABORT, 'o snapshot de uma versão aprovada é imutável');
END;
