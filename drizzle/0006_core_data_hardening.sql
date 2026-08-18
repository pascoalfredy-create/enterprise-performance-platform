CREATE TABLE IF NOT EXISTS `tenants` (
  `id` text PRIMARY KEY NOT NULL,
  `created_at` text NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `status` text NOT NULL CHECK (`status` IN ('Ativo','Inativo'))
);
CREATE UNIQUE INDEX IF NOT EXISTS `tenants_slug_uq` ON `tenants` (`slug`);

CREATE TABLE IF NOT EXISTS `invitation_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `user_id` text NOT NULL,
  `token_hash` text NOT NULL,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `used_at` text,
  `revoked_at` text
);
CREATE UNIQUE INDEX IF NOT EXISTS `invitation_tokens_hash_uq` ON `invitation_tokens` (`token_hash`);
CREATE INDEX IF NOT EXISTS `invitation_tokens_user_idx` ON `invitation_tokens` (`tenant_id`,`user_id`);

CREATE TABLE IF NOT EXISTS `payroll_run_scopes` (`run_id` text PRIMARY KEY NOT NULL,`tenant_id` text NOT NULL,`organization_id` text,`created_at` text NOT NULL);
CREATE TABLE IF NOT EXISTS `management_report_scopes` (`report_id` text PRIMARY KEY NOT NULL,`tenant_id` text NOT NULL,`organization_id` text,`created_at` text NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS `organizations_tenant_code_uq` ON `organizations` (`tenant_id`,`code`);
CREATE INDEX IF NOT EXISTS `organizations_tenant_status_idx` ON `organizations` (`tenant_id`,`status`);
CREATE UNIQUE INDEX IF NOT EXISTS `platform_users_tenant_email_uq` ON `platform_users` (`tenant_id`,`email`);
CREATE INDEX IF NOT EXISTS `platform_users_email_status_idx` ON `platform_users` (`email`,`status`);
CREATE UNIQUE INDEX IF NOT EXISTS `employees_tenant_number_uq` ON `employees` (`tenant_id`,`employee_number`);
CREATE INDEX IF NOT EXISTS `employees_tenant_org_status_idx` ON `employees` (`tenant_id`,`organization_id`,`status`);
CREATE INDEX IF NOT EXISTS `performance_scope_idx` ON `performance_entries` (`tenant_id`,`organization_id`,`period`,`currency`,`scenario`);
CREATE INDEX IF NOT EXISTS `payroll_runs_tenant_period_idx` ON `payroll_runs` (`tenant_id`,`period`,`currency`,`status`);
CREATE INDEX IF NOT EXISTS `payroll_run_scopes_scope_idx` ON `payroll_run_scopes` (`tenant_id`,`organization_id`);
CREATE INDEX IF NOT EXISTS `management_report_scopes_scope_idx` ON `management_report_scopes` (`tenant_id`,`organization_id`);

CREATE TRIGGER IF NOT EXISTS `performance_entries_validate_insert`
BEFORE INSERT ON `performance_entries`
WHEN NEW.`period` NOT GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' OR length(NEW.`currency`) <> 3 OR NEW.`scenario` NOT IN ('Actual','Budget','Forecast','Scenario')
BEGIN SELECT RAISE(ABORT,'invalid performance entry'); END;

CREATE TRIGGER IF NOT EXISTS `payroll_runs_validate_insert`
BEFORE INSERT ON `payroll_runs`
WHEN NEW.`period` NOT GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' OR length(NEW.`currency`) <> 3 OR NEW.`status` NOT IN ('Rascunho','Validado','Aprovado','Fechado') OR NEW.`employee_count` < 0
BEGIN SELECT RAISE(ABORT,'invalid payroll run'); END;

CREATE TRIGGER IF NOT EXISTS `workforce_cost_validate_insert`
BEFORE INSERT ON `workforce_cost_postings`
WHEN NEW.`total_minor` <> NEW.`gross_minor` + NEW.`employer_minor`
BEGIN SELECT RAISE(ABORT,'workforce total must reconcile'); END;
