CREATE TABLE `employee_contracts` (
 `id` text PRIMARY KEY NOT NULL,`tenant_id` text NOT NULL,`created_at` text NOT NULL,`employee_id` text NOT NULL,
 `contract_number` text NOT NULL,`contract_type` text NOT NULL,`start_date` text NOT NULL,`end_date` text,
 `work_schedule` text NOT NULL,`weekly_minutes` integer NOT NULL,`country_pack` text,`status` text NOT NULL,
 `activated_at` text,`ended_at` text
);
CREATE UNIQUE INDEX `employee_contracts_number_uq` ON `employee_contracts` (`tenant_id`,`contract_number`);
CREATE UNIQUE INDEX `employee_contracts_one_active_uq` ON `employee_contracts` (`tenant_id`,`employee_id`) WHERE `status`='Ativo';
CREATE INDEX `employee_contracts_employee_status_idx` ON `employee_contracts` (`tenant_id`,`employee_id`,`status`);

INSERT INTO `employee_contracts` (`id`,`tenant_id`,`created_at`,`employee_id`,`contract_number`,`contract_type`,`start_date`,`end_date`,`work_schedule`,`weekly_minutes`,`country_pack`,`status`,`activated_at`,`ended_at`)
SELECT 'legacy-'||`id`,`tenant_id`,`created_at`,`id`,'LEGACY-'||`employee_number`,'Legado',`hire_date`,NULL,'Não definido',2400,NULL,'Ativo',`created_at`,NULL FROM `employees`;

CREATE TRIGGER `employee_contracts_validate_insert` BEFORE INSERT ON `employee_contracts`
WHEN NOT EXISTS (SELECT 1 FROM `employees` WHERE `id`=NEW.`employee_id` AND `tenant_id`=NEW.`tenant_id`)
 OR NEW.`status`<>'Rascunho' OR NEW.`start_date` NOT GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'
 OR (NEW.`end_date` IS NOT NULL AND NEW.`end_date`<NEW.`start_date`) OR NEW.`weekly_minutes`<=0 OR NEW.`weekly_minutes`>10080
BEGIN SELECT RAISE(ABORT,'invalid employee contract'); END;
CREATE TRIGGER `employee_contracts_valid_transition` BEFORE UPDATE OF `status` ON `employee_contracts`
WHEN NOT ((OLD.`status`='Rascunho' AND NEW.`status`='Ativo') OR (OLD.`status`='Ativo' AND NEW.`status`='Terminado'))
BEGIN SELECT RAISE(ABORT,'invalid contract transition'); END;
CREATE TRIGGER `employee_contract_activated` AFTER UPDATE OF `status` ON `employee_contracts` WHEN NEW.`status`='Ativo'
BEGIN UPDATE `employees` SET `status`='Ativo' WHERE `id`=NEW.`employee_id` AND `tenant_id`=NEW.`tenant_id`; END;
CREATE TRIGGER `employee_contract_ended` AFTER UPDATE OF `status` ON `employee_contracts` WHEN NEW.`status`='Terminado'
BEGIN UPDATE `employees` SET `status`='Inativo' WHERE `id`=NEW.`employee_id` AND `tenant_id`=NEW.`tenant_id`; END;
