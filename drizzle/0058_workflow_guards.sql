CREATE UNIQUE INDEX attendance_one_active_shift ON attendance_assignments(tenant_id,employee_id) WHERE status='Ativa';
DROP TRIGGER attendance_timesheet_transition;
CREATE TRIGGER attendance_timesheet_transition BEFORE UPDATE ON attendance_timesheets WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.employee_id<>OLD.employee_id OR NEW.period<>OLD.period OR NEW.created_at<>OLD.created_at OR NOT (
 (OLD.status='Rascunho' AND NEW.status='Submetido' AND NEW.submitted_by IS NOT NULL AND NEW.submitted_at IS NOT NULL AND NEW.source_hash=OLD.source_hash AND NEW.worked_minutes=OLD.worked_minutes AND NEW.scheduled_minutes=OLD.scheduled_minutes AND NEW.overtime_minutes=OLD.overtime_minutes AND NEW.entry_count=OLD.entry_count) OR
 (OLD.status='Submetido' AND NEW.status IN ('Aprovado','Rejeitado') AND NEW.decided_by IS NOT NULL AND NEW.decided_at IS NOT NULL AND NEW.source_hash=OLD.source_hash AND NEW.worked_minutes=OLD.worked_minutes AND NEW.scheduled_minutes=OLD.scheduled_minutes AND NEW.overtime_minutes=OLD.overtime_minutes AND NEW.entry_count=OLD.entry_count) OR
 (OLD.status='Rejeitado' AND NEW.status='Rascunho' AND NEW.submitted_by IS NULL AND NEW.decided_by IS NULL AND NEW.source_hash IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'invalid attendance timesheet transition'); END;
CREATE TRIGGER onboarding_task_open_case BEFORE INSERT ON employee_onboarding_tasks WHEN NOT EXISTS(SELECT 1 FROM employee_onboarding_cases c WHERE c.id=NEW.case_id AND c.tenant_id=NEW.tenant_id AND c.status IN ('Preparação','Em curso')) BEGIN SELECT RAISE(ABORT,'invalid completed onboarding case'); END;
ALTER TABLE consolidation_adjustments ADD COLUMN organization_id TEXT;
ALTER TABLE consolidation_adjustments ADD COLUMN nci_amount_minor INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER consolidation_adjustment_nci_immutable BEFORE UPDATE ON consolidation_adjustments WHEN NEW.organization_id IS NOT OLD.organization_id OR NEW.nci_amount_minor<>OLD.nci_amount_minor BEGIN SELECT RAISE(ABORT,'consolidation adjustment is immutable'); END;

DROP TRIGGER IF EXISTS consolidation_run_transition_guard;
CREATE TRIGGER IF NOT EXISTS consolidation_run_transition_guard BEFORE UPDATE ON consolidation_runs
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.rate_set_id<>OLD.rate_set_id OR NEW.period<>OLD.period OR NEW.target_currency<>OLD.target_currency
 OR NEW.run_number<>OLD.run_number OR NEW.source_count<>OLD.source_count OR NEW.organization_count<>OLD.organization_count OR NEW.currency_count<>OLD.currency_count
 OR NEW.converted_total_minor<>OLD.converted_total_minor OR NEW.input_hash<>OLD.input_hash
 OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT (OLD.status='Calculado' AND NEW.status='Aprovado'
  AND NEW.adjustment_total_minor=(SELECT COALESCE(SUM(amount_minor),0) FROM consolidation_adjustments a WHERE a.tenant_id=OLD.tenant_id AND a.run_id=OLD.id)
  AND NEW.reported_total_minor=OLD.converted_total_minor+NEW.adjustment_total_minor
  AND NEW.nci_total_minor=OLD.nci_total_minor+(SELECT COALESCE(SUM(nci_amount_minor),0) FROM consolidation_adjustments a WHERE a.tenant_id=OLD.tenant_id AND a.run_id=OLD.id)
  AND NEW.parent_total_minor=NEW.reported_total_minor-NEW.nci_total_minor
  AND NEW.approval_hash IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'invalid consolidation run transition'); END;
