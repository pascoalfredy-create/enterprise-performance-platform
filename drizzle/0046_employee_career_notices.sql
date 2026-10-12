CREATE TABLE IF NOT EXISTS employee_career_notices (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,employee_id TEXT NOT NULL,
 notice_type TEXT NOT NULL CHECK(notice_type IN ('Promoção','Aumento Salarial','Promoção e Aumento Salarial')),
 title TEXT NOT NULL,message TEXT NOT NULL,
 previous_job_title TEXT,new_job_title TEXT,
 previous_salary_minor INTEGER,new_salary_minor INTEGER,currency TEXT,
 effective_date TEXT,
 status TEXT NOT NULL CHECK(status IN ('Publicado','Reconhecido')),
 published_by TEXT NOT NULL,published_at TEXT NOT NULL,acknowledged_at TEXT,
 FOREIGN KEY(employee_id) REFERENCES employees(id)
);
CREATE INDEX IF NOT EXISTS employee_career_notices_scope_idx ON employee_career_notices(tenant_id,employee_id,status,published_at);
CREATE TRIGGER IF NOT EXISTS employee_career_notice_scope BEFORE INSERT ON employee_career_notices
WHEN NOT EXISTS(SELECT 1 FROM employees e WHERE e.id=NEW.employee_id AND e.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'employee career notice outside tenant'); END;
CREATE TRIGGER IF NOT EXISTS employee_career_notice_salary_guard BEFORE INSERT ON employee_career_notices
WHEN (NEW.previous_salary_minor IS NOT NULL OR NEW.new_salary_minor IS NOT NULL) AND NEW.currency IS NULL
BEGIN SELECT RAISE(ABORT,'career notice salary figures require a currency'); END;
CREATE TRIGGER IF NOT EXISTS employee_career_notice_no_delete BEFORE DELETE ON employee_career_notices
BEGIN SELECT RAISE(ABORT,'employee career notices cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS employee_career_notice_transition_guard BEFORE UPDATE ON employee_career_notices
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.employee_id<>OLD.employee_id OR NEW.notice_type<>OLD.notice_type
 OR NEW.title<>OLD.title OR NEW.message<>OLD.message
 OR NEW.previous_job_title IS NOT OLD.previous_job_title OR NEW.new_job_title IS NOT OLD.new_job_title
 OR NEW.previous_salary_minor IS NOT OLD.previous_salary_minor OR NEW.new_salary_minor IS NOT OLD.new_salary_minor
 OR NEW.currency IS NOT OLD.currency OR NEW.effective_date IS NOT OLD.effective_date
 OR NEW.published_by<>OLD.published_by OR NEW.published_at<>OLD.published_at
 OR NOT (OLD.status='Publicado' AND NEW.status='Reconhecido')
BEGIN SELECT RAISE(ABORT,'invalid employee career notice transition'); END;
CREATE TRIGGER IF NOT EXISTS employee_career_notice_ack_guard BEFORE UPDATE ON employee_career_notices
WHEN NEW.status='Reconhecido' AND NEW.acknowledged_at IS NULL
BEGIN SELECT RAISE(ABORT,'employee career notice acknowledgement requires acknowledged_at'); END;
