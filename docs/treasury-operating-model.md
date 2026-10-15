# Treasury and financial engine: operating contract

The selected source model is ERP + banks. This release supplies the cash-planning foundation and real financial-line reporting. It does not connect to a bank or execute payments.

## Treasury

1. Configure bank accounts by authorized organization and ISO currency.
2. Record each account's available bank balance for the selected date, with a statement reference. A new reference records a correction as a new immutable snapshot; previous evidence is retained. Duplicate references on the same account/date are rejected.
3. Record expected receipts and payments, or import an ERP CSV with columns `data;direcao;rubrica;descricao;valor;referencia`. Directions are `Entrada` and `Saída`. Values are positive; the direction determines the effect on cash. Maximum 500 lines per import, atomic and reference-deduplicated per account.
4. Select organization, currency and bank-balance date. Forecasts are withheld until every selected account has a balance for that date. Currencies are never added together or implicitly converted.
5. The engine starts with the available balance, adds expected receipts and subtracts expected payments daily for 91 days. Weekly closing = weekly opening + inflows - outflows. The minimum is computed across daily closing balances, including opening cash. This is a dated planning estimate, not an intraday liquidity guarantee.
6. Overdue outstanding items are included on the first projection day and explicitly counted. Review overdue items rather than treating their contractual due dates as guaranteed payment dates.
7. Cancel forecasts that are no longer outstanding; record refreshed bank balances after actual settlements. This release does not reconcile actual bank statement movements automatically. Do not leave already-settled forecasts outstanding after updating a bank balance, as that would count them again.
8. Source references, balances, imports and cancellations are audited. No forecast changes Actual accounting entries. XLSX exports contain the selected projection and balance evidence.

## Concise financial surface

The CFO summary retains a small set of actual totals and exposes the real mapped catalog lines, selected-period Actual/Budget amounts and an explicitly arithmetic Actual-minus-Budget difference. Line names and classifications come from the tenant's own financial catalog. A source-model redesign remains necessary before certifying a full balance sheet, indirect cash-flow statement or ratios that require average balances.

Next work should agree a configurable reporting hierarchy and formulas for results, financial position and cash movements, with drill-through to ERP evidence and completeness/reconciliation checks. A trial balance is not by itself a bank cash forecast, and a profitability total is not available cash.

## Verification

SQLite-backed runtime tests cover 13-week arithmetic, daily shortfalls, overdue items, cancelled flows, scope, read-only roles, full account-to-forecast flow, immutable balance revisions, atomic CSV deduplication and the absence of side effects on Actual entries. Visual verification with an authenticated administrative session remains outstanding.
