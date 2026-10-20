-- Preserve source evidence at application time. Historical rows remain NULL:
-- reconstructing past composition from today's source would invent history.
ALTER TABLE budget_integration_values ADD COLUMN movements_json TEXT CHECK(movements_json IS NULL OR json_valid(movements_json));
ALTER TABLE budget_integration_values ADD COLUMN cell_snapshot_json TEXT CHECK(cell_snapshot_json IS NULL OR json_valid(cell_snapshot_json));

-- Intentionally empty precondition tables: a failing insert aborts an entire D1 batch.
CREATE TABLE payroll_month_import_checks(matches_revision INTEGER NOT NULL CHECK(matches_revision=1));
CREATE TABLE budget_cell_write_checks(matches_revision INTEGER NOT NULL CHECK(matches_revision=1));
