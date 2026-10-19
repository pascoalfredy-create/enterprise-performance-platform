export const CATALOG_VERSION = "AO-2026-02";
export const ANNUAL_MONTHS_CHARGED = 10;

export type BillingInterval = "monthly" | "annual";
// A single commercial code is kept (instead of introducing a new one) so the
// existing subscriptions.bundle_code CHECK constraint, and every historical
// checkout/subscription row created under the old multi-bundle catalog,
// never need to change: "ENTERPRISE" already meant "every module included",
// which is exactly what the single package is now.
export type BundleCode = "ENTERPRISE";

export type Bundle = {
  code: BundleCode;
  name: string;
  description: string;
  capabilities: string[];
};

export const bundles: Bundle[] = [
  {
    code: "ENTERPRISE",
    name: "Yela Performance Enterprise",
    description: "Pacote único com todos os módulos — finanças, pessoas, planeamento e performance partilham os mesmos dados, por isso não há sentido em vendê-los em separado.",
    capabilities: [
      "Todos os módulos incluídos",
      "Finance & FP&A + HCM & Payroll",
      "Workforce Planning + Performance Management",
      "Analytics, Workflow e Integration Hub",
    ],
  },
];

// The business sells by company size, not by per-seat add-ons: a tenant on a
// tier may not add an employee past its ceiling — it must move to the next
// tier first (enforced where employees are created, not just priced here).
export type EmployeeTierCode = "T1" | "T2" | "T3" | "T4";

export type EmployeeTier = {
  code: EmployeeTierCode;
  label: string;
  minEmployees: number;
  maxEmployees: number | null; // null = sem limite superior
  monthlyMinor: number;
  includedFinancialModelProjects: number;
};

export const employeeTiers: EmployeeTier[] = [
  { code: "T1", label: "1 a 50 colaboradores", minEmployees: 1, maxEmployees: 50, monthlyMinor: 15_000_000, includedFinancialModelProjects: 1 },
  { code: "T2", label: "51 a 100 colaboradores", minEmployees: 51, maxEmployees: 100, monthlyMinor: 25_000_000, includedFinancialModelProjects: 2 },
  { code: "T3", label: "101 a 200 colaboradores", minEmployees: 101, maxEmployees: 200, monthlyMinor: 40_000_000, includedFinancialModelProjects: 4 },
  { code: "T4", label: "201 ou mais colaboradores", minEmployees: 201, maxEmployees: null, monthlyMinor: 60_000_000, includedFinancialModelProjects: 4 },
];

export function employeeTierByCode(code: string): EmployeeTier | undefined {
  return employeeTiers.find((t) => t.code === code);
}

// The tier a given headcount falls into. A count above every ceiling lands
// on the last (uncapped) tier.
export function tierForEmployeeCount(employeeCount: number): EmployeeTier {
  return (
    employeeTiers.find(
      (t) => employeeCount >= t.minEmployees && (t.maxEmployees === null || employeeCount <= t.maxEmployees),
    ) || employeeTiers[employeeTiers.length - 1]
  );
}

export const EXTRA_FINANCIAL_MODEL_PROJECT_MONTHLY_MINOR = 50_000_000;

export function subscriptionTotal(input: {
  tier: EmployeeTier;
  interval: BillingInterval;
  extraFinancialModelProjects: number;
}) {
  const monthly =
    input.tier.monthlyMinor +
    Math.max(0, Math.trunc(input.extraFinancialModelProjects)) * EXTRA_FINANCIAL_MODEL_PROJECT_MONTHLY_MINOR;
  return {
    monthlyMinor: monthly,
    totalMinor: input.interval === "annual" ? monthly * ANNUAL_MONTHS_CHARGED : monthly,
  };
}

export function formatAOA(minor: number) {
  return new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(minor / 100);
}
