CREATE TABLE IF NOT EXISTS `employee_contracts` (
 `id` text PRIMARY KEY NOT NULL,`tenant_id` text NOT NULL,`created_at` text NOT NULL,`employee_id` text NOT NULL,
 `contract_number` text NOT NULL,`contract_type` text NOT NULL,`start_date` text NOT NULL,`end_date` text,
 `work_schedule` text NOT NULL,`weekly_minutes` integer NOT NULL,`country_pack` text,`status` text NOT NULL,
 `activated_at` text,`ended_at` text
);
CREATE UNIQUE INDEX IF NOT EXISTS `employee_contracts_number_uq` ON `employee_contracts` (`tenant_id`,`contract_number`);
CREATE UNIQUE INDEX IF NOT EXISTS `employee_contracts_one_active_uq` ON `employee_contracts` (`tenant_id`,`employee_id`) WHERE `status`='Ativo';
CREATE INDEX IF NOT EXISTS `employee_contracts_employee_status_idx` ON `employee_contracts` (`tenant_id`,`employee_id`,`status`);

-- Inserts as 'Rascunho', then immediately promotes to 'Ativo', instead of
-- inserting 'Ativo' directly: a direct 'Ativo' insert only ever worked
-- because this statement used to run before employee_contracts_validate_insert
-- (below) existed, which made it a one-shot trick — fine for the very
-- first time this file is ever applied, but not for replaying it once
-- that trigger is already there (which per-file tracking being out of
-- sync can cause). 'Rascunho' always passes that trigger's insert
-- validation regardless of whether it already exists, and the Rascunho->
-- Ativo transition right after is always allowed by
-- employee_contracts_valid_transition (below) once that exists too — so
-- this is safe to run exactly once per employee no matter how many times
-- the file itself gets executed. The per-employee (not per-table) guard
-- is deliberate: an employee hired after the first run has no legacy
-- contract and isn't touched by any later real run of this file, but if
-- one somehow still has none at all, giving them this fallback is a safe
-- no-op against the one-active-contract-per-employee unique index, not a
-- data integrity risk.
INSERT INTO `employee_contracts` (`id`,`tenant_id`,`created_at`,`employee_id`,`contract_number`,`contract_type`,`start_date`,`end_date`,`work_schedule`,`weekly_minutes`,`country_pack`,`status`,`activated_at`,`ended_at`)
SELECT 'legacy-'||`e`.`id`,`e`.`tenant_id`,`e`.`created_at`,`e`.`id`,'LEGACY-'||`e`.`employee_number`,'Legado',`e`.`hire_date`,NULL,'Não definido',2400,NULL,'Rascunho',NULL,NULL FROM `employees` `e`
WHERE NOT EXISTS (SELECT 1 FROM `employee_contracts` `c` WHERE `c`.`id`='legacy-'||`e`.`id`);
UPDATE `employee_contracts` SET `status`='Ativo',`activated_at`=`created_at` WHERE `id` LIKE 'legacy-%' AND `status`='Rascunho';

CREATE TRIGGER IF NOT EXISTS `employee_contracts_validate_insert` BEFORE INSERT ON `employee_contracts`
WHEN NOT EXISTS (SELECT 1 FROM `employees` WHERE `id`=NEW.`employee_id` AND `tenant_id`=NEW.`tenant_id`)
 OR NEW.`status`<>'Rascunho' OR NEW.`start_date` NOT GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'
 OR (NEW.`end_date` IS NOT NULL AND NEW.`end_date`<NEW.`start_date`) OR NEW.`weekly_minutes`<=0 OR NEW.`weekly_minutes`>10080
BEGIN SELECT RAISE(ABORT,'invalid employee contract'); END;
CREATE TRIGGER IF NOT EXISTS `employee_contracts_valid_transition` BEFORE UPDATE OF `status` ON `employee_contracts`
WHEN NOT ((OLD.`status`='Rascunho' AND NEW.`status`='Ativo') OR (OLD.`status`='Ativo' AND NEW.`status`='Terminado'))
BEGIN SELECT RAISE(ABORT,'invalid contract transition'); END;
CREATE TRIGGER IF NOT EXISTS `employee_contract_activated` AFTER UPDATE OF `status` ON `employee_contracts` WHEN NEW.`status`='Ativo'
BEGIN UPDATE `employees` SET `status`='Ativo' WHERE `id`=NEW.`employee_id` AND `tenant_id`=NEW.`tenant_id`; END;
CREATE TRIGGER IF NOT EXISTS `employee_contract_ended` AFTER UPDATE OF `status` ON `employee_contracts` WHEN NEW.`status`='Terminado'
BEGIN UPDATE `employees` SET `status`='Inativo' WHERE `id`=NEW.`employee_id` AND `tenant_id`=NEW.`tenant_id`; END;
