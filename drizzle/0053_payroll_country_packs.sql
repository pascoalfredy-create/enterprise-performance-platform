CREATE TABLE IF NOT EXISTS payroll_country_packs (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,country_code TEXT NOT NULL CHECK(country_code IN ('AO','PT','GB','ES','FR')),
 status TEXT NOT NULL CHECK(status IN ('Em parametrização','Ativo')),
 pack_version TEXT NOT NULL,
 started_by TEXT NOT NULL,started_at TEXT NOT NULL,
 activated_by TEXT,activated_at TEXT,
 created_at TEXT NOT NULL,
 UNIQUE(tenant_id,country_code)
);
CREATE INDEX IF NOT EXISTS payroll_country_packs_scope_idx ON payroll_country_packs(tenant_id,country_code);
CREATE TRIGGER IF NOT EXISTS payroll_country_pack_no_delete BEFORE DELETE ON payroll_country_packs
BEGIN SELECT RAISE(ABORT,'payroll country pack records cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS payroll_country_pack_transition_guard BEFORE UPDATE ON payroll_country_packs
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.country_code<>OLD.country_code
 OR NEW.pack_version<>OLD.pack_version OR NEW.started_by<>OLD.started_by OR NEW.started_at<>OLD.started_at OR NEW.created_at<>OLD.created_at
 OR NOT (OLD.status='Em parametrização' AND NEW.status='Ativo' AND NEW.activated_by IS NOT NULL AND NEW.activated_at IS NOT NULL AND NEW.activated_by<>OLD.started_by)
BEGIN SELECT RAISE(ABORT,'invalid payroll country pack transition'); END;
