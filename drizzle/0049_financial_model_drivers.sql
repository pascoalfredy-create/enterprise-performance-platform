ALTER TABLE financial_model_lines ADD COLUMN driver_line_id TEXT;
ALTER TABLE financial_model_lines ADD COLUMN driver_multiplier_bps INTEGER CHECK(driver_multiplier_bps IS NULL OR driver_multiplier_bps BETWEEN -1000000 AND 1000000);

CREATE TRIGGER IF NOT EXISTS financial_model_line_driver_guard BEFORE INSERT ON financial_model_lines
WHEN (NEW.driver_line_id IS NOT NULL AND (NEW.driver_multiplier_bps IS NULL OR NEW.base_amount_minor<>0 OR NEW.growth_bps<>0
  OR NOT EXISTS(SELECT 1 FROM financial_model_lines d WHERE d.id=NEW.driver_line_id AND d.tenant_id=NEW.tenant_id AND d.model_id=NEW.model_id)))
 OR (NEW.driver_line_id IS NULL AND NEW.driver_multiplier_bps IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'invalid financial model line driver reference'); END;
