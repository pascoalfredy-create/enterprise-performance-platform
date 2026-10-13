ALTER TABLE payroll_runs ADD COLUMN organization_id TEXT;
-- The immutability trigger below also fires on this backfill UPDATE for
-- already-closed runs (any UPDATE on a 'Fechado' row is blocked), so it is
-- dropped and recreated identically around the backfill, all within this
-- same migration file (applied as one atomic unit).
DROP TRIGGER IF EXISTS closed_payroll_runs_immutable_update;
UPDATE payroll_runs SET organization_id=(SELECT s.organization_id FROM payroll_run_scopes s WHERE s.run_id=payroll_runs.id) WHERE EXISTS(SELECT 1 FROM payroll_run_scopes s WHERE s.run_id=payroll_runs.id);
CREATE TRIGGER IF NOT EXISTS `closed_payroll_runs_immutable_update` BEFORE UPDATE ON `payroll_runs` WHEN OLD.`status`='Fechado' BEGIN SELECT RAISE(ABORT,'closed payroll is immutable'); END;
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_period_scope_uq ON payroll_runs(tenant_id,period,currency,COALESCE(organization_id,''));
