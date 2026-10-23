-- One complete approved source line may feed one destination per channel.
-- The channel is part of the versioned adapter reference; economic CAPEX
-- and its cash payment remain independent. Other integration types keep
-- their existing multi-dimensional allocation contracts.
CREATE UNIQUE INDEX IF NOT EXISTS investment_budget_active_source
 ON financial_line_catalog_mappings(tenant_id,source_reference)
 WHERE source_module='Investimentos' AND status='Ativo'
 AND json_extract(CASE WHEN json_valid(source_reference) THEN source_reference ELSE '{}' END,'$.channel') IN ('CAPEX','Depreciacao','Pagamento','Financiamento');
