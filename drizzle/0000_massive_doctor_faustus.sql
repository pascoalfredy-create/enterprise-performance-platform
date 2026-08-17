CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`actor` text NOT NULL,
	`summary` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	`employee_number` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`organization_id` text NOT NULL,
	`job_title` text NOT NULL,
	`hire_date` text NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_users` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`organization_id` text,
	`status` text NOT NULL
);
