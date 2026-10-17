# Assumption-driven feasibility, report previews and live Excel

## Delivery boundary
This release implements the common financial model and report/UI improvements approved in the discussion. It does not activate the ten industry packs, Monte Carlo, market-data feeds, complex project pipelines or jurisdictional tax compliance. Opening an established annual study now prepares an integrated draft automatically. This retains its base assumptions, discount rate and useful-life horizon; saved revisions remain unchanged until the user saves. A visible notice explains recalculation. New studies use the integrated model by default. The legacy calculator remains available for explicit comparison.

## Preserved and improved
- Existing study IDs, organizations, revisions, audit controls and saved assumptions remain in the same D1 table. No destructive migration.
- Existing annual engine/model 2 stays mathematically unchanged; editable drafts use model 3 automatically. Integrated assumptions are stored under a strictly validated `planning` object with version 1; results are model 3.
- Existing feasibility KPI cards remain. Annual projections and financial statement tables are collapsed on the main page; complete statements appear in the PDF preview.
- Projected statements have a separate visible preview action with income, balance and cash-flow tabs; tables stay collapsed on the main page. PDF and Excel have preview actions, including the general module transfer toolbar. Excel download occurs inside its preview.
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
- NPV uses equivalent monthly discount; conventional monthly IRR is annualized by compounding. Startup negative flows before the first positive receipt still permit IRR when there is exactly one nonzero sign change. Nonconventional/unavailable IRR remains unavailable. Simple/discounted payback is interpolated by month.

## Verification
- Dedicated tests cover loan methods/grace, VAT/reinvestment/ongoing/closing cases, balance/cash/debt reconciliation, automatic/manual funding, fixed-rate project invariance to debt, periodic discount/IRR, legacy preservation, import round-trip, formula ranges and workbook parity.
- API tests cover persistence, validation and existing isolation/revision checks. Printable report tests ensure full financial statements/notes are present before preview opens.
- Native spreadsheet QA strips cached formula values before recalculation, then compares model values with the spreadsheet engine. A second workbook changes only price, horizon and nominal debt interest on sheet 01 before forced recalculation. Cached-value inspection alone is not accepted as proof of recalculation.
- Authenticated visual and browser print-dialog tests have not been performed; native spreadsheet checks do not certify every Excel version.


## Live-session access regression (2026-10-17)
The administrator session opened a new empty study, with no saved assumption-driven study selected. A legacy positive-CAPEX validation rejected its default zero investment; conditional header rendering then removed all preview buttons. Entering a temporary positive investment exposed and opened the maps, reproducing the cause without saving tenant data.
Integrated models now allow zero initial CAPEX (services/startup drafts), while negative investment and residual above investment remain invalid. The legacy annual calculator retains its prior validation. UI, API and own-template import apply the same integrated rule. Preview actions remain visible, disabled with an explanation for genuinely invalid assumptions. Empty operating assumptions are marked as unpopulated projections, not proof of viability, including in the PDF.


## IAPMEI statement presentation reference
Official source: https://www.iapmei.pt/pt/saber-mais/apoio-empresarial-e-formacao/ferramentas-de-gestao/ferramenta-de-avaliacao-de-projetos/
Reference archive: https://www.iapmei.pt/media/f005100b/20260811-214229_FAP5_anos_V8.zip (FAP5_anos_V8.xlsm; inspected without executing macros).
The shared presentation layer follows the reference’s income statement progression, asset/equity/liability hierarchy and treasury operating/financing/investing groups. UI, PDF and five-sheet Excel use the same presentation mapping and live calculation references. Monthly technical calculation rows remain protected and hidden in Excel; the annual maps are the visible output. Valuation calculations and stored assumptions are unchanged.
This is an adaptation, not the official workbook or an IAPMEI certification. Aggregated fixed/variable cost assumptions are disclosed and not invented as detailed personnel, FSE or CMVMC. Unsupported asset classes are not fabricated. Configured tax rates remain applicable; Portuguese IRC, municipal surcharge or labour deductions are not silently introduced. The cash map uses an indirect operational bridge because direct-flow detail is not supplied by the current assumptions. All groups reconcile to the existing model and closing balance cash.
