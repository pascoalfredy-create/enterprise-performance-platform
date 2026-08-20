CREATE TABLE IF NOT EXISTS performance_actions (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, organization_id TEXT NOT NULL,
 period TEXT, currency TEXT, source_line_code TEXT, source_context TEXT,
 title TEXT NOT NULL, description TEXT, owner_email TEXT NOT NULL, due_date TEXT NOT NULL,
 priority TEXT NOT NULL CHECK(priority IN ('Baixa','Normal','Alta','Crítica')),
 status TEXT NOT NULL CHECK(status IN ('Aberta','Em curso','Concluída','Cancelada')),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 completed_at TEXT, completion_evidence TEXT,
 FOREIGN KEY(organization_id) REFERENCES organizations(id)
);
CREATE INDEX IF NOT EXISTS performance_actions_scope_idx ON performance_actions(tenant_id,organization_id,status,due_date);
CREATE TRIGGER IF NOT EXISTS performance_action_reference_guard BEFORE INSERT ON performance_actions
WHEN NOT EXISTS(SELECT 1 FROM organizations o WHERE o.id=NEW.organization_id AND o.tenant_id=NEW.tenant_id AND o.status='Ativa') OR NOT EXISTS(SELECT 1 FROM platform_users u WHERE lower(u.email)=lower(NEW.owner_email) AND u.tenant_id=NEW.tenant_id AND u.status='Ativo')
BEGIN SELECT RAISE(ABORT,'performance action reference outside tenant'); END;
CREATE TRIGGER IF NOT EXISTS performance_action_no_delete BEFORE DELETE ON performance_actions
BEGIN SELECT RAISE(ABORT,'performance actions cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS performance_action_transition_guard BEFORE UPDATE ON performance_actions
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.organization_id<>OLD.organization_id OR NEW.period IS NOT OLD.period OR NEW.currency IS NOT OLD.currency OR NEW.source_line_code IS NOT OLD.source_line_code OR NEW.source_context IS NOT OLD.source_context OR NEW.title<>OLD.title OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR OLD.status IN ('Concluída','Cancelada') OR NOT ((OLD.status='Aberta' AND NEW.status IN ('Em curso','Concluída','Cancelada')) OR (OLD.status='Em curso' AND NEW.status IN ('Concluída','Cancelada')))
BEGIN SELECT RAISE(ABORT,'invalid performance action transition'); END;
CREATE TRIGGER IF NOT EXISTS performance_action_completion_guard BEFORE UPDATE ON performance_actions
WHEN NEW.status='Concluída' AND (NEW.completion_evidence IS NULL OR length(trim(NEW.completion_evidence))<3 OR NEW.completed_at IS NULL)
BEGIN SELECT RAISE(ABORT,'completion evidence is required'); END;
