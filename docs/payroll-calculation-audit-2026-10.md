# Payroll calculation audit — 18 October 2026

## Findings and corrections

The former generic engine applied every percentage to base salary. It did not have statutory taxable/contributory bases, a versioned tax table, or a visible calculation breakdown. Fixed/percentage components remain available as explicitly **parametrized processing**, without implying automatic legal compliance.

A separate deterministic calculation module now supports explicit **Angola / Group A / 2026**, in AOA, for the standard non-retired regime and a full monthly salary. It computes worker/employer INSS, IRT taxable income, fixed-plus-excess IRT, deductions, net salary and total employer cost. No existing run is recalculated.

Component incidence must be reviewed before automatic processing. The engine differentiates standard earnings, meal and transport allowances (each limit aggregated across components), holiday allowance, other deductions and other employer costs. Manual taxes/contributions cannot be added to the automatic regime. Loan repayments affect net salary after tax. Retroactive adjustments are kept in the generic workflow until source-period fiscal reconciliation exists.

Existing archived salary profiles are considered by their effective dates. Overlapping eligible profiles/contracts are rejected rather than paying salary multiple times. Automatic mode rejects partial salary/contract months, contracts explicitly assigned to another country, approved unpaid absences and unsupported currency/year. Inputs, rule version, detailed components, bases and result are stored with the existing calculation hash and included in issued payslips. Previous snapshots and closed-run immutability remain unchanged.

Users can select **Ver cálculo** before validation/approval and read the same evidence in the payslip/PDF. Creating a processing navigates to Processamentos. Network failures release the save button and display an error.

## Source register

- Lei 14/25, Art. 21 and Annex I (2026): https://www.angolex.com/paginas/leis/lei-que-aprova-o-orcamento-geral-do-estado-para-o-exercicio-economico-de-2026a-14a-25a.html
- Lei 18/14, Art. 7 (deduction of mandatory employee contributions and non-taxable remuneration): https://lex.ao/docs/assembleia-nacional/2014/lei-n-o-18-14-de-22-de-outubro/
- Lei 28/20, amended Art. 2 (allowance treatment): https://lex.ao/docs/assembleia-nacional/2020/lei-n-o-28-20-de-22-de-julho/
- DP 227/18, Arts. 12–13 (general INSS rates and contribution exclusions): https://lex.ao/docs/presidente-da-republica/2018/decreto-presidencial-n-o-227-18-de-27-de-setembro/
- Official INSS publication located, retrieval unavailable during review: https://portal.inss.gov.ao/wp-content/uploads/2021/10/227_18.pdf

The MINFIN OGE PDF initially located was a legislative proposal, not a promulgated law, and was not used as authority. Published fixed amounts are used literally, including discontinuities at the lower bracket transitions; the engine does not smooth the table.

## Verification

Independent boundary vectors and scenarios cover exemption thresholds, high income, cent rounding, aggregation of duplicated allowance natures, holiday vs Christmas, loan repayments, employer extras, negative/unsafe inputs, manual-tax conflicts, unsupported validity, and reconciliation over a deterministic salary range.

API integration tests execute the actual payroll functions against SQLite with all formal migrations. They cover calculation persistence, payslip evidence/immutability, incidence review/audit, organization isolation, overlapping salary profiles, historic effective profiles, applicability and idempotency. Framework auth is outside this harness; the existing authorization suite remains required.

## Remaining HR work

This is not a claim that all national payroll cases are automated. Remaining work includes attendance-driven salary proration, overtime/night/weekend rules, unpaid absence valuation, retirees and special regimes/personal exemptions, benefits in kind, termination settlements, fiscal reconciliation of retroactives, per-company default rules, and further country packs. They must receive their own versioned formulas, effective dates and tests. The automatic mode requires explicit confirmation that the run is within its supported scope.

No production employee payroll was created, approved, paid or altered during this audit. Live authenticated visual QA remains separate from automated code/API checks.
