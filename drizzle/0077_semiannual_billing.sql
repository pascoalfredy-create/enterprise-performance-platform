-- Add 'semiannual' (10% discount, vs. annual's 20%) as a billing option
-- WITHOUT touching billing_interval's existing CHECK (monthly/annual only):
-- two separate attempts at the standard SQLite CHECK-widening rebuild
-- (rename table, recreate with the wider CHECK, copy data, drop, reindex)
-- both failed against remote D1 with D1_RESET_DO — once for both tables in
-- one migration, once split into one table per migration — so the rebuild
-- pattern itself is the problem here, not its size.
--
-- Instead, a new column carries the real three-way interval and the old
-- `billing_interval` column is left exactly as it was (still written by the
-- app, mapped down to 'monthly'/'annual' so its CHECK keeps passing) — a
-- plain ADD COLUMN, the same lightweight, metadata-only operation already
-- proven safe against this exact database by migration 0076.
ALTER TABLE `checkout_sessions` ADD COLUMN `billing_period` TEXT NOT NULL DEFAULT 'monthly' CHECK (`billing_period` IN ('monthly','semiannual','annual'));
UPDATE `checkout_sessions` SET `billing_period` = `billing_interval`;

ALTER TABLE `subscriptions` ADD COLUMN `billing_period` TEXT NOT NULL DEFAULT 'monthly' CHECK (`billing_period` IN ('monthly','semiannual','annual'));
UPDATE `subscriptions` SET `billing_period` = `billing_interval`;
