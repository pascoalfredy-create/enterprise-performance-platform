-- Commercial model change: one single bundle ("ENTERPRISE" — Yela Performance
-- Enterprise), priced by employee-count tier instead of by bundle tier +
-- per-seat add-ons. bundle_code itself is untouched (still only ever
-- 'ENTERPRISE' going forward; historical FINANCE/PEOPLE/PERFORMANCE rows are
-- left exactly as they were sold, never rewritten).
ALTER TABLE subscriptions ADD COLUMN employee_tier TEXT NOT NULL DEFAULT 'T1' CHECK (employee_tier IN ('T1','T2','T3','T4'));
ALTER TABLE subscriptions ADD COLUMN extra_financial_model_projects INTEGER NOT NULL DEFAULT 0 CHECK (extra_financial_model_projects >= 0);
ALTER TABLE checkout_sessions ADD COLUMN requested_extra_financial_model_projects INTEGER NOT NULL DEFAULT 0 CHECK (requested_extra_financial_model_projects >= 0);
