CREATE TABLE IF NOT EXISTS employee_reporting_lines (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,employee_id TEXT NOT NULL,manager_id TEXT NOT NULL,
 effective_from TEXT NOT NULL,effective_to TEXT,
 status TEXT NOT NULL CHECK(status IN ('Ativo','Encerrado')),
 created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 FOREIGN KEY(employee_id) REFERENCES employees(id),FOREIGN KEY(manager_id) REFERENCES employees(id)
);
CREATE INDEX IF NOT EXISTS employee_reporting_lines_scope_idx ON employee_reporting_lines(tenant_id,employee_id,status,effective_from);
CREATE INDEX IF NOT EXISTS employee_reporting_lines_manager_idx ON employee_reporting_lines(tenant_id,manager_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS employee_reporting_lines_one_active_uq ON employee_reporting_lines(tenant_id,employee_id) WHERE status='Ativo';

CREATE TRIGGER IF NOT EXISTS employee_reporting_line_scope BEFORE INSERT ON employee_reporting_lines
WHEN NEW.employee_id=NEW.manager_id
 OR NOT EXISTS(SELECT 1 FROM employees e WHERE e.id=NEW.employee_id AND e.tenant_id=NEW.tenant_id)
 OR NOT EXISTS(SELECT 1 FROM employees m WHERE m.id=NEW.manager_id AND m.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'employee reporting line outside tenant or self-referencing'); END;

CREATE TRIGGER IF NOT EXISTS employee_reporting_line_cycle_guard BEFORE INSERT ON employee_reporting_lines
WHEN NEW.employee_id<>NEW.manager_id AND EXISTS(
 WITH RECURSIVE chain(id) AS (
  SELECT NEW.manager_id
  UNION ALL
  SELECT r.manager_id FROM employee_reporting_lines r JOIN chain c ON r.employee_id=c.id WHERE r.tenant_id=NEW.tenant_id AND r.status='Ativo'
 )
 SELECT 1 FROM chain WHERE id=NEW.employee_id
)
BEGIN SELECT RAISE(ABORT,'invalid employee reporting line: would create a management cycle'); END;

CREATE TRIGGER IF NOT EXISTS employee_reporting_line_no_delete BEFORE DELETE ON employee_reporting_lines
BEGIN SELECT RAISE(ABORT,'employee reporting lines cannot be deleted'); END;

CREATE TRIGGER IF NOT EXISTS employee_reporting_line_transition_guard BEFORE UPDATE ON employee_reporting_lines
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.employee_id<>OLD.employee_id OR NEW.manager_id<>OLD.manager_id OR NEW.effective_from<>OLD.effective_from OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT (OLD.status='Ativo' AND NEW.status='Encerrado' AND NEW.effective_to IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'invalid employee reporting line transition'); END;
