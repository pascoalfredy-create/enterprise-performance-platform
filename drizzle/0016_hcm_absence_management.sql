CREATE TABLE IF NOT EXISTS hcm_absence_types (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
 unit TEXT NOT NULL CHECK(unit IN ('Dias','Horas')), paid INTEGER NOT NULL CHECK(paid IN (0,1)),
 requires_balance INTEGER NOT NULL CHECK(requires_balance IN (0,1)), status TEXT NOT NULL CHECK(status IN ('Ativo','Inativo')),
 created_at TEXT NOT NULL, UNIQUE(tenant_id,code)
);
CREATE TABLE IF NOT EXISTS hcm_absence_balances (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, employee_id TEXT NOT NULL, absence_type_id TEXT NOT NULL,
 fiscal_year INTEGER NOT NULL, allowance_minutes INTEGER NOT NULL CHECK(allowance_minutes>=0), used_minutes INTEGER NOT NULL DEFAULT 0 CHECK(used_minutes>=0),
 created_at TEXT NOT NULL, FOREIGN KEY(employee_id) REFERENCES employees(id), FOREIGN KEY(absence_type_id) REFERENCES hcm_absence_types(id),
 UNIQUE(tenant_id,employee_id,absence_type_id,fiscal_year), CHECK(used_minutes<=allowance_minutes)
);
CREATE TABLE IF NOT EXISTS hcm_absence_requests (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, employee_id TEXT NOT NULL, absence_type_id TEXT NOT NULL,
 start_date TEXT NOT NULL, end_date TEXT NOT NULL, requested_minutes INTEGER NOT NULL CHECK(requested_minutes>0), reason TEXT,
 status TEXT NOT NULL CHECK(status IN ('Pendente','Aprovado','Rejeitado','Cancelado')), requested_by TEXT NOT NULL, requested_at TEXT NOT NULL,
 decided_by TEXT, decided_at TEXT, decision_note TEXT, FOREIGN KEY(employee_id) REFERENCES employees(id), FOREIGN KEY(absence_type_id) REFERENCES hcm_absence_types(id)
);
CREATE INDEX IF NOT EXISTS hcm_absence_requests_scope_idx ON hcm_absence_requests(tenant_id,employee_id,start_date,end_date,status);
CREATE TRIGGER IF NOT EXISTS absence_balance_reference_guard BEFORE INSERT ON hcm_absence_balances
WHEN NOT EXISTS(SELECT 1 FROM employees e JOIN hcm_absence_types t ON t.tenant_id=e.tenant_id WHERE e.id=NEW.employee_id AND t.id=NEW.absence_type_id AND e.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'absence balance reference outside tenant'); END;
CREATE TRIGGER IF NOT EXISTS absence_balance_immutable_guard BEFORE UPDATE ON hcm_absence_balances
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.employee_id<>OLD.employee_id OR NEW.absence_type_id<>OLD.absence_type_id OR NEW.fiscal_year<>OLD.fiscal_year OR NEW.allowance_minutes<>OLD.allowance_minutes OR NEW.created_at<>OLD.created_at OR NEW.used_minutes<OLD.used_minutes
BEGIN SELECT RAISE(ABORT,'invalid absence balance update'); END;
CREATE TRIGGER IF NOT EXISTS absence_request_reference_guard BEFORE INSERT ON hcm_absence_requests
WHEN NEW.end_date<NEW.start_date OR NOT EXISTS(SELECT 1 FROM employees e JOIN hcm_absence_types t ON t.tenant_id=e.tenant_id WHERE e.id=NEW.employee_id AND t.id=NEW.absence_type_id AND e.tenant_id=NEW.tenant_id AND t.status='Ativo')
BEGIN SELECT RAISE(ABORT,'invalid absence request reference'); END;
CREATE TRIGGER IF NOT EXISTS absence_request_overlap_guard BEFORE INSERT ON hcm_absence_requests
WHEN EXISTS(SELECT 1 FROM hcm_absence_requests r WHERE r.tenant_id=NEW.tenant_id AND r.employee_id=NEW.employee_id AND r.status IN ('Pendente','Aprovado') AND NEW.start_date<=r.end_date AND NEW.end_date>=r.start_date)
BEGIN SELECT RAISE(ABORT,'absence request overlaps existing request'); END;
CREATE TRIGGER IF NOT EXISTS absence_request_immutable_delete BEFORE DELETE ON hcm_absence_requests
BEGIN SELECT RAISE(ABORT,'absence requests cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS absence_request_transition_guard BEFORE UPDATE ON hcm_absence_requests
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.employee_id<>OLD.employee_id OR NEW.absence_type_id<>OLD.absence_type_id OR NEW.start_date<>OLD.start_date OR NEW.end_date<>OLD.end_date OR NEW.requested_minutes<>OLD.requested_minutes OR NEW.requested_by<>OLD.requested_by OR OLD.status<>'Pendente' OR NEW.status NOT IN ('Aprovado','Rejeitado','Cancelado')
BEGIN SELECT RAISE(ABORT,'invalid absence request transition'); END;
CREATE TRIGGER IF NOT EXISTS absence_approval_balance_guard BEFORE UPDATE ON hcm_absence_requests
WHEN NEW.status='Aprovado' AND EXISTS(SELECT 1 FROM hcm_absence_types t WHERE t.id=NEW.absence_type_id AND t.tenant_id=NEW.tenant_id AND t.requires_balance=1) AND NOT EXISTS(SELECT 1 FROM hcm_absence_balances b WHERE b.tenant_id=NEW.tenant_id AND b.employee_id=NEW.employee_id AND b.absence_type_id=NEW.absence_type_id AND b.fiscal_year=CAST(substr(NEW.start_date,1,4) AS INTEGER) AND b.allowance_minutes-b.used_minutes>=NEW.requested_minutes)
BEGIN SELECT RAISE(ABORT,'insufficient absence balance'); END;
CREATE TRIGGER IF NOT EXISTS absence_approval_consumes_balance AFTER UPDATE ON hcm_absence_requests
WHEN OLD.status='Pendente' AND NEW.status='Aprovado' AND EXISTS(SELECT 1 FROM hcm_absence_types t WHERE t.id=NEW.absence_type_id AND t.tenant_id=NEW.tenant_id AND t.requires_balance=1)
BEGIN UPDATE hcm_absence_balances SET used_minutes=used_minutes+NEW.requested_minutes WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.employee_id AND absence_type_id=NEW.absence_type_id AND fiscal_year=CAST(substr(NEW.start_date,1,4) AS INTEGER); END;
