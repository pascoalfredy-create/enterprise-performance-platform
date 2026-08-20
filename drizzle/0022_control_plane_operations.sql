CREATE TABLE IF NOT EXISTS control_plane_change_requests (
 id TEXT PRIMARY KEY,change_type TEXT NOT NULL CHECK(change_type IN ('Suspender subscrição','Reativar subscrição','Suspender módulo','Reativar módulo')),
 target_type TEXT NOT NULL CHECK(target_type IN ('subscription','entitlement')),target_id TEXT NOT NULL,tenant_id TEXT NOT NULL,
 reason TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('Pendente','Aprovado','Rejeitado','Executado')),
 requested_by TEXT NOT NULL,requested_at TEXT NOT NULL,decided_by TEXT,decided_at TEXT,executed_at TEXT,
 before_json TEXT NOT NULL,after_json TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS control_plane_change_open_uq ON control_plane_change_requests(change_type,target_id) WHERE status IN ('Pendente','Aprovado');
CREATE TABLE IF NOT EXISTS operator_audit_events (
 id TEXT PRIMARY KEY,actor_email TEXT NOT NULL,action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,
 reason TEXT,evidence_hash TEXT NOT NULL,occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS control_plane_changes_status_idx ON control_plane_change_requests(status,requested_at);
CREATE INDEX IF NOT EXISTS operator_audit_timeline_idx ON operator_audit_events(occurred_at DESC,actor_email);
CREATE TRIGGER IF NOT EXISTS control_plane_change_transition_guard BEFORE UPDATE ON control_plane_change_requests
WHEN NEW.id<>OLD.id OR NEW.change_type<>OLD.change_type OR NEW.target_type<>OLD.target_type OR NEW.target_id<>OLD.target_id OR NEW.tenant_id<>OLD.tenant_id OR NEW.reason<>OLD.reason OR NEW.requested_by<>OLD.requested_by OR NEW.requested_at<>OLD.requested_at OR NEW.before_json<>OLD.before_json
 OR NOT ((OLD.status='Pendente' AND NEW.status IN ('Aprovado','Rejeitado')) OR (OLD.status='Aprovado' AND NEW.status='Executado'))
BEGIN SELECT RAISE(ABORT,'invalid control plane change transition'); END;
CREATE TRIGGER IF NOT EXISTS control_plane_change_no_delete BEFORE DELETE ON control_plane_change_requests BEGIN SELECT RAISE(ABORT,'control plane changes cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS operator_audit_no_update BEFORE UPDATE ON operator_audit_events BEGIN SELECT RAISE(ABORT,'operator audit is immutable'); END;
CREATE TRIGGER IF NOT EXISTS operator_audit_no_delete BEFORE DELETE ON operator_audit_events BEGIN SELECT RAISE(ABORT,'operator audit is immutable'); END;
CREATE TRIGGER IF NOT EXISTS module_entitlement_core_guard BEFORE UPDATE ON module_entitlements
WHEN OLD.module_code='CORE' AND NEW.status<>'Ativo' AND EXISTS(SELECT 1 FROM subscriptions s WHERE s.id=OLD.subscription_id AND s.status='Ativa')
BEGIN SELECT RAISE(ABORT,'CORE follows subscription status'); END;
