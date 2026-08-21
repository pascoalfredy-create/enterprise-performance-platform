CREATE TABLE IF NOT EXISTS demo_portfolio_installations (
 tenant_id TEXT PRIMARY KEY,
 dataset_version TEXT NOT NULL,
 installed_by TEXT NOT NULL,
 installed_at TEXT NOT NULL,
 record_count INTEGER NOT NULL CHECK(record_count>0)
);
CREATE TRIGGER IF NOT EXISTS demo_portfolio_installation_immutable BEFORE UPDATE ON demo_portfolio_installations BEGIN SELECT RAISE(ABORT,'demo portfolio installation is immutable'); END;
CREATE TRIGGER IF NOT EXISTS demo_portfolio_installation_no_delete BEFORE DELETE ON demo_portfolio_installations BEGIN SELECT RAISE(ABORT,'demo portfolio installation cannot be deleted'); END;
