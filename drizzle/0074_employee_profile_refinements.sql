-- "Estabelecimento" never had a clear meaning distinct from the employee's
-- organization; rename it to pair with education level as the institution
-- that issued the qualification. Add an IBAN/NIB field so the fiscal and
-- banking tab is complete at registration -- this is the value HR records
-- directly when opening the file; the governed self-service request table
-- (employee_personal_detail_requests) remains the separate place an
-- employee requests a change to their own payout account later.
ALTER TABLE employee_profile RENAME COLUMN establishment TO education_institution;
ALTER TABLE employee_profile ADD COLUMN bank_iban TEXT NOT NULL DEFAULT '';
