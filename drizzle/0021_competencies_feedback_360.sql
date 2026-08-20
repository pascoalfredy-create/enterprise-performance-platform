CREATE TABLE IF NOT EXISTS competency_frameworks (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,description TEXT,
 status TEXT NOT NULL CHECK(status IN ('Rascunho','Ativo','Arquivado')),created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 activated_by TEXT,activated_at TEXT,UNIQUE(tenant_id,name)
);
CREATE TABLE IF NOT EXISTS competency_definitions (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,framework_id TEXT NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,
 description TEXT,category TEXT NOT NULL,weight_bps INTEGER NOT NULL CHECK(weight_bps BETWEEN 1 AND 10000),
 status TEXT NOT NULL CHECK(status IN ('Ativa','Inativa')),created_at TEXT NOT NULL,
 FOREIGN KEY(framework_id) REFERENCES competency_frameworks(id),UNIQUE(tenant_id,framework_id,code)
);
CREATE TABLE IF NOT EXISTS feedback_360_rounds (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,review_id TEXT NOT NULL,framework_id TEXT NOT NULL,due_date TEXT NOT NULL,
 confidentiality TEXT NOT NULL CHECK(confidentiality IN ('Identificado','Confidencial')),
 status TEXT NOT NULL CHECK(status IN ('Rascunho','Aberto','Fechado','Cancelado')),created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 opened_by TEXT,opened_at TEXT,closed_by TEXT,closed_at TEXT,overall_score_bps INTEGER,
 FOREIGN KEY(review_id) REFERENCES performance_reviews(id),FOREIGN KEY(framework_id) REFERENCES competency_frameworks(id),
 UNIQUE(tenant_id,review_id,framework_id)
);
CREATE TABLE IF NOT EXISTS feedback_360_participants (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,round_id TEXT NOT NULL,evaluator_email TEXT NOT NULL,
 relationship TEXT NOT NULL CHECK(relationship IN ('Autoavaliação','Gestor','Par','Reporte direto','Outro')),
 weight_bps INTEGER NOT NULL CHECK(weight_bps BETWEEN 1 AND 10000),status TEXT NOT NULL CHECK(status IN ('Pendente','Submetido')),
 invited_at TEXT NOT NULL,submitted_at TEXT,FOREIGN KEY(round_id) REFERENCES feedback_360_rounds(id),
 UNIQUE(tenant_id,round_id,evaluator_email)
);
CREATE TABLE IF NOT EXISTS feedback_360_responses (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,round_id TEXT NOT NULL,participant_id TEXT NOT NULL,competency_id TEXT NOT NULL,
 rating_bps INTEGER NOT NULL CHECK(rating_bps IN (2000,4000,6000,8000,10000)),comment TEXT,submitted_at TEXT NOT NULL,
 FOREIGN KEY(round_id) REFERENCES feedback_360_rounds(id),FOREIGN KEY(participant_id) REFERENCES feedback_360_participants(id),
 FOREIGN KEY(competency_id) REFERENCES competency_definitions(id),UNIQUE(tenant_id,participant_id,competency_id)
);
CREATE INDEX IF NOT EXISTS competency_framework_scope_idx ON competency_frameworks(tenant_id,status);
CREATE INDEX IF NOT EXISTS feedback_360_scope_idx ON feedback_360_rounds(tenant_id,status,due_date);
CREATE INDEX IF NOT EXISTS feedback_360_participant_idx ON feedback_360_participants(tenant_id,evaluator_email,status);
CREATE TRIGGER IF NOT EXISTS competency_definition_reference_guard BEFORE INSERT ON competency_definitions
WHEN NOT EXISTS(SELECT 1 FROM competency_frameworks f WHERE f.id=NEW.framework_id AND f.tenant_id=NEW.tenant_id AND f.status='Rascunho')
BEGIN SELECT RAISE(ABORT,'competency requires draft framework'); END;
CREATE TRIGGER IF NOT EXISTS competency_definition_immutable_update BEFORE UPDATE ON competency_definitions BEGIN SELECT RAISE(ABORT,'competency definitions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS competency_definition_no_delete BEFORE DELETE ON competency_definitions BEGIN SELECT RAISE(ABORT,'competency definitions cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS competency_framework_transition_guard BEFORE UPDATE ON competency_frameworks
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.name<>OLD.name OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT ((OLD.status='Rascunho' AND NEW.status='Ativo') OR (OLD.status='Ativo' AND NEW.status='Arquivado'))
 OR (NEW.status='Ativo' AND (SELECT COALESCE(SUM(weight_bps),0) FROM competency_definitions c WHERE c.tenant_id=OLD.tenant_id AND c.framework_id=OLD.id AND c.status='Ativa')<>10000)
BEGIN SELECT RAISE(ABORT,'invalid competency framework transition or weights'); END;
CREATE TRIGGER IF NOT EXISTS competency_framework_no_delete BEFORE DELETE ON competency_frameworks BEGIN SELECT RAISE(ABORT,'competency frameworks cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS feedback_360_round_reference_guard BEFORE INSERT ON feedback_360_rounds
WHEN NOT EXISTS(SELECT 1 FROM performance_reviews r JOIN competency_frameworks f ON f.tenant_id=r.tenant_id WHERE r.id=NEW.review_id AND r.tenant_id=NEW.tenant_id AND r.status<>'Cancelada' AND f.id=NEW.framework_id AND f.status='Ativo')
BEGIN SELECT RAISE(ABORT,'invalid feedback round reference'); END;
CREATE TRIGGER IF NOT EXISTS feedback_360_participant_guard BEFORE INSERT ON feedback_360_participants
WHEN NOT EXISTS(SELECT 1 FROM feedback_360_rounds r JOIN performance_reviews v ON v.id=r.review_id AND v.tenant_id=r.tenant_id JOIN platform_users u ON u.tenant_id=r.tenant_id WHERE r.id=NEW.round_id AND r.tenant_id=NEW.tenant_id AND r.status='Rascunho' AND lower(u.email)=lower(NEW.evaluator_email) AND u.status='Ativo' AND (u.organization_id IS NULL OR u.organization_id=v.organization_id))
BEGIN SELECT RAISE(ABORT,'invalid feedback participant'); END;
CREATE TRIGGER IF NOT EXISTS feedback_360_round_transition_guard BEFORE UPDATE ON feedback_360_rounds
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.review_id<>OLD.review_id OR NEW.framework_id<>OLD.framework_id OR NEW.due_date<>OLD.due_date OR NEW.confidentiality<>OLD.confidentiality OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT ((OLD.status='Rascunho' AND NEW.status='Aberto' AND (SELECT COUNT(*) FROM feedback_360_participants p WHERE p.tenant_id=OLD.tenant_id AND p.round_id=OLD.id)>=2)
  OR (OLD.status='Aberto' AND NEW.status='Fechado' AND NOT EXISTS(SELECT 1 FROM feedback_360_participants p WHERE p.tenant_id=OLD.tenant_id AND p.round_id=OLD.id AND p.status<>'Submetido') AND NEW.overall_score_bps=(SELECT ROUND(SUM(z.score*z.competency_weight)*1.0/SUM(z.competency_weight)) FROM (SELECT c.weight_bps competency_weight,SUM(x.rating_bps*p.weight_bps)*1.0/SUM(p.weight_bps) score FROM competency_definitions c JOIN feedback_360_responses x ON x.competency_id=c.id AND x.tenant_id=c.tenant_id JOIN feedback_360_participants p ON p.id=x.participant_id AND p.tenant_id=x.tenant_id WHERE x.round_id=OLD.id AND x.tenant_id=OLD.tenant_id GROUP BY c.id,c.weight_bps) z))
  OR (OLD.status IN ('Rascunho','Aberto') AND NEW.status='Cancelado'))
BEGIN SELECT RAISE(ABORT,'invalid feedback round transition'); END;
CREATE TRIGGER IF NOT EXISTS feedback_360_participant_transition_guard BEFORE UPDATE ON feedback_360_participants
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.round_id<>OLD.round_id OR NEW.evaluator_email<>OLD.evaluator_email OR NEW.relationship<>OLD.relationship OR NEW.weight_bps<>OLD.weight_bps OR NEW.invited_at<>OLD.invited_at
 OR NOT (OLD.status='Pendente' AND NEW.status='Submetido')
 OR (SELECT COUNT(*) FROM feedback_360_responses x WHERE x.tenant_id=OLD.tenant_id AND x.participant_id=OLD.id)<>(SELECT COUNT(*) FROM competency_definitions c JOIN feedback_360_rounds r ON r.framework_id=c.framework_id AND r.tenant_id=c.tenant_id WHERE r.id=OLD.round_id AND c.tenant_id=OLD.tenant_id AND c.status='Ativa')
BEGIN SELECT RAISE(ABORT,'invalid feedback participant transition'); END;
CREATE TRIGGER IF NOT EXISTS feedback_360_response_guard BEFORE INSERT ON feedback_360_responses
WHEN NOT EXISTS(SELECT 1 FROM feedback_360_participants p JOIN feedback_360_rounds r ON r.id=p.round_id AND r.tenant_id=p.tenant_id JOIN competency_definitions c ON c.framework_id=r.framework_id AND c.tenant_id=r.tenant_id WHERE p.id=NEW.participant_id AND p.tenant_id=NEW.tenant_id AND p.round_id=NEW.round_id AND p.status='Pendente' AND r.status='Aberto' AND c.id=NEW.competency_id AND c.status='Ativa')
BEGIN SELECT RAISE(ABORT,'invalid feedback response'); END;
CREATE TRIGGER IF NOT EXISTS feedback_360_response_immutable_update BEFORE UPDATE ON feedback_360_responses BEGIN SELECT RAISE(ABORT,'feedback responses are immutable'); END;
CREATE TRIGGER IF NOT EXISTS feedback_360_response_immutable_delete BEFORE DELETE ON feedback_360_responses BEGIN SELECT RAISE(ABORT,'feedback responses are immutable'); END;
CREATE TRIGGER IF NOT EXISTS feedback_360_round_no_delete BEFORE DELETE ON feedback_360_rounds BEGIN SELECT RAISE(ABORT,'feedback rounds cannot be deleted'); END;
