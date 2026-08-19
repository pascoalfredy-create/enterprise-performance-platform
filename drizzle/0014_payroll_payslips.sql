CREATE TABLE `payroll_payslips` (
 `id` text PRIMARY KEY NOT NULL,
 `tenant_id` text NOT NULL,
 `run_id` text NOT NULL,
 `run_line_id` text NOT NULL UNIQUE,
 `employee_id` text NOT NULL,
 `payslip_number` text NOT NULL,
 `period` text NOT NULL,
 `currency` text NOT NULL,
 `gross_minor` integer NOT NULL,
 `deduction_minor` integer NOT NULL,
 `employer_minor` integer NOT NULL,
 `net_minor` integer NOT NULL,
 `payload_json` text NOT NULL,
 `document_hash` text NOT NULL,
 `status` text NOT NULL CHECK (`status` IN ('Emitido','Anulado')),
 `issued_at` text NOT NULL,
 FOREIGN KEY (`run_id`) REFERENCES `payroll_runs` (`id`),
 FOREIGN KEY (`run_line_id`) REFERENCES `payroll_run_lines` (`id`),
 FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`),
 UNIQUE (`tenant_id`,`payslip_number`)
);

CREATE INDEX `payroll_payslips_tenant_period_idx` ON `payroll_payslips` (`tenant_id`,`period`,`status`);
CREATE TRIGGER `payslip_requires_closed_run` BEFORE INSERT ON `payroll_payslips`
WHEN NOT EXISTS (SELECT 1 FROM `payroll_runs` WHERE `id`=NEW.`run_id` AND `tenant_id`=NEW.`tenant_id` AND `status`='Fechado')
BEGIN SELECT RAISE(ABORT,'payslip requires closed payroll'); END;
CREATE TRIGGER `payslip_reference_guard` BEFORE INSERT ON `payroll_payslips`
WHEN NOT EXISTS (SELECT 1 FROM `payroll_run_lines` WHERE `id`=NEW.`run_line_id` AND `run_id`=NEW.`run_id` AND `employee_id`=NEW.`employee_id` AND `tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT,'payslip reference outside payroll'); END;
CREATE TRIGGER `payslip_no_update` BEFORE UPDATE ON `payroll_payslips` BEGIN SELECT RAISE(ABORT,'issued payslip is immutable'); END;
CREATE TRIGGER `payslip_no_delete` BEFORE DELETE ON `payroll_payslips` BEGIN SELECT RAISE(ABORT,'issued payslip is immutable'); END;
