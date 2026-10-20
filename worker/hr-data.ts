import {peopleHealthApi} from './people-health';
import type {D1Database} from "../worker-configuration";
import { classifyDataError } from "../lib/api-error";
import { PERSONNEL_COST_LINE_CODES_SUBQUERY } from "./financial-line-catalog";
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
  if(new URL(request.url).searchParams.get("resource")==="health")return peopleHealthApi(request,db,security);
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
          "SELECT r.period,r.currency,COUNT(DISTINCT l.employee_id) employee_count,SUM(l.gross_minor) gross_minor,SUM(l.net_minor) net_minor,SUM(l.employer_minor) employer_minor FROM payroll_runs r JOIN payroll_run_lines l ON l.run_id=r.id AND l.tenant_id=r.tenant_id JOIN employees e ON e.id=l.employee_id AND e.tenant_id=l.tenant_id WHERE r.tenant_id=? AND r.status='Fechado' AND (? IS NULL OR e.organization_id=?) GROUP BY r.period,r.currency ORDER BY r.period DESC,r.currency LIMIT 1",
        )
        .bind(tenant,scope,scope)
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

export async function hrPeopleApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    if (request.method !== "GET")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const tenant = security.tenantId,
      scope = security.organizationId,
      today = new Date().toISOString().slice(0, 10),
      soon = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    const [
      anyEmployees,
      candidates,
      hired,
      active,
      endingSoon,
      latestTimesheets,
      onLeaveToday,
      pendingRequests,
      sickLeave,
      avgBalance,
      pendingDocuments,
    ] = await Promise.all([
      db
        .prepare("SELECT 1 FROM employees WHERE tenant_id=? LIMIT 1")
        .bind(tenant)
        .first(),
      db
        .prepare("SELECT COUNT(*) n FROM recruitment_candidates WHERE tenant_id=?")
        .bind(tenant)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) n FROM recruitment_applications WHERE tenant_id=? AND status='Contratada'",
        )
        .bind(tenant)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) n FROM employees WHERE tenant_id=? AND status='Ativo' AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) n FROM employee_contracts c JOIN employees e ON e.id=c.employee_id AND e.tenant_id=c.tenant_id WHERE c.tenant_id=? AND c.status='Ativo' AND c.end_date IS NOT NULL AND c.end_date>=? AND c.end_date<=? AND (? IS NULL OR e.organization_id=?)",
        )
        .bind(tenant, today, soon, scope, scope)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT MAX(period) period FROM attendance_timesheets WHERE tenant_id=?",
        )
        .bind(tenant)
        .first<{ period: string | null }>(),
      db
        .prepare(
          "SELECT COUNT(*) n FROM hcm_absence_requests r JOIN employees e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.status='Aprovado' AND r.start_date<=? AND r.end_date>=? AND (? IS NULL OR e.organization_id=?)",
        )
        .bind(tenant, today, today, scope, scope)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) n FROM hcm_absence_requests r JOIN employees e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.status='Pendente' AND (? IS NULL OR e.organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) n FROM hcm_absence_requests r JOIN employees e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id JOIN hcm_absence_types t ON t.id=r.absence_type_id AND t.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.status IN ('Aprovado','Pendente') AND (t.name LIKE '%édica%' OR t.name LIKE '%edica%' OR t.code LIKE '%MED%') AND (? IS NULL OR e.organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT AVG(b.allowance_minutes-b.used_minutes) avg_minutes FROM hcm_absence_balances b JOIN employees e ON e.id=b.employee_id AND e.tenant_id=b.tenant_id WHERE b.tenant_id=? AND (? IS NULL OR e.organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ avg_minutes: number | null }>(),
      db
        .prepare(
          "SELECT COUNT(*) n FROM employee_documents d JOIN employees e ON e.id=d.employee_id AND e.tenant_id=d.tenant_id WHERE d.tenant_id=? AND d.status='Pendente' AND (? IS NULL OR e.organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ n: number }>(),
    ]);
    let attendance: {
      period: string;
      approved: number;
      total: number;
      presenceRatePct: number | null;
      overtimeMinutes: number;
    } | null = null;
    if (latestTimesheets?.period) {
      const rows = await db
        .prepare(
          "SELECT COUNT(*) total,SUM(CASE WHEN t.status='Aprovado' THEN 1 ELSE 0 END) approved,SUM(t.worked_minutes) worked,SUM(t.scheduled_minutes) scheduled,SUM(t.overtime_minutes) overtime FROM attendance_timesheets t JOIN employees e ON e.id=t.employee_id AND e.tenant_id=t.tenant_id WHERE t.tenant_id=? AND t.period=? AND (? IS NULL OR e.organization_id=?)",
        )
        .bind(tenant, latestTimesheets.period, scope, scope)
        .first<{
          total: number;
          approved: number;
          worked: number;
          scheduled: number;
          overtime: number;
        }>();
      if (rows && rows.total > 0)
        attendance = {
          period: latestTimesheets.period,
          approved: rows.approved,
          total: rows.total,
          presenceRatePct:
            rows.scheduled > 0 ? (rows.worked / rows.scheduled) * 100 : null,
          overtimeMinutes: rows.overtime || 0,
        };
    }
    return Response.json({
      hasData: Boolean(anyEmployees),
      lifecycle: {
        candidates: candidates?.n ?? 0,
        hired: hired?.n ?? 0,
        active: active?.n ?? 0,
        contractsEndingSoon: endingSoon?.n ?? 0,
      },
      attendance,
      leave: {
        onLeaveToday: onLeaveToday?.n ?? 0,
        pendingRequests: pendingRequests?.n ?? 0,
        sickLeave: sickLeave?.n ?? 0,
        avgBalanceDays: avgBalance?.avg_minutes
          ? avgBalance.avg_minutes / 60 / 8
          : null,
      },
      documents: { pendingApproval: pendingDocuments?.n ?? 0 },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function hrPayrollCostApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    if (request.method !== "GET")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const tenant = security.tenantId,
      scope = security.organizationId;
    const latestPayroll = await db
      .prepare(
        "SELECT r.id,r.period,r.currency,COUNT(DISTINCT l.employee_id) employee_count,SUM(l.gross_minor) gross_minor,SUM(l.net_minor) net_minor,SUM(l.employer_minor) employer_minor FROM payroll_runs r JOIN payroll_run_lines l ON l.run_id=r.id AND l.tenant_id=r.tenant_id JOIN employees e ON e.id=l.employee_id AND e.tenant_id=l.tenant_id WHERE r.tenant_id=? AND r.status='Fechado' AND (? IS NULL OR e.organization_id=?) GROUP BY r.id ORDER BY r.period DESC,r.created_at DESC LIMIT 1",
      )
      .bind(tenant,scope,scope)
      .first<{
        id: string;
        period: string;
        currency: string;
        employee_count: number;
        gross_minor: number;
        net_minor: number;
        employer_minor: number;
      }>();
    if (!latestPayroll)
      return Response.json({
        hasData: false,
        payroll: null,
        reconciliation: null,
        workforceCost: null,
        costBreakdown: null,
        nextPeriodProjection: null,
      });
    const [reconciled, totalActive, approvedBudget, runComposition, currentBase] =
      await Promise.all([
        db
          .prepare(
            "SELECT COUNT(DISTINCT l.employee_id) n FROM payroll_run_lines l JOIN employees e ON e.id=l.employee_id AND e.tenant_id=l.tenant_id WHERE l.tenant_id=? AND l.run_id=? AND (? IS NULL OR e.organization_id=?)",
          )
          .bind(tenant, latestPayroll.id, scope, scope)
          .first<{ n: number }>(),
        db
          .prepare(
            "SELECT COUNT(*) n FROM employees WHERE tenant_id=? AND status='Ativo' AND (? IS NULL OR organization_id=?)",
          )
          .bind(tenant, scope, scope)
          .first<{ n: number }>(),
        db
          .prepare(
            "SELECT id FROM budget_versions WHERE tenant_id=? AND status='Aprovado' ORDER BY approved_at DESC LIMIT 1",
          )
          .bind(tenant)
          .first<{ id: string }>(),
        db
          .prepare(
            "SELECT COALESCE(SUM(l.base_minor),0) base,COALESCE(SUM(l.gross_minor),0) gross,COALESCE(SUM(l.employer_minor),0) employer FROM payroll_run_lines l JOIN employees e ON e.id=l.employee_id AND e.tenant_id=l.tenant_id WHERE l.tenant_id=? AND l.run_id=? AND (? IS NULL OR e.organization_id=?)",
          )
          .bind(tenant, latestPayroll.id, scope, scope)
          .first<{ base: number; gross: number; employer: number }>(),
        db
          .prepare(
            "SELECT COALESCE(SUM(sp.base_minor),0) base,COUNT(*) n FROM salary_profiles sp JOIN employees e ON e.id=sp.employee_id AND e.tenant_id=sp.tenant_id WHERE sp.tenant_id=? AND sp.status='Ativo' AND e.status='Ativo' AND (? IS NULL OR e.organization_id=?)",
          )
          .bind(tenant, scope, scope)
          .first<{ base: number; n: number }>(),
      ]);
    const [workforceActual, workforceBudget] = await Promise.all([
      db
        .prepare(
          "SELECT COALESCE(SUM(total_minor),0) total FROM workforce_cost_postings WHERE tenant_id=? AND period=? AND currency=? AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, latestPayroll.period, latestPayroll.currency, scope, scope)
        .first<{ total: number }>(),
      approvedBudget
        ? db
            .prepare(
              `SELECT COALESCE(SUM(amount_minor),0) total FROM performance_entries WHERE tenant_id=? AND scenario='Budget' AND version_id=? AND line_code IN ${PERSONNEL_COST_LINE_CODES_SUBQUERY} AND period=? AND currency=? AND (? IS NULL OR organization_id=?)`,
            )
            .bind(
              tenant,
              approvedBudget.id,
              tenant,
              tenant,
              scope,
              scope,
              latestPayroll.period,
              latestPayroll.currency,
              scope,
              scope,
            )
            .first<{ total: number }>()
        : Promise.resolve({ total: 0 }),
    ]);
    return Response.json({
      hasData: true,
      payroll: {
        period: latestPayroll.period,
        currency: latestPayroll.currency,
        grossMinor: latestPayroll.gross_minor,
        netMinor: latestPayroll.net_minor,
        employerMinor: latestPayroll.employer_minor,
      },
      reconciliation: {
        reconciled: reconciled?.n ?? 0,
        total: totalActive?.n ?? 0,
      },
      workforceCost: {
        hasBudget: Boolean(approvedBudget),
        actualMinor: workforceActual?.total ?? 0,
        budgetMinor: workforceBudget?.total ?? 0,
      },
      costBreakdown:
        runComposition && (reconciled?.n ?? 0) > 0
          ? {
              baseMinor: runComposition.base,
              otherEarningsMinor: Math.max(
                0,
                runComposition.gross - runComposition.base,
              ),
              employerMinor: runComposition.employer,
            }
          : null,
      nextPeriodProjection:
        currentBase && currentBase.n > 0 && runComposition
          ? {
              currentBaseMinor: currentBase.base,
              lastClosedBaseMinor: runComposition.base,
              deltaMinor: currentBase.base - runComposition.base,
              activeEmployeeCount: currentBase.n,
            }
          : null,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function hrTalentApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    if (request.method !== "GET")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const tenant = security.tenantId,
      scope = security.organizationId;
    const [reviews, devItems, competencies, openRequisitions] = await Promise.all([
      db
        .prepare(
          "SELECT final_score_bps FROM performance_reviews WHERE tenant_id=? AND status='Finalizada' AND final_score_bps IS NOT NULL AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .all<{ final_score_bps: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) total,SUM(CASE WHEN i.status='Aberta' THEN 1 ELSE 0 END) active,SUM(CASE WHEN i.status='Concluída' THEN 1 ELSE 0 END) concluded FROM performance_development_items i JOIN performance_reviews r ON r.id=i.review_id AND r.tenant_id=i.tenant_id WHERE i.tenant_id=? AND (? IS NULL OR r.organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ total: number; active: number; concluded: number }>(),
      db
        .prepare(
          "SELECT COUNT(DISTINCT f.competency_id) n FROM feedback_360_responses f JOIN feedback_360_rounds rnd ON rnd.id=f.round_id AND rnd.tenant_id=f.tenant_id JOIN performance_reviews r ON r.id=rnd.review_id AND r.tenant_id=rnd.tenant_id WHERE f.tenant_id=? AND (? IS NULL OR r.organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) n FROM recruitment_requisitions WHERE tenant_id=? AND status='Aberta' AND (? IS NULL OR organization_id=?)",
        )
        .bind(tenant, scope, scope)
        .first<{ n: number }>(),
    ]);
    const buckets = { exceptional: 0, above: 0, onTrack: 0, developing: 0, critical: 0 };
    for (const row of reviews.results) {
      const bps = row.final_score_bps;
      if (bps >= 9000) buckets.exceptional++;
      else if (bps >= 7500) buckets.above++;
      else if (bps >= 5500) buckets.onTrack++;
      else if (bps >= 3500) buckets.developing++;
      else buckets.critical++;
    }
    return Response.json({
      hasData: reviews.results.length > 0,
      ratingDistribution: buckets,
      totalReviews: reviews.results.length,
      developmentPlans: {
        hasData: (devItems?.total ?? 0) > 0,
        active: devItems?.active ?? 0,
        concluded: devItems?.concluded ?? 0,
      },
      competenciesAssessed: competencies?.n ?? 0,
      insights: {
        retentionRiskCount: buckets.critical + buckets.developing,
        successionGapCount: openRequisitions?.n ?? 0,
        developmentActiveCount: devItems?.active ?? 0,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
