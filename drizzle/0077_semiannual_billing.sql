-- SQLite cannot widen a CHECK constraint in place, so checkout_sessions is
-- rebuilt to also allow 'semiannual' (10% discount, vs. annual's 20%) in
-- billing_interval. Data is copied across unchanged; indexes are recreated
-- on the new table. (Split from the subscriptions rebuild into its own
-- migration file — combining both full-table rebuilds in one exec against
-- remote D1 hit a transient D1_RESET_DO failure.)
ALTER TABLE `checkout_sessions` RENAME TO `checkout_sessions_old`;
CREATE TABLE `checkout_sessions` (
 `id` text PRIMARY KEY NOT NULL,
 `account_id` text NOT NULL,
 `catalog_version` text NOT NULL,
 `bundle_code` text NOT NULL CHECK (`bundle_code` IN ('FINANCE','PEOPLE','PERFORMANCE','ENTERPRISE')),
 `billing_interval` text NOT NULL CHECK (`billing_interval` IN ('monthly','semiannual','annual')),
 `requested_users` integer NOT NULL CHECK (`requested_users` BETWEEN 1 AND 500),
 `requested_employees` integer NOT NULL CHECK (`requested_employees` BETWEEN 0 AND 10000),
 `currency` text NOT NULL CHECK (`currency`='AOA'),
 `amount_minor` integer NOT NULL CHECK (`amount_minor`>0),
 `status` text NOT NULL CHECK (`status` IN ('Rascunho','Aguarda pagamento','Pago','Expirado','Cancelado')),
 `idempotency_key` text NOT NULL UNIQUE,
 `expires_at` text NOT NULL,
 `created_at` text NOT NULL,
 `updated_at` text NOT NULL,
 `requested_extra_financial_model_projects` integer NOT NULL DEFAULT 0 CHECK (`requested_extra_financial_model_projects` >= 0),
 FOREIGN KEY (`account_id`) REFERENCES `commerce_accounts` (`id`)
);
INSERT INTO `checkout_sessions` (id,account_id,catalog_version,bundle_code,billing_interval,requested_users,requested_employees,currency,amount_minor,status,idempotency_key,expires_at,created_at,updated_at,requested_extra_financial_model_projects)
SELECT id,account_id,catalog_version,bundle_code,billing_interval,requested_users,requested_employees,currency,amount_minor,status,idempotency_key,expires_at,created_at,updated_at,requested_extra_financial_model_projects FROM `checkout_sessions_old`;
DROP TABLE `checkout_sessions_old`;
CREATE INDEX IF NOT EXISTS `checkout_sessions_account_created_idx` ON `checkout_sessions` (`account_id`,`created_at` DESC);
CREATE INDEX IF NOT EXISTS `checkout_sessions_status_expiry_idx` ON `checkout_sessions` (`status`,`expires_at`);
