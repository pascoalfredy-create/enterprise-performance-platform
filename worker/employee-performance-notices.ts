import { classifyDataError } from "../lib/api-error";
type Security = {
  tenantId: string;
  organizationId: string | null;
  email: string;
};
const uid = () => crypto.randomUUID();
const fail = (error: unknown) => {
  const x = classifyDataError(
    error,
    "Não foi possível processar os resultados de avaliação de desempenho.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};
const RATINGS = [
  "Abaixo do esperado",
  "Dentro do esperado",
  "Acima do esperado",
  "Excecional",
];

export async function employeePerformanceNoticesApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    const tenant = security.tenantId,
      scope = security.organizationId;
    if (request.method === "GET") {
      const notices = await db
        .prepare(
          "SELECT n.*,e.first_name||' '||e.last_name employee_name,e.employee_number FROM employee_performance_notices n JOIN employees e ON e.id=n.employee_id AND e.tenant_id=n.tenant_id WHERE n.tenant_id=? AND (? IS NULL OR e.organization_id=?) ORDER BY n.published_at DESC",
        )
        .bind(tenant, scope, scope)
        .all();
      return Response.json({ notices: notices.results });
    }
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const body = (await request.json()) as Record<string, string>,
      now = new Date().toISOString();
    if (body.type !== "publishResult")
      return Response.json({ error: "Operação não suportada." }, { status: 400 });
    const employee = await db
      .prepare(
        "SELECT id FROM employees WHERE id=? AND tenant_id=? AND (? IS NULL OR organization_id=?) AND status<>'Inativo'",
      )
      .bind(body.employeeId, tenant, scope, scope)
      .first();
    if (!employee)
      return Response.json(
        { error: "Colaborador fora do âmbito autorizado." },
        { status: 403 },
      );
    if (!body.cycleName?.trim() || !RATINGS.includes(body.overallRating))
      return Response.json(
        { error: "Ciclo e classificação válida são obrigatórios." },
        { status: 400 },
      );
    if (!body.summary?.trim() || body.summary.trim().length < 3)
      return Response.json(
        { error: "O resumo do resultado é obrigatório." },
        { status: 400 },
      );
    let scoreBps: number | null = null;
    if (body.scoreBps !== undefined && body.scoreBps !== null && body.scoreBps !== "") {
      const n = Number(body.scoreBps);
      if (!Number.isInteger(n) || n < 0 || n > 10000)
        return Response.json(
          { error: "A pontuação deve estar entre 0 e 10000." },
          { status: 400 },
        );
      scoreBps = n;
    }
    const id = uid();
    await db
      .prepare(
        "INSERT INTO employee_performance_notices (id,tenant_id,employee_id,cycle_name,overall_rating,score_bps,summary,strengths,development_areas,status,published_by,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        tenant,
        body.employeeId,
        body.cycleName.trim(),
        body.overallRating,
        scoreBps,
        body.summary.trim(),
        body.strengths?.trim() || null,
        body.developmentAreas?.trim() || null,
        "Publicado",
        security.email,
        now,
      )
      .run();
    await db
      .prepare(
        "INSERT INTO audit_events (id,tenant_id,created_at,action,entity_type,entity_id,actor,summary) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(
        uid(),
        tenant,
        now,
        "CREATE",
        "employeePerformanceNotice",
        id,
        security.email,
        `Resultado de avaliação publicado: ${body.cycleName.trim()}`,
      )
      .run();
    return Response.json({ id, status: "Publicado" }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
