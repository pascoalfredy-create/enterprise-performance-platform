CREATE TABLE `dimension_members` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	`dimension_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `financial_dimensions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL
);
