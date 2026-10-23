# Projected income tax payment calendar

This optional study setting separates the monthly estimated income tax expense from payments and outstanding tax. It adds no accounting journal, statutory tax determination or real treasury transaction. Existing studies default to the previous immediate monthly payment behaviour.

## Assumptions and cash treatment

`planning.taxPaymentCalendar` has a cycle of 1, 3, 6 or 12 study months and a payment lag of 0–12 months. Cycles begin at study month 1, not an inferred civil fiscal year. The tax estimate itself stays monthly at the configured rate, without annual netting of losses, loss carryforwards, advance payments or withholding. Those require separate explicit policy work.

For example, cycle 3 and lag 1 pays estimates for months 1–3 in month 4. Unpaid estimated tax becomes a liability. Only already-accrued amounts scheduled within the next 12 months enter current liabilities; later maturities are non-current. Future expense is not classified as current debt. Without project liquidation, liabilities beyond the forecast horizon remain outstanding. Liquidation settles the estimated balance at the final month.

The actual business cash flow and CFADS deduct tax paid, with the income-statement expense reversed only once in the cash bridge. Unlevered project cash flow applies the same calendar independently to operating tax before financing effects. VAT retains its existing calendar and stays separate from income tax. Operating working capital excludes this income-tax balance to avoid deducting payment twice.

## Presentation

Fiscal assumptions expose two inputs and an automatically calculated monthly view by study year. Detailed method text is collapsed. Projected treasury shows tax paid; projected balance separates VAT and current/non-current income tax. Liquidity and structural working capital reflect the new liabilities. The working-capital support map includes estimated, paid and outstanding income tax. Excel retains protected live helper formulas, validation, explanations and round-trip imports in five languages.

## Validation

Independent due-date ledgers cover every supported cycle, lags, seasonal estimates and liquidation/continuation. Additional cases cover legacy equivalence, quarterly timing, current/non-current classification without future expense, debt-independent project valuation and real workbook round trips. TypeScript, full build/tests, language audit, actual React controls and authenticated browser review remain required before publication.

Reference for the expense/cash distinction: IFRS Foundation, IAS 7 paragraphs 35–36, https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ias7.html. Payment intervals and lag are user-defined management assumptions; this implementation does not certify IFRS or local tax compliance, calculate deferred tax assets/liabilities, or infer a country's legal deadlines.
