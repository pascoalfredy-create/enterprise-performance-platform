import { classifyDataError } from "../lib/api-error";
type Security = {
  tenantId: string;
  organizationId: string | null;
  email: string;
  role: string;
};
const uid = () => crypto.randomUUID();
const sha = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const fail = (error: unknown) => {
  const x = classifyDataError(
    error,
    "Não foi possível processar o plano de headcount.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};
export async function workforcePlansApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    const tenant = security.tenantId,
      scope = security.organizationId,
      url = new URL(request.url),
      selected = url.searchParams.get("plan") || "",
      now = new Date().toISOString();
    const snapshot = async () => {
      const [plans, lines, organizations, actual] = await Promise.all([
        db
          .prepare(
            "SELECT p.*,o.name organization_name,(SELECT COALESCE(SUM(l.headcount),0) FROM workforce_plan_lines l WHERE l.tenant_id=p.tenant_id AND l.plan_id=p.id) planned_headcount,(SELECT COALESCE(SUM(l.headcount*l.monthly_cost_minor),0) FROM workforce_plan_lines l WHERE l.tenant_id=p.tenant_id AND l.plan_id=p.id) planned_monthly_cost_minor,(SELECT COUNT(*) FROM workforce_plan_lines l WHERE l.tenant_id=p.tenant_id AND l.plan_id=p.id) line_count FROM workforce_plans p JOIN organizations o ON o.id=p.organization_id AND o.tenant_id=p.tenant_id WHERE p.tenant_id=? AND (? IS NULL OR p.organization_id=?) ORDER BY p.created_at DESC",
          )
          .bind(tenant, scope, scope)
          .all(),
        selected
          ? db
              .prepare(
                "SELECT * FROM workforce_plan_lines WHERE tenant_id=? AND plan_id=? ORDER BY period,job_title",
              )
              .bind(tenant, selected)
              .all()
          : Promise.resolve({ results: [] }),
        db
          .prepare(
            "SELECT id,code,name,currency FROM organizations WHERE tenant_id=? AND (? IS NULL OR id=?) AND status='Ativa' ORDER BY name",
          )
          .bind(tenant, scope, scope)
          .all(),
        db
          .prepare(
            "SELECT COUNT(*) actual_headcount,COALESCE(SUM(COALESCE(s.base_salary_minor,0)),0) actual_monthly_base_minor FROM employees e LEFT JOIN salary_profiles s ON s.employee_id=e.id AND s.tenant_id=e.tenant_id AND s.status='Ativo' WHERE e.tenant_id=? AND e.status='Ativo' AND (? IS NULL OR e.organization_id=?)",
          )
          .bind(tenant, scope, scope)
          .first(),
      ]);
      return {
        plans: plans.results,
        lines: lines.results,
        organizations: organizations.results,
        actual,
      };
    };
    if (request.method === "GET") return Response.json(await snapshot());
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const body = (await request.json()) as Record<string, string>;
    let entityId = body.planId || "";
    if (body.type === "createPlan") {
      const org = scope || body.organizationId,
        currency = body.currency?.trim().toUpperCase();
      if (
        !org ||
        !body.name?.trim() ||
        !/^[A-Z]{3}$/.test(currency || "") ||
        !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(body.startPeriod || "") ||
        !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(body.endPeriod || "") ||
        body.startPeriod > body.endPeriod
      )
        return Response.json(
          {
            error:
              "Organização, nome, moeda e horizonte válidos são obrigatórios.",
          },
          { status: 400 },
        );
      const previous = await db
        .prepare(
          "SELECT COALESCE(MAX(version_number),0) n FROM workforce_plans WHERE tenant_id=? AND organization_id=? AND name=?",
        )
        .bind(tenant, org, body.name.trim())
        .first<Record<string, unknown>>();
      entityId = uid();
      await db
        .prepare(
          "INSERT INTO workforce_plans (id,tenant_id,organization_id,name,currency,start_period,end_period,version_number,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?, 'Rascunho',?,?)",
        )
        .bind(
          entityId,
          tenant,
          org,
          body.name.trim(),
          currency,
          body.startPeriod,
          body.endPeriod,
          Number(previous?.n || 0) + 1,
          security.email,
          now,
        )
        .run();
    } else if (body.type === "addPlanLine") {
      const headcount = Number(body.headcount),
        cost = Math.round(Number(body.monthlyCost) * 100);
      if (
        !body.planId ||
        !body.jobTitle?.trim() ||
        !/^[0-9]{4}-[0-9]{2}$/.test(body.period || "") ||
        !Number.isInteger(headcount) ||
        headcount < 0 ||
        !Number.isSafeInteger(cost) ||
        cost < 0 ||
        !["Base", "Nova contratação", "Substituição", "Redução"].includes(
          body.movementType,
        ) ||
        !body.assumptionNote?.trim() ||
        body.assumptionNote.trim().length < 5
      )
        return Response.json(
          {
            error:
              "Função, período, headcount, custo, movimento e pressuposto válidos são obrigatórios.",
          },
          { status: 400 },
        );
      await db
        .prepare(
          "INSERT INTO workforce_plan_lines VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          uid(),
          tenant,
          body.planId,
          body.jobTitle.trim(),
          body.departmentCode?.trim() || null,
          body.period,
          headcount,
          cost,
          body.movementType,
          body.assumptionNote.trim(),
          security.email,
          now,
        )
        .run();
      entityId = body.planId;
    } else if (body.type === "submitPlan") {
      await db
        .prepare(
          "UPDATE workforce_plans SET status='Submetido',submitted_by=?,submitted_at=? WHERE id=? AND tenant_id=? AND status='Rascunho'",
        )
        .bind(security.email, now, body.planId, tenant)
        .run();
    } else if (body.type === "approvePlan") {
      const plan = await db
        .prepare(
          "SELECT * FROM workforce_plans WHERE id=? AND tenant_id=? AND status='Submetido' AND (? IS NULL OR organization_id=?)",
        )
        .bind(body.planId, tenant, scope, scope)
        .first<Record<string, unknown>>();
      if (!plan)
        return Response.json(
          { error: "Plano submetido não encontrado." },
          { status: 404 },
        );
      if (
        String(plan.created_by).toLowerCase() ===
          security.email.toLowerCase() ||
        String(plan.submitted_by).toLowerCase() === security.email.toLowerCase()
      )
        return Response.json(
          {
            error:
              "Maker-checker: o aprovador deve ser independente do criador e submissor.",
          },
          { status: 403 },
        );
      const lines = await db
        .prepare(
          "SELECT * FROM workforce_plan_lines WHERE tenant_id=? AND plan_id=? ORDER BY period,job_title",
        )
        .bind(tenant, body.planId)
        .all();
      const hash = await sha(JSON.stringify({ plan, lines: lines.results }));
      await db
        .prepare(
          "UPDATE workforce_plans SET status='Aprovado',approved_by=?,approved_at=?,approval_hash=? WHERE id=? AND tenant_id=? AND status='Submetido'",
        )
        .bind(security.email, now, hash, body.planId, tenant)
        .run();
    } else
      return Response.json(
        { error: "Operação de headcount não suportada." },
        { status: 400 },
      );
    await db
      .prepare(
        "INSERT INTO audit_events (id,tenant_id,created_at,action,entity_type,entity_id,actor,summary) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(
        uid(),
        tenant,
        now,
        body.type,
        "workforcePlan",
        entityId,
        security.email,
        `Headcount planning: ${body.type}`,
      )
      .run();
    return workforcePlansApi(
      new Request(`${url.origin}${url.pathname}?plan=${entityId}`, {
        method: "GET",
        headers: request.headers,
      }),
      db,
      security,
    );
  } catch (error) {
    return fail(error);
  }
}
