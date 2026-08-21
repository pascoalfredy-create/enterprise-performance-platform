CREATE TABLE IF NOT EXISTS demo_enterprise_installations (
 tenant_id TEXT PRIMARY KEY,
 dataset_version TEXT NOT NULL,
 installed_by TEXT NOT NULL,
 installed_at TEXT NOT NULL,
 record_count INTEGER NOT NULL CHECK(record_count>0),
 module_count INTEGER NOT NULL CHECK(module_count>0)
);
CREATE TRIGGER IF NOT EXISTS demo_enterprise_installation_immutable BEFORE UPDATE ON demo_enterprise_installations BEGIN SELECT RAISE(ABORT,'demo enterprise installation is immutable'); END;
CREATE TRIGGER IF NOT EXISTS demo_enterprise_installation_no_delete BEFORE DELETE ON demo_enterprise_installations BEGIN SELECT RAISE(ABORT,'demo enterprise installation cannot be deleted'); END;
