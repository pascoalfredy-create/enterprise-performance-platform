# Monthly and accumulated management analysis

## Behavior
- Finanças → Automatização da análise has month, two months, quarter to date, half-year to date, year to date and custom start/end month filters.
- Custom intervals support up to 120 months, including year boundaries. Quarter/half-year shortcuts are calendar periods ending at the chosen source month.
- Import basis is explicit: monthly movements or January-to-date flows, excluding opening balances. Positions are always closing balances.
- Migration 0068 adds `period_basis` default month; existing sources retain their original interpretation. Monthly hashes remain compatible with previous imports. Switching basis is a real revision requiring replacement confirmation.
- YTD writes require explicit opening-exclusion acknowledgement; raw reports that mix opening balances with current-year flows still need a source adapter/separation before import.
- Each observed monthly/YTD flow is an interval edge. A flow is available only if observed intervals connect the requested boundaries, independently per role. No values are spread across months. Observations after the selected end cannot resolve earlier periods.
- Closing positions come from the final month; opening positions come from the month immediately before the start. Positions are never summed or averaged in the monthly summary. Opening positions are never included in flow edges.
- Monthly averages equal interval flows divided by the inclusive calendar-month count. Derived profit averages need complete income coverage. Rates use the aggregated interval report and its actual dates.
- Monthly history includes gaps and marks unavailable observations. An isolated YTD total never becomes a fake monthly trend.
- The automatic-analysis comparison uses the same interval in the previous year when available. Headcount averaging uses the selected interval boundaries.
- Interval totals, monthly averages and interpretation notes appear on screen, in the complete printable executive report, and in the Excel interval sheet.

## Validation
- `tests/analysis-intervals.test.mjs`: isolated cumulative averages; cumulative differences; zero/negative corrections; quarter boundaries; unavailable subperiods; gaps; monthly sum vs closing positions; weighted margin; cash bridge/opening exclusion; mixed source bases; cross-year intervals; scope and integer overflow.
- `tests/financial-ledger.test.mjs`: migration, persisted basis, YTD acknowledgement, idempotency, revision-safe basis replacement and CFO monthly/YTD coverage.
- `tests/executive-print.test.mjs`: complete printable report includes totals/averages and interpretation note before tabs are opened.
- Existing tenant, currency, organization, audit and treasury separation checks remain applicable.
- No authenticated visual session or browser PDF-print dialog validation. Uploaded private Primavera files are not committed and are not imported into production by these tests.

## Acceptance walkthrough
1. Open Finanças → Automatização da análise and select organization, currency and source month.
2. Download the blank template. Supply source-verified values, with actual zeros distinguished from absent information. Exclude duplicate totals.
3. Choose monthly movements or January-to-date; confirm the basis/opening-exclusion statement and import.
4. For an isolated August YTD source, select January to August. The total and total/8 should appear. August alone stays unavailable until July YTD or observed August movements are supplied.
5. For March and June YTD observations, select April–June: June minus March, average /3. April alone remains unavailable without its boundary observations.
6. Export PDF/Excel and confirm the selected dates, averages and explanatory note.

## Remaining source work
- Direct Crystal Reports XLS and formatted Primavera PDF parsing is not part of this interval change. The existing canonical CSV/XLSX path remains available.
- No external ERP API connection or automatic sector-reference feed is claimed.
- Cross-year approved-budget comparison remains unavailable if the existing budget endpoint cannot supply all selected periods.
