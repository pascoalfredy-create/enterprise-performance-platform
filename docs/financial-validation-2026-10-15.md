# Financial foundation review — 15 October 2026

This release corrects the operating path from source imports to reporting. It is not a certification of the entire financial module.

## Delivered

- API-provided action availability explains segregation of duties before a user tries validation, publication or an integration decision. The server still enforces the same policy. Financial batches require a user independent of the creator; integration decisions require a user independent of the validator.
- Integration alerts use the same policy for the actionable count and claiming a task. Role permission alone does not mean a user can approve their own validation.
- Financial catalog creation uses explicit columns and the correct number of SQL values.
- Imported detail values display major currency units; the unchanged stored integers remain minor units. Batch selection clears old detail rows immediately.
- Mutations release their busy state after network/JSON failures and are never automatically retried.
- Actual import totals outside the safe integer range are rejected before insertion. Integration record counts reject fractions.
- Organization, month and currency filters reach every operational financial report. Scope restrictions remain enforced server-side. A multi-organization sum is labelled as authorized organizations, not as consolidation with eliminations.
- The management-pack export reads the filtered cockpit and produces an XLSX summary and classification breakdown. Fixed illustrative EBITDA, cash, conclusions and amounts are removed from the export and operational views.
- Budget comparison selects an approved version for the selected fiscal year and does not substitute a zero budget for a period with no budget entries.
- Empty periods and balance-only records do not fabricate income. Partial diagnostic roles fall back to the complete classified income totals. Cash categories are labelled as an aggregation, not a reconciled cash-flow statement.
- Working-capital estimates require the relevant role data and positive denominators, using the actual number of calendar days in the month.
- Variance drivers accumulate all descriptions under the same financial line code, reconciling the drivers and residual to the total variance.

## Verification

TypeScript and production build passed. All 259 tests passed, including ten new SQLite-backed runtime tests covering catalog creation, import-to-Actual, self-approval rejection, single posting, unsafe totals, integration decisions, counts, report filters and organization isolation, empty periods, partial role coverage, variance reconciliation and alert actionability.

No production imports were approved or published as part of testing. Authenticated visual verification of this release is pending: the administrative browser session was unavailable.

## Further work

- Validate real user journeys with an independent financial reviewer account, without repurposing the employee portal account.
- Agree and implement the source-data contract for balances versus movements, debit/credit and contra-account signs, opening/closing balances, and cash movements before certifying full financial statements.
- Add explicit balance-sheet reconciliation and source completeness checks.
- Build operational 13-week treasury forecasts and receivables/payables aging from reconciled source data; illustrative outputs have been removed, not replaced with invented operational forecasts.
- Extend end-to-end financial validation to approved budgets/forecasts, consolidation/eliminations, model drivers, diagnostics and exported management conclusions.
