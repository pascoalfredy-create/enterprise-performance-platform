# Study debt drawdowns

Optional `planning.debtDrawdowns` adds up to 24 future amounts to the existing month-zero loan. Existing saved studies without this setting retain their numeric results. These are planned study cash flows, not real borrowing transactions.

## Contract assumptions

One contract shares the existing nominal annual rate, grace period, maturity and repayment method. Maturity and grace count from project month zero. Additional draws occur at the **start** of their chosen month and therefore accrue that month's interest. Draws must fall within grace; revolving loans or contracts with different terms need a separate future model. Initial fees remain at month zero. A draw beyond the study horizon is retained in inputs but does not finance the projection or its static planned WACC mix.

Interest applies only to funds already drawn, plus capitalized grace interest when selected. Annuity or constant-principal payments begin after grace; bullet repayment occurs at maturity. Project liquidation repays only utilized debt. Project operating cash flows do not gain revenue or operating profit from drawdowns. Actual financing enters cash/debt and FCFE; debt-service coverage reflects actual payments.

## Maps and Excel

Projected treasury and the existing debt-service map show received funding in its period, without adding a second duplicate borrowing line. Shared live formulas feed the balance, cash checks, debt checks and annual reports. Protected auxiliary cells shorten formulas below Excel's formula-size limit. Inputs, explanations and import/export retain five languages.

Validation covers independent cent-rounded schedules for all three repayment methods, capitalized and paid grace interest, unchanged legacy results, horizon exclusion, projected-map receipts, real workbook round trip and five-language React controls. Production browser review and CI remain mandatory before activation.

Formula reference: Microsoft PMT/IPMT documentation specifies periodic rate/period consistency and fixed-rate annuity assumptions: https://support.microsoft.com/en-us/excel/functions/pmt-function and https://support.microsoft.com/en-us/excel/functions/ipmt-function. Month-start draws and shared contractual grace are explicit product assumptions, not an inferred universal bank convention.
