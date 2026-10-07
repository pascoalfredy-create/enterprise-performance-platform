import { classifyDataError } from "../lib/api-error";
type Security = {
  tenantId: string;
  organizationId: string | null;
  email: string;
  role: string;
};
const fail = (error: unknown) => {
  const x = classifyDataError(
    error,
    "Não foi possível processar os dados de RH.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};

export async function hrCockpitApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    if (request.method !== "GET")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const tenant = security.tenantId,
      scope = security.organizationId,
      today = new Date().toISOString().slice(0, 10);
    const [
      activeEmployees,
      anyEmployees,
      latestPayroll,
      vacancies,
      pendingAbsence,
      onLeaveToday,
    ] = await Promise.all([
      db
        .prepare(
          "SELECT COUNT(*) n FROM employees WHERE tenant_id=? AND status='Ativo' AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ n: number }>(),
      db
        .prepare("SELECT 1 FROM employees WHERE tenant_id=? LIMIT 1")
        .bind(tenant)
        .first(),
      db
        .prepare(
          "SELECT period,currency,employee_count,gross_minor,net_minor,employer_minor FROM payroll_runs WHERE tenant_id=? AND status='Fechado' ORDER BY period DESC LIMIT 1",
        )
        .bind(tenant)
        .first<{
          period: string;
          currency: string;
          employee_count: number;
          gross_minor: number;
          net_minor: number;
          employer_minor: number;
        }>(),
      db
        .prepare(
          "SELECT COUNT(*) requisitions,COALESCE(SUM(positions),0) positions FROM recruitment_requisitions WHERE tenant_id=? AND status='Aberta' AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ requisitions: number; positions: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) n FROM hcm_absence_requests r JOIN employees e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.status='Pendente' AND (? IS NULL OR e.organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) n FROM hcm_absence_requests r JOIN employees e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.status='Aprovado' AND r.start_date<=? AND r.end_date>=? AND (? IS NULL OR e.organization_id=?)",
        )
        .bind(tenant, today, today, scope, scope)
        .first<{ n: number }>(),
    ]);
    return Response.json({
      hasData: Boolean(anyEmployees),
      activeEmployees: activeEmployees?.n ?? 0,
      openVacancies: {
        requisitions: vacancies?.requisitions ?? 0,
        positions: vacancies?.positions ?? 0,
      },
      pendingAbsenceRequests: pendingAbsence?.n ?? 0,
      onLeaveToday: onLeaveToday?.n ?? 0,
      payroll: latestPayroll
        ? {
            period: latestPayroll.period,
            currency: latestPayroll.currency,
            employeeCount: latestPayroll.employee_count,
            grossMinor: latestPayroll.gross_minor,
            netMinor: latestPayroll.net_minor,
            employerMinor: latestPayroll.employer_minor,
          }
        : null,
    });
  } catch (error) {
    return fail(error);
  }
}
