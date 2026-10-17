-- Existing imports remain monthly. YTD flow values must exclude opening balances.
ALTER TABLE analysis_imports ADD COLUMN period_basis TEXT NOT NULL DEFAULT 'month' CHECK (period_basis IN ('month','ytd'));
