-- Fiscal identity (NIF, documento) is HR master data entered directly in the employee file,
-- not an employee self-service request. It never shipped in any UI, so drop it cleanly from
-- the governed personal-detail-request queue (trigger first, or SQLite refuses the column
-- drop with "error in trigger ... no such column") and give it its own small HR-writable
-- table instead of widening `employees`, whose fixed column list many fixtures and seed
-- scripts insert into positionally.
DROP TRIGGER IF EXISTS employee_personal_detail_request_transition_guard;
ALTER TABLE employee_personal_detail_requests DROP COLUMN tax_id;
ALTER TABLE employee_personal_detail_requests DROP COLUMN id_document;
CREATE TRIGGER employee_personal_detail_request_transition_guard BEFORE UPDATE ON employee_personal_detail_requests
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.employee_id<>OLD.employee_id
 OR NEW.phone<>OLD.phone OR NEW.address<>OLD.address OR NEW.emergency_contact_name<>OLD.emergency_contact_name OR NEW.emergency_contact_phone<>OLD.emergency_contact_phone OR NEW.bank_iban<>OLD.bank_iban
 OR NEW.requested_by<>OLD.requested_by OR NEW.requested_at<>OLD.requested_at
 OR NOT (OLD.status='Pendente' AND NEW.status IN ('Aprovado','Rejeitado') AND NEW.decided_by IS NOT NULL AND NEW.decided_at IS NOT NULL AND NEW.decided_by<>NEW.requested_by)
BEGIN SELECT RAISE(ABORT,'invalid employee personal detail request transition'); END;

CREATE TABLE IF NOT EXISTS employee_tax_identity (
 tenant_id TEXT NOT NULL,employee_id TEXT NOT NULL,tax_id TEXT NOT NULL DEFAULT '',id_document TEXT NOT NULL DEFAULT '',
 updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,employee_id),
 FOREIGN KEY(employee_id) REFERENCES employees(id)
);
CREATE TRIGGER IF NOT EXISTS employee_tax_identity_scope BEFORE INSERT ON employee_tax_identity
WHEN NOT EXISTS(SELECT 1 FROM employees e WHERE e.id=NEW.employee_id AND e.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'employee tax identity outside tenant'); END;
CREATE TRIGGER IF NOT EXISTS employee_tax_identity_immutable_keys BEFORE UPDATE ON employee_tax_identity
WHEN NEW.tenant_id<>OLD.tenant_id OR NEW.employee_id<>OLD.employee_id
BEGIN SELECT RAISE(ABORT,'invalid employee tax identity update'); END;
