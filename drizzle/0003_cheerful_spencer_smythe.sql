CREATE TABLE `payroll_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	`employee_id` text NOT NULL,
	`component_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payroll_components` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`method` text NOT NULL,
	`value_minor` integer,
	`rate_bps` integer,
	`calculation_order` integer NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payroll_run_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	`run_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`base_minor` integer NOT NULL,
	`gross_minor` integer NOT NULL,
	`deduction_minor` integer NOT NULL,
	`employer_minor` integer NOT NULL,
	`net_minor` integer NOT NULL,
	`calculation_hash` text NOT NULL,
	`input_snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payroll_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	`period` text NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`employee_count` integer NOT NULL,
	`gross_minor` integer NOT NULL,
	`deduction_minor` integer NOT NULL,
	`employer_minor` integer NOT NULL,
	`net_minor` integer NOT NULL,
	`closed_at` text
);
--> statement-breakpoint
CREATE TABLE `salary_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	`employee_id` text NOT NULL,
	`currency` text NOT NULL,
	`periodicity` text NOT NULL,
	`base_minor` integer NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`dimension_member_id` text,
	`status` text NOT NULL
);
