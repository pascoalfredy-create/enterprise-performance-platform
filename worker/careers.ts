import { classifyDataError } from "../lib/api-error.ts";

const uid = () => crypto.randomUUID();
const digestBytes = async (v: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", v)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const fail = (e: unknown) => {
  const x = classifyDataError(
    e,
    "Não foi possível processar a candidatura.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};

// Public, unauthenticated careers page API: job-seekers never have a
// platform account, so this route is special-cased in worker/index.ts's
// fetch() to bypass the blanket /api/ Supabase auth gate entirely — the
// only genuinely anonymous write surface in the platform. There is no
// KV/rate-limiter binding available in this Worker, so abuse is bounded
// by simple per-tenant daily caps computed from existing data rather
// than a dedicated throttle table.
const DAILY_APPLICATION_CAP = 200;
const DAILY_DOCUMENT_CAP = 600;
const DOCUMENT_TYPES = ["CV", "Carta de Apresentação", "Certificado Académico", "Outro"];
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

async function resolveTenant(db: D1Database, slug: string) {
  return db
    .prepare("SELECT id,name FROM tenants WHERE slug=? AND status='Ativo'")
    .bind(slug)
    .first<{ id: string; name: string }>();
}

function profileFields(body: Record<string, string>) {
  const years = body.yearsExperience?.trim();
  return {
    birthDate: body.birthDate?.trim() || null,
    nationalId: body.nationalId?.trim() || null,
    address: body.address?.trim() || null,
    linkedinUrl: body.linkedinUrl?.trim() || null,
    currentEmployer: body.currentEmployer?.trim() || null,
    currentRole: body.currentRole?.trim() || null,
    yearsExperience: years ? Number(years) : null,
    highestEducation: body.highestEducation?.trim() || null,
    fieldOfStudy: body.fieldOfStudy?.trim() || null,
    institution: body.institution?.trim() || null,
    presentation: body.presentation?.trim() || "",
  };
}

export async function careersApi(
  request: Request,
  db: D1Database,
  slug: string,
) {
  try {
    const tenant = await resolveTenant(db, slug);
    if (!tenant)
      return Response.json(
        { error: "Empresa não encontrada." },
        { status: 404 },
      );
    if (request.method === "GET") {
      const rows = await db
        .prepare(
          "SELECT r.id,r.title,r.department_code,r.positions,r.employment_type,r.target_start_date,r.status,o.name organization_name FROM recruitment_requisitions r JOIN organizations o ON o.id=r.organization_id AND o.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.status IN ('Aberta','Fechada','Cancelada') ORDER BY (r.status='Aberta') DESC,r.created_at DESC",
        )
        .bind(tenant.id)
        .all<{
          id: string;
          title: string;
          department_code: string | null;
          positions: number;
          employment_type: string;
          target_start_date: string;
          status: string;
          organization_name: string;
        }>();
      return Response.json({
        companyName: tenant.name,
        requisitions: rows.results.map((r) => ({
          id: r.id,
          title: r.title,
          departmentCode: r.department_code,
          positions: r.positions,
          employmentType: r.employment_type,
          targetStartDate: r.target_start_date,
          status: r.status,
          organizationName: r.organization_name,
        })),
      });
    }
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const body = (await request.json()) as Record<string, string>;
    const email = (body.email || "").trim().toLowerCase();
    const profile = profileFields(body);
    const spontaneous = body.type === "spontaneous";
    if (
      !body.fullName?.trim() ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      body.consent !== "on" ||
      profile.presentation.length < 20 ||
      (!spontaneous && !body.requisitionId) ||
      (profile.yearsExperience !== null &&
        (!Number.isInteger(profile.yearsExperience) ||
          profile.yearsExperience < 0))
    )
      return Response.json(
        {
          error:
            "Vaga (ou candidatura espontânea), nome, e-mail, consentimento e uma breve apresentação (mín. 20 carateres) são obrigatórios.",
        },
        { status: 400 },
      );
    if (!spontaneous) {
      const requisition = await db
        .prepare(
          "SELECT id FROM recruitment_requisitions WHERE id=? AND tenant_id=? AND status='Aberta'",
        )
        .bind(body.requisitionId, tenant.id)
        .first();
      if (!requisition)
        return Response.json(
          { error: "Vaga não encontrada ou já encerrada." },
          { status: 404 },
        );
    }
    const dailyCount = await db
      .prepare(
        "SELECT COUNT(*) n FROM recruitment_candidates WHERE tenant_id=? AND source='Website' AND created_at>=?",
      )
      .bind(tenant.id, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .first<{ n: number }>();
    if (Number(dailyCount?.n || 0) >= DAILY_APPLICATION_CAP)
      return Response.json(
        {
          error:
            "Limite diário de candidaturas atingido. Tente novamente mais tarde.",
        },
        { status: 429 },
      );
    const now = new Date().toISOString(),
      actor = "candidatura-publica";
    const existingCandidate = await db
      .prepare(
        "SELECT id FROM recruitment_candidates WHERE tenant_id=? AND email=?",
      )
      .bind(tenant.id, email)
      .first<{ id: string }>();
    const candidateId = existingCandidate?.id || uid();
    if (!existingCandidate)
      await db
        .prepare(
          "INSERT INTO recruitment_candidates (id,tenant_id,full_name,email,phone,source,consent_at,created_by,created_at,birth_date,national_id,address,linkedin_url,current_employer,current_role,years_experience,highest_education,field_of_study,institution,presentation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          candidateId,
          tenant.id,
          body.fullName.trim(),
          email,
          body.phone?.trim() || null,
          "Website",
          now,
          actor,
          now,
          profile.birthDate,
          profile.nationalId,
          profile.address,
          profile.linkedinUrl,
          profile.currentEmployer,
          profile.currentRole,
          profile.yearsExperience,
          profile.highestEducation,
          profile.fieldOfStudy,
          profile.institution,
          profile.presentation,
        )
        .run();
    else
      await db
        .prepare(
          "UPDATE recruitment_candidates SET full_name=?,phone=?,birth_date=?,national_id=?,address=?,linkedin_url=?,current_employer=?,current_role=?,years_experience=?,highest_education=?,field_of_study=?,institution=?,presentation=? WHERE id=? AND tenant_id=?",
        )
        .bind(
          body.fullName.trim(),
          body.phone?.trim() || null,
          profile.birthDate,
          profile.nationalId,
          profile.address,
          profile.linkedinUrl,
          profile.currentEmployer,
          profile.currentRole,
          profile.yearsExperience,
          profile.highestEducation,
          profile.fieldOfStudy,
          profile.institution,
          profile.presentation,
          candidateId,
          tenant.id,
        )
        .run();
    let entityId: string, action: string, summary: string;
    if (spontaneous) {
      entityId = uid();
      action = "PUBLIC_APPLY_SPONTANEOUS";
      summary = "Candidatura espontânea pública recebida";
      await db
        .prepare(
          "INSERT INTO recruitment_spontaneous_applications (id,tenant_id,candidate_id,status,created_by,created_at) VALUES (?,?,?,'Em avaliação',?,?)",
        )
        .bind(entityId, tenant.id, candidateId, actor, now)
        .run();
    } else {
      entityId = uid();
      action = "PUBLIC_APPLY";
      summary = `Candidatura pública recebida para a vaga ${body.requisitionId}`;
      try {
        await db
          .prepare(
            "INSERT INTO recruitment_applications (id,tenant_id,requisition_id,candidate_id,status,rating,decision_note,created_by,created_at,updated_at) VALUES (?,?,?,?,'Recebida',NULL,NULL,?,?,?)",
          )
          .bind(entityId, tenant.id, body.requisitionId, candidateId, actor, now, now)
          .run();
      } catch (e) {
        const classified = classifyDataError(e, "");
        if (classified.code === "CONFLICT")
          return Response.json(
            { error: "Já tem uma candidatura registada para esta vaga." },
            { status: 409 },
          );
        throw e;
      }
    }
    await db
      .prepare(
        "INSERT INTO audit_events (id,tenant_id,created_at,action,entity_type,entity_id,actor,summary) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(
        uid(),
        tenant.id,
        now,
        action,
        spontaneous ? "spontaneousApplication" : "recruitmentApplication",
        entityId,
        actor,
        summary,
      )
      .run();
    return Response.json({ success: true, candidateId });
  } catch (e) {
    return fail(e);
  }
}

export async function careersDocumentApi(
  request: Request,
  db: D1Database,
  bucket: R2Bucket,
  slug: string,
) {
  try {
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const tenant = await resolveTenant(db, slug);
    if (!tenant)
      return Response.json(
        { error: "Empresa não encontrada." },
        { status: 404 },
      );
    if (
      !(request.headers.get("content-type") || "").includes(
        "multipart/form-data",
      )
    )
      return Response.json(
        { error: "Formato de carregamento inválido." },
        { status: 400 },
      );
    const form = await request.formData(),
      file = form.get("file"),
      documentType = String(form.get("documentType") || ""),
      candidateId = String(form.get("candidateId") || "");
    if (!(file instanceof File))
      return Response.json(
        { error: "Selecione um ficheiro válido." },
        { status: 400 },
      );
    if (!DOCUMENT_TYPES.includes(documentType))
      return Response.json(
        { error: "Tipo de documento inválido." },
        { status: 400 },
      );
    if (
      !ALLOWED_MIME.includes(file.type) ||
      file.size < 1 ||
      file.size > MAX_DOCUMENT_BYTES
    )
      return Response.json(
        { error: "Apenas PDF, JPG ou PNG até 5 MB." },
        { status: 400 },
      );
    const candidate = await db
      .prepare(
        "SELECT id FROM recruitment_candidates WHERE id=? AND tenant_id=?",
      )
      .bind(candidateId, tenant.id)
      .first();
    if (!candidate)
      return Response.json(
        { error: "Candidato fora do âmbito autorizado." },
        { status: 403 },
      );
    const dailyCount = await db
      .prepare(
        "SELECT COUNT(*) n FROM recruitment_candidate_documents WHERE tenant_id=? AND uploaded_at>=?",
      )
      .bind(tenant.id, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .first<{ n: number }>();
    if (Number(dailyCount?.n || 0) >= DAILY_DOCUMENT_CAP)
      return Response.json(
        {
          error:
            "Limite diário de documentos atingido. Tente novamente mais tarde.",
        },
        { status: 429 },
      );
    const now = new Date().toISOString(),
      bytes = await file.arrayBuffer(),
      evidence = await digestBytes(bytes),
      entityId = uid(),
      storageKey = `${tenant.id}/careers/candidates/${candidateId}/documents/${entityId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await bucket.put(storageKey, bytes, {
      httpMetadata: { contentType: file.type },
      customMetadata: { tenantId: tenant.id, candidateId, evidenceHash: evidence },
    });
    try {
      await db.batch([
        db
          .prepare(
            "INSERT INTO recruitment_candidate_documents (id,tenant_id,candidate_id,document_type,file_name,mime_type,file_size,storage_key,evidence_hash,uploaded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            entityId,
            tenant.id,
            candidateId,
            documentType,
            file.name,
            file.type,
            file.size,
            storageKey,
            evidence,
            now,
          ),
        db
          .prepare(
            "INSERT INTO audit_events (id,tenant_id,created_at,action,entity_type,entity_id,actor,summary) VALUES (?,?,?,?,?,?,?,?)",
          )
          .bind(
            uid(),
            tenant.id,
            now,
            "PUBLIC_APPLY_DOCUMENT",
            "candidateDocument",
            entityId,
            "candidatura-publica",
            `Documento ${documentType} carregado para candidato ${candidateId}`,
          ),
      ]);
    } catch (e) {
      await bucket.delete(storageKey);
      throw e;
    }
    return Response.json({ success: true, documentId: entityId }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
