CREATE TABLE IF NOT EXISTS performance_reviews (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, cycle_id TEXT NOT NULL, organization_id TEXT NOT NULL,
 subject_email TEXT NOT NULL, reviewer_email TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Aguardando autoavaliação','Aguardando gestor','Calibração','Finalizada','Cancelada')),
 self_competency_bps INTEGER, self_comment TEXT, self_submitted_at TEXT,
 goal_score_bps INTEGER, manager_competency_bps INTEGER, manager_comment TEXT, manager_submitted_at TEXT,
 calibrated_competency_bps INTEGER, calibration_reason TEXT, final_score_bps INTEGER,
 calibrated_by TEXT, calibrated_at TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(cycle_id) REFERENCES performance_cycles(id), FOREIGN KEY(organization_id) REFERENCES organizations(id),
 UNIQUE(tenant_id,cycle_id,subject_email)
);
CREATE TABLE IF NOT EXISTS performance_review_goal_snapshots (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, review_id TEXT NOT NULL, goal_id TEXT NOT NULL,
 progress_bps INTEGER NOT NULL CHECK(progress_bps BETWEEN 0 AND 10000), weight_bps INTEGER NOT NULL CHECK(weight_bps BETWEEN 1 AND 10000),
 captured_value_scaled INTEGER NOT NULL, captured_at TEXT NOT NULL, FOREIGN KEY(review_id) REFERENCES performance_reviews(id),
 FOREIGN KEY(goal_id) REFERENCES performance_goals(id), UNIQUE(tenant_id,review_id,goal_id)
);
CREATE TABLE IF NOT EXISTS performance_development_items (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, review_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT,
 owner_email TEXT NOT NULL, due_date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('Aberta','Concluída','Cancelada')),
 completion_evidence TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT,
 FOREIGN KEY(review_id) REFERENCES performance_reviews(id)
);
CREATE INDEX IF NOT EXISTS performance_reviews_scope_idx ON performance_reviews(tenant_id,organization_id,cycle_id,status,subject_email);
CREATE INDEX IF NOT EXISTS performance_development_scope_idx ON performance_development_items(tenant_id,owner_email,status,due_date);
CREATE TRIGGER IF NOT EXISTS performance_review_reference_guard BEFORE INSERT ON performance_reviews
WHEN NEW.subject_email=NEW.reviewer_email OR NOT EXISTS(
 SELECT 1 FROM performance_cycles c JOIN organizations o ON o.tenant_id=c.tenant_id
 JOIN platform_users s ON s.tenant_id=c.tenant_id JOIN platform_users r ON r.tenant_id=c.tenant_id
 WHERE c.id=NEW.cycle_id AND c.tenant_id=NEW.tenant_id AND c.status='Ativo'
 AND o.id=NEW.organization_id AND o.status='Ativa' AND lower(s.email)=lower(NEW.subject_email) AND s.status='Ativo' AND (s.organization_id IS NULL OR s.organization_id=NEW.organization_id)
 AND lower(r.email)=lower(NEW.reviewer_email) AND r.status='Ativo' AND (r.organization_id IS NULL OR r.organization_id=NEW.organization_id)
) OR NOT EXISTS(SELECT 1 FROM performance_goals g WHERE g.tenant_id=NEW.tenant_id AND g.cycle_id=NEW.cycle_id AND g.organization_id=NEW.organization_id AND lower(g.owner_email)=lower(NEW.subject_email) AND g.status IN ('Ativo','Concluído'))
BEGIN SELECT RAISE(ABORT,'invalid performance review reference'); END;
CREATE TRIGGER IF NOT EXISTS performance_review_transition_guard BEFORE UPDATE ON performance_reviews
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.cycle_id<>OLD.cycle_id OR NEW.organization_id<>OLD.organization_id
 OR NEW.subject_email<>OLD.subject_email OR NEW.reviewer_email<>OLD.reviewer_email OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT ((OLD.status='Aguardando autoavaliação' AND NEW.status='Aguardando gestor' AND NEW.self_competency_bps BETWEEN 2000 AND 10000 AND length(NEW.self_comment)>=3)
  OR (OLD.status='Aguardando gestor' AND NEW.status='Calibração' AND NEW.goal_score_bps BETWEEN 0 AND 10000 AND NEW.manager_competency_bps BETWEEN 2000 AND 10000 AND NEW.final_score_bps BETWEEN 0 AND 10000 AND length(NEW.manager_comment)>=3 AND EXISTS(SELECT 1 FROM performance_review_goal_snapshots x WHERE x.tenant_id=OLD.tenant_id AND x.review_id=OLD.id))
  OR (OLD.status='Calibração' AND NEW.status='Finalizada' AND NEW.calibrated_competency_bps BETWEEN 2000 AND 10000 AND NEW.final_score_bps BETWEEN 0 AND 10000 AND length(NEW.calibration_reason)>=10)
  OR (OLD.status IN ('Aguardando autoavaliação','Aguardando gestor') AND NEW.status='Cancelada'))
BEGIN SELECT RAISE(ABORT,'invalid performance review transition'); END;
CREATE TRIGGER IF NOT EXISTS performance_review_snapshot_guard BEFORE INSERT ON performance_review_goal_snapshots
WHEN NOT EXISTS(SELECT 1 FROM performance_reviews r JOIN performance_goals g ON g.tenant_id=r.tenant_id
 WHERE r.id=NEW.review_id AND r.tenant_id=NEW.tenant_id AND r.status='Aguardando gestor' AND g.id=NEW.goal_id
 AND g.cycle_id=r.cycle_id AND g.organization_id=r.organization_id AND lower(g.owner_email)=lower(r.subject_email))
BEGIN SELECT RAISE(ABORT,'invalid review goal snapshot'); END;
CREATE TRIGGER IF NOT EXISTS performance_review_snapshot_immutable_update BEFORE UPDATE ON performance_review_goal_snapshots BEGIN SELECT RAISE(ABORT,'review goal snapshots are immutable'); END;
CREATE TRIGGER IF NOT EXISTS performance_review_snapshot_immutable_delete BEFORE DELETE ON performance_review_goal_snapshots BEGIN SELECT RAISE(ABORT,'review goal snapshots are immutable'); END;
CREATE TRIGGER IF NOT EXISTS performance_review_no_delete BEFORE DELETE ON performance_reviews BEGIN SELECT RAISE(ABORT,'performance reviews cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS performance_development_reference_guard BEFORE INSERT ON performance_development_items
WHEN NOT EXISTS(SELECT 1 FROM performance_reviews r JOIN platform_users u ON u.tenant_id=r.tenant_id WHERE r.id=NEW.review_id AND r.tenant_id=NEW.tenant_id AND r.status='Finalizada' AND lower(u.email)=lower(NEW.owner_email) AND u.status='Ativo' AND (u.organization_id IS NULL OR u.organization_id=r.organization_id))
BEGIN SELECT RAISE(ABORT,'development item requires finalized review'); END;
CREATE TRIGGER IF NOT EXISTS performance_development_transition_guard BEFORE UPDATE ON performance_development_items
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.review_id<>OLD.review_id OR NEW.title<>OLD.title OR NEW.owner_email<>OLD.owner_email OR NEW.due_date<>OLD.due_date OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT (OLD.status='Aberta' AND NEW.status IN ('Concluída','Cancelada')) OR (NEW.status='Concluída' AND COALESCE(length(NEW.completion_evidence),0)<3)
BEGIN SELECT RAISE(ABORT,'invalid development item transition'); END;
CREATE TRIGGER IF NOT EXISTS performance_development_no_delete BEFORE DELETE ON performance_development_items BEGIN SELECT RAISE(ABORT,'development items cannot be deleted'); END;
