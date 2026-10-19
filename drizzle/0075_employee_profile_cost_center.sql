-- Reuse the existing tenant-configured financial dimensions (the same
-- dimension_members already linked from salary_profiles, planning_entries,
-- performance_entries and workforce_cost_postings) as the cost-center
-- picker in Dados Profissionais, instead of a new, disconnected table.
-- Department reuses the existing organizations(kind='Departamento') concept
-- (already selectable when creating a unit) rather than inventing a second one.
ALTER TABLE employee_profile ADD COLUMN cost_center_member_id TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_profile ADD COLUMN department_organization_id TEXT NOT NULL DEFAULT '';
