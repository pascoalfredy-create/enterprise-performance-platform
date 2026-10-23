-- One active year-one study component per budget version and calendar anchor.
-- The source_reference JSON deliberately excludes the study revision: refreshing
-- a saved revision updates the same mapping instead of adding a second amount.
CREATE UNIQUE INDEX IF NOT EXISTS study_budget_source_identity
ON financial_line_catalog_mappings(tenant_id,source_reference)
WHERE source_module='Financeiro' AND status='Ativo'
AND json_extract(CASE WHEN json_valid(source_reference) THEN source_reference ELSE '{}' END,'$.kind')='study-year-one';

-- Full study inputs are restricted to the study-source permission, not copied
-- into cell provenance visible to budget-only readers.
CREATE TABLE study_budget_source_snapshots (
 id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 organization_id TEXT NOT NULL,
 study_id TEXT NOT NULL,
 study_revision INTEGER NOT NULL,
 study_name TEXT NOT NULL,
 currency TEXT NOT NULL,
 assumptions_json TEXT NOT NULL,
 calculator_version TEXT NOT NULL,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),
 FOREIGN KEY(organization_id) REFERENCES organizations(id)
);
CREATE TRIGGER study_budget_source_snapshot_update BEFORE UPDATE ON study_budget_source_snapshots
BEGIN SELECT RAISE(ABORT,'study source snapshot is immutable'); END;
CREATE TRIGGER study_budget_source_snapshot_delete BEFORE DELETE ON study_budget_source_snapshots
BEGIN SELECT RAISE(ABORT,'study source snapshot is immutable'); END;
