ALTER TABLE attendance_entries ADD COLUMN clock_in_lat REAL;
ALTER TABLE attendance_entries ADD COLUMN clock_in_lng REAL;
ALTER TABLE attendance_entries ADD COLUMN clock_in_accuracy_m REAL;
ALTER TABLE attendance_entries ADD COLUMN clock_out_lat REAL;
ALTER TABLE attendance_entries ADD COLUMN clock_out_lng REAL;
ALTER TABLE attendance_entries ADD COLUMN clock_out_accuracy_m REAL;

DROP TRIGGER IF EXISTS attendance_entry_close;
CREATE TRIGGER IF NOT EXISTS attendance_entry_close BEFORE UPDATE ON attendance_entries
WHEN OLD.clock_out IS NOT NULL OR NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.employee_id<>OLD.employee_id
 OR NEW.work_date<>OLD.work_date OR NEW.clock_in<>OLD.clock_in OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NEW.clock_in_lat IS NOT OLD.clock_in_lat OR NEW.clock_in_lng IS NOT OLD.clock_in_lng OR NEW.clock_in_accuracy_m IS NOT OLD.clock_in_accuracy_m
 OR NEW.clock_out IS NULL OR NEW.worked_minutes IS NULL OR NEW.overtime_minutes IS NULL
BEGIN SELECT RAISE(ABORT,'invalid attendance entry close'); END;
