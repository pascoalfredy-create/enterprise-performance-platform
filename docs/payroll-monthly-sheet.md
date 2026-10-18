# Monthly payroll sheet

The Payroll Runs navigation entry is now displayed as **Folha mensal de salários**. It opens a grid for one month, currency and authorized organization scope. Profiles/components, payroll history/approvals, payslips and payments have separate destinations.

## User workflow

1. Select month, currency and calculation regime.
2. Review employees automatically loaded from the employee master, active contracts and effective monthly salary profiles. Ineligible employees are shown with an explanation, not silently omitted or paid.
3. Use **Preparar variáveis** to override recurring component amounts for that month or add one-off meal, transport, bonus, holiday/Christmas or other deduction amounts. Blank recurring overrides retain the profile value; zero explicitly overrides it to zero. Additions are added to recurring amounts. Neither source profiles nor components are rewritten.
4. Include/exclude employees. Every change is saved with an audit event and an optimistic revision check.
5. **Conferir folha** recalculates on the server, using the same engine and source loader as final generation. The sheet shows bases, IRT, worker/employer contributions, deductions, net and cost. Partial totals are clearly identified when selected employees have blocking issues; processing and report export remain disabled.
6. Preview the monthly statement or export numeric, formatted Excel cells and PDF. Totals and exports use all selected employees, regardless of the visible search filter.
7. **Processar mês** creates the existing draft payroll run from the checked inputs. A changed source fingerprint requires a new check. A database revision trigger rejects monthly edits that race with final insertion and rolls back creation atomically.
8. Continue through the existing role-separated validation, approval, close, payslip and payment workflows from **Histórico e aprovações**. No payment is executed by preparing the sheet or generating a draft.

## Data and locking

`payroll_month_inputs` stores tenant, employee, period, currency, included flag, monthly JSON, revision and actor/time. Values never automatically roll into the next month. Overrides refer only to active components assigned to that employee. Processed months reject further edits; cancelling an eligible draft through the existing governed cancellation workflow allows preparing a replacement while preserving original run evidence.

Saved sheets read immutable calculation snapshots rather than recomputing them with today's profile/components. Tenant-wide history combines all organization runs in the selected month/currency; local scope returns only its employees. Mixed calculation regimes are identified explicitly. Source loading uses bounded bulk queries rather than queries per employee.

## Calculation scope

No new tax formulas were introduced here. The existing explicit Angola 2026 / standard full-month rules and generic mode remain in effect, including blocks on unsupported partial months, personal/special regimes and unresolved retroactives. This grid is a monthly management workflow with original UI and code; it does not copy PRIMAVERA software, logos, assets or proprietary file formats.

## Verification

Calculation/API tests cover preview without writes, preview-to-persisted reconciliation, monthly-only bonuses, recurring replacements/zero overrides, allowance aggregation, selection, missing prerequisites, optimistic concurrency/audit, stale source fingerprints, locked history, SQL race rollback, scope isolation, and combined company history. Workbook round-trip tests verify selected rows, numeric gross/net/cost values, formats and totals.
