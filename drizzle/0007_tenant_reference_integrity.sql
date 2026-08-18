CREATE TRIGGER `platform_users_organization_tenant_insert`
BEFORE INSERT ON `platform_users`
WHEN NEW.`organization_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `organizations` WHERE `id`=NEW.`organization_id` AND `tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT,'organization outside tenant'); END;

CREATE TRIGGER `employees_organization_tenant_insert`
BEFORE INSERT ON `employees`
WHEN NOT EXISTS (SELECT 1 FROM `organizations` WHERE `id`=NEW.`organization_id` AND `tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT,'organization outside tenant'); END;

CREATE TRIGGER `dimension_members_dimension_tenant_insert`
BEFORE INSERT ON `dimension_members`
WHEN NOT EXISTS (SELECT 1 FROM `financial_dimensions` WHERE `id`=NEW.`dimension_id` AND `tenant_id`=NEW.`tenant_id`)
 OR (NEW.`parent_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `dimension_members` WHERE `id`=NEW.`parent_id` AND `dimension_id`=NEW.`dimension_id` AND `tenant_id`=NEW.`tenant_id`))
BEGIN SELECT RAISE(ABORT,'dimension reference outside tenant'); END;

CREATE TRIGGER `performance_entries_references_insert`
BEFORE INSERT ON `performance_entries`
WHEN NOT EXISTS (SELECT 1 FROM `organizations` WHERE `id`=NEW.`organization_id` AND `tenant_id`=NEW.`tenant_id`)
 OR (NEW.`version_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `budget_versions` WHERE `id`=NEW.`version_id` AND `tenant_id`=NEW.`tenant_id`))
 OR (NEW.`dimension_member_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `dimension_members` WHERE `id`=NEW.`dimension_member_id` AND `tenant_id`=NEW.`tenant_id`))
BEGIN SELECT RAISE(ABORT,'performance reference outside tenant'); END;

CREATE TRIGGER `salary_profiles_references_insert`
BEFORE INSERT ON `salary_profiles`
WHEN NOT EXISTS (SELECT 1 FROM `employees` WHERE `id`=NEW.`employee_id` AND `tenant_id`=NEW.`tenant_id`)
 OR (NEW.`dimension_member_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `dimension_members` WHERE `id`=NEW.`dimension_member_id` AND `tenant_id`=NEW.`tenant_id`))
BEGIN SELECT RAISE(ABORT,'salary reference outside tenant'); END;

CREATE TRIGGER `payroll_assignments_references_insert`
BEFORE INSERT ON `payroll_assignments`
WHEN NOT EXISTS (SELECT 1 FROM `employees` WHERE `id`=NEW.`employee_id` AND `tenant_id`=NEW.`tenant_id`)
 OR NOT EXISTS (SELECT 1 FROM `payroll_components` WHERE `id`=NEW.`component_id` AND `tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT,'payroll assignment outside tenant'); END;

CREATE TRIGGER `payroll_run_scopes_references_insert`
BEFORE INSERT ON `payroll_run_scopes`
WHEN NOT EXISTS (SELECT 1 FROM `payroll_runs` WHERE `id`=NEW.`run_id` AND `tenant_id`=NEW.`tenant_id`)
 OR (NEW.`organization_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `organizations` WHERE `id`=NEW.`organization_id` AND `tenant_id`=NEW.`tenant_id`))
BEGIN SELECT RAISE(ABORT,'payroll scope outside tenant'); END;

CREATE TRIGGER `payroll_run_lines_references_insert`
BEFORE INSERT ON `payroll_run_lines`
WHEN NOT EXISTS (SELECT 1 FROM `payroll_runs` WHERE `id`=NEW.`run_id` AND `tenant_id`=NEW.`tenant_id`)
 OR NOT EXISTS (SELECT 1 FROM `employees` WHERE `id`=NEW.`employee_id` AND `tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT,'payroll line outside tenant'); END;

CREATE TRIGGER `workforce_cost_references_insert`
BEFORE INSERT ON `workforce_cost_postings`
WHEN NOT EXISTS (SELECT 1 FROM `payroll_runs` WHERE `id`=NEW.`run_id` AND `tenant_id`=NEW.`tenant_id`)
 OR NOT EXISTS (SELECT 1 FROM `payroll_run_lines` WHERE `id`=NEW.`run_line_id` AND `run_id`=NEW.`run_id` AND `tenant_id`=NEW.`tenant_id`)
 OR NOT EXISTS (SELECT 1 FROM `employees` WHERE `id`=NEW.`employee_id` AND `tenant_id`=NEW.`tenant_id`)
 OR NOT EXISTS (SELECT 1 FROM `organizations` WHERE `id`=NEW.`organization_id` AND `tenant_id`=NEW.`tenant_id`)
 OR (NEW.`dimension_member_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `dimension_members` WHERE `id`=NEW.`dimension_member_id` AND `tenant_id`=NEW.`tenant_id`))
BEGIN SELECT RAISE(ABORT,'workforce reference outside tenant'); END;

CREATE TRIGGER `management_reports_version_tenant_insert`
BEFORE INSERT ON `management_reports`
WHEN NEW.`budget_version_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `budget_versions` WHERE `id`=NEW.`budget_version_id` AND `tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT,'report version outside tenant'); END;

CREATE TRIGGER `management_report_scopes_references_insert`
BEFORE INSERT ON `management_report_scopes`
WHEN NOT EXISTS (SELECT 1 FROM `management_reports` WHERE `id`=NEW.`report_id` AND `tenant_id`=NEW.`tenant_id`)
 OR (NEW.`organization_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `organizations` WHERE `id`=NEW.`organization_id` AND `tenant_id`=NEW.`tenant_id`))
BEGIN SELECT RAISE(ABORT,'report scope outside tenant'); END;

CREATE TRIGGER `closed_payroll_runs_immutable_update` BEFORE UPDATE ON `payroll_runs` WHEN OLD.`status`='Fechado' BEGIN SELECT RAISE(ABORT,'closed payroll is immutable'); END;
CREATE TRIGGER `closed_payroll_runs_immutable_delete` BEFORE DELETE ON `payroll_runs` WHEN OLD.`status`='Fechado' BEGIN SELECT RAISE(ABORT,'closed payroll is immutable'); END;
CREATE TRIGGER `closed_payroll_lines_immutable_update` BEFORE UPDATE ON `payroll_run_lines` WHEN EXISTS (SELECT 1 FROM `payroll_runs` WHERE `id`=OLD.`run_id` AND `tenant_id`=OLD.`tenant_id` AND `status`='Fechado') BEGIN SELECT RAISE(ABORT,'closed payroll line is immutable'); END;
CREATE TRIGGER `closed_payroll_lines_immutable_delete` BEFORE DELETE ON `payroll_run_lines` WHEN EXISTS (SELECT 1 FROM `payroll_runs` WHERE `id`=OLD.`run_id` AND `tenant_id`=OLD.`tenant_id` AND `status`='Fechado') BEGIN SELECT RAISE(ABORT,'closed payroll line is immutable'); END;
CREATE TRIGGER `management_reports_immutable_update` BEFORE UPDATE ON `management_reports` WHEN OLD.`status`='Emitido' BEGIN SELECT RAISE(ABORT,'issued report is immutable'); END;
CREATE TRIGGER `management_reports_immutable_delete` BEFORE DELETE ON `management_reports` WHEN OLD.`status`='Emitido' BEGIN SELECT RAISE(ABORT,'issued report is immutable'); END;
CREATE TRIGGER `workforce_cost_immutable_update` BEFORE UPDATE ON `workforce_cost_postings` BEGIN SELECT RAISE(ABORT,'workforce posting is immutable'); END;
CREATE TRIGGER `workforce_cost_immutable_delete` BEFORE DELETE ON `workforce_cost_postings` BEGIN SELECT RAISE(ABORT,'workforce posting is immutable'); END;
CREATE TRIGGER `payroll_performance_immutable_update` BEFORE UPDATE ON `performance_entries` WHEN OLD.`source`='Payroll' BEGIN SELECT RAISE(ABORT,'payroll performance entry is immutable'); END;
CREATE TRIGGER `payroll_performance_immutable_delete` BEFORE DELETE ON `performance_entries` WHEN OLD.`source`='Payroll' BEGIN SELECT RAISE(ABORT,'payroll performance entry is immutable'); END;
