# Financial planning foundation — 23 October 2026

The economic budget remains distinct from an investment study and from actual treasury transactions. Optional settings preserve existing saved studies and their prior numeric behaviour when absent.

## Delivered

- Saved study revision → economic budget: explicit company, currency, analytic line, component and calendar anchor; read-only preview; confirmation; revision/context token; exclusive source ownership; manual-cell safeguards; no implicit allocation to cost centres. Initial investment is a separate component in the month before study month 1. Reinvestment excludes month 0.
- Immutable source evidence: full input snapshot is stored separately from ordinary cell provenance. Source access additionally requires financial-data read permission. Budget application uses the common integration engine and all-cell optimistic checks. Approved versions remain frozen. Removing a draft contribution retains the study and evidence; failed retirement restores source activity.
- Optional operating profile: 12 normalized relative study-month weights, first sales month and linear ramp. Delayed/ramp sales are not automatically recovered later. Existing fixed costs retain their calendar. This is a sales profile, not a manufacturing/inventory optimizer.
- Optional depreciation per initial pool and additional investment: acquisition date remains the cash date; commissioning starts depreciation; published category/rate or useful life; capped charges and no double depreciation for month-zero assets. Unprofiled assets keep existing defaults. The existing global residual assumption remains; individual residual values are not introduced here.
- Optional dated shareholder contributions: initial equity remains month 0; up to 24 later contributions affect cash, capital and actual investor flows, not sales or operating profit. Automatic equity keeps the manual schedule inactive. Earlier deficits remain visible. WACC uses a static planned financing mix within the model horizon, not monthly dynamic weights.
- Excel exports retain live formulas, optional settings and category provenance; import round trips are covered using actual workbooks. User-facing controls and explanatory text retain five languages.

## Validation

TypeScript, complete verified build/test suite, language audit and actual React interaction checks. Additional tests cover independent monthly profiles, book-value limits, dated contributions, tenant/company isolation, approved budgets, stale previews, immutable evidence and source changes at the final write boundary. Browser review and CI outcomes must be checked before publication; this document is not evidence that deployment has occurred.

## Following phases

Debt drawdowns and tranches, cash tax calendars and loss carryforwards by jurisdiction, continuation/liquidation terminal-value choices, scenario lineage and BI redesign remain separate work. No claim of automatic acceptance by every bank, sector or jurisdiction is made. Missing monthly ERP history must never be relabelled as measured monthly results; accumulated averages and derived differences need explicit provenance.
