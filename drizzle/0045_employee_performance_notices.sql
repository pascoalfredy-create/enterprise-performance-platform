CREATE TABLE IF NOT EXISTS employee_performance_notices (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,employee_id TEXT NOT NULL,
 cycle_name TEXT NOT NULL,
 overall_rating TEXT NOT NULL CHECK(overall_rating IN ('Abaixo do esperado','Dentro do esperado','Acima do esperado','Excecional')),
 score_bps INTEGER CHECK(score_bps IS NULL OR score_bps BETWEEN 0 AND 10000),
 summary TEXT NOT NULL,strengths TEXT,development_areas TEXT,
 status TEXT NOT NULL CHECK(status IN ('Publicado','Reconhecido')),
 published_by TEXT NOT NULL,published_at TEXT NOT NULL,acknowledged_at TEXT,
 FOREIGN KEY(employee_id) REFERENCES employees(id)
);
CREATE INDEX IF NOT EXISTS employee_performance_notices_scope_idx ON employee_performance_notices(tenant_id,employee_id,status,published_at);
CREATE TRIGGER IF NOT EXISTS employee_performance_notice_scope BEFORE INSERT ON employee_performance_notices
WHEN NOT EXISTS(SELECT 1 FROM employees e WHERE e.id=NEW.employee_id AND e.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'employee performance notice outside tenant'); END;
CREATE TRIGGER IF NOT EXISTS employee_performance_notice_no_delete BEFORE DELETE ON employee_performance_notices
BEGIN SELECT RAISE(ABORT,'employee performance notices cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS employee_performance_notice_transition_guard BEFORE UPDATE ON employee_performance_notices
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.employee_id<>OLD.employee_id OR NEW.cycle_name<>OLD.cycle_name
 OR NEW.overall_rating<>OLD.overall_rating OR NEW.score_bps IS NOT OLD.score_bps OR NEW.summary<>OLD.summary
 OR NEW.strengths IS NOT OLD.strengths OR NEW.development_areas IS NOT OLD.development_areas
 OR NEW.published_by<>OLD.published_by OR NEW.published_at<>OLD.published_at
 OR NOT (OLD.status='Publicado' AND NEW.status='Reconhecido')
BEGIN SELECT RAISE(ABORT,'invalid employee performance notice transition'); END;
CREATE TRIGGER IF NOT EXISTS employee_performance_notice_ack_guard BEFORE UPDATE ON employee_performance_notices
WHEN NEW.status='Reconhecido' AND NEW.acknowledged_at IS NULL
BEGIN SELECT RAISE(ABORT,'employee performance notice acknowledgement requires acknowledged_at'); END;
