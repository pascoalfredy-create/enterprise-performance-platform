import type { D1Database } from "../worker-configuration";
export async function financialScope(request: Request, db: D1Database, security: { tenantId: string; organizationId: string | null }) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("organizationId");
  if (requested && security.organizationId && requested !== security.organizationId) throw new Error("organization outside tenant scope");
  const scope = security.organizationId || requested || null;
  if (scope && !await db.prepare("SELECT id FROM organizations WHERE id=? AND tenant_id=?").bind(scope, security.tenantId).first()) throw new Error("organization outside tenant scope");
  const period = url.searchParams.get("period");
  const currency = (url.searchParams.get("currency") || "AOA").toUpperCase();
  if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("invalid financial period");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("invalid financial currency");
  return { scope, currency, period };
}
