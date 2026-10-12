CREATE TABLE IF NOT EXISTS employee_tasks (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,employee_id TEXT NOT NULL,
 title TEXT NOT NULL,description TEXT,deliverable TEXT,
 priority TEXT NOT NULL CHECK(priority IN ('Baixa','Normal','Alta','Crítica')),
 due_date TEXT,status TEXT NOT NULL CHECK(status IN ('Pendente','Em curso','Concluída','Cancelada')),
 assigned_by TEXT NOT NULL,assigned_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 completed_at TEXT,completion_note TEXT,
 FOREIGN KEY(employee_id) REFERENCES employees(id)
);
CREATE INDEX IF NOT EXISTS employee_tasks_scope_idx ON employee_tasks(tenant_id,employee_id,status,due_date);
CREATE TRIGGER IF NOT EXISTS employee_task_scope BEFORE INSERT ON employee_tasks
WHEN NOT EXISTS(SELECT 1 FROM employees e WHERE e.id=NEW.employee_id AND e.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'employee task outside tenant'); END;
CREATE TRIGGER IF NOT EXISTS employee_task_no_delete BEFORE DELETE ON employee_tasks
BEGIN SELECT RAISE(ABORT,'employee tasks cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS employee_task_transition_guard BEFORE UPDATE ON employee_tasks
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.employee_id<>OLD.employee_id OR NEW.title<>OLD.title OR NEW.description IS NOT OLD.description OR NEW.deliverable IS NOT OLD.deliverable OR NEW.priority<>OLD.priority OR NEW.due_date IS NOT OLD.due_date OR NEW.assigned_by<>OLD.assigned_by OR NEW.assigned_at<>OLD.assigned_at
 OR OLD.status IN ('Concluída','Cancelada')
 OR NOT ((OLD.status='Pendente' AND NEW.status IN ('Em curso','Cancelada')) OR (OLD.status='Em curso' AND NEW.status IN ('Concluída','Cancelada')))
BEGIN SELECT RAISE(ABORT,'invalid employee task transition'); END;
CREATE TRIGGER IF NOT EXISTS employee_task_completion_guard BEFORE UPDATE ON employee_tasks
WHEN NEW.status='Concluída' AND NEW.completed_at IS NULL
BEGIN SELECT RAISE(ABORT,'employee task completion requires completed_at'); END;
