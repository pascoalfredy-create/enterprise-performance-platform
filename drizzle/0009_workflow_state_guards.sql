CREATE TRIGGER `budget_entries_require_draft`
BEFORE INSERT ON `performance_entries`
WHEN NEW.`scenario`='Budget' AND NOT EXISTS (
  SELECT 1 FROM `budget_versions` WHERE `id`=NEW.`version_id` AND `tenant_id`=NEW.`tenant_id` AND `status`='Rascunho'
)
BEGIN SELECT RAISE(ABORT,'budget version is not open'); END;

CREATE TRIGGER `budget_versions_valid_transition`
BEFORE UPDATE OF `status` ON `budget_versions`
WHEN NOT (OLD.`status`='Rascunho' AND NEW.`status`='Aprovado')
BEGIN SELECT RAISE(ABORT,'invalid budget transition'); END;

CREATE TRIGGER `payroll_runs_valid_transition`
BEFORE UPDATE OF `status` ON `payroll_runs`
WHEN NOT (
  (OLD.`status`='Rascunho' AND NEW.`status`='Validado') OR
  (OLD.`status`='Validado' AND NEW.`status`='Aprovado') OR
  (OLD.`status`='Aprovado' AND NEW.`status`='Fechado')
)
BEGIN SELECT RAISE(ABORT,'invalid payroll transition'); END;

CREATE TRIGGER `workforce_requires_closed_payroll`
BEFORE INSERT ON `workforce_cost_postings`
WHEN NOT EXISTS (SELECT 1 FROM `payroll_runs` WHERE `id`=NEW.`run_id` AND `tenant_id`=NEW.`tenant_id` AND `status`='Fechado')
BEGIN SELECT RAISE(ABORT,'payroll run is not closed'); END;
