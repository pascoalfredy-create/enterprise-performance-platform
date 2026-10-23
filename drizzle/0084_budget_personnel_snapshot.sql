-- NULL marks evidence not captured in older approvals. Never rewrite approved
-- values or infer a past classification from today's live mappings.
ALTER TABLE budget_version_line_snapshots ADD COLUMN personnel_organizations_json TEXT CHECK(personnel_organizations_json IS NULL OR json_valid(personnel_organizations_json));
