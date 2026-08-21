CREATE TABLE IF NOT EXISTS workflow_tasks (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, organization_id TEXT,
 source_domain TEXT NOT NULL, source_id TEXT NOT NULL, source_target TEXT NOT NULL,
 title TEXT NOT NULL, detail TEXT NOT NULL,
 priority TEXT NOT NULL CHECK(priority IN ('Normal','Alta','Crítica')),
 assignee_email TEXT NOT NULL, due_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Aberta','Em curso','Concluída','Cancelada')),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 completed_at TEXT, completion_evidence TEXT,
 UNIQUE(tenant_id,source_domain,source_id), FOREIGN KEY(organization_id) REFERENCES organizations(id)
);
CREATE INDEX IF NOT EXISTS workflow_tasks_scope_idx ON workflow_tasks(tenant_id,organization_id,status,due_at);
CREATE INDEX IF NOT EXISTS workflow_tasks_assignee_idx ON workflow_tasks(tenant_id,assignee_email,status,due_at);
CREATE TRIGGER IF NOT EXISTS workflow_task_reference_guard BEFORE INSERT ON workflow_tasks
WHEN (NEW.organization_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM organizations o WHERE o.id=NEW.organization_id AND o.tenant_id=NEW.tenant_id AND o.status='Ativa')) OR NOT EXISTS(SELECT 1 FROM platform_users u WHERE lower(u.email)=lower(NEW.assignee_email) AND u.tenant_id=NEW.tenant_id AND u.status='Ativo')
BEGIN SELECT RAISE(ABORT,'workflow task reference outside tenant'); END;
CREATE TRIGGER IF NOT EXISTS workflow_task_no_delete BEFORE DELETE ON workflow_tasks BEGIN SELECT RAISE(ABORT,'workflow tasks cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS workflow_task_transition_guard BEFORE UPDATE ON workflow_tasks
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.organization_id IS NOT OLD.organization_id OR NEW.source_domain<>OLD.source_domain OR NEW.source_id<>OLD.source_id OR NEW.source_target<>OLD.source_target OR NEW.title<>OLD.title OR NEW.detail<>OLD.detail OR NEW.priority<>OLD.priority OR NEW.assignee_email<>OLD.assignee_email OR NEW.due_at<>OLD.due_at OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR OLD.status IN ('Concluída','Cancelada') OR NOT ((OLD.status='Aberta' AND NEW.status IN ('Em curso','Concluída','Cancelada')) OR (OLD.status='Em curso' AND NEW.status IN ('Concluída','Cancelada')))
BEGIN SELECT RAISE(ABORT,'invalid workflow task transition'); END;
CREATE TRIGGER IF NOT EXISTS workflow_task_completion_guard BEFORE UPDATE ON workflow_tasks
WHEN NEW.status='Concluída' AND (NEW.completion_evidence IS NULL OR length(trim(NEW.completion_evidence))<3 OR NEW.completed_at IS NULL)
BEGIN SELECT RAISE(ABORT,'workflow task completion evidence is required'); END;
