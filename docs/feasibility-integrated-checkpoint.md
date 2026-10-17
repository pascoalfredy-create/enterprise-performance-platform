# Assumption-driven feasibility, report previews and live Excel

## Delivery boundary
This release implements the common financial model and report/UI improvements approved in the discussion. It does not activate the ten industry packs, Monte Carlo, market-data feeds, complex project pipelines or jurisdictional tax compliance. The established annual study remains available unchanged until an owner explicitly enables the integrated model. New studies use the integrated model by default.

## Preserved and improved
- Existing study IDs, organizations, revisions, audit controls and saved assumptions remain in the same D1 table. No destructive migration.
- Existing annual engine/model 2 stays mathematically unchanged. Integrated assumptions are stored under a strictly validated `planning` object with version 1; results are model 3.
- Existing feasibility KPI cards remain. Annual projections and financial statement tables are collapsed on the main page; complete statements appear in the PDF preview.
- PDF and Excel have preview actions, including the general module transfer toolbar. Excel download occurs inside its preview.
- Excel has exactly five sheets: assumptions, income, balance, cash/debt and metrics. Inputs are blue/unlocked; formulas are protected but visible. Sheet protection is accidental-edit protection, not encryption.
- Own-model Excel assumptions can be imported, previewed and applied before saving. Currency, unique keys, required values and finance configuration are validated. This is not a Primavera PDF/XLS reader.

## Financial model
- Monthly horizon up to 360 months, with annual statement summaries. Annual base quantity/fixed costs divide by 12; monthly inputs retain monthly values. Growth changes annually. No extra inflation factor is silently applied.
- Shared expression graph computes values in TypeScript and emits live Excel formulas. Cached results are included, auto recalculation requested, and formulas stay within Excel length/argument limits.
- Project FCFF excludes equity and loan receipts. Actual cash includes interest, principal and financing fees. Investor flows distinguish contributions and a simulated closing liquidation payout.
- Loan: nominal annual interest /12; constant payment, constant principal or bullet; principal grace or capitalized-interest grace. Outstanding debt is repaid on simulated liquidation. WACC uses effective annual contractual debt interest and initial funding weights; fees are reflected in cash but excluded from Kd.
- Auto equity explicitly funds the worst operating cash deficit plus the selected reserve upfront. Manual equity deficits remain visible; no fictitious loan or balance plug is created.
- Receivable/payable balances use rolling invoiced monthly history and fractional average-term weights (365/12 days). No receivable or supplier credit precedes its invoice. Inventory overhang is consumed before new purchases; declining demand cannot manufacture negative purchases/refunds.
- Additional CAPEX occurs once in its configured month. Investments share the configured useful life; net residual proceeds are an explicit end assumption. Asset depreciation is bounded by depreciable value.
- VAT is a configurable projection: sales, eligible direct purchases, selected fixed-cost share, recovery share and settlement cycle. Nonrecoverable VAT enters costs/assets. Credit refunds are explicit assumptions. It is not an automatic local VAT return.
- Income tax is estimated monthly, with optional interest deductibility and no loss carryforward or separate payment lag. Liquidation sale proceeds are already net of sale taxes/costs; disposal book-value differences reconcile equity.
- DSCR uses post-estimated-tax operating cash less operating working-capital change and additional CAPEX, excluding terminal recoveries/residual. Threshold is configurable, not universal bank approval.
- Liquidation assumes recovery/settlement of projected operating balances, net residual sale, remaining debt repayment and positive cash distribution. With liquidation disabled, there is no automatic perpetual/exit value and no intermediate dividend schedule.
- NPV uses equivalent monthly discount; conventional monthly IRR is annualized by compounding. Nonconventional/unavailable IRR remains unavailable. Simple/discounted payback is interpolated by month.

## Verification
- Dedicated tests cover loan methods/grace, VAT/reinvestment/ongoing/closing cases, balance/cash/debt reconciliation, automatic/manual funding, fixed-rate project invariance to debt, periodic discount/IRR, legacy preservation, import round-trip, formula ranges and workbook parity.
- API tests cover persistence, validation and existing isolation/revision checks. Printable report tests ensure full financial statements/notes are present before preview opens.
- Native spreadsheet QA strips cached formula values before recalculation, then compares model values with the spreadsheet engine. A second workbook changes only price, horizon and nominal debt interest on sheet 01 before forced recalculation. Cached-value inspection alone is not accepted as proof of recalculation.
- Authenticated visual and browser print-dialog tests have not been performed; native spreadsheet checks do not certify every Excel version.
