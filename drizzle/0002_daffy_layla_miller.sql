CREATE TABLE `budget_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	`name` text NOT NULL,
	`fiscal_year` integer NOT NULL,
	`status` text NOT NULL,
	`approved_at` text
);
--> statement-breakpoint
CREATE TABLE `performance_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	`organization_id` text NOT NULL,
	`period` text NOT NULL,
	`scenario` text NOT NULL,
	`version_id` text,
	`currency` text NOT NULL,
	`line_code` text NOT NULL,
	`line_name` text NOT NULL,
	`dimension_member_id` text,
	`amount_minor` integer NOT NULL,
	`source` text NOT NULL
);
