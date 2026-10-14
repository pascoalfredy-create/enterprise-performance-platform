-- Fail closed if existing active payroll already contains duplicate employee periods.
CREATE TABLE payroll_duplicate_preflight (n INTEGER CHECK(n=0));
INSERT INTO payroll_duplicate_preflight SELECT COUNT(*) FROM (SELECT l.tenant_id,l.employee_id,r.period,r.currency FROM payroll_run_lines l JOIN payroll_runs r ON r.id=l.run_id AND r.tenant_id=l.tenant_id WHERE r.status<>'Cancelado' GROUP BY l.tenant_id,l.employee_id,r.period,r.currency HAVING COUNT(*)>1);
DROP TABLE payroll_duplicate_preflight;
CREATE TRIGGER payroll_employee_period_unique BEFORE INSERT ON payroll_run_lines
WHEN EXISTS(SELECT 1 FROM payroll_run_lines l JOIN payroll_runs old ON old.id=l.run_id AND old.tenant_id=l.tenant_id JOIN payroll_runs new ON new.id=NEW.run_id AND new.tenant_id=NEW.tenant_id WHERE l.tenant_id=NEW.tenant_id AND l.employee_id=NEW.employee_id AND old.period=new.period AND old.currency=new.currency AND old.status<>'Cancelado')
BEGIN SELECT RAISE(ABORT,'duplicate employee payroll period'); END;
-- All settlements execute inside the same SQLite statement/transaction as closing.
CREATE TRIGGER payroll_close_atomic_settlement AFTER UPDATE OF status ON payroll_runs
WHEN OLD.status='Aprovado' AND NEW.status='Fechado'
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM payroll_loan_deductions d JOIN payroll_loan_installments i ON i.id=d.installment_id AND i.tenant_id=d.tenant_id JOIN payroll_loans l ON l.id=d.loan_id AND l.tenant_id=d.tenant_id WHERE d.run_id=NEW.id AND d.tenant_id=NEW.tenant_id AND (d.status<>'Calculada' OR i.status<>'Programada' OR l.status<>'Aprovado')) THEN RAISE(ABORT,'payroll settlement source changed') END;
 UPDATE payroll_loans SET outstanding_minor=outstanding_minor-(SELECT SUM(d.amount_minor) FROM payroll_loan_deductions d WHERE d.loan_id=payroll_loans.id AND d.tenant_id=payroll_loans.tenant_id AND d.run_id=NEW.id AND d.status='Calculada') WHERE tenant_id=NEW.tenant_id AND id IN (SELECT loan_id FROM payroll_loan_deductions WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id AND status='Calculada');
 UPDATE payroll_loan_installments SET status='Liquidada',paid_at=NEW.closed_at WHERE tenant_id=NEW.tenant_id AND id IN (SELECT installment_id FROM payroll_loan_deductions WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id AND status='Calculada');
 UPDATE payroll_loan_deductions SET status='Liquidada',settled_at=NEW.closed_at WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id AND status='Calculada';
 UPDATE payroll_loans SET status='Liquidado',completed_at=NEW.closed_at WHERE tenant_id=NEW.tenant_id AND status='Aprovado' AND outstanding_minor=0 AND id IN (SELECT loan_id FROM payroll_loan_deductions WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id);
 UPDATE payroll_adjustments SET status='Processado',processed_at=NEW.closed_at WHERE tenant_id=NEW.tenant_id AND status='Aprovado' AND id IN (SELECT adjustment_id FROM payroll_adjustment_applications WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id AND status='Calculado');
 UPDATE payroll_adjustment_applications SET status='Processado',processed_at=NEW.closed_at WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id AND status='Calculado';
END;
DROP TRIGGER payroll_adjustment_application_no_delete;
CREATE TRIGGER payroll_adjustment_application_no_delete BEFORE DELETE ON payroll_adjustment_applications WHEN NOT EXISTS(SELECT 1 FROM payroll_runs r WHERE r.id=OLD.run_id AND r.tenant_id=OLD.tenant_id AND r.status='Cancelado') BEGIN SELECT RAISE(ABORT,'payroll adjustment applications cannot be deleted'); END;
-- Cancellation releases the period, while preserving the original payroll evidence.
DROP TRIGGER payroll_runs_valid_transition;
CREATE TRIGGER payroll_runs_valid_transition BEFORE UPDATE OF status ON payroll_runs
WHEN NOT ((OLD.status='Rascunho' AND NEW.status='Validado') OR (OLD.status='Validado' AND NEW.status='Aprovado') OR (OLD.status='Aprovado' AND NEW.status='Fechado') OR (OLD.status IN ('Rascunho','Validado','Aprovado') AND NEW.status='Cancelado'))
BEGIN SELECT RAISE(ABORT,'invalid payroll transition'); END;
DROP INDEX payroll_runs_period_scope_uq;
CREATE UNIQUE INDEX payroll_runs_period_scope_uq ON payroll_runs(tenant_id,period,currency,COALESCE(organization_id,'')) WHERE status<>'Cancelado';
CREATE TRIGGER payroll_cancel_release AFTER UPDATE OF status ON payroll_runs WHEN NEW.status='Cancelado'
BEGIN
 DELETE FROM payroll_loan_deductions WHERE run_id=NEW.id AND tenant_id=NEW.tenant_id AND status='Calculada';
 DELETE FROM payroll_adjustment_applications WHERE run_id=NEW.id AND tenant_id=NEW.tenant_id AND status='Calculado';
END;
