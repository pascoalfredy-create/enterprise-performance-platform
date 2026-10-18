# Employee file as payroll source

The employee file reads the existing employee, contract, salary-profile, payroll-component, monthly-input and run tables. It creates no duplicate salary register. It is available through the payroll-gated HR navigation, the administration employee directory (for payroll-enabled users), and each monthly worksheet row.

Permanent salary revisions reuse the effective-dated salary-profile API, retaining the financial dimension and prior profile history. Recurring components are created with an explicit compatible tax treatment in the same transaction as the assignment; activation/deactivation reuses the audited API. Recurring component changes apply to unprocessed months (component effective dating is not introduced here). Closed payroll evidence remains unchanged.

Period-only variables are visible in the employee history with revision, author, date and notes. They never become recurring conditions. Commission, overtime, night work, shift allowance and other taxable earnings supplement the existing monthly drivers. Overtime/night work accept either a total amount or hours and an explicit hourly amount, including any applicable premium. Quantities have hundredth-hour precision. Multiplication uses integer money and half-up rounding. A conflicting entered total is rejected. No statutory overtime tariff or absence proration is inferred; existing unsupported-case blocks remain.

GET `/api/payroll?employeeFile=<id>` is governed by the existing PAYROLL access checks and additionally enforces tenant and organization scope. History sections show the latest 36 records each. Monthly calculations and processed evidence remain authoritative, including quantity/rate and notes in run snapshots.

## Product references

Independent UI and implementation, informed by these public product descriptions:

- PRIMAVERA / Cegid: monthly remuneration, deductions, hours and absences; amount/quantity depending on component configuration: https://helpcenter.ila.cegid.com/wp-content/uploads/ManualNovidades_PublicSector_3.pdf
- Factorial: permanent/variable compensation, frequency and effective conditions in the employee contract: https://help.factorialhr.com/pt_BR/remuneracoes/como-gerenciar-compensacoes
- Sólides: employee master includes position, contract, currency and working shift: https://ajuda.solides.com.br/hc/pt-br/articles/4412076729357-Como-realizar-o-cadastro-completo-dos-colaboradores-atrav%C3%A9s-da-planilha

These references do not define local tax or labor law. Existing Angola tax engine rules are unchanged.

## Validation

Runtime SQLite tests execute the actual payroll API and every formal migration. They verify employee-file source reconciliation, tenant/organization isolation, atomic component incidence creation, salary revision history, monthly quantity evidence, next-month non-recurrence and unchanged processed snapshots. Unit tests exercise decimal rounding, conflicting totals, unsupported keys and unsafe numeric inputs. Existing payroll/export and platform tests remain required.
