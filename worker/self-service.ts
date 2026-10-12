import { classifyDataError } from "../lib/api-error";
type Security = {
  tenantId: string;
  email: string;
  employeeId: string | null;
};
const fail = (error: unknown) => {
  const x = classifyDataError(
    error,
    "Não foi possível processar o portal do colaborador.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};
const noEmployee = () =>
  Response.json(
    { error: "Esta conta não está associada a um colaborador." },
    { status: 403 },
  );

export async function selfServiceApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  if (!security.employeeId) return noEmployee();
  const tenant = security.tenantId,
    employeeId = security.employeeId;
  try {
    if (request.method === "GET") {
      const resource = new URL(request.url).searchParams.get("resource") || "profile";
      if (resource === "profile") {
        const employee = await db
          .prepare(
            "SELECT e.first_name,e.last_name,e.job_title,e.hire_date,e.status,e.employee_number,o.name organization_name FROM employees e LEFT JOIN organizations o ON o.id=e.organization_id AND o.tenant_id=e.tenant_id WHERE e.id=? AND e.tenant_id=?",
          )
          .bind(employeeId, tenant)
          .first<{
            first_name: string;
            last_name: string;
            job_title: string;
            hire_date: string;
            status: string;
            employee_number: string;
            organization_name: string | null;
          }>();
        if (!employee) return noEmployee();
        return Response.json({
          name: `${employee.first_name} ${employee.last_name}`,
          email: security.email,
          employeeNumber: employee.employee_number,
          jobTitle: employee.job_title,
          hireDate: employee.hire_date,
          status: employee.status,
          organizationName: employee.organization_name,
        });
      }
      if (resource === "payslips") {
        const rows = await db
          .prepare(
            "SELECT payslip_number,period,currency,gross_minor,deduction_minor,net_minor,issued_at FROM payroll_payslips WHERE tenant_id=? AND employee_id=? AND status='Emitido' ORDER BY period DESC",
          )
          .bind(tenant, employeeId)
          .all<{
            payslip_number: string;
            period: string;
            currency: string;
            gross_minor: number;
            deduction_minor: number;
            net_minor: number;
            issued_at: string;
          }>();
        return Response.json({
          payslips: rows.results.map((r) => ({
            payslipNumber: r.payslip_number,
            period: r.period,
            currency: r.currency,
            grossMinor: r.gross_minor,
            deductionMinor: r.deduction_minor,
            netMinor: r.net_minor,
            issuedAt: r.issued_at,
          })),
        });
      }
      if (resource === "leave") {
        const [balances, requests] = await Promise.all([
          db
            .prepare(
              "SELECT b.fiscal_year,b.allowance_minutes,b.used_minutes,t.code,t.name,t.unit FROM hcm_absence_balances b JOIN hcm_absence_types t ON t.id=b.absence_type_id AND t.tenant_id=b.tenant_id WHERE b.tenant_id=? AND b.employee_id=? ORDER BY b.fiscal_year DESC,t.name",
            )
            .bind(tenant, employeeId)
            .all<{
              fiscal_year: number;
              allowance_minutes: number;
              used_minutes: number;
              code: string;
              name: string;
              unit: string;
            }>(),
          db
            .prepare(
              "SELECT r.id,r.start_date,r.end_date,r.requested_minutes,r.reason,r.status,r.requested_at,t.name absence_type_name,t.unit FROM hcm_absence_requests r JOIN hcm_absence_types t ON t.id=r.absence_type_id AND t.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.employee_id=? ORDER BY r.requested_at DESC",
            )
            .bind(tenant, employeeId)
            .all<{
              id: string;
              start_date: string;
              end_date: string;
              requested_minutes: number;
              reason: string | null;
              status: string;
              requested_at: string;
              absence_type_name: string;
              unit: string;
            }>(),
        ]);
        return Response.json({
          balances: balances.results.map((b) => ({
            fiscalYear: b.fiscal_year,
            absenceTypeCode: b.code,
            absenceTypeName: b.name,
            unit: b.unit,
            allowanceMinutes: b.allowance_minutes,
            usedMinutes: b.used_minutes,
            remainingMinutes: b.allowance_minutes - b.used_minutes,
          })),
          requests: requests.results.map((r) => ({
            id: r.id,
            absenceTypeName: r.absence_type_name,
            unit: r.unit,
            startDate: r.start_date,
            endDate: r.end_date,
            requestedMinutes: r.requested_minutes,
            reason: r.reason,
            status: r.status,
            requestedAt: r.requested_at,
          })),
        });
      }
      if (resource === "absence-types") {
        const rows = await db
          .prepare(
            "SELECT id,code,name,unit FROM hcm_absence_types WHERE tenant_id=? AND status='Ativo' ORDER BY name",
          )
          .bind(tenant)
          .all<{ id: string; code: string; name: string; unit: string }>();
        return Response.json({ absenceTypes: rows.results });
      }
      if (resource === "tasks") {
        const rows = await db
          .prepare(
            "SELECT id,title,description,deliverable,priority,due_date,status,assigned_by,assigned_at,completed_at,completion_note FROM employee_tasks WHERE tenant_id=? AND employee_id=? ORDER BY CASE status WHEN 'Pendente' THEN 1 WHEN 'Em curso' THEN 2 ELSE 3 END,due_date",
          )
          .bind(tenant, employeeId)
          .all<{
            id: string;
            title: string;
            description: string | null;
            deliverable: string | null;
            priority: string;
            due_date: string | null;
            status: string;
            assigned_by: string;
            assigned_at: string;
            completed_at: string | null;
            completion_note: string | null;
          }>();
        return Response.json({
          tasks: rows.results.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            deliverable: t.deliverable,
            priority: t.priority,
            dueDate: t.due_date,
            status: t.status,
            assignedBy: t.assigned_by,
            assignedAt: t.assigned_at,
            completedAt: t.completed_at,
            completionNote: t.completion_note,
          })),
        });
      }
      if (resource === "performance-notices") {
        const rows = await db
          .prepare(
            "SELECT id,cycle_name,overall_rating,score_bps,summary,strengths,development_areas,status,published_by,published_at,acknowledged_at FROM employee_performance_notices WHERE tenant_id=? AND employee_id=? ORDER BY published_at DESC",
          )
          .bind(tenant, employeeId)
          .all<{
            id: string;
            cycle_name: string;
            overall_rating: string;
            score_bps: number | null;
            summary: string;
            strengths: string | null;
            development_areas: string | null;
            status: string;
            published_by: string;
            published_at: string;
            acknowledged_at: string | null;
          }>();
        return Response.json({
          notices: rows.results.map((n) => ({
            id: n.id,
            cycleName: n.cycle_name,
            overallRating: n.overall_rating,
            scoreBps: n.score_bps,
            summary: n.summary,
            strengths: n.strengths,
            developmentAreas: n.development_areas,
            status: n.status,
            publishedBy: n.published_by,
            publishedAt: n.published_at,
            acknowledgedAt: n.acknowledged_at,
          })),
        });
      }
      if (resource === "documents") {
        const rows = await db
          .prepare(
            "SELECT d.reference,d.issue_date,d.expiry_date,d.status,dt.name document_type_name FROM employee_documents d JOIN employee_document_types dt ON dt.id=d.document_type_id AND dt.tenant_id=d.tenant_id WHERE d.tenant_id=? AND d.employee_id=? AND d.status<>'Substituído' ORDER BY d.issue_date DESC",
          )
          .bind(tenant, employeeId)
          .all<{
            reference: string;
            issue_date: string;
            expiry_date: string | null;
            status: string;
            document_type_name: string;
          }>();
        return Response.json({
          documents: rows.results.map((d) => ({
            documentTypeName: d.document_type_name,
            reference: d.reference,
            issueDate: d.issue_date,
            expiryDate: d.expiry_date,
            status: d.status,
          })),
        });
      }
      return Response.json({ error: "Recurso desconhecido." }, { status: 404 });
    }
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const body = (await request.json()) as Record<string, string>;
    if (body.type === "acknowledgeNotice") {
      const now = new Date().toISOString();
      const result = await db
        .prepare(
          "UPDATE employee_performance_notices SET status='Reconhecido',acknowledged_at=? WHERE id=? AND tenant_id=? AND employee_id=? AND status='Publicado'",
        )
        .bind(now, body.noticeId, tenant, employeeId)
        .run();
      if (!Number(result.meta.changes || 0))
        return Response.json(
          { error: "Notificação não encontrada ou já foi reconhecida." },
          { status: 409 },
        );
      return Response.json({ id: body.noticeId, status: "Reconhecido" });
    }
    if (body.type === "taskTransition") {
      const task = await db
        .prepare(
          "SELECT status FROM employee_tasks WHERE id=? AND tenant_id=? AND employee_id=?",
        )
        .bind(body.taskId, tenant, employeeId)
        .first<{ status: string }>();
      if (!task)
        return Response.json(
          { error: "Tarefa não encontrada no seu âmbito." },
          { status: 404 },
        );
      const allowed: Record<string, string[]> = {
        Pendente: ["Em curso"],
        "Em curso": ["Concluída"],
      };
      if (!allowed[task.status]?.includes(body.status))
        return Response.json(
          { error: "Transição de tarefa inválida." },
          { status: 409 },
        );
      const now = new Date().toISOString();
      const result = await db
        .prepare(
          "UPDATE employee_tasks SET status=?,updated_at=?,completed_at=?,completion_note=? WHERE id=? AND tenant_id=? AND employee_id=? AND status=?",
        )
        .bind(
          body.status,
          now,
          body.status === "Concluída" ? now : null,
          body.status === "Concluída" ? body.note?.trim() || null : null,
          body.taskId,
          tenant,
          employeeId,
          task.status,
        )
        .run();
      if (!Number(result.meta.changes || 0))
        return Response.json(
          { error: "A tarefa foi atualizada em paralelo." },
          { status: 409 },
        );
      return Response.json({ id: body.taskId, status: body.status });
    }
    if (body.type !== "leaveRequest")
      return Response.json({ error: "Tipo de pedido desconhecido." }, { status: 400 });
    if (
      !body.absenceTypeId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate || "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate || "")
    )
      return Response.json(
        { error: "Tipo de ausência, data de início e data de fim são obrigatórios." },
        { status: 400 },
      );
    const absenceType = await db
      .prepare(
        "SELECT unit FROM hcm_absence_types WHERE id=? AND tenant_id=? AND status='Ativo'",
      )
      .bind(body.absenceTypeId, tenant)
      .first<{ unit: string }>();
    if (!absenceType)
      return Response.json({ error: "Tipo de ausência inválido." }, { status: 400 });
    const days =
      Math.round(
        (new Date(body.endDate).getTime() - new Date(body.startDate).getTime()) /
          86400000,
      ) + 1;
    if (days <= 0)
      return Response.json(
        { error: "O intervalo de datas é inválido." },
        { status: 400 },
      );
    const requestedMinutes = absenceType.unit === "Dias" ? days * 8 * 60 : days * 60;
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO hcm_absence_requests (id,tenant_id,employee_id,absence_type_id,start_date,end_date,requested_minutes,reason,status,requested_by,requested_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        tenant,
        employeeId,
        body.absenceTypeId,
        body.startDate,
        body.endDate,
        requestedMinutes,
        body.reason || null,
        "Pendente",
        security.email,
        now,
      )
      .run();
    return Response.json({ id, status: "Pendente" }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
