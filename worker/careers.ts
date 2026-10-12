import { classifyDataError } from "../lib/api-error.ts";

const uid = () => crypto.randomUUID();
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
// by a simple per-tenant daily cap computed from existing data rather
// than a dedicated throttle table.
const DAILY_APPLICATION_CAP = 200;

export async function careersApi(
  request: Request,
  db: D1Database,
  slug: string,
) {
  try {
    const tenant = await db
      .prepare("SELECT id,name FROM tenants WHERE slug=? AND status='Ativo'")
      .bind(slug)
      .first<{ id: string; name: string }>();
    if (!tenant)
      return Response.json(
        { error: "Empresa não encontrada." },
        { status: 404 },
      );
    if (request.method === "GET") {
      const rows = await db
        .prepare(
          "SELECT r.id,r.title,r.department_code,r.positions,r.employment_type,r.target_start_date,o.name organization_name FROM recruitment_requisitions r JOIN organizations o ON o.id=r.organization_id AND o.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.status='Aberta' ORDER BY r.created_at DESC",
        )
        .bind(tenant.id)
        .all<{
          id: string;
          title: string;
          department_code: string | null;
          positions: number;
          employment_type: string;
          target_start_date: string;
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
          organizationName: r.organization_name,
        })),
      });
    }
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const body = (await request.json()) as Record<string, string>;
    const email = (body.email || "").trim().toLowerCase();
    if (
      !body.requisitionId ||
      !body.fullName?.trim() ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      body.consent !== "on"
    )
      return Response.json(
        {
          error: "Vaga, nome, e-mail e consentimento são obrigatórios.",
        },
        { status: 400 },
      );
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
          "INSERT INTO recruitment_candidates (id,tenant_id,full_name,email,phone,source,consent_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
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
        )
        .run();
    const applicationId = uid();
    try {
      await db
        .prepare(
          "INSERT INTO recruitment_applications (id,tenant_id,requisition_id,candidate_id,status,rating,decision_note,created_by,created_at,updated_at) VALUES (?,?,?,?,'Recebida',NULL,NULL,?,?,?)",
        )
        .bind(applicationId, tenant.id, body.requisitionId, candidateId, actor, now, now)
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
    await db
      .prepare(
        "INSERT INTO audit_events (id,tenant_id,created_at,action,entity_type,entity_id,actor,summary) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(
        uid(),
        tenant.id,
        now,
        "PUBLIC_APPLY",
        "recruitmentApplication",
        applicationId,
        actor,
        `Candidatura pública recebida para a vaga ${body.requisitionId}`,
      )
      .run();
    return Response.json({ success: true });
  } catch (e) {
    return fail(e);
  }
}
