ALTER TABLE payroll_runs ADD COLUMN organization_id TEXT;
UPDATE payroll_runs SET organization_id=(SELECT s.organization_id FROM payroll_run_scopes s WHERE s.run_id=payroll_runs.id) WHERE EXISTS(SELECT 1 FROM payroll_run_scopes s WHERE s.run_id=payroll_runs.id);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_period_scope_uq ON payroll_runs(tenant_id,period,currency,COALESCE(organization_id,''));
