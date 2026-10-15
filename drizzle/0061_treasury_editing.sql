ALTER TABLE treasury_flows ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE treasury_flows ADD COLUMN updated_by TEXT;
ALTER TABLE treasury_flows ADD COLUMN updated_at TEXT;
CREATE TABLE treasury_flow_history (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,flow_id TEXT NOT NULL,revision INTEGER NOT NULL,actor TEXT NOT NULL,changed_at TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,UNIQUE(tenant_id,flow_id,revision)
);
DROP TRIGGER treasury_flow_immutable;
CREATE TRIGGER treasury_flow_edit_guard BEFORE UPDATE ON treasury_flows
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NEW.revision<>OLD.revision+1 OR NEW.updated_by IS NULL OR NEW.updated_at IS NULL
 OR NOT ((OLD.status='Previsto' AND NEW.status IN ('Previsto','Cancelado')) OR (OLD.status='Cancelado' AND NEW.status='Previsto'))
 OR NOT EXISTS(SELECT 1 FROM treasury_accounts a WHERE a.id=NEW.account_id AND a.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'invalid treasury flow edit'); END;
CREATE TRIGGER treasury_flow_edit_history AFTER UPDATE ON treasury_flows BEGIN
 INSERT INTO treasury_flow_history VALUES (lower(hex(randomblob(16))),NEW.tenant_id,NEW.id,NEW.revision,NEW.updated_by,NEW.updated_at,
 json_object('accountId',OLD.account_id,'date',OLD.due_date,'direction',OLD.direction,'category',OLD.category,'description',OLD.description,'amountMinor',OLD.amount_minor,'reference',OLD.reference,'status',OLD.status),
 json_object('accountId',NEW.account_id,'date',NEW.due_date,'direction',NEW.direction,'category',NEW.category,'description',NEW.description,'amountMinor',NEW.amount_minor,'reference',NEW.reference,'status',NEW.status));
END;
CREATE TRIGGER treasury_flow_history_immutable BEFORE UPDATE ON treasury_flow_history BEGIN SELECT RAISE(ABORT,'treasury history immutable'); END;
CREATE TRIGGER treasury_flow_history_no_delete BEFORE DELETE ON treasury_flow_history BEGIN SELECT RAISE(ABORT,'treasury history immutable'); END;
