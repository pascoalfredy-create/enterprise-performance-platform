-- Existing components must be explicitly reviewed before statutory processing.
CREATE TABLE payroll_component_incidence (
 tenant_id TEXT NOT NULL, component_id TEXT NOT NULL,
 treatment TEXT NOT NULL CHECK(treatment IN ('Standard','Meal','Transport','Holiday','OtherDeduction','OtherEmployer','ManualTax')),
 reviewed_by TEXT NOT NULL, reviewed_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,component_id)
);
CREATE TRIGGER payroll_incidence_tenant_insert BEFORE INSERT ON payroll_component_incidence
WHEN NOT EXISTS(SELECT 1 FROM payroll_components c WHERE c.id=NEW.component_id AND c.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'payroll incidence outside tenant'); END;
CREATE TRIGGER payroll_incidence_tenant_update BEFORE UPDATE ON payroll_component_incidence
WHEN NEW.tenant_id<>OLD.tenant_id OR NEW.component_id<>OLD.component_id
BEGIN SELECT RAISE(ABORT,'payroll incidence identity is immutable'); END;
