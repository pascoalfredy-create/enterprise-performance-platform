CREATE TABLE IF NOT EXISTS organization_ownership (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,organization_id TEXT NOT NULL,
 ownership_bps INTEGER NOT NULL CHECK(ownership_bps BETWEEN 0 AND 10000),
 effective_from TEXT NOT NULL,effective_to TEXT,
 status TEXT NOT NULL CHECK(status IN ('Ativo','Encerrado')),
 created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id) REFERENCES organizations(id)
);
CREATE INDEX IF NOT EXISTS organization_ownership_scope_idx ON organization_ownership(tenant_id,organization_id,status,effective_from);
CREATE UNIQUE INDEX IF NOT EXISTS organization_ownership_one_active_uq ON organization_ownership(tenant_id,organization_id) WHERE status='Ativo';
CREATE TRIGGER IF NOT EXISTS organization_ownership_scope BEFORE INSERT ON organization_ownership
WHEN NOT EXISTS(SELECT 1 FROM organizations o WHERE o.id=NEW.organization_id AND o.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'organization ownership outside tenant'); END;
CREATE TRIGGER IF NOT EXISTS organization_ownership_no_delete BEFORE DELETE ON organization_ownership
BEGIN SELECT RAISE(ABORT,'organization ownership records cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS organization_ownership_transition_guard BEFORE UPDATE ON organization_ownership
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.organization_id<>OLD.organization_id OR NEW.ownership_bps<>OLD.ownership_bps
 OR NEW.effective_from<>OLD.effective_from OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT (OLD.status='Ativo' AND NEW.status='Encerrado' AND NEW.effective_to IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'invalid organization ownership transition'); END;

ALTER TABLE consolidation_lines ADD COLUMN ownership_bps INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE consolidation_lines ADD COLUMN nci_amount_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE consolidation_runs ADD COLUMN nci_total_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE consolidation_runs ADD COLUMN parent_total_minor INTEGER;

DROP TRIGGER IF EXISTS consolidation_run_transition_guard;
CREATE TRIGGER IF NOT EXISTS consolidation_run_transition_guard BEFORE UPDATE ON consolidation_runs
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.rate_set_id<>OLD.rate_set_id OR NEW.period<>OLD.period OR NEW.target_currency<>OLD.target_currency
 OR NEW.run_number<>OLD.run_number OR NEW.source_count<>OLD.source_count OR NEW.organization_count<>OLD.organization_count OR NEW.currency_count<>OLD.currency_count
 OR NEW.converted_total_minor<>OLD.converted_total_minor OR NEW.nci_total_minor<>OLD.nci_total_minor OR NEW.input_hash<>OLD.input_hash
 OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT (OLD.status='Calculado' AND NEW.status='Aprovado'
  AND NEW.adjustment_total_minor=(SELECT COALESCE(SUM(amount_minor),0) FROM consolidation_adjustments a WHERE a.tenant_id=OLD.tenant_id AND a.run_id=OLD.id)
  AND NEW.reported_total_minor=OLD.converted_total_minor+NEW.adjustment_total_minor
  AND NEW.parent_total_minor=NEW.reported_total_minor-OLD.nci_total_minor
  AND NEW.approval_hash IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'invalid consolidation run transition'); END;
