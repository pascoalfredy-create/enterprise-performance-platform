CREATE TABLE IF NOT EXISTS financial_line_catalog (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,classification TEXT NOT NULL CHECK(classification IN ('Receita','Custo','Ativo','Passivo','Capital','Caixa','Outro')),cash_flow_category TEXT NOT NULL CHECK(cash_flow_category IN ('Operacional','Investimento','Financiamento','Não aplicável')),sign_mode TEXT NOT NULL CHECK(sign_mode IN ('Natural','Inverter')),status TEXT NOT NULL CHECK(status IN ('Ativa','Inativa')),created_by TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(tenant_id,code)
);
CREATE TABLE IF NOT EXISTS financial_source_mappings (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,source_system TEXT NOT NULL,source_code TEXT NOT NULL,line_id TEXT NOT NULL,dimension_member_id TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 FOREIGN KEY(line_id) REFERENCES financial_line_catalog(id),FOREIGN KEY(dimension_member_id) REFERENCES dimension_members(id),UNIQUE(tenant_id,source_system,source_code)
);
CREATE TABLE IF NOT EXISTS financial_import_batches (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,organization_id TEXT NOT NULL,period TEXT NOT NULL,currency TEXT NOT NULL,source_system TEXT NOT NULL,file_name TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('Carregado','Validado','Publicado','Rejeitado')),row_count INTEGER NOT NULL,total_minor INTEGER NOT NULL,input_hash TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,validated_by TEXT,validated_at TEXT,posted_by TEXT,posted_at TEXT,
 FOREIGN KEY(organization_id) REFERENCES organizations(id),UNIQUE(tenant_id,organization_id,period,currency,source_system,input_hash)
);
CREATE TABLE IF NOT EXISTS financial_import_rows (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,batch_id TEXT NOT NULL,row_number INTEGER NOT NULL,source_code TEXT NOT NULL,source_description TEXT NOT NULL,amount_minor INTEGER NOT NULL,line_id TEXT,dimension_member_id TEXT,mapping_status TEXT NOT NULL CHECK(mapping_status IN ('Mapeado','Pendente')),row_hash TEXT NOT NULL,
 FOREIGN KEY(batch_id) REFERENCES financial_import_batches(id),FOREIGN KEY(line_id) REFERENCES financial_line_catalog(id),FOREIGN KEY(dimension_member_id) REFERENCES dimension_members(id),UNIQUE(tenant_id,batch_id,row_number)
);
CREATE TABLE IF NOT EXISTS financial_import_postings (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,batch_id TEXT NOT NULL,row_id TEXT NOT NULL,performance_entry_id TEXT NOT NULL,posted_at TEXT NOT NULL,
 FOREIGN KEY(batch_id) REFERENCES financial_import_batches(id),FOREIGN KEY(row_id) REFERENCES financial_import_rows(id),FOREIGN KEY(performance_entry_id) REFERENCES performance_entries(id),UNIQUE(tenant_id,batch_id,row_id),UNIQUE(tenant_id,performance_entry_id)
);
CREATE INDEX IF NOT EXISTS financial_import_scope_idx ON financial_import_batches(tenant_id,organization_id,period,status);
CREATE INDEX IF NOT EXISTS financial_mapping_lookup_idx ON financial_source_mappings(tenant_id,source_system,source_code);
CREATE TRIGGER IF NOT EXISTS financial_mapping_guard BEFORE INSERT ON financial_source_mappings
WHEN NOT EXISTS(SELECT 1 FROM financial_line_catalog l WHERE l.id=NEW.line_id AND l.tenant_id=NEW.tenant_id AND l.status='Ativa') OR (NEW.dimension_member_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dimension_members d WHERE d.id=NEW.dimension_member_id AND d.tenant_id=NEW.tenant_id AND d.status='Ativo'))
BEGIN SELECT RAISE(ABORT,'invalid financial source mapping'); END;
CREATE TRIGGER IF NOT EXISTS financial_import_batch_guard BEFORE INSERT ON financial_import_batches
WHEN length(NEW.currency)<>3 OR NEW.period NOT GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' OR NOT EXISTS(SELECT 1 FROM organizations o WHERE o.id=NEW.organization_id AND o.tenant_id=NEW.tenant_id AND o.status='Ativa')
BEGIN SELECT RAISE(ABORT,'invalid financial import batch'); END;
CREATE TRIGGER IF NOT EXISTS financial_import_row_guard BEFORE INSERT ON financial_import_rows
WHEN NOT EXISTS(SELECT 1 FROM financial_import_batches b WHERE b.id=NEW.batch_id AND b.tenant_id=NEW.tenant_id AND b.status='Carregado') OR (NEW.line_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM financial_line_catalog l WHERE l.id=NEW.line_id AND l.tenant_id=NEW.tenant_id))
BEGIN SELECT RAISE(ABORT,'invalid financial import row'); END;
CREATE TRIGGER IF NOT EXISTS financial_import_row_immutable_update BEFORE UPDATE ON financial_import_rows BEGIN SELECT RAISE(ABORT,'financial import rows are immutable'); END;
CREATE TRIGGER IF NOT EXISTS financial_import_row_no_delete BEFORE DELETE ON financial_import_rows BEGIN SELECT RAISE(ABORT,'financial import rows cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS financial_import_posting_guard BEFORE INSERT ON financial_import_postings
WHEN NOT EXISTS(SELECT 1 FROM financial_import_batches b JOIN financial_import_rows r ON r.batch_id=b.id AND r.tenant_id=b.tenant_id JOIN performance_entries p ON p.id=NEW.performance_entry_id AND p.tenant_id=b.tenant_id WHERE b.id=NEW.batch_id AND b.tenant_id=NEW.tenant_id AND b.status='Validado' AND r.id=NEW.row_id AND p.source='Import:'||b.id)
BEGIN SELECT RAISE(ABORT,'invalid financial import posting'); END;
CREATE TRIGGER IF NOT EXISTS financial_import_posting_immutable_update BEFORE UPDATE ON financial_import_postings BEGIN SELECT RAISE(ABORT,'financial import postings are immutable'); END;
CREATE TRIGGER IF NOT EXISTS financial_import_posting_no_delete BEFORE DELETE ON financial_import_postings BEGIN SELECT RAISE(ABORT,'financial import postings cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS financial_import_transition_guard BEFORE UPDATE ON financial_import_batches
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.organization_id<>OLD.organization_id OR NEW.period<>OLD.period OR NEW.currency<>OLD.currency OR NEW.source_system<>OLD.source_system OR NEW.file_name<>OLD.file_name OR NEW.row_count<>OLD.row_count OR NEW.total_minor<>OLD.total_minor OR NEW.input_hash<>OLD.input_hash OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT ((OLD.status='Carregado' AND NEW.status IN ('Validado','Rejeitado')) OR (OLD.status='Validado' AND NEW.status='Publicado'))
BEGIN SELECT RAISE(ABORT,'invalid financial import transition'); END;
CREATE TRIGGER IF NOT EXISTS financial_import_no_delete BEFORE DELETE ON financial_import_batches BEGIN SELECT RAISE(ABORT,'financial imports cannot be deleted'); END;
