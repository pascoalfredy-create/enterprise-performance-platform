ALTER TABLE employee_personal_detail_requests ADD COLUMN tax_id TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_personal_detail_requests ADD COLUMN id_document TEXT NOT NULL DEFAULT '';
DROP TRIGGER IF EXISTS employee_personal_detail_request_transition_guard;
CREATE TRIGGER employee_personal_detail_request_transition_guard BEFORE UPDATE ON employee_personal_detail_requests
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.employee_id<>OLD.employee_id
 OR NEW.phone<>OLD.phone OR NEW.address<>OLD.address OR NEW.emergency_contact_name<>OLD.emergency_contact_name OR NEW.emergency_contact_phone<>OLD.emergency_contact_phone OR NEW.bank_iban<>OLD.bank_iban
 OR NEW.tax_id<>OLD.tax_id OR NEW.id_document<>OLD.id_document
 OR NEW.requested_by<>OLD.requested_by OR NEW.requested_at<>OLD.requested_at
 OR NOT (OLD.status='Pendente' AND NEW.status IN ('Aprovado','Rejeitado') AND NEW.decided_by IS NOT NULL AND NEW.decided_at IS NOT NULL AND NEW.decided_by<>NEW.requested_by)
BEGIN SELECT RAISE(ABORT,'invalid employee personal detail request transition'); END;
