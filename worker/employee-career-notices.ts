import type {D1Database} from "../worker-configuration";
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
    "Não foi possível processar as notificações de carreira.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};
const TYPES = ["Promoção", "Aumento Salarial", "Promoção e Aumento Salarial"];

export async function employeeCareerNoticesApi(
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
          "SELECT n.*,e.first_name||' '||e.last_name employee_name,e.employee_number FROM employee_career_notices n JOIN employees e ON e.id=n.employee_id AND e.tenant_id=n.tenant_id WHERE n.tenant_id=? AND (? IS NULL OR e.organization_id=?) ORDER BY n.published_at DESC",
        )
        .bind(tenant, scope, scope)
        .all();
      return Response.json({ notices: notices.results });
    }
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const body = (await request.json()) as Record<string, string>,
      now = new Date().toISOString();
    if (body.type !== "publishNotice")
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
    if (!TYPES.includes(body.noticeType))
      return Response.json(
        { error: "Tipo de notificação inválido." },
        { status: 400 },
      );
    if (!body.title?.trim() || !body.message?.trim() || body.message.trim().length < 3)
      return Response.json(
        { error: "Título e mensagem são obrigatórios." },
        { status: 400 },
      );
    const parseSalary = (value: string | undefined) => {
      if (value === undefined || value === null || value === "") return null;
      const n = Number(value);
      return Number.isInteger(n) && n >= 0 ? n : NaN;
    };
    const previousSalaryMinor = parseSalary(body.previousSalaryMinor);
    const newSalaryMinor = parseSalary(body.newSalaryMinor);
    if (Number.isNaN(previousSalaryMinor))
      return Response.json(
        { error: "Salário anterior inválido." },
        { status: 400 },
      );
    if (Number.isNaN(newSalaryMinor))
      return Response.json({ error: "Novo salário inválido." }, { status: 400 });
    if ((previousSalaryMinor !== null || newSalaryMinor !== null) && !body.currency?.trim())
      return Response.json(
        { error: "A moeda é obrigatória quando há valores salariais." },
        { status: 400 },
      );
    if (body.effectiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.effectiveDate))
      return Response.json(
        { error: "Data de efeito inválida." },
        { status: 400 },
      );
    const id = uid();
    await db
      .prepare(
        "INSERT INTO employee_career_notices (id,tenant_id,employee_id,notice_type,title,message,previous_job_title,new_job_title,previous_salary_minor,new_salary_minor,currency,effective_date,status,published_by,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        tenant,
        body.employeeId,
        body.noticeType,
        body.title.trim(),
        body.message.trim(),
        body.previousJobTitle?.trim() || null,
        body.newJobTitle?.trim() || null,
        previousSalaryMinor,
        newSalaryMinor,
        body.currency?.trim() || null,
        body.effectiveDate || null,
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
        "employeeCareerNotice",
        id,
        security.email,
        `Notificação de carreira publicada: ${body.title.trim()}`,
      )
      .run();
    return Response.json({ id, status: "Publicado" }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
