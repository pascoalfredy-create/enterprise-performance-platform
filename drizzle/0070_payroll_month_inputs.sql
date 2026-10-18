CREATE TABLE payroll_month_inputs (
 tenant_id TEXT NOT NULL,employee_id TEXT NOT NULL,period TEXT NOT NULL,currency TEXT NOT NULL,
 included INTEGER NOT NULL CHECK(included IN (0,1)),values_json TEXT NOT NULL CHECK(json_valid(values_json)),
 revision INTEGER NOT NULL CHECK(revision>0),updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,employee_id,period,currency)
);
CREATE TRIGGER payroll_month_scope BEFORE INSERT ON payroll_month_inputs
WHEN NOT EXISTS(SELECT 1 FROM employees e WHERE e.id=NEW.employee_id AND e.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'payroll monthly input outside tenant'); END;
CREATE TRIGGER payroll_month_identity BEFORE UPDATE ON payroll_month_inputs
WHEN NEW.tenant_id<>OLD.tenant_id OR NEW.employee_id<>OLD.employee_id OR NEW.period<>OLD.period OR NEW.currency<>OLD.currency OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'invalid payroll monthly revision'); END;
CREATE TRIGGER payroll_month_lock_insert BEFORE INSERT ON payroll_month_inputs
WHEN EXISTS(SELECT 1 FROM payroll_run_lines l JOIN payroll_runs r ON r.id=l.run_id AND r.tenant_id=l.tenant_id WHERE l.tenant_id=NEW.tenant_id AND l.employee_id=NEW.employee_id AND r.period=NEW.period AND r.currency=NEW.currency AND r.status<>'Cancelado')
BEGIN SELECT RAISE(ABORT,'monthly payroll inputs are locked'); END;
CREATE TRIGGER payroll_month_lock_update BEFORE UPDATE ON payroll_month_inputs
WHEN EXISTS(SELECT 1 FROM payroll_run_lines l JOIN payroll_runs r ON r.id=l.run_id AND r.tenant_id=l.tenant_id WHERE l.tenant_id=NEW.tenant_id AND l.employee_id=NEW.employee_id AND r.period=NEW.period AND r.currency=NEW.currency AND r.status<>'Cancelado')
BEGIN SELECT RAISE(ABORT,'monthly payroll inputs are locked'); END;
CREATE TRIGGER payroll_month_revision_at_calculation BEFORE INSERT ON payroll_run_lines
WHEN json_extract(NEW.input_snapshot,'$.monthlyInputRevision') IS NOT NULL
 AND json_extract(NEW.input_snapshot,'$.monthlyInputRevision')<>COALESCE((SELECT i.revision FROM payroll_month_inputs i JOIN payroll_runs r ON r.id=NEW.run_id AND r.tenant_id=NEW.tenant_id WHERE i.tenant_id=NEW.tenant_id AND i.employee_id=NEW.employee_id AND i.period=r.period AND i.currency=r.currency),0)
BEGIN SELECT RAISE(ABORT,'payroll monthly inputs changed'); END;
CREATE TRIGGER payroll_month_no_delete BEFORE DELETE ON payroll_month_inputs
BEGIN SELECT RAISE(ABORT,'monthly payroll inputs cannot be deleted'); END;
