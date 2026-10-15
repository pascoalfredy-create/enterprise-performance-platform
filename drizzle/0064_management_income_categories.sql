-- Management categories are independent of accounting classifications and descriptions.
ALTER TABLE management_actuals ADD COLUMN category TEXT NOT NULL DEFAULT '';
UPDATE management_actuals SET category=COALESCE((SELECT e.line_name FROM performance_entries e WHERE e.id=management_actuals.entry_id AND e.tenant_id=management_actuals.tenant_id),'Sem categoria');
CREATE INDEX management_actual_entry ON management_actuals(tenant_id,entry_id);
