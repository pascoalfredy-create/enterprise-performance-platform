CREATE TABLE IF NOT EXISTS employee_onboarding_documents (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,employee_id TEXT NOT NULL,
 title TEXT NOT NULL,description TEXT,document_url TEXT,
 status TEXT NOT NULL CHECK(status IN ('Pendente','Assinado')),
 published_by TEXT NOT NULL,published_at TEXT NOT NULL,
 signed_by TEXT,signature_name TEXT,signed_at TEXT,
 FOREIGN KEY(employee_id) REFERENCES employees(id)
);
CREATE INDEX IF NOT EXISTS employee_onboarding_documents_scope_idx ON employee_onboarding_documents(tenant_id,employee_id,status,published_at);
CREATE TRIGGER IF NOT EXISTS employee_onboarding_document_scope BEFORE INSERT ON employee_onboarding_documents
WHEN NOT EXISTS(SELECT 1 FROM employees e WHERE e.id=NEW.employee_id AND e.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'employee onboarding document outside tenant'); END;
CREATE TRIGGER IF NOT EXISTS employee_onboarding_document_no_delete BEFORE DELETE ON employee_onboarding_documents
BEGIN SELECT RAISE(ABORT,'employee onboarding documents cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS employee_onboarding_document_transition_guard BEFORE UPDATE ON employee_onboarding_documents
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.employee_id<>OLD.employee_id OR NEW.title<>OLD.title
 OR NEW.description IS NOT OLD.description OR NEW.document_url IS NOT OLD.document_url
 OR NEW.published_by<>OLD.published_by OR NEW.published_at<>OLD.published_at
 OR NOT (OLD.status='Pendente' AND NEW.status='Assinado' AND NEW.signed_by IS NOT NULL AND NEW.signature_name IS NOT NULL AND length(trim(NEW.signature_name))>2 AND NEW.signed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'invalid employee onboarding document transition'); END;
