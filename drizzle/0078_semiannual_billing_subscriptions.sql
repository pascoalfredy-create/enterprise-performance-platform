-- Second half of the semiannual-billing rebuild (see 0077): subscriptions
-- also gates billing_interval to ('monthly','annual') and needs the same
-- CHECK widened to allow 'semiannual'. Kept in its own migration file/exec
-- for the same reason 0077 was split out.
ALTER TABLE `subscriptions` RENAME TO `subscriptions_old`;
CREATE TABLE `subscriptions` (
 `id` text PRIMARY KEY NOT NULL,
 `account_id` text NOT NULL,
 `checkout_id` text NOT NULL UNIQUE,
 `tenant_id` text NOT NULL UNIQUE,
 `bundle_code` text NOT NULL CHECK (`bundle_code` IN ('FINANCE','PEOPLE','PERFORMANCE','ENTERPRISE')),
 `billing_interval` text NOT NULL CHECK (`billing_interval` IN ('monthly','semiannual','annual')),
 `status` text NOT NULL CHECK (`status` IN ('Ativa','Suspensa','Cancelada')),
 `current_period_start` text NOT NULL,
 `current_period_end` text NOT NULL,
 `created_at` text NOT NULL,
 `employee_tier` text NOT NULL DEFAULT 'T1' CHECK (`employee_tier` IN ('T1','T2','T3','T4')),
 `extra_financial_model_projects` integer NOT NULL DEFAULT 0 CHECK (`extra_financial_model_projects` >= 0),
 FOREIGN KEY (`account_id`) REFERENCES `commerce_accounts` (`id`),
 FOREIGN KEY (`checkout_id`) REFERENCES `checkout_sessions` (`id`),
 FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);
INSERT INTO `subscriptions` (id,account_id,checkout_id,tenant_id,bundle_code,billing_interval,status,current_period_start,current_period_end,created_at,employee_tier,extra_financial_model_projects)
SELECT id,account_id,checkout_id,tenant_id,bundle_code,billing_interval,status,current_period_start,current_period_end,created_at,employee_tier,extra_financial_model_projects FROM `subscriptions_old`;
DROP TABLE `subscriptions_old`;
CREATE INDEX IF NOT EXISTS `subscriptions_account_status_idx` ON `subscriptions` (`account_id`,`status`);
CREATE TRIGGER IF NOT EXISTS `subscription_tenant_immutable` BEFORE UPDATE OF `tenant_id`,`checkout_id`,`account_id` ON `subscriptions` BEGIN SELECT RAISE(ABORT,'subscription ownership is immutable'); END;
