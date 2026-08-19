CREATE TABLE `subscriptions` (
 `id` text PRIMARY KEY NOT NULL,
 `account_id` text NOT NULL,
 `checkout_id` text NOT NULL UNIQUE,
 `tenant_id` text NOT NULL UNIQUE,
 `bundle_code` text NOT NULL CHECK (`bundle_code` IN ('FINANCE','PEOPLE','PERFORMANCE','ENTERPRISE')),
 `billing_interval` text NOT NULL CHECK (`billing_interval` IN ('monthly','annual')),
 `status` text NOT NULL CHECK (`status` IN ('Ativa','Suspensa','Cancelada')),
 `current_period_start` text NOT NULL,
 `current_period_end` text NOT NULL,
 `created_at` text NOT NULL,
 FOREIGN KEY (`account_id`) REFERENCES `commerce_accounts` (`id`),
 FOREIGN KEY (`checkout_id`) REFERENCES `checkout_sessions` (`id`),
 FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);

CREATE TABLE `module_entitlements` (
 `id` text PRIMARY KEY NOT NULL,
 `tenant_id` text NOT NULL,
 `subscription_id` text NOT NULL,
 `module_code` text NOT NULL CHECK (`module_code` IN ('CORE','FINANCE_FP&A','HCM','PAYROLL','WORKFORCE_PLANNING','PERFORMANCE_MANAGEMENT','ANALYTICS_REPORTING','WORKFLOW','INTEGRATIONS')),
 `status` text NOT NULL CHECK (`status` IN ('Ativo','Suspenso','Terminado')),
 `effective_from` text NOT NULL,
 `effective_to` text,
 `created_at` text NOT NULL,
 FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
 FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`),
 UNIQUE (`tenant_id`,`module_code`)
);

CREATE TABLE `provisioning_orders` (
 `id` text PRIMARY KEY NOT NULL,
 `payment_id` text NOT NULL UNIQUE,
 `account_id` text NOT NULL,
 `checkout_id` text NOT NULL UNIQUE,
 `tenant_id` text UNIQUE,
 `company_name` text NOT NULL,
 `company_slug` text NOT NULL,
 `country_code` text NOT NULL,
 `base_currency` text NOT NULL,
 `locale` text NOT NULL,
 `status` text NOT NULL CHECK (`status` IN ('Pendente','Concluída','Falhou')),
 `requested_at` text NOT NULL,
 `completed_at` text,
 FOREIGN KEY (`payment_id`) REFERENCES `payment_intents` (`id`),
 FOREIGN KEY (`account_id`) REFERENCES `commerce_accounts` (`id`),
 FOREIGN KEY (`checkout_id`) REFERENCES `checkout_sessions` (`id`),
 FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);

CREATE INDEX `subscriptions_account_status_idx` ON `subscriptions` (`account_id`,`status`);
CREATE INDEX `module_entitlements_tenant_status_idx` ON `module_entitlements` (`tenant_id`,`status`);
CREATE TRIGGER `subscription_tenant_immutable` BEFORE UPDATE OF `tenant_id`,`checkout_id`,`account_id` ON `subscriptions` BEGIN SELECT RAISE(ABORT,'subscription ownership is immutable'); END;
CREATE TRIGGER `provisioning_ownership_immutable` BEFORE UPDATE OF `payment_id`,`account_id`,`checkout_id`,`tenant_id` ON `provisioning_orders` BEGIN SELECT RAISE(ABORT,'provisioning ownership is immutable'); END;
