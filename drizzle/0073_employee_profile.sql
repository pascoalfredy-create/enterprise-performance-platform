-- Broaden the HR-owned employee record (previously just tax identity) into a full
-- registration profile: identification, identity documents, fiscal/banking reference
-- data and professional/organisational details, all filled directly in the employee
-- file by HR with no self-service maker-checker. Contract terms, salary and recurring
-- components already have their own sections and stay there -- this table only holds
-- the descriptive data nothing else owns yet. Bank transfer routing (IBAN) stays on
-- the governed personal-detail-request table, the one place money-routing changes are
-- still deliberately a two-person action.
DROP TRIGGER IF EXISTS employee_tax_identity_scope;
DROP TRIGGER IF EXISTS employee_tax_identity_immutable_keys;
ALTER TABLE employee_tax_identity RENAME TO employee_profile;
ALTER TABLE employee_profile RENAME COLUMN id_document TO id_document_number;
ALTER TABLE employee_profile ADD COLUMN short_name TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN gender TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN birth_date TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN marital_status TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN nationality TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN locality TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN postal_code TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN municipality TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN province TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN country TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN mobile_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN id_document_type TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN id_document_issue_place TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN id_document_issue_date TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN id_document_expiry_date TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN social_security_number TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN finance_office TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN income_type TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN bank_name TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN bank_branch TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN professional_category TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN establishment TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN profession TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN education_level TEXT NOT NULL DEFAULT '';
CREATE TRIGGER IF NOT EXISTS employee_profile_scope BEFORE INSERT ON employee_profile
WHEN NOT EXISTS(SELECT 1 FROM employees e WHERE e.id=NEW.employee_id AND e.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'employee profile outside tenant'); END;
CREATE TRIGGER IF NOT EXISTS employee_profile_immutable_keys BEFORE UPDATE ON employee_profile
WHEN NEW.tenant_id<>OLD.tenant_id OR NEW.employee_id<>OLD.employee_id
BEGIN SELECT RAISE(ABORT,'invalid employee profile update'); END;
