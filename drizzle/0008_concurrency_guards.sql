CREATE UNIQUE INDEX `dimension_members_business_key_uq` ON `dimension_members` (`tenant_id`,`dimension_id`,`code`);
CREATE UNIQUE INDEX `budget_versions_business_key_uq` ON `budget_versions` (`tenant_id`,`fiscal_year`,`name`);
CREATE UNIQUE INDEX `salary_profiles_one_active_uq` ON `salary_profiles` (`tenant_id`,`employee_id`) WHERE `status`='Ativo';
CREATE UNIQUE INDEX `payroll_components_tenant_code_uq` ON `payroll_components` (`tenant_id`,`code`);
CREATE UNIQUE INDEX `payroll_assignments_business_key_uq` ON `payroll_assignments` (`tenant_id`,`employee_id`,`component_id`);
CREATE UNIQUE INDEX `payroll_run_lines_employee_uq` ON `payroll_run_lines` (`tenant_id`,`run_id`,`employee_id`);
CREATE UNIQUE INDEX `workforce_cost_run_line_uq` ON `workforce_cost_postings` (`tenant_id`,`run_line_id`);
CREATE UNIQUE INDEX `management_reports_tenant_number_uq` ON `management_reports` (`tenant_id`,`report_number`);
CREATE UNIQUE INDEX `invitation_tokens_one_open_uq` ON `invitation_tokens` (`tenant_id`,`user_id`) WHERE `used_at` IS NULL AND `revoked_at` IS NULL;
CREATE INDEX `audit_events_tenant_created_idx` ON `audit_events` (`tenant_id`,`created_at`);

CREATE TRIGGER `audit_events_immutable_update` BEFORE UPDATE ON `audit_events` BEGIN SELECT RAISE(ABORT,'audit event is immutable'); END;
CREATE TRIGGER `audit_events_immutable_delete` BEFORE DELETE ON `audit_events` BEGIN SELECT RAISE(ABORT,'audit event is immutable'); END;
