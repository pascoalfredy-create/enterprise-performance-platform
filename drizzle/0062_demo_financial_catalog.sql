-- Classify only the known ERP Demo codes; tenant-authored classifications win.
INSERT OR IGNORE INTO financial_line_catalog (id,tenant_id,code,name,classification,cash_flow_category,sign_mode,status,created_by,created_at)
SELECT lower(hex(randomblob(16))),e.tenant_id,e.line_code,MAX(e.line_name),CASE e.line_code WHEN 'REVENUE' THEN 'Receita' WHEN 'COGS' THEN 'Custo' WHEN 'OPEX' THEN 'Custo' ELSE 'Ativo' END,'Não aplicável','Natural','Ativa','demo-catalog-repair',datetime('now')
FROM performance_entries e WHERE e.source='ERP Demo' AND e.line_code IN ('REVENUE','COGS','OPEX','CAPEX','CASH') GROUP BY e.tenant_id,e.line_code;
