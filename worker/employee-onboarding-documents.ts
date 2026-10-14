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
    "Não foi possível processar os documentos de integração.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};

export async function employeeOnboardingDocumentsApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    const tenant = security.tenantId,
      scope = security.organizationId;
    if (request.method === "GET") {
      const documents = await db
        .prepare(
          "SELECT d.*,e.first_name||' '||e.last_name employee_name,e.employee_number FROM employee_onboarding_documents d JOIN employees e ON e.id=d.employee_id AND e.tenant_id=d.tenant_id WHERE d.tenant_id=? AND (? IS NULL OR e.organization_id=?) ORDER BY d.published_at DESC",
        )
        .bind(tenant, scope, scope)
        .all();
      return Response.json({ documents: documents.results });
    }
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const body = (await request.json()) as Record<string, string>,
      now = new Date().toISOString();
    if (body.type !== "publishOnboardingDocument")
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
    if (!body.title?.trim())
      return Response.json(
        { error: "O título do documento é obrigatório." },
        { status: 400 },
      );
    if (body.documentUrl && !/^https?:\/\//.test(body.documentUrl.trim()))
      return Response.json(
        { error: "O link do documento deve ser um URL válido." },
        { status: 400 },
      );
    const id = uid();
    await db
      .prepare(
        "INSERT INTO employee_onboarding_documents (id,tenant_id,employee_id,title,description,document_url,status,published_by,published_at) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        tenant,
        body.employeeId,
        body.title.trim(),
        body.description?.trim() || null,
        body.documentUrl?.trim() || null,
        "Pendente",
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
        "employeeOnboardingDocument",
        id,
        security.email,
        `Documento de integração enviado para assinatura: ${body.title.trim()}`,
      )
      .run();
    return Response.json({ id, status: "Pendente" }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
