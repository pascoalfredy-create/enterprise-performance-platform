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
    "Não foi possível processar as tarefas de colaboradores.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};

export async function employeeTasksApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    const tenant = security.tenantId,
      scope = security.organizationId;
    if (request.method === "GET") {
      const tasks = await db
        .prepare(
          "SELECT t.*,e.first_name||' '||e.last_name employee_name,e.employee_number FROM employee_tasks t JOIN employees e ON e.id=t.employee_id AND e.tenant_id=t.tenant_id WHERE t.tenant_id=? AND (? IS NULL OR e.organization_id=?) ORDER BY CASE t.status WHEN 'Pendente' THEN 1 WHEN 'Em curso' THEN 2 ELSE 3 END,t.due_date",
        )
        .bind(tenant, scope, scope)
        .all();
      return Response.json({ tasks: tasks.results });
    }
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const body = (await request.json()) as Record<string, string>,
      now = new Date().toISOString();
    if (body.type === "assignTask") {
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
      if (
        !body.title?.trim() ||
        !["Baixa", "Normal", "Alta", "Crítica"].includes(body.priority)
      )
        return Response.json(
          { error: "Título e prioridade válida são obrigatórios." },
          { status: 400 },
        );
      if (body.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate))
        return Response.json(
          { error: "Data de entrega inválida." },
          { status: 400 },
        );
      const id = uid();
      await db
        .prepare(
          "INSERT INTO employee_tasks (id,tenant_id,employee_id,title,description,deliverable,priority,due_date,status,assigned_by,assigned_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          tenant,
          body.employeeId,
          body.title.trim(),
          body.description?.trim() || null,
          body.deliverable?.trim() || null,
          body.priority,
          body.dueDate || null,
          "Pendente",
          security.email,
          now,
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
          "employeeTask",
          id,
          security.email,
          `Tarefa atribuída: ${body.title.trim()}`,
        )
        .run();
      return Response.json({ id, status: "Pendente" }, { status: 201 });
    }
    if (body.type === "cancelTask") {
      const result = await db
        .prepare(
          "UPDATE employee_tasks SET status='Cancelada',updated_at=? WHERE id=? AND tenant_id=? AND status IN ('Pendente','Em curso') AND EXISTS (SELECT 1 FROM employees e WHERE e.id=employee_tasks.employee_id AND e.tenant_id=employee_tasks.tenant_id AND (? IS NULL OR e.organization_id=?))",
        )
        .bind(now, body.taskId, tenant, scope, scope)
        .run();
      if (!Number(result.meta.changes || 0))
        return Response.json(
          { error: "A tarefa não está disponível para cancelamento neste âmbito." },
          { status: 409 },
        );
      await db
        .prepare(
          "INSERT INTO audit_events (id,tenant_id,created_at,action,entity_type,entity_id,actor,summary) VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(
          uid(),
          tenant,
          now,
          "CANCEL",
          "employeeTask",
          body.taskId,
          security.email,
          "Tarefa cancelada",
        )
        .run();
      return Response.json({ id: body.taskId, status: "Cancelada" });
    }
    return Response.json({ error: "Operação não suportada." }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}
