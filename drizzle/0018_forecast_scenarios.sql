CREATE TABLE IF NOT EXISTS planning_versions (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, version_type TEXT NOT NULL CHECK(version_type IN ('Forecast','Cenário')),
 fiscal_year INTEGER NOT NULL, base_budget_id TEXT, status TEXT NOT NULL CHECK(status IN ('Rascunho','Aprovado','Arquivado')),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT,
 FOREIGN KEY(base_budget_id) REFERENCES budget_versions(id), UNIQUE(tenant_id,name,fiscal_year,version_type)
);
CREATE TABLE IF NOT EXISTS planning_entries (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, version_id TEXT NOT NULL, organization_id TEXT NOT NULL,
 period TEXT NOT NULL, currency TEXT NOT NULL, line_code TEXT NOT NULL, line_name TEXT NOT NULL,
 dimension_member_id TEXT, amount_minor INTEGER NOT NULL, assumption_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(version_id) REFERENCES planning_versions(id), FOREIGN KEY(organization_id) REFERENCES organizations(id), FOREIGN KEY(dimension_member_id) REFERENCES dimension_members(id)
);
CREATE INDEX IF NOT EXISTS planning_entries_analysis_idx ON planning_entries(tenant_id,version_id,period,currency,organization_id,line_code);
CREATE TRIGGER IF NOT EXISTS planning_version_base_guard BEFORE INSERT ON planning_versions
WHEN NEW.base_budget_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM budget_versions b WHERE b.id=NEW.base_budget_id AND b.tenant_id=NEW.tenant_id AND b.status='Aprovado')
BEGIN SELECT RAISE(ABORT,'planning base budget must be approved in tenant'); END;
CREATE TRIGGER IF NOT EXISTS planning_entry_reference_guard BEFORE INSERT ON planning_entries
WHEN NOT EXISTS(SELECT 1 FROM planning_versions v JOIN organizations o ON o.tenant_id=v.tenant_id WHERE v.id=NEW.version_id AND o.id=NEW.organization_id AND v.tenant_id=NEW.tenant_id AND v.status='Rascunho' AND o.status='Ativa') OR (NEW.dimension_member_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dimension_members m WHERE m.id=NEW.dimension_member_id AND m.tenant_id=NEW.tenant_id AND m.status='Ativo'))
BEGIN SELECT RAISE(ABORT,'invalid planning entry reference or closed version'); END;
CREATE TRIGGER IF NOT EXISTS planning_entry_format_guard BEFORE INSERT ON planning_entries
WHEN NEW.period NOT GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' OR length(NEW.currency)<>3 OR length(trim(NEW.line_code))=0 OR length(trim(NEW.line_name))=0
BEGIN SELECT RAISE(ABORT,'invalid planning entry'); END;
CREATE TRIGGER IF NOT EXISTS planning_version_transition_guard BEFORE UPDATE ON planning_versions
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.name<>OLD.name OR NEW.version_type<>OLD.version_type OR NEW.fiscal_year<>OLD.fiscal_year OR NEW.base_budget_id IS NOT OLD.base_budget_id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NOT ((OLD.status='Rascunho' AND NEW.status='Aprovado') OR (OLD.status='Aprovado' AND NEW.status='Arquivado'))
BEGIN SELECT RAISE(ABORT,'invalid planning version transition'); END;
CREATE TRIGGER IF NOT EXISTS planning_entry_no_change_update BEFORE UPDATE ON planning_entries
BEGIN SELECT RAISE(ABORT,'planning entries are append only'); END;
CREATE TRIGGER IF NOT EXISTS planning_entry_no_delete BEFORE DELETE ON planning_entries
BEGIN SELECT RAISE(ABORT,'planning entries are append only'); END;
