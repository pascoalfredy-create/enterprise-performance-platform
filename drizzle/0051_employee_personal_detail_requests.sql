CREATE TABLE IF NOT EXISTS employee_personal_detail_requests (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,employee_id TEXT NOT NULL,
 phone TEXT NOT NULL,address TEXT NOT NULL,emergency_contact_name TEXT NOT NULL,emergency_contact_phone TEXT NOT NULL,bank_iban TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Pendente','Aprovado','Rejeitado')),
 requested_by TEXT NOT NULL,requested_at TEXT NOT NULL,
 decided_by TEXT,decided_at TEXT,decision_note TEXT,
 CHECK(bank_iban='' OR length(bank_iban) BETWEEN 15 AND 34),
 FOREIGN KEY(employee_id) REFERENCES employees(id)
);
CREATE INDEX IF NOT EXISTS employee_personal_detail_requests_scope_idx ON employee_personal_detail_requests(tenant_id,employee_id,status,requested_at);

CREATE TRIGGER IF NOT EXISTS employee_personal_detail_request_scope BEFORE INSERT ON employee_personal_detail_requests
WHEN NOT EXISTS(SELECT 1 FROM employees e WHERE e.id=NEW.employee_id AND e.tenant_id=NEW.tenant_id)
 OR NEW.status<>'Pendente' OR NEW.decided_by IS NOT NULL OR NEW.decided_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'invalid employee personal detail request'); END;

CREATE TRIGGER IF NOT EXISTS employee_personal_detail_request_no_delete BEFORE DELETE ON employee_personal_detail_requests
BEGIN SELECT RAISE(ABORT,'employee personal detail requests cannot be deleted'); END;

CREATE TRIGGER IF NOT EXISTS employee_personal_detail_request_transition_guard BEFORE UPDATE ON employee_personal_detail_requests
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.employee_id<>OLD.employee_id
 OR NEW.phone<>OLD.phone OR NEW.address<>OLD.address OR NEW.emergency_contact_name<>OLD.emergency_contact_name OR NEW.emergency_contact_phone<>OLD.emergency_contact_phone OR NEW.bank_iban<>OLD.bank_iban
 OR NEW.requested_by<>OLD.requested_by OR NEW.requested_at<>OLD.requested_at
 OR NOT (OLD.status='Pendente' AND NEW.status IN ('Aprovado','Rejeitado') AND NEW.decided_by IS NOT NULL AND NEW.decided_at IS NOT NULL AND NEW.decided_by<>NEW.requested_by)
BEGIN SELECT RAISE(ABORT,'invalid employee personal detail request transition'); END;
