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
const minutesOf = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};
function luandaNow() {
  const local = new Date(Date.now() + 60 * 60 * 1000);
  return {
    workDate: local.toISOString().slice(0, 10),
    clockTime: local.toISOString().slice(11, 16),
  };
}
function parseGeo(lat: unknown, lng: unknown, accuracy: unknown) {
  if (lat === undefined && lng === undefined && accuracy === undefined) return null;
  if (lat === undefined || lng === undefined) return "invalid" as const;
  const latN = Number(lat),
    lngN = Number(lng),
    accN = accuracy === undefined ? null : Number(accuracy);
  if (
    !Number.isFinite(latN) ||
    !Number.isFinite(lngN) ||
    latN < -90 ||
    latN > 90 ||
    lngN < -180 ||
    lngN > 180 ||
    (accN !== null && (!Number.isFinite(accN) || accN < 0))
  )
    return "invalid" as const;
  return { lat: latN, lng: lngN, accuracy: accN };
}

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
        const manager = await db
          .prepare(
            "SELECT m.first_name,m.last_name,m.job_title FROM employee_reporting_lines r JOIN employees m ON m.id=r.manager_id AND m.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.employee_id=? AND r.status='Ativo'",
          )
          .bind(tenant, employeeId)
          .first<{ first_name: string; last_name: string; job_title: string }>();
        const reportCount = await db
          .prepare(
            "SELECT COUNT(*) n FROM employee_reporting_lines WHERE tenant_id=? AND manager_id=? AND status='Ativo'",
          )
          .bind(tenant, employeeId)
          .first<{ n: number }>();
        return Response.json({
          name: `${employee.first_name} ${employee.last_name}`,
          email: security.email,
          employeeNumber: employee.employee_number,
          jobTitle: employee.job_title,
          hireDate: employee.hire_date,
          status: employee.status,
          organizationName: employee.organization_name,
          managerName: manager ? `${manager.first_name} ${manager.last_name}` : null,
          managerJobTitle: manager ? manager.job_title : null,
          reportCount: Number(reportCount?.n || 0),
        });
      }
      if (resource === "team") {
        const rows = await db
          .prepare(
            "SELECT e.id,e.first_name,e.last_name,e.job_title,e.employee_number FROM employee_reporting_lines r JOIN employees e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.manager_id=? AND r.status='Ativo' ORDER BY e.first_name,e.last_name",
          )
          .bind(tenant, employeeId)
          .all<{
            id: string;
            first_name: string;
            last_name: string;
            job_title: string;
            employee_number: string;
          }>();
        return Response.json({
          reports: rows.results.map((r) => ({
            id: r.id,
            name: `${r.first_name} ${r.last_name}`,
            jobTitle: r.job_title,
            employeeNumber: r.employee_number,
          })),
        });
      }
      if (resource === "team-leave") {
        const { workDate } = luandaNow(),
          windowEnd = new Date(
            Date.parse(`${workDate}T00:00:00Z`) + 60 * 24 * 60 * 60 * 1000,
          )
            .toISOString()
            .slice(0, 10);
        const rows = await db
          .prepare(
            "SELECT r.id,r.start_date,r.end_date,r.requested_minutes,t.name absence_type_name,t.unit,e.first_name,e.last_name FROM hcm_absence_requests r JOIN employees e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id JOIN employee_reporting_lines rl ON rl.employee_id=e.id AND rl.tenant_id=e.tenant_id AND rl.status='Ativo' JOIN hcm_absence_types t ON t.id=r.absence_type_id AND t.tenant_id=r.tenant_id WHERE r.tenant_id=? AND rl.manager_id=? AND r.status='Aprovado' AND r.end_date>=? AND r.start_date<=? ORDER BY r.start_date",
          )
          .bind(tenant, employeeId, workDate, windowEnd)
          .all<{
            id: string;
            start_date: string;
            end_date: string;
            requested_minutes: number;
            absence_type_name: string;
            unit: string;
            first_name: string;
            last_name: string;
          }>();
        return Response.json({
          team: rows.results.map((r) => ({
            id: r.id,
            name: `${r.first_name} ${r.last_name}`,
            absenceTypeName: r.absence_type_name,
            unit: r.unit,
            startDate: r.start_date,
            endDate: r.end_date,
            requestedMinutes: r.requested_minutes,
          })),
        });
      }
      if (resource === "personal-details") {
        const current = await db
          .prepare(
            "SELECT phone,address,emergency_contact_name,emergency_contact_phone,bank_iban,decided_at FROM employee_personal_detail_requests WHERE tenant_id=? AND employee_id=? AND status='Aprovado' ORDER BY decided_at DESC LIMIT 1",
          )
          .bind(tenant, employeeId)
          .first<{
            phone: string;
            address: string;
            emergency_contact_name: string;
            emergency_contact_phone: string;
            bank_iban: string;
            decided_at: string;
          }>();
        const pending = await db
          .prepare(
            "SELECT id,requested_at FROM employee_personal_detail_requests WHERE tenant_id=? AND employee_id=? AND status='Pendente' ORDER BY requested_at DESC LIMIT 1",
          )
          .bind(tenant, employeeId)
          .first<{ id: string; requested_at: string }>();
        return Response.json({
          phone: current?.phone || "",
          address: current?.address || "",
          emergencyContactName: current?.emergency_contact_name || "",
          emergencyContactPhone: current?.emergency_contact_phone || "",
          bankIban: current?.bank_iban || "",
          updatedAt: current?.decided_at || null,
          pendingRequest: pending
            ? { id: pending.id, requestedAt: pending.requested_at }
            : null,
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
      if (resource === "career-notices") {
        const rows = await db
          .prepare(
            "SELECT id,notice_type,title,message,previous_job_title,new_job_title,previous_salary_minor,new_salary_minor,currency,effective_date,status,published_by,published_at,acknowledged_at FROM employee_career_notices WHERE tenant_id=? AND employee_id=? ORDER BY published_at DESC",
          )
          .bind(tenant, employeeId)
          .all<{
            id: string;
            notice_type: string;
            title: string;
            message: string;
            previous_job_title: string | null;
            new_job_title: string | null;
            previous_salary_minor: number | null;
            new_salary_minor: number | null;
            currency: string | null;
            effective_date: string | null;
            status: string;
            published_by: string;
            published_at: string;
            acknowledged_at: string | null;
          }>();
        return Response.json({
          notices: rows.results.map((n) => ({
            id: n.id,
            noticeType: n.notice_type,
            title: n.title,
            message: n.message,
            previousJobTitle: n.previous_job_title,
            newJobTitle: n.new_job_title,
            previousSalaryMinor: n.previous_salary_minor,
            newSalaryMinor: n.new_salary_minor,
            currency: n.currency,
            effectiveDate: n.effective_date,
            status: n.status,
            publishedBy: n.published_by,
            publishedAt: n.published_at,
            acknowledgedAt: n.acknowledged_at,
          })),
        });
      }
      if (resource === "attendance") {
        const [openEntry, recent] = await Promise.all([
          db
            .prepare(
              "SELECT id,work_date,clock_in,scheduled_minutes,clock_in_lat,clock_in_lng FROM attendance_entries WHERE tenant_id=? AND employee_id=? AND clock_out IS NULL ORDER BY work_date DESC LIMIT 1",
            )
            .bind(tenant, employeeId)
            .first<{
              id: string;
              work_date: string;
              clock_in: string;
              scheduled_minutes: number;
              clock_in_lat: number | null;
              clock_in_lng: number | null;
            }>(),
          db
            .prepare(
              "SELECT id,work_date,clock_in,clock_out,worked_minutes,scheduled_minutes,overtime_minutes,exception_code,clock_in_lat,clock_in_lng,clock_out_lat,clock_out_lng FROM attendance_entries WHERE tenant_id=? AND employee_id=? AND clock_out IS NOT NULL ORDER BY work_date DESC LIMIT 14",
            )
            .bind(tenant, employeeId)
            .all<{
              id: string;
              work_date: string;
              clock_in: string;
              clock_out: string;
              worked_minutes: number;
              scheduled_minutes: number;
              overtime_minutes: number;
              exception_code: string | null;
              clock_in_lat: number | null;
              clock_in_lng: number | null;
              clock_out_lat: number | null;
              clock_out_lng: number | null;
            }>(),
        ]);
        return Response.json({
          openEntry: openEntry
            ? {
                id: openEntry.id,
                workDate: openEntry.work_date,
                clockIn: openEntry.clock_in,
                scheduledMinutes: openEntry.scheduled_minutes,
                clockInHasLocation: openEntry.clock_in_lat !== null,
              }
            : null,
          recentEntries: recent.results.map((e) => ({
            id: e.id,
            workDate: e.work_date,
            clockIn: e.clock_in,
            clockOut: e.clock_out,
            workedMinutes: e.worked_minutes,
            scheduledMinutes: e.scheduled_minutes,
            overtimeMinutes: e.overtime_minutes,
            exceptionCode: e.exception_code,
            clockInHasLocation: e.clock_in_lat !== null,
            clockOutHasLocation: e.clock_out_lat !== null,
          })),
        });
      }
      if (resource === "onboarding-documents") {
        const rows = await db
          .prepare(
            "SELECT id,title,description,document_url,status,published_by,published_at,signature_name,signed_at FROM employee_onboarding_documents WHERE tenant_id=? AND employee_id=? ORDER BY CASE status WHEN 'Pendente' THEN 1 ELSE 2 END,published_at DESC",
          )
          .bind(tenant, employeeId)
          .all<{
            id: string;
            title: string;
            description: string | null;
            document_url: string | null;
            status: string;
            published_by: string;
            published_at: string;
            signature_name: string | null;
            signed_at: string | null;
          }>();
        return Response.json({
          documents: rows.results.map((d) => ({
            id: d.id,
            title: d.title,
            description: d.description,
            documentUrl: d.document_url,
            status: d.status,
            publishedBy: d.published_by,
            publishedAt: d.published_at,
            signatureName: d.signature_name,
            signedAt: d.signed_at,
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
    if (body.type === "selfClockIn") {
      const open = await db
        .prepare(
          "SELECT id FROM attendance_entries WHERE tenant_id=? AND employee_id=? AND clock_out IS NULL",
        )
        .bind(tenant, employeeId)
        .first();
      if (open)
        return Response.json(
          { error: "Já tem uma entrada em aberto. Registe a saída primeiro." },
          { status: 409 },
        );
      const { workDate, clockTime } = luandaNow();
      const existingToday = await db
        .prepare(
          "SELECT id FROM attendance_entries WHERE tenant_id=? AND employee_id=? AND work_date=?",
        )
        .bind(tenant, employeeId, workDate)
        .first();
      if (existingToday)
        return Response.json(
          { error: "Já registou a presença de hoje." },
          { status: 409 },
        );
      const assignment = await db
        .prepare(
          "SELECT s.scheduled_minutes FROM attendance_assignments a JOIN attendance_shifts s ON s.id=a.shift_id AND s.tenant_id=a.tenant_id WHERE a.tenant_id=? AND a.employee_id=? AND a.status='Ativa' AND a.effective_from<=? ORDER BY a.effective_from DESC LIMIT 1",
        )
        .bind(tenant, employeeId, workDate)
        .first<{ scheduled_minutes: number }>();
      if (!assignment)
        return Response.json(
          { error: "Não existe um turno ativo atribuído. Contacte os Recursos Humanos." },
          { status: 409 },
        );
      const geo = parseGeo(body.lat, body.lng, body.accuracy);
      if (geo === "invalid")
        return Response.json(
          { error: "Localização inválida." },
          { status: 400 },
        );
      const id = crypto.randomUUID(),
        now = new Date().toISOString();
      await db
        .prepare(
          "INSERT INTO attendance_entries (id,tenant_id,employee_id,work_date,clock_in,clock_out,source,worked_minutes,scheduled_minutes,overtime_minutes,exception_code,note,created_by,created_at,clock_in_lat,clock_in_lng,clock_in_accuracy_m) VALUES (?,?,?,?,?,NULL,?,NULL,?,NULL,NULL,?,?,?,?,?,?)",
        )
        .bind(
          id,
          tenant,
          employeeId,
          workDate,
          clockTime,
          "Self-service",
          assignment.scheduled_minutes,
          null,
          security.email,
          now,
          geo?.lat ?? null,
          geo?.lng ?? null,
          geo?.accuracy ?? null,
        )
        .run();
      return Response.json(
        { id, workDate, clockIn: clockTime, hasLocation: !!geo },
        { status: 201 },
      );
    }
    if (body.type === "selfClockOut") {
      const row = await db
        .prepare(
          "SELECT id,clock_in,scheduled_minutes FROM attendance_entries WHERE tenant_id=? AND employee_id=? AND clock_out IS NULL",
        )
        .bind(tenant, employeeId)
        .first<{ id: string; clock_in: string; scheduled_minutes: number }>();
      if (!row)
        return Response.json(
          { error: "Não existe nenhuma entrada em aberto." },
          { status: 404 },
        );
      const { clockTime } = luandaNow();
      const start = minutesOf(row.clock_in),
        end = minutesOf(clockTime),
        worked = end >= start ? end - start : 1440 - start + end,
        scheduled = row.scheduled_minutes,
        overtime = Math.max(0, worked - scheduled);
      if (worked <= 0 || worked > 1440)
        return Response.json(
          { error: "A duração da marcação é inválida." },
          { status: 400 },
        );
      const geo = parseGeo(body.lat, body.lng, body.accuracy);
      if (geo === "invalid")
        return Response.json(
          { error: "Localização inválida." },
          { status: 400 },
        );
      const result = await db
        .prepare(
          "UPDATE attendance_entries SET clock_out=?,worked_minutes=?,overtime_minutes=?,exception_code=?,clock_out_lat=?,clock_out_lng=?,clock_out_accuracy_m=? WHERE id=? AND tenant_id=? AND employee_id=? AND clock_out IS NULL",
        )
        .bind(
          clockTime,
          worked,
          overtime,
          worked < scheduled ? "DÉFICE" : overtime > 0 ? "EXTRA" : null,
          geo?.lat ?? null,
          geo?.lng ?? null,
          geo?.accuracy ?? null,
          row.id,
          tenant,
          employeeId,
        )
        .run();
      if (!Number(result.meta.changes || 0))
        return Response.json(
          { error: "A entrada foi fechada em paralelo." },
          { status: 409 },
        );
      return Response.json({
        id: row.id,
        clockOut: clockTime,
        workedMinutes: worked,
        overtimeMinutes: overtime,
        hasLocation: !!geo,
      });
    }
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
    if (body.type === "acknowledgeCareerNotice") {
      const now = new Date().toISOString();
      const result = await db
        .prepare(
          "UPDATE employee_career_notices SET status='Reconhecido',acknowledged_at=? WHERE id=? AND tenant_id=? AND employee_id=? AND status='Publicado'",
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
    if (body.type === "signOnboardingDocument") {
      const signatureName = (body.signatureName || "").trim();
      if (signatureName.length < 3)
        return Response.json(
          { error: "Indique o seu nome completo para assinar." },
          { status: 400 },
        );
      const now = new Date().toISOString();
      const result = await db
        .prepare(
          "UPDATE employee_onboarding_documents SET status='Assinado',signed_by=?,signature_name=?,signed_at=? WHERE id=? AND tenant_id=? AND employee_id=? AND status='Pendente'",
        )
        .bind(security.email, signatureName, now, body.documentId, tenant, employeeId)
        .run();
      if (!Number(result.meta.changes || 0))
        return Response.json(
          { error: "Documento não encontrado ou já foi assinado." },
          { status: 409 },
        );
      return Response.json({ id: body.documentId, status: "Assinado" });
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
    if (body.type === "requestPersonalDetailChange") {
      const pending = await db
        .prepare(
          "SELECT id FROM employee_personal_detail_requests WHERE tenant_id=? AND employee_id=? AND status='Pendente'",
        )
        .bind(tenant, employeeId)
        .first();
      if (pending)
        return Response.json(
          { error: "Já existe um pedido de alteração pendente de aprovação." },
          { status: 409 },
        );
      const iban = (body.bankIban || "").trim().toUpperCase();
      if (iban && (iban.length < 15 || iban.length > 34))
        return Response.json(
          { error: "IBAN inválido." },
          { status: 400 },
        );
      const now = new Date().toISOString(),
        id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO employee_personal_detail_requests (id,tenant_id,employee_id,phone,address,emergency_contact_name,emergency_contact_phone,bank_iban,status,requested_by,requested_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          tenant,
          employeeId,
          (body.phone || "").trim(),
          (body.address || "").trim(),
          (body.emergencyContactName || "").trim(),
          (body.emergencyContactPhone || "").trim(),
          iban,
          "Pendente",
          security.email,
          now,
        )
        .run();
      return Response.json({ id, status: "Pendente", requestedAt: now });
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
