CREATE TABLE `management_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	`report_number` integer NOT NULL,
	`title` text NOT NULL,
	`template` text NOT NULL,
	`period` text NOT NULL,
	`currency` text NOT NULL,
	`budget_version_id` text,
	`status` text NOT NULL,
	`payload_json` text NOT NULL,
	`input_hash` text NOT NULL,
	`created_by` text NOT NULL
);
