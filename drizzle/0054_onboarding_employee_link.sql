DROP TRIGGER IF EXISTS onboarding_case_transition;
CREATE TRIGGER IF NOT EXISTS onboarding_case_transition BEFORE UPDATE ON employee_onboarding_cases
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.application_id<>OLD.application_id OR NEW.owner_email<>OLD.owner_email OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT (
  (OLD.status='Preparação' AND NEW.status='Em curso')
  OR (OLD.status='Em curso' AND NEW.status='Concluído' AND NEW.completed_at IS NOT NULL AND EXISTS(SELECT 1 FROM employee_onboarding_tasks t WHERE t.case_id=OLD.id) AND NOT EXISTS(SELECT 1 FROM employee_onboarding_tasks t WHERE t.case_id=OLD.id AND t.status<>'Concluída'))
  OR (NEW.status=OLD.status AND OLD.employee_id IS NULL AND NEW.employee_id IS NOT NULL)
 )
BEGIN SELECT RAISE(ABORT,'invalid onboarding case transition'); END;
CREATE TRIGGER IF NOT EXISTS onboarding_case_employee_scope BEFORE UPDATE ON employee_onboarding_cases
WHEN NEW.employee_id IS NOT NULL AND (OLD.employee_id IS NULL OR NEW.employee_id<>OLD.employee_id)
 AND NOT EXISTS(SELECT 1 FROM employees e WHERE e.id=NEW.employee_id AND e.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'onboarding case employee outside tenant'); END;
