CREATE TABLE payroll_payment_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL UNIQUE,
  batch_number TEXT NOT NULL,
  period TEXT NOT NULL,
  currency TEXT NOT NULL,
  employee_count INTEGER NOT NULL CHECK (employee_count > 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  status TEXT NOT NULL CHECK (status IN ('Preparado','Aprovado','Exportado')),
  evidence_hash TEXT NOT NULL,
  prepared_by TEXT NOT NULL,
  prepared_at TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  exported_by TEXT,
  exported_at TEXT,
  FOREIGN KEY (run_id) REFERENCES payroll_runs(id),
  UNIQUE (tenant_id, batch_number)
);

CREATE TABLE payroll_payment_batch_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  payslip_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  FOREIGN KEY (batch_id) REFERENCES payroll_payment_batches(id),
  FOREIGN KEY (payslip_id) REFERENCES payroll_payslips(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  UNIQUE (tenant_id, payslip_id)
);

CREATE INDEX idx_payment_batches_tenant_period ON payroll_payment_batches(tenant_id, period, status);
CREATE INDEX idx_payment_batch_lines_batch ON payroll_payment_batch_lines(tenant_id, batch_id);

CREATE TRIGGER payment_batch_reference_guard_insert BEFORE INSERT ON payroll_payment_batches
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM payroll_runs r WHERE r.id=NEW.run_id AND r.tenant_id=NEW.tenant_id
      AND r.status='Fechado' AND r.period=NEW.period AND r.currency=NEW.currency
      AND r.employee_count=NEW.employee_count AND r.net_minor=NEW.total_minor
  ) THEN RAISE(ABORT,'payment batch requires reconciled closed payroll') END;
END;

CREATE TRIGGER payment_batch_line_reference_guard_insert BEFORE INSERT ON payroll_payment_batch_lines
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM payroll_payment_batches b JOIN payroll_payslips p ON p.id=NEW.payslip_id
    WHERE b.id=NEW.batch_id AND b.tenant_id=NEW.tenant_id AND p.tenant_id=NEW.tenant_id
      AND p.run_id=b.run_id AND p.employee_id=NEW.employee_id AND p.net_minor=NEW.amount_minor
      AND p.status='Emitido'
  ) THEN RAISE(ABORT,'payment batch line reference mismatch') END;
END;

CREATE TRIGGER payment_batch_line_immutable_update BEFORE UPDATE ON payroll_payment_batch_lines
BEGIN SELECT RAISE(ABORT,'payment batch lines are immutable'); END;
CREATE TRIGGER payment_batch_line_immutable_delete BEFORE DELETE ON payroll_payment_batch_lines
BEGIN SELECT RAISE(ABORT,'payment batch lines are immutable'); END;
CREATE TRIGGER payment_batch_immutable_delete BEFORE DELETE ON payroll_payment_batches
BEGIN SELECT RAISE(ABORT,'payment batches are immutable'); END;

CREATE TRIGGER payment_batch_transition_guard BEFORE UPDATE ON payroll_payment_batches
BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.run_id<>OLD.run_id
    OR NEW.batch_number<>OLD.batch_number OR NEW.period<>OLD.period OR NEW.currency<>OLD.currency
    OR NEW.employee_count<>OLD.employee_count OR NEW.total_minor<>OLD.total_minor
    OR NEW.evidence_hash<>OLD.evidence_hash OR NEW.prepared_by<>OLD.prepared_by OR NEW.prepared_at<>OLD.prepared_at
    THEN RAISE(ABORT,'payment batch evidence is immutable') END;
  SELECT CASE WHEN NOT ((OLD.status='Preparado' AND NEW.status='Aprovado') OR (OLD.status='Aprovado' AND NEW.status='Exportado'))
    THEN RAISE(ABORT,'invalid payment batch transition') END;
END;
