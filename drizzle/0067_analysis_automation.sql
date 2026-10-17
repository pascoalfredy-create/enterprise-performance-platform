CREATE TABLE analysis_settings (
 tenant_id TEXT NOT NULL,organization_id TEXT NOT NULL,currency TEXT NOT NULL,settings_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,organization_id,currency),FOREIGN KEY(organization_id) REFERENCES organizations(id)
);
CREATE TABLE analysis_imports (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,organization_id TEXT NOT NULL,currency TEXT NOT NULL,period TEXT NOT NULL,source_system TEXT NOT NULL,file_name TEXT NOT NULL,content_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,revision INTEGER NOT NULL DEFAULT 0,created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id) REFERENCES organizations(id)
);
CREATE UNIQUE INDEX analysis_active_snapshot ON analysis_imports(tenant_id,organization_id,currency,period) WHERE active=1;
CREATE TABLE analysis_import_rows (
 id TEXT PRIMARY KEY,import_id TEXT NOT NULL,tenant_id TEXT NOT NULL,source_code TEXT NOT NULL,description TEXT NOT NULL,role TEXT NOT NULL,amount_minor INTEGER NOT NULL,
 FOREIGN KEY(import_id) REFERENCES analysis_imports(id),UNIQUE(import_id,source_code)
);
CREATE TABLE analysis_source_mappings (
 tenant_id TEXT NOT NULL,organization_id TEXT NOT NULL,source_system TEXT NOT NULL,source_code TEXT NOT NULL,role TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,organization_id,source_system,source_code),FOREIGN KEY(organization_id) REFERENCES organizations(id)
);
CREATE INDEX analysis_import_scope ON analysis_imports(tenant_id,organization_id,currency,period);
