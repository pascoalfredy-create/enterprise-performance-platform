CREATE TABLE `commerce_accounts` (
 `id` text PRIMARY KEY NOT NULL,
 `identity_subject` text NOT NULL UNIQUE,
 `email_normalized` text NOT NULL UNIQUE,
 `status` text NOT NULL CHECK (`status` IN ('Ativa','Bloqueada','Encerrada')),
 `created_at` text NOT NULL,
 `updated_at` text NOT NULL
);

CREATE TABLE `checkout_sessions` (
 `id` text PRIMARY KEY NOT NULL,
 `account_id` text NOT NULL,
 `catalog_version` text NOT NULL,
 `bundle_code` text NOT NULL CHECK (`bundle_code` IN ('FINANCE','PEOPLE','PERFORMANCE','ENTERPRISE')),
 `billing_interval` text NOT NULL CHECK (`billing_interval` IN ('monthly','annual')),
 `requested_users` integer NOT NULL CHECK (`requested_users` BETWEEN 1 AND 500),
 `requested_employees` integer NOT NULL CHECK (`requested_employees` BETWEEN 0 AND 10000),
 `currency` text NOT NULL CHECK (`currency`='AOA'),
 `amount_minor` integer NOT NULL CHECK (`amount_minor`>0),
 `status` text NOT NULL CHECK (`status` IN ('Rascunho','Aguarda pagamento','Pago','Expirado','Cancelado')),
 `idempotency_key` text NOT NULL UNIQUE,
 `expires_at` text NOT NULL,
 `created_at` text NOT NULL,
 `updated_at` text NOT NULL,
 FOREIGN KEY (`account_id`) REFERENCES `commerce_accounts` (`id`)
);

CREATE INDEX `checkout_sessions_account_created_idx` ON `checkout_sessions` (`account_id`,`created_at` DESC);
CREATE INDEX `checkout_sessions_status_expiry_idx` ON `checkout_sessions` (`status`,`expires_at`);

CREATE TABLE `commerce_audit_events` (
 `id` text PRIMARY KEY NOT NULL,
 `account_id` text NOT NULL,
 `event_type` text NOT NULL,
 `entity_type` text NOT NULL,
 `entity_id` text NOT NULL,
 `summary` text NOT NULL,
 `evidence_hash` text NOT NULL,
 `occurred_at` text NOT NULL,
 FOREIGN KEY (`account_id`) REFERENCES `commerce_accounts` (`id`)
);

CREATE INDEX `commerce_audit_account_time_idx` ON `commerce_audit_events` (`account_id`,`occurred_at` DESC);
CREATE TRIGGER `commerce_audit_no_update` BEFORE UPDATE ON `commerce_audit_events` BEGIN SELECT RAISE(ABORT,'commerce audit is immutable'); END;
CREATE TRIGGER `commerce_audit_no_delete` BEFORE DELETE ON `commerce_audit_events` BEGIN SELECT RAISE(ABORT,'commerce audit is immutable'); END;
