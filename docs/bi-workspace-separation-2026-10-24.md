# BI and operational workspace separation — first delivery

The BI workspace groups real financial, treasury, bank, people-health, workforce-cost, approved-budget variance, saved-study and consolidation panels by entitled module and analysis area. The operational navigation catalog controls available panels; unsupported or unauthorized requests do not render a panel. Pure analysis destinations route to BI. Treasury, bank import, payroll, employee files, budget input and study assumptions retain independent operational destinations.

The hub renders existing calculation components, not another data engine. Financial subpanel changes retain FinanceSuite filter state. Each underlying panel states its own period/currency/source. The hub does not claim to apply a global period to all modules. The executive overview starts at the current month; missing profile data no longer substitutes illustrative metrics/charts/actions.

Treasury work keeps account balances, editable movements, validation and import controls. KPIs, category summaries and 13-week forecasts render in analysis mode; source rows remain available. Bank work keeps file preview, import, classification, original rows and correction/deletion; BI shows read-only balance summaries, charts, grouped and original rows. Existing workbook exports remain. Financial obligations retain their operational tables and settlement controls while redundant total cards are removed. Reports explicitly request analysis presentation for treasury/bank destinations.

No financial, payroll, fiscal, debt, tax-calendar or study formulas changed. No schema migration and no production-data edits are part of this work. Five-language copy is authored for the new hub. Existing component-language findings remain tracked separately.

## Remaining scope

This is the shared BI foundation and first operational separation. Recruitment, attendance and reviews still use the combined people-health view rather than their own detailed BI pages. Additional draft-budget/scenario comparisons and richer per-submodule charts need dedicated read-only views with explicit filters. Operational statuses and approval counters must not be blindly removed or hidden by CSS. This delivery must not be described as completing every module or redesigning every chart.

## Validation

Permission filtering, independent work routes, authorized and unauthorized rendering are covered by tests/bi-workspace.test.mjs. A separate actual-React fixture exercises work/analysis presentation in five languages, panel switching and return to source without production writes. Authenticated browser QA of the review version remains mandatory before activation.

## Review browser observations

Authenticated review browsing confirmed the BI/module/area selector, operational finance landing, work treasury account and import controls, and bank import controls without chart cards. The financial BI view loaded the real August 2026 aggregate: revenue 36,214,600 AOA, recognized costs 19,600,000 AOA and recorded management result 16,614,600 AOA. No production data were edited. Treasury lacks balances for the chosen date; bank statements are absent in the selected scope, so nonempty forecast/bank views and their Excel export were verified with isolated React fixtures instead of invented production records.

The real executive PDF attempt timed out. The browser runtime then refused observation because its native credential state could not resume; explicit navigation to the retained origin did not recover access. This is an unresolved browser/PDF validation blocker, not evidence of a PDF calculation defect. Do not activate the release until this check and final-version browser verification are completed.
