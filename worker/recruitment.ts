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
  bucket: R2Bucket,
  s: Security,
) {
  try {
    const tenant = s.tenantId,
      scope = s.organizationId,
      now = new Date().toISOString(),
      url = new URL(request.url);
    if (request.method === "GET") {
      const download = url.searchParams.get("download");
      if (download) {
        const row = await db
          .prepare(
            "SELECT d.storage_key,d.file_name,d.mime_type FROM recruitment_candidate_documents d JOIN recruitment_candidates c ON c.id=d.candidate_id AND c.tenant_id=d.tenant_id WHERE d.id=? AND d.tenant_id=? AND (? IS NULL OR EXISTS(SELECT 1 FROM recruitment_applications a JOIN recruitment_requisitions r ON r.id=a.requisition_id AND r.tenant_id=a.tenant_id WHERE a.candidate_id=d.candidate_id AND a.tenant_id=d.tenant_id AND r.organization_id=?) OR EXISTS(SELECT 1 FROM recruitment_spontaneous_applications s WHERE s.candidate_id=d.candidate_id AND s.tenant_id=d.tenant_id AND s.status='Em avaliação'))",
          )
          .bind(download, tenant, scope, scope)
          .first<{ storage_key: string; file_name: string; mime_type: string }>();
        if (!row)
          return Response.json(
            { error: "Documento não encontrado no âmbito autorizado." },
            { status: 404 },
          );
        const object = await bucket.get(row.storage_key);
        if (!object)
          return Response.json(
            { error: "Conteúdo documental não encontrado." },
            { status: 404 },
          );
        const safe = row.file_name.replace(/[\r\n"\\]/g, "_");
        return new Response(object.body, {
          headers: {
            "content-type": row.mime_type,
            "content-length": String(object.size),
            "content-disposition": `attachment; filename="${safe}"`,
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        });
      }
    }
    const snapshot = async () => {
      const [
        requisitions,
        applications,
        candidates,
        cases,
        tasks,
        organizations,
        owners,
        tenantRow,
        activeEmployees,
        onboardingDocuments,
        spontaneousApplications,
        candidateDocuments,
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
            "SELECT id,full_name,email,phone,source,consent_at,birth_date,national_id,address,linkedin_url,current_employer,current_role,years_experience,highest_education,field_of_study,institution,presentation FROM recruitment_candidates c WHERE c.tenant_id=? AND (? IS NULL OR EXISTS(SELECT 1 FROM recruitment_applications a JOIN recruitment_requisitions r ON r.id=a.requisition_id AND r.tenant_id=a.tenant_id WHERE a.candidate_id=c.id AND a.tenant_id=c.tenant_id AND r.organization_id=?) OR EXISTS(SELECT 1 FROM recruitment_spontaneous_applications s WHERE s.candidate_id=c.id AND s.tenant_id=c.tenant_id AND s.status='Em avaliação')) ORDER BY full_name",
          )
          .bind(tenant, scope, scope)
          .all(),
        db
          .prepare(
            "SELECT c.*,k.full_name candidate_name,r.title requisition_title,r.organization_id,(SELECT COUNT(*) FROM employee_onboarding_tasks t WHERE t.case_id=c.id AND t.tenant_id=c.tenant_id) task_count,(SELECT COUNT(*) FROM employee_onboarding_tasks t WHERE t.case_id=c.id AND t.tenant_id=c.tenant_id AND t.status='Concluída') completed_count,e.first_name||' '||e.last_name linked_employee_name,e.employee_number linked_employee_number FROM employee_onboarding_cases c JOIN recruitment_applications a ON a.id=c.application_id AND a.tenant_id=c.tenant_id JOIN recruitment_candidates k ON k.id=a.candidate_id AND k.tenant_id=a.tenant_id JOIN recruitment_requisitions r ON r.id=a.requisition_id AND r.tenant_id=a.tenant_id LEFT JOIN employees e ON e.id=c.employee_id AND e.tenant_id=c.tenant_id WHERE c.tenant_id=? AND (? IS NULL OR r.organization_id=?) ORDER BY c.created_at DESC",
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
        db
          .prepare("SELECT slug FROM tenants WHERE id=?")
          .bind(tenant)
          .first<{ slug: string }>(),
        db
          .prepare(
            "SELECT id,employee_number,first_name,last_name,status FROM employees WHERE tenant_id=? AND (? IS NULL OR organization_id=?) AND status<>'Inativo' ORDER BY first_name,last_name",
          )
          .bind(tenant, scope, scope)
          .all(),
        db
          .prepare(
            "SELECT d.*,e.first_name||' '||e.last_name employee_name,e.employee_number FROM employee_onboarding_documents d JOIN employees e ON e.id=d.employee_id AND e.tenant_id=d.tenant_id WHERE d.tenant_id=? AND (? IS NULL OR e.organization_id=?) ORDER BY d.published_at DESC",
          )
          .bind(tenant, scope, scope)
          .all(),
        db
          .prepare(
            "SELECT s.*,c.full_name candidate_name,c.email candidate_email FROM recruitment_spontaneous_applications s JOIN recruitment_candidates c ON c.id=s.candidate_id AND c.tenant_id=s.tenant_id LEFT JOIN recruitment_applications a ON a.id=s.linked_application_id AND a.tenant_id=s.tenant_id LEFT JOIN recruitment_requisitions r ON r.id=a.requisition_id AND r.tenant_id=a.tenant_id WHERE s.tenant_id=? AND (? IS NULL OR s.status='Em avaliação' OR r.organization_id=?) ORDER BY s.created_at DESC",
          )
          .bind(tenant, scope, scope)
          .all(),
        db
          .prepare(
            "SELECT d.id,d.candidate_id,d.document_type,d.file_name,d.uploaded_at FROM recruitment_candidate_documents d WHERE d.tenant_id=? AND (? IS NULL OR EXISTS(SELECT 1 FROM recruitment_applications a JOIN recruitment_requisitions r ON r.id=a.requisition_id AND r.tenant_id=a.tenant_id WHERE a.candidate_id=d.candidate_id AND a.tenant_id=d.tenant_id AND r.organization_id=?) OR EXISTS(SELECT 1 FROM recruitment_spontaneous_applications s WHERE s.candidate_id=d.candidate_id AND s.tenant_id=d.tenant_id AND s.status='Em avaliação')) ORDER BY d.uploaded_at DESC",
          )
          .bind(tenant, scope, scope)
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
        careersSlug: tenantRow?.slug || null,
        activeEmployees: activeEmployees.results,
        onboardingDocuments: onboardingDocuments.results,
        spontaneousApplications: spontaneousApplications.results,
        candidateDocuments: candidateDocuments.results,
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
          "INSERT INTO recruitment_candidates (id,tenant_id,full_name,email,phone,source,consent_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
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
    } else if (b.type === "linkOnboardingEmployee") {
      const employee = await db
        .prepare(
          "SELECT id FROM employees WHERE id=? AND tenant_id=? AND (? IS NULL OR organization_id=?) AND status<>'Inativo'",
        )
        .bind(b.employeeId, tenant, scope, scope)
        .first();
      if (!employee)
        return Response.json(
          { error: "Colaborador fora do âmbito autorizado." },
          { status: 403 },
        );
      entityId = b.caseId;
      entityType = "onboarding";
      const result = await db
        .prepare(
          "UPDATE employee_onboarding_cases SET employee_id=? WHERE id=? AND tenant_id=? AND employee_id IS NULL",
        )
        .bind(b.employeeId, b.caseId, tenant)
        .run();
      if (!Number(result.meta.changes || 0))
        return Response.json(
          {
            error:
              "Caso de onboarding não encontrado ou já tem um colaborador associado.",
          },
          { status: 409 },
        );
    } else if (b.type === "createEmployeeFromCase") {
      const org = scope || b.organizationId,
        employeeNumber = b.employeeNumber?.trim().toUpperCase();
      if (!employeeNumber || !org || !b.jobTitle?.trim())
        return Response.json(
          {
            error:
              "Número de colaborador, organização e função são obrigatórios.",
          },
          { status: 400 },
        );
      const caseRow = await db
        .prepare(
          "SELECT c.start_date,k.full_name candidate_name FROM employee_onboarding_cases c JOIN recruitment_applications a ON a.id=c.application_id AND a.tenant_id=c.tenant_id JOIN recruitment_candidates k ON k.id=a.candidate_id AND k.tenant_id=a.tenant_id WHERE c.id=? AND c.tenant_id=? AND c.employee_id IS NULL",
        )
        .bind(b.caseId, tenant)
        .first<{ start_date: string; candidate_name: string }>();
      if (!caseRow)
        return Response.json(
          {
            error:
              "Caso de onboarding não encontrado ou já tem um colaborador associado.",
          },
          { status: 404 },
        );
      const organization = await db
        .prepare(
          "SELECT id FROM organizations WHERE id=? AND tenant_id=? AND status='Ativa'",
        )
        .bind(org, tenant)
        .first();
      if (!organization)
        return Response.json(
          { error: "Organização fora do âmbito autorizado." },
          { status: 403 },
        );
      if (
        await db
          .prepare(
            "SELECT id FROM employees WHERE tenant_id=? AND employee_number=?",
          )
          .bind(tenant, employeeNumber)
          .first()
      )
        return Response.json(
          { error: "O número de colaborador já existe." },
          { status: 409 },
        );
      const parts = caseRow.candidate_name.trim().split(/\s+/),
        firstName = parts[0],
        lastName = parts.slice(1).join(" ") || parts[0],
        employeeId = uid();
      entityId = b.caseId;
      entityType = "onboarding";
      await db.batch([
        db
          .prepare(
            "INSERT INTO employees (id,tenant_id,employee_number,first_name,last_name,organization_id,job_title,hire_date,status,created_at) VALUES (?,?,?,?,?,?,?,?,'Pendente',?)",
          )
          .bind(
            employeeId,
            tenant,
            employeeNumber,
            firstName,
            lastName,
            org,
            b.jobTitle.trim(),
            caseRow.start_date,
            now,
          ),
        db
          .prepare(
            "UPDATE employee_onboarding_cases SET employee_id=? WHERE id=? AND tenant_id=? AND employee_id IS NULL",
          )
          .bind(employeeId, b.caseId, tenant),
      ]);
      const linked = await db
        .prepare(
          "SELECT 1 FROM employee_onboarding_cases WHERE id=? AND tenant_id=? AND employee_id=?",
        )
        .bind(b.caseId, tenant, employeeId)
        .first();
      if (!linked)
        return Response.json(
          {
            error:
              "A ficha foi criada, mas o caso já tinha sido associado entretanto. Associe-a manualmente em 'Associar existente'.",
          },
          { status: 409 },
        );
    } else if (b.type === "linkSpontaneousApplication") {
      const spontaneous = await db
        .prepare(
          "SELECT candidate_id FROM recruitment_spontaneous_applications WHERE id=? AND tenant_id=? AND status='Em avaliação'",
        )
        .bind(b.spontaneousId, tenant)
        .first<{ candidate_id: string }>();
      const requisition = await db
        .prepare(
          "SELECT id FROM recruitment_requisitions WHERE id=? AND tenant_id=? AND status='Aberta' AND (? IS NULL OR organization_id=?)",
        )
        .bind(b.requisitionId, tenant, scope, scope)
        .first();
      if (!spontaneous || !requisition)
        return Response.json(
          {
            error:
              "Candidatura espontânea ou vaga aberta não encontrada no âmbito autorizado.",
          },
          { status: 404 },
        );
      const applicationId = uid();
      entityId = b.spontaneousId;
      try {
        await db.batch([
          db
            .prepare(
              "INSERT INTO recruitment_applications (id,tenant_id,requisition_id,candidate_id,status,rating,decision_note,created_by,created_at,updated_at) VALUES (?,?,?,?,'Recebida',NULL,NULL,?,?,?)",
            )
            .bind(applicationId, tenant, b.requisitionId, spontaneous.candidate_id, s.email, now, now),
          db
            .prepare(
              "UPDATE recruitment_spontaneous_applications SET status='Associada',linked_application_id=?,decided_by=?,decided_at=? WHERE id=? AND tenant_id=? AND status='Em avaliação'",
            )
            .bind(applicationId, s.email, now, b.spontaneousId, tenant),
        ]);
      } catch (e) {
        const classified = classifyDataError(e, "");
        if (classified.code === "CONFLICT")
          return Response.json(
            { error: "Este candidato já tem uma candidatura para esta vaga." },
            { status: 409 },
          );
        throw e;
      }
    } else if (b.type === "archiveSpontaneousApplication") {
      entityId = b.spontaneousId;
      const result = await db
        .prepare(
          "UPDATE recruitment_spontaneous_applications SET status='Arquivada',note=?,decided_by=?,decided_at=? WHERE id=? AND tenant_id=? AND status='Em avaliação'",
        )
        .bind(b.note?.trim() || null, s.email, now, b.spontaneousId, tenant)
        .run();
      if (!Number(result.meta.changes || 0))
        return Response.json(
          {
            error:
              "Candidatura espontânea não encontrada ou já decidida.",
          },
          { status: 409 },
        );
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
