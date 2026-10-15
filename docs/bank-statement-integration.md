# ERP data and bank statement analysis

The platform reads business data for management analysis. Users do not need to enter accounting journals or opening positions to unlock income and bank analysis. ERP Actual data remains the source of income results; bank statements remain evidence of cash. Importing an invoice payment never automatically creates another revenue or expense entry.

## Bank import

Open Treasury → Bank statements, or Import → Bank statement from the common toolbar. Supported files: CSV, first-sheet Excel `.xlsx`, and OFX. PDF/image extraction and OCR are not included in this release. Use the bank's structured export; an uploaded supporting PDF is not a structured-data import.

The reader recognises Portuguese/English headers for date, description, signed amount or debit/credit, running balance, counterparty IBAN, reference, bank, account and currency. Bank/account/currency and opening/closing balance can also appear as metadata rows above the header. The downloadable sample shows the layout. Excel date serials and ISO or day/month/year dates are supported. Ambiguous monetary separators, invalid dates and inconsistent account/currency data are rejected.

Opening and closing balances are read from source metadata or derived from running balances / closing balance plus the complete transaction list. The user is never asked to type balancing values. Every available running balance must reconcile; import is rejected if opening + inflows − outflows does not equal closing. A file with neither opening, closing nor running balances cannot establish a cash position and must be exported again with that information.

One account/currency is imported per statement. Missing bank/account labels can be confirmed from the bank file; an existing authorised treasury account can be selected. Otherwise, a bank/account/currency identity creates the treasury account automatically. Closing balance feeds the treasury balance on its evidence date. The CFO income preview also reads imported bank flows for the selected month and latest statement balances per account, with each balance's date visible; it never treats a balance from another day as confirmed cash today. Income and bank series remain separate, including when income uses a YTD comparison.

## Categories, IBANs and corrections

Description rules suggest categories such as fuel, payroll, taxes, bank fees, utilities, rent and suppliers. Unknown transfers and IBAN-only descriptions default to Other. Categories are suggestions, not verified accounting treatment. Users can correct an original row, assign a category to all movements of one IBAN within the selected statement, or create a business-specific category without an account code.

The IBAN summary produces one row per normalised IBAN, with original movement count, separate inflows and outflows and net amount. Movements without an IBAN are grouped by category. Mixed categories on one IBAN appear as Other at summary level; individual classifications remain visible in the originals and category chart. IBAN checks validate formatting and known country lengths, not account ownership or a bank payment instruction.

Original rows are retained. Import hash prevents exact replay. Overlapping date ranges for the same account are blocked to prevent double counting where stable transaction IDs cannot be guaranteed. An incorrect statement can be soft-removed with a reason and audit record; original rows remain available for audit and its automatic closing balance is withdrawn. A later manual balance correction must be reviewed before removal. Reimport a corrected file rather than editing source amounts. Mutation revisions reject stale corrections; source import and audit are atomic.

## Common transfer toolbar and actual coverage

All application modules have a common toolbar with Import, Excel and PDF. The import menu opens an implemented destination rather than guessing how to write arbitrary columns into business tables.

| Destination | Current structured import | Consumer |
|---|---|---|
| ERP financial data | CSV and Excel `.xlsx`, code/description/amount, existing mapping and approval | Actual income analysis, profitability and finance reports |
| Bank statements | CSV, Excel `.xlsx`, OFX, preview and reconciliation | Bank dashboard, imported cash series, dated treasury balance |
| Budget / Forecast / Scenarios | Existing CSV / Excel workflow | Planning and scenario analysis |
| Supporting documents | Existing document upload workflow | Document management; does not create numeric/module records |
| Other entity-specific module imports | No new generic writer in this release | Need their own typed schema, validation and adapter before consumption |

Common Excel exports the currently loaded view and visible tables, not unseen pages or a database dump. Module-specific financial/bank exporters retain numeric workbook sheets. Common PDF uses the browser print dialog with a dedicated report frame and Save as PDF destination; it expands original-row details and excludes editing controls. No email is sent and no download contains authentication tokens.

## Validation

Database-backed tests cover source reading, category/IBAN grouping, decimal/date errors, OFX/CSV/Excel cell handling, scope, duplicate/overlap rejection, audit rollback, correction revisions, source retention on removal and the treasury/CFO bridge. Production build, TypeScript and the full repository test suite are required before merge. Authenticated production visual review is still required for live tenant files.
