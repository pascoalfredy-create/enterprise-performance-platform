CREATE TABLE `operator_users` (
 `id` text PRIMARY KEY NOT NULL,
 `email_normalized` text NOT NULL UNIQUE,
 `identity_subject` text UNIQUE,
 `role` text NOT NULL CHECK (`role` IN ('Platform Owner','Billing Operator','Support Auditor')),
 `status` text NOT NULL CHECK (`status` IN ('Ativo','Bloqueado')),
 `mfa_required` integer NOT NULL DEFAULT 1 CHECK (`mfa_required` IN (0,1)),
 `created_at` text NOT NULL,
 `updated_at` text NOT NULL
);

INSERT INTO `operator_users` (`id`,`email_normalized`,`identity_subject`,`role`,`status`,`mfa_required`,`created_at`,`updated_at`)
VALUES ('platform-owner-pascoal','pascoalfredy@gmail.com',NULL,'Platform Owner','Ativo',1,'2026-08-19T00:00:00.000Z','2026-08-19T00:00:00.000Z');

CREATE TABLE `billing_invoices` (
 `id` text PRIMARY KEY NOT NULL,
 `checkout_id` text NOT NULL UNIQUE,
 `account_id` text NOT NULL,
 `invoice_number` text NOT NULL UNIQUE,
 `currency` text NOT NULL CHECK (`currency`='AOA'),
 `subtotal_minor` integer NOT NULL CHECK (`subtotal_minor`>0),
 `tax_minor` integer NOT NULL DEFAULT 0 CHECK (`tax_minor`>=0),
 `tax_status` text NOT NULL CHECK (`tax_status` IN ('Pendente configuração','Calculado')),
 `total_minor` integer NOT NULL CHECK (`total_minor`>0),
 `status` text NOT NULL CHECK (`status` IN ('Aguarda pagamento','Paga','Anulada')),
 `due_at` text NOT NULL,
 `paid_at` text,
 `created_at` text NOT NULL,
 FOREIGN KEY (`checkout_id`) REFERENCES `checkout_sessions` (`id`),
 FOREIGN KEY (`account_id`) REFERENCES `commerce_accounts` (`id`)
);

CREATE TABLE `payment_intents` (
 `id` text PRIMARY KEY NOT NULL,
 `invoice_id` text NOT NULL UNIQUE,
 `provider` text NOT NULL,
 `provider_reference` text NOT NULL UNIQUE,
 `amount_minor` integer NOT NULL CHECK (`amount_minor`>0),
 `currency` text NOT NULL CHECK (`currency`='AOA'),
 `status` text NOT NULL CHECK (`status` IN ('Pendente','Confirmado','Falhou','Expirado')),
 `expires_at` text NOT NULL,
 `confirmed_at` text,
 `created_at` text NOT NULL,
 FOREIGN KEY (`invoice_id`) REFERENCES `billing_invoices` (`id`)
);

CREATE TABLE `billing_events` (
 `id` text PRIMARY KEY NOT NULL,
 `provider` text NOT NULL,
 `external_event_id` text NOT NULL UNIQUE,
 `event_type` text NOT NULL,
 `payload_hash` text NOT NULL,
 `status` text NOT NULL CHECK (`status` IN ('Recebido','Processado','Rejeitado')),
 `received_at` text NOT NULL,
 `processed_at` text
);

CREATE INDEX `billing_invoices_account_status_idx` ON `billing_invoices` (`account_id`,`status`,`created_at` DESC);
CREATE INDEX `payment_intents_status_expiry_idx` ON `payment_intents` (`status`,`expires_at`);
CREATE TRIGGER `billing_events_no_update` BEFORE UPDATE ON `billing_events` BEGIN SELECT RAISE(ABORT,'billing event is immutable'); END;
CREATE TRIGGER `billing_events_no_delete` BEFORE DELETE ON `billing_events` BEGIN SELECT RAISE(ABORT,'billing event is immutable'); END;
