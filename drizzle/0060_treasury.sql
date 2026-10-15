CREATE TABLE treasury_accounts (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,organization_id TEXT NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,currency TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(tenant_id,organization_id,code),FOREIGN KEY(organization_id) REFERENCES organizations(id)
);
CREATE TABLE treasury_balances (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,account_id TEXT NOT NULL,balance_date TEXT NOT NULL,amount_minor INTEGER NOT NULL,reference TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(tenant_id,account_id,balance_date,reference),FOREIGN KEY(account_id) REFERENCES treasury_accounts(id)
);
CREATE TABLE treasury_flows (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,account_id TEXT NOT NULL,due_date TEXT NOT NULL,direction TEXT NOT NULL CHECK(direction IN ('Entrada','Saída')),category TEXT NOT NULL,description TEXT NOT NULL,amount_minor INTEGER NOT NULL CHECK(amount_minor>0),reference TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('Previsto','Cancelado')),created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(tenant_id,account_id,reference),FOREIGN KEY(account_id) REFERENCES treasury_accounts(id)
);
CREATE INDEX treasury_flows_date ON treasury_flows(tenant_id,account_id,status,due_date);
CREATE TRIGGER treasury_account_scope BEFORE INSERT ON treasury_accounts WHEN NOT EXISTS(SELECT 1 FROM organizations WHERE id=NEW.organization_id AND tenant_id=NEW.tenant_id AND status='Ativa') BEGIN SELECT RAISE(ABORT,'treasury account outside tenant'); END;
CREATE TRIGGER treasury_balance_scope BEFORE INSERT ON treasury_balances WHEN NOT EXISTS(SELECT 1 FROM treasury_accounts WHERE id=NEW.account_id AND tenant_id=NEW.tenant_id) BEGIN SELECT RAISE(ABORT,'treasury balance outside tenant'); END;
CREATE TRIGGER treasury_flow_scope BEFORE INSERT ON treasury_flows WHEN NOT EXISTS(SELECT 1 FROM treasury_accounts WHERE id=NEW.account_id AND tenant_id=NEW.tenant_id) BEGIN SELECT RAISE(ABORT,'treasury flow outside tenant'); END;
CREATE TRIGGER treasury_balance_immutable BEFORE UPDATE ON treasury_balances BEGIN SELECT RAISE(ABORT,'treasury balance immutable'); END;
CREATE TRIGGER treasury_balance_no_delete BEFORE DELETE ON treasury_balances BEGIN SELECT RAISE(ABORT,'treasury balance immutable'); END;
CREATE TRIGGER treasury_flow_immutable BEFORE UPDATE ON treasury_flows WHEN OLD.status<>'Previsto' OR NEW.status<>'Cancelado' OR NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.account_id<>OLD.account_id OR NEW.due_date<>OLD.due_date OR NEW.direction<>OLD.direction OR NEW.category<>OLD.category OR NEW.description<>OLD.description OR NEW.amount_minor<>OLD.amount_minor OR NEW.reference<>OLD.reference OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at BEGIN SELECT RAISE(ABORT,'treasury flow immutable'); END;
