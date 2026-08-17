CREATE TABLE `workforce_cost_postings` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	`run_id` text NOT NULL,
	`run_line_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`dimension_member_id` text,
	`period` text NOT NULL,
	`currency` text NOT NULL,
	`gross_minor` integer NOT NULL,
	`employer_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`source_hash` text NOT NULL,
	`posted_at` text NOT NULL
);
