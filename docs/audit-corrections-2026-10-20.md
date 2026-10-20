# Audit integrity corrections — 20 October 2026

Scope: fixes for the eight findings against commit 99931515. No visual redesign and no mutation of production payroll or budget data during development.

1. Budget resource authorization: every mapping-id and assumption-id operation checks both tenant and caller organization. Explicit company claims cannot widen the authenticated scope. The no-dimension cell and company-wide aggregate view are distinguished.
2. Payroll editor identity: employee, month, currency and revision form the React reconciliation boundary, so uncontrolled numeric fields cannot travel to a different employee.
3. Additive integration: separately applied mappings are combined per version/company/dimension/currency/period. Manual composition is applied once; reapplying the same mapping stays idempotent. D1 batch preconditions reject concurrent cell replacement.
4. Currency isolation: annual writes, assumptions, adjustment and origin reads use currency as part of cell identity; ambiguous legacy reads return a conflict.
5. Dimension isolation: recalculation matches an exact dimension (including NULL), while aggregate reads add independently calculated groups instead of selecting the last row. Aggregate views are read-only until an explicit dimension/no-dimension view is selected.
6. Historical evidence: migration 0083 adds frozen source and full-cell composition JSON to applied integration values. Old values have no invented detail: their snapshot is explicitly unavailable. Existing approved monetary values are not recalculated or migrated.
7. Payroll import: updated templates include month and currency. Parsing validates the whole file, refuses unknown/duplicate employee numbers and invalid amounts, and preserves unrelated inputs. One server-side D1 transaction saves all changed employees with revision checks and audit; any failure rolls back the batch. Up to 200 changed employees per atomic batch.
8. Deployment: typecheck and the entire test/build command run before migrations and worker deployment, including direct pushes to main. Verification and deployment use Node 24 consistently.

Validation includes actual SQLite migrations and real API handler tests, parser tests and a structural guard for the React identity regression. The workflow gate is checked as well. Authenticated visual verification remains a distinct pending check while no browser/execution environment is available.

The new templates intentionally supersede the old untagged payroll import templates. Export a fresh template before importing. No old partial imports or mixed-currency data are automatically rewritten: affected records require scoped review and user-supported evidence.
