CREATE TABLE bank_statement_imports (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, account_id TEXT NOT NULL, file_name TEXT NOT NULL,
 source_hash TEXT NOT NULL, bank_name TEXT NOT NULL, account_reference TEXT NOT NULL,
 start_date TEXT NOT NULL, end_date TEXT NOT NULL, opening_minor INTEGER NOT NULL, closing_minor INTEGER NOT NULL,
 row_count INTEGER NOT NULL CHECK(row_count>0), status TEXT NOT NULL DEFAULT 'Ativo' CHECK(status IN ('Ativo','Apagado')),
 revision INTEGER NOT NULL DEFAULT 0, balance_id TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(tenant_id,account_id,source_hash), FOREIGN KEY(account_id) REFERENCES treasury_accounts(id)
);
CREATE TABLE bank_statement_movements (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, statement_id TEXT NOT NULL, row_number INTEGER NOT NULL,
 movement_date TEXT NOT NULL, description TEXT NOT NULL, reference TEXT NOT NULL, iban TEXT NOT NULL,
 incoming_minor INTEGER NOT NULL CHECK(incoming_minor>=0), outgoing_minor INTEGER NOT NULL CHECK(outgoing_minor>=0),
 balance_minor INTEGER, category TEXT NOT NULL,
 CHECK((incoming_minor>0 AND outgoing_minor=0) OR (outgoing_minor>0 AND incoming_minor=0)),
 UNIQUE(tenant_id,statement_id,row_number), FOREIGN KEY(statement_id) REFERENCES bank_statement_imports(id)
);
CREATE INDEX bank_statement_scope_date ON bank_statement_imports(tenant_id,account_id,status,start_date,end_date);
CREATE INDEX bank_movement_date ON bank_statement_movements(tenant_id,statement_id,movement_date);
CREATE TRIGGER bank_import_scope BEFORE INSERT ON bank_statement_imports WHEN NOT EXISTS(SELECT 1 FROM treasury_accounts a WHERE a.id=NEW.account_id AND a.tenant_id=NEW.tenant_id) BEGIN SELECT RAISE(ABORT,'bank account outside tenant scope'); END;
CREATE TRIGGER bank_import_overlap BEFORE INSERT ON bank_statement_imports WHEN EXISTS(SELECT 1 FROM bank_statement_imports b WHERE b.tenant_id=NEW.tenant_id AND b.account_id=NEW.account_id AND b.status='Ativo' AND NEW.start_date<=b.end_date AND NEW.end_date>=b.start_date) BEGIN SELECT RAISE(ABORT,'bank statement overlaps imported period'); END;
CREATE TRIGGER bank_row_scope BEFORE INSERT ON bank_statement_movements WHEN NOT EXISTS(SELECT 1 FROM bank_statement_imports b WHERE b.id=NEW.statement_id AND b.tenant_id=NEW.tenant_id AND b.status='Ativo' AND NEW.movement_date BETWEEN b.start_date AND b.end_date) BEGIN SELECT RAISE(ABORT,'bank statement outside tenant scope'); END;
CREATE TRIGGER bank_statement_update BEFORE UPDATE ON bank_statement_imports WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.account_id<>OLD.account_id OR NEW.source_hash<>OLD.source_hash OR NEW.file_name<>OLD.file_name OR NEW.bank_name<>OLD.bank_name OR NEW.account_reference<>OLD.account_reference OR NEW.start_date<>OLD.start_date OR NEW.end_date<>OLD.end_date OR NEW.opening_minor<>OLD.opening_minor OR NEW.closing_minor<>OLD.closing_minor OR NEW.row_count<>OLD.row_count OR NEW.balance_id<>OLD.balance_id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR OLD.status<>'Ativo' OR NEW.revision<>OLD.revision+1 BEGIN SELECT RAISE(ABORT,'bank statement immutable'); END;
CREATE TRIGGER bank_statement_no_delete BEFORE DELETE ON bank_statement_imports BEGIN SELECT RAISE(ABORT,'bank statement immutable'); END;
CREATE TRIGGER bank_movement_update BEFORE UPDATE ON bank_statement_movements WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.statement_id<>OLD.statement_id OR NEW.row_number<>OLD.row_number OR NEW.movement_date<>OLD.movement_date OR NEW.description<>OLD.description OR NEW.reference<>OLD.reference OR NEW.iban<>OLD.iban OR NEW.incoming_minor<>OLD.incoming_minor OR NEW.outgoing_minor<>OLD.outgoing_minor OR COALESCE(NEW.balance_minor,'null')<>COALESCE(OLD.balance_minor,'null') BEGIN SELECT RAISE(ABORT,'bank movement immutable'); END;
CREATE TRIGGER bank_movement_no_delete BEFORE DELETE ON bank_statement_movements BEGIN SELECT RAISE(ABORT,'bank movement immutable'); END;
