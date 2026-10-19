import type { D1Database } from "../worker-configuration";
import { employeeTierByCode } from "../lib/commercial-catalog";

// A tenant on a tier may not add an employee past its ceiling — it must
// upgrade first. Returns the error message to surface, or null when the
// tenant has room (or carries no commercial subscription record at all,
// e.g. an internal/demo tenant, which is never blocked here).
export async function employeeCapacityError(
  db: D1Database,
  tenantId: string,
): Promise<string | null> {
  const sub = await db
    .prepare(
      "SELECT employee_tier FROM subscriptions WHERE tenant_id=? AND status='Ativa'",
    )
    .bind(tenantId)
    .first<{ employee_tier: string }>();
  if (!sub) return null;
  const tier = employeeTierByCode(sub.employee_tier);
  if (!tier || tier.maxEmployees === null) return null;
  const count = await db
    .prepare(
      "SELECT COUNT(*) n FROM employees WHERE tenant_id=? AND status IN ('Pendente','Ativo')",
    )
    .bind(tenantId)
    .first<{ n: number }>();
  if ((count?.n || 0) >= tier.maxEmployees)
    return `O plano atual (${tier.label}) está no limite de colaboradores. Mude de escalão para adicionar mais.`;
  return null;
}

// Projects are distinct financial_models.name values: re-versioning an
// existing project (a new version under the same name) never counts
// against the cap, only a genuinely new project name does. Returns the
// error message to surface, or null when the tenant has room (or carries
// no commercial subscription record at all).
export async function financialModelProjectCapacityError(
  db: D1Database,
  tenantId: string,
): Promise<string | null> {
  const sub = await db
    .prepare(
      "SELECT employee_tier,extra_financial_model_projects FROM subscriptions WHERE tenant_id=? AND status='Ativa'",
    )
    .bind(tenantId)
    .first<{ employee_tier: string; extra_financial_model_projects: number }>();
  if (!sub) return null;
  const tier = employeeTierByCode(sub.employee_tier);
  if (!tier) return null;
  const limit = tier.includedFinancialModelProjects + (sub.extra_financial_model_projects || 0);
  const count = await db
    .prepare("SELECT COUNT(DISTINCT name) n FROM financial_models WHERE tenant_id=?")
    .bind(tenantId)
    .first<{ n: number }>();
  if ((count?.n || 0) >= limit)
    return `Limite de projetos de Modelagem Financeira atingido (${limit}). Compre um projeto extra ou mude de escalão.`;
  return null;
}
