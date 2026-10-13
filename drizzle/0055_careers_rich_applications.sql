ALTER TABLE recruitment_candidates ADD COLUMN birth_date TEXT;
ALTER TABLE recruitment_candidates ADD COLUMN national_id TEXT;
ALTER TABLE recruitment_candidates ADD COLUMN address TEXT;
ALTER TABLE recruitment_candidates ADD COLUMN linkedin_url TEXT;
ALTER TABLE recruitment_candidates ADD COLUMN current_employer TEXT;
ALTER TABLE recruitment_candidates ADD COLUMN current_role TEXT;
ALTER TABLE recruitment_candidates ADD COLUMN years_experience INTEGER CHECK(years_experience IS NULL OR years_experience>=0);
ALTER TABLE recruitment_candidates ADD COLUMN highest_education TEXT;
ALTER TABLE recruitment_candidates ADD COLUMN field_of_study TEXT;
ALTER TABLE recruitment_candidates ADD COLUMN institution TEXT;
ALTER TABLE recruitment_candidates ADD COLUMN presentation TEXT;

CREATE TABLE IF NOT EXISTS recruitment_candidate_documents (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,candidate_id TEXT NOT NULL,document_type TEXT NOT NULL CHECK(document_type IN ('CV','Carta de Apresentação','Certificado Académico','Outro')),file_name TEXT NOT NULL,mime_type TEXT NOT NULL,file_size INTEGER NOT NULL CHECK(file_size>0),storage_key TEXT NOT NULL,evidence_hash TEXT NOT NULL,uploaded_at TEXT NOT NULL,FOREIGN KEY(candidate_id) REFERENCES recruitment_candidates(id)
);
CREATE INDEX IF NOT EXISTS recruitment_candidate_documents_idx ON recruitment_candidate_documents(tenant_id,candidate_id);
CREATE TRIGGER IF NOT EXISTS recruitment_candidate_document_scope BEFORE INSERT ON recruitment_candidate_documents WHEN NOT EXISTS(SELECT 1 FROM recruitment_candidates c WHERE c.id=NEW.candidate_id AND c.tenant_id=NEW.tenant_id) BEGIN SELECT RAISE(ABORT,'recruitment candidate document outside tenant'); END;
CREATE TRIGGER IF NOT EXISTS recruitment_candidate_document_no_update BEFORE UPDATE ON recruitment_candidate_documents BEGIN SELECT RAISE(ABORT,'recruitment candidate documents cannot be modified'); END;
CREATE TRIGGER IF NOT EXISTS recruitment_candidate_document_no_delete BEFORE DELETE ON recruitment_candidate_documents BEGIN SELECT RAISE(ABORT,'recruitment candidate documents cannot be deleted'); END;

CREATE TABLE IF NOT EXISTS recruitment_spontaneous_applications (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,candidate_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('Em avaliação','Associada','Arquivada')),note TEXT,linked_application_id TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL,decided_by TEXT,decided_at TEXT,FOREIGN KEY(candidate_id) REFERENCES recruitment_candidates(id),FOREIGN KEY(linked_application_id) REFERENCES recruitment_applications(id)
);
CREATE INDEX IF NOT EXISTS recruitment_spontaneous_idx ON recruitment_spontaneous_applications(tenant_id,status);
CREATE TRIGGER IF NOT EXISTS recruitment_spontaneous_scope BEFORE INSERT ON recruitment_spontaneous_applications WHEN NOT EXISTS(SELECT 1 FROM recruitment_candidates c WHERE c.id=NEW.candidate_id AND c.tenant_id=NEW.tenant_id) BEGIN SELECT RAISE(ABORT,'spontaneous application outside tenant'); END;
CREATE TRIGGER IF NOT EXISTS recruitment_spontaneous_transition BEFORE UPDATE ON recruitment_spontaneous_applications WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.candidate_id<>OLD.candidate_id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NOT ((OLD.status='Em avaliação' AND NEW.status='Associada' AND NEW.linked_application_id IS NOT NULL AND NEW.decided_by IS NOT NULL AND NEW.decided_at IS NOT NULL) OR (OLD.status='Em avaliação' AND NEW.status='Arquivada' AND NEW.linked_application_id IS NULL AND NEW.decided_by IS NOT NULL AND NEW.decided_at IS NOT NULL)) BEGIN SELECT RAISE(ABORT,'invalid spontaneous application transition'); END;
CREATE TRIGGER IF NOT EXISTS recruitment_spontaneous_no_delete BEFORE DELETE ON recruitment_spontaneous_applications BEGIN SELECT RAISE(ABORT,'spontaneous applications cannot be deleted'); END;
