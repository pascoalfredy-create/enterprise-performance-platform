import { classifyDataError } from "../lib/api-error";
type Security = {
  tenantId: string;
  organizationId: string | null;
  email: string;
  role: string;
};
const uid = () => crypto.randomUUID();
const fail = (e: unknown) => {
  const x = classifyDataError(
    e,
    "Não foi possível processar recrutamento e onboarding.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};
export async function recruitmentApi(
  request: Request,
  db: D1Database,
  s: Security,
) {
  try {
    const tenant = s.tenantId,
      scope = s.organizationId,
      now = new Date().toISOString();
    const snapshot = async () => {
      const [
        requisitions,
        applications,
        candidates,
        cases,
        tasks,
        organizations,
        owners,
      ] = await Promise.all([
        db
          .prepare(
            "SELECT r.*,o.name organization_name,(SELECT COUNT(*) FROM recruitment_applications a WHERE a.requisition_id=r.id AND a.tenant_id=r.tenant_id) application_count FROM recruitment_requisitions r JOIN organizations o ON o.id=r.organization_id AND o.tenant_id=r.tenant_id WHERE r.tenant_id=? AND (? IS NULL OR r.organization_id=?) ORDER BY r.created_at DESC",
          )
          .bind(tenant, scope, scope)
          .all(),
        db
          .prepare(
            "SELECT a.*,c.full_name candidate_name,c.email candidate_email,r.title requisition_title,r.organization_id FROM recruitment_applications a JOIN recruitment_candidates c ON c.id=a.candidate_id AND c.tenant_id=a.tenant_id JOIN recruitment_requisitions r ON r.id=a.requisition_id AND r.tenant_id=a.tenant_id WHERE a.tenant_id=? AND (? IS NULL OR r.organization_id=?) ORDER BY a.updated_at DESC",
          )
          .bind(tenant, scope, scope)
          .all(),
        db
          .prepare(
            "SELECT id,full_name,email,phone,source,consent_at FROM recruitment_candidates WHERE tenant_id=? ORDER BY full_name",
          )
          .bind(tenant)
          .all(),
        db
          .prepare(
            "SELECT c.*,k.full_name candidate_name,r.title requisition_title,r.organization_id,(SELECT COUNT(*) FROM employee_onboarding_tasks t WHERE t.case_id=c.id AND t.tenant_id=c.tenant_id) task_count,(SELECT COUNT(*) FROM employee_onboarding_tasks t WHERE t.case_id=c.id AND t.tenant_id=c.tenant_id AND t.status='Concluída') completed_count FROM employee_onboarding_cases c JOIN recruitment_applications a ON a.id=c.application_id AND a.tenant_id=c.tenant_id JOIN recruitment_candidates k ON k.id=a.candidate_id AND k.tenant_id=a.tenant_id JOIN recruitment_requisitions r ON r.id=a.requisition_id AND r.tenant_id=a.tenant_id WHERE c.tenant_id=? AND (? IS NULL OR r.organization_id=?) ORDER BY c.created_at DESC",
          )
          .bind(tenant, scope, scope)
          .all(),
        db
          .prepare(
            "SELECT * FROM employee_onboarding_tasks WHERE tenant_id=? ORDER BY due_date",
          )
          .bind(tenant)
          .all(),
        db
          .prepare(
            "SELECT id,code,name,currency FROM organizations WHERE tenant_id=? AND (? IS NULL OR id=?) AND status='Ativa' ORDER BY name",
          )
          .bind(tenant, scope, scope)
          .all(),
        db
          .prepare(
            "SELECT email,name,role FROM platform_users WHERE tenant_id=? AND status='Ativo' ORDER BY name",
          )
          .bind(tenant)
          .all(),
      ]);
      return {
        requisitions: requisitions.results,
        applications: applications.results,
        candidates: candidates.results,
        onboardingCases: cases.results,
        tasks: tasks.results,
        organizations: organizations.results,
        owners: owners.results,
      };
    };
    if (request.method === "GET") return Response.json(await snapshot());
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const b = (await request.json()) as Record<string, string>;
    let entityId = "",
      entityType = "recruitment";
    if (b.type === "createRequisition") {
      const org = scope || b.organizationId,
        cost = Math.round(Number(b.monthlyBudget) * 100),
        positions = Number(b.positions);
      if (
        !org ||
        !b.title?.trim() ||
        !Number.isInteger(positions) ||
        positions < 1 ||
        !Number.isSafeInteger(cost) ||
        cost < 0 ||
        !/^[A-Z]{3}$/.test(b.currency || "") ||
        !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(b.targetStartDate || "") ||
        !b.businessReason?.trim() ||
        b.businessReason.trim().length < 10
      )
        return Response.json(
          {
            error:
              "Organização, vaga, posições, orçamento, data e justificação são obrigatórios.",
          },
          { status: 400 },
        );
      entityId = uid();
      await db
        .prepare(
          "INSERT INTO recruitment_requisitions (id,tenant_id,organization_id,title,department_code,positions,target_start_date,employment_type,budget_monthly_minor,currency,status,business_reason,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,'Rascunho',?,?,?)",
        )
        .bind(
          entityId,
          tenant,
          org,
          b.title.trim(),
          b.departmentCode?.trim() || null,
          positions,
          b.targetStartDate,
          b.employmentType || "Efetivo",
          cost,
          b.currency,
          b.businessReason.trim(),
          s.email,
          now,
        )
        .run();
    } else if (b.type === "openRequisition") {
      const item = await db
        .prepare(
          "SELECT created_by FROM recruitment_requisitions WHERE id=? AND tenant_id=? AND status='Rascunho'",
        )
        .bind(b.requisitionId, tenant)
        .first<Record<string, unknown>>();
      if (!item)
        return Response.json(
          { error: "Requisição em rascunho não encontrada." },
          { status: 404 },
        );
      if (String(item.created_by).toLowerCase() === s.email.toLowerCase())
        return Response.json(
          {
            error:
              "Maker-checker: o criador não pode aprovar a própria requisição.",
          },
          { status: 403 },
        );
      entityId = b.requisitionId;
      await db
        .prepare(
          "UPDATE recruitment_requisitions SET status='Aberta',approved_by=?,approved_at=? WHERE id=? AND tenant_id=? AND status='Rascunho'",
        )
        .bind(s.email, now, b.requisitionId, tenant)
        .run();
    } else if (b.type === "addCandidate") {
      if (
        !b.requisitionId ||
        !b.fullName?.trim() ||
        !/^\S+@\S+\.\S+$/.test(b.email || "") ||
        b.consent !== "on"
      )
        return Response.json(
          {
            error: "Requisição, nome, e-mail e consentimento são obrigatórios.",
          },
          { status: 400 },
        );
      const open = await db
        .prepare(
          "SELECT id FROM recruitment_requisitions WHERE id=? AND tenant_id=? AND status='Aberta'",
        )
        .bind(b.requisitionId, tenant)
        .first();
      if (!open)
        return Response.json(
          { error: "Requisição aberta não encontrada." },
          { status: 404 },
        );
      const candidateId = uid();
      await db
        .prepare(
          "INSERT INTO recruitment_candidates VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          candidateId,
          tenant,
          b.fullName.trim(),
          b.email.toLowerCase(),
          b.phone?.trim() || null,
          b.source || "Direto",
          now,
          s.email,
          now,
        )
        .run();
      entityId = uid();
      await db
        .prepare(
          "INSERT INTO recruitment_applications VALUES (?,?,?,?,'Recebida',NULL,NULL,?,?,?)",
        )
        .bind(entityId, tenant, b.requisitionId, candidateId, s.email, now, now)
        .run();
    } else if (b.type === "transitionApplication") {
      const item = await db
        .prepare(
          "SELECT * FROM recruitment_applications WHERE id=? AND tenant_id=?",
        )
        .bind(b.applicationId, tenant)
        .first<Record<string, unknown>>();
      if (!item)
        return Response.json(
          { error: "Candidatura não encontrada." },
          { status: 404 },
        );
      entityId = b.applicationId;
      await db
        .prepare(
          "UPDATE recruitment_applications SET status=?,rating=?,decision_note=?,updated_at=? WHERE id=? AND tenant_id=? AND status=?",
        )
        .bind(
          b.status,
          b.rating ? Number(b.rating) : null,
          b.decisionNote?.trim() || null,
          now,
          b.applicationId,
          tenant,
          item.status,
        )
        .run();
    } else if (b.type === "startOnboarding") {
      const app = await db
        .prepare(
          "SELECT * FROM recruitment_applications WHERE id=? AND tenant_id=? AND status='Contratada'",
        )
        .bind(b.applicationId, tenant)
        .first();
      if (
        !app ||
        !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(b.startDate || "") ||
        !b.ownerEmail
      )
        return Response.json(
          {
            error:
              "Candidatura contratada, data e responsável são obrigatórios.",
          },
          { status: 409 },
        );
      entityId = uid();
      entityType = "onboarding";
      await db
        .prepare(
          "INSERT INTO employee_onboarding_cases VALUES (?,?,?,NULL,'Preparação',?,?,?,?,NULL)",
        )
        .bind(
          entityId,
          tenant,
          b.applicationId,
          b.startDate,
          b.ownerEmail,
          s.email,
          now,
        )
        .run();
    } else if (b.type === "addOnboardingTask") {
      if (
        !b.caseId ||
        !b.title?.trim() ||
        !b.ownerEmail ||
        !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(b.dueDate || "")
      )
        return Response.json(
          { error: "Caso, tarefa, responsável e prazo são obrigatórios." },
          { status: 400 },
        );
      entityId = b.caseId;
      entityType = "onboarding";
      await db.batch([
        db.prepare("INSERT INTO employee_onboarding_tasks VALUES (?,?,?,?,?,?,'Pendente',NULL,?,NULL)").bind(uid(),tenant,b.caseId,b.title.trim(),b.ownerEmail,b.dueDate,now),
        db.prepare("UPDATE employee_onboarding_cases SET status='Em curso' WHERE id=? AND tenant_id=? AND status='Preparação'").bind(b.caseId,tenant),
      ]);
    } else if (b.type === "completeOnboardingTask") {
      entityId = b.caseId;
      entityType = "onboarding";
      await db.batch([
        db.prepare("UPDATE employee_onboarding_tasks SET status='Concluída',evidence=?,completed_at=? WHERE id=? AND tenant_id=? AND status='Pendente'").bind(b.evidence?.trim(),now,b.taskId,tenant),
        db.prepare("UPDATE employee_onboarding_cases SET status='Concluído',completed_at=? WHERE id=? AND tenant_id=? AND status='Em curso' AND EXISTS(SELECT 1 FROM employee_onboarding_tasks t WHERE t.case_id=employee_onboarding_cases.id) AND NOT EXISTS(SELECT 1 FROM employee_onboarding_tasks t WHERE t.case_id=employee_onboarding_cases.id AND t.status<>'Concluída')").bind(now,b.caseId,tenant),
      ]);
    } else
      return Response.json(
        { error: "Operação de recrutamento não suportada." },
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
        b.type,
        entityType,
        entityId,
        s.email,
        `HCM Talent: ${b.type}`,
      )
      .run();
    return Response.json(await snapshot());
  } catch (e) {
    return fail(e);
  }
}
