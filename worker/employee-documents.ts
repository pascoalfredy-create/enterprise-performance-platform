import { classifyDataError } from "../lib/api-error";
type Security = {
  tenantId: string;
  organizationId: string | null;
  email: string;
  role: string;
};
const uid = () => crypto.randomUUID();
const digest = async (v: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const digestBytes = async (v: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", v)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export async function employeeDocumentsApi(
  request: Request,
  db: D1Database,
  bucket: R2Bucket,
  security: Security,
) {
  try {
    const tenant = security.tenantId,
      scope = security.organizationId,
      now = new Date().toISOString(),
      url = new URL(request.url);
    const snapshot = async () => {
      const [types, documents, employees] = await Promise.all([
        db
          .prepare(
            "SELECT * FROM employee_document_types WHERE tenant_id=? ORDER BY category,name",
          )
          .bind(tenant)
          .all(),
        db
          .prepare(
            "SELECT d.*,t.code type_code,t.name type_name,t.category,t.confidentiality,e.employee_number,e.first_name||' '||e.last_name employee_name,o.name organization_name FROM employee_documents d JOIN employee_document_types t ON t.id=d.document_type_id AND t.tenant_id=d.tenant_id JOIN employees e ON e.id=d.employee_id AND e.tenant_id=d.tenant_id JOIN organizations o ON o.id=e.organization_id AND o.tenant_id=e.tenant_id WHERE d.tenant_id=? AND (? IS NULL OR e.organization_id=?) ORDER BY d.submitted_at DESC",
          )
          .bind(tenant, scope, scope)
          .all(),
        db
          .prepare(
            "SELECT e.id,e.employee_number,e.first_name||' '||e.last_name name,o.name organization_name FROM employees e JOIN organizations o ON o.id=e.organization_id AND o.tenant_id=e.tenant_id WHERE e.tenant_id=? AND (? IS NULL OR e.organization_id=?) AND e.status='Ativo' ORDER BY e.first_name,e.last_name",
          )
          .bind(tenant, scope, scope)
          .all(),
      ]);
      return {
        types: types.results,
        documents: documents.results,
        employees: employees.results,
      };
    };
    if (request.method === "GET") {
      const download = url.searchParams.get("download");
      if (!download) return Response.json(await snapshot());
      const row = await db
        .prepare(
          "SELECT d.storage_key,d.file_name,d.mime_type FROM employee_documents d JOIN employees e ON e.id=d.employee_id AND e.tenant_id=d.tenant_id WHERE d.id=? AND d.tenant_id=? AND (? IS NULL OR e.organization_id=?) AND d.status='Aprovado'",
        )
        .bind(download, tenant, scope, scope)
        .first<{ storage_key: string; file_name: string; mime_type: string }>();
      if (!row)
        return Response.json(
          { error: "Documento aprovado não encontrado no âmbito autorizado." },
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
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    if (
      (request.headers.get("content-type") || "").includes(
        "multipart/form-data",
      )
    ) {
      const form = await request.formData(),
        file = form.get("file");
      if (!(file instanceof File))
        return Response.json(
          { error: "Selecione um ficheiro válido." },
          { status: 400 },
        );
      const allowed = ["application/pdf", "image/jpeg", "image/png"];
      if (
        !allowed.includes(file.type) ||
        file.size < 1 ||
        file.size > 10 * 1024 * 1024
      )
        return Response.json(
          { error: "Apenas PDF, JPG ou PNG entre 1 byte e 10 MB." },
          { status: 400 },
        );
      const employeeId = String(form.get("employeeId") || ""),
        documentTypeId = String(form.get("documentTypeId") || ""),
        reference = String(form.get("reference") || "").trim(),
        issueDate = String(form.get("issueDate") || ""),
        expiryDate = String(form.get("expiryDate") || "") || null,
        employee = await db
          .prepare(
            "SELECT e.* FROM employees e WHERE e.id=? AND e.tenant_id=? AND (? IS NULL OR e.organization_id=?)",
          )
          .bind(employeeId, tenant, scope, scope)
          .first();
      if (!employee)
        return Response.json(
          { error: "Colaborador fora do âmbito autorizado." },
          { status: 403 },
        );
      if (!documentTypeId || !reference || !issueDate)
        return Response.json(
          { error: "Tipo, referência e emissão são obrigatórios." },
          { status: 400 },
        );
      const bytes = await file.arrayBuffer(),
        evidence = await digestBytes(bytes),
        latest = await db
          .prepare(
            "SELECT COALESCE(MAX(version_number),0) version FROM employee_documents WHERE tenant_id=? AND employee_id=? AND document_type_id=?",
          )
          .bind(tenant, employeeId, documentTypeId)
          .first<{ version: number }>(),
        version = Number(latest?.version || 0) + 1,
        entityId = uid(),
        storageKey = `${tenant}/employees/${employeeId}/documents/${entityId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await bucket.put(storageKey, bytes, {
        httpMetadata: { contentType: file.type },
        customMetadata: {
          tenantId: tenant,
          employeeId,
          evidenceHash: evidence,
        },
      });
      try {
        await db.batch([
          db
            .prepare(
              "INSERT INTO employee_documents (id,tenant_id,employee_id,document_type_id,reference,issue_date,expiry_date,file_name,mime_type,file_size,storage_key,evidence_hash,version_number,status,submitted_by,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'Pendente',?,?)",
            )
            .bind(
              entityId,
              tenant,
              employeeId,
              documentTypeId,
              reference,
              issueDate,
              expiryDate,
              file.name,
              file.type,
              file.size,
              storageKey,
              evidence,
              version,
              security.email,
              now,
            ),
          db
            .prepare(
              "INSERT INTO audit_events (id,tenant_id,actor,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?,?)",
            )
            .bind(
              uid(),
              tenant,
              security.email,
              "employee.document.uploaded",
              "employeeDocument",
              entityId,
              `Documento ${reference} versão ${version} carregado`,
              now,
            ),
        ]);
      } catch (error) {
        await bucket.delete(storageKey);
        throw error;
      }
      return Response.json(await snapshot(), { status: 201 });
    }
    const body = (await request.json()) as Record<string, string>;
    let entityId = "",
      action = "",
      summary = "";
    if (body.type === "createType") {
      if (scope)
        return Response.json(
          { error: "Tipos documentais exigem âmbito de todo o tenant." },
          { status: 403 },
        );
      if (
        !body.code?.trim() ||
        !body.name?.trim() ||
        !body.category?.trim() ||
        !["Normal", "Confidencial", "Restrito"].includes(body.confidentiality)
      )
        return Response.json(
          {
            error:
              "Código, nome, categoria e confidencialidade são obrigatórios.",
          },
          { status: 400 },
        );
      entityId = uid();
      action = "employee.document_type.created";
      summary = `Tipo ${body.code.trim().toUpperCase()} criado`;
      await db
        .prepare(
          "INSERT INTO employee_document_types VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          entityId,
          tenant,
          body.code.trim().toUpperCase(),
          body.name.trim(),
          body.category.trim(),
          body.requiresExpiry === "1" ? 1 : 0,
          body.confidentiality,
          "Ativo",
          security.email,
          now,
        )
        .run();
    } else if (body.type === "registerDocument") {
      const employee = await db
        .prepare(
          "SELECT e.* FROM employees e WHERE e.id=? AND e.tenant_id=? AND (? IS NULL OR e.organization_id=?)",
        )
        .bind(body.employeeId || "", tenant, scope, scope)
        .first();
      if (!employee)
        return Response.json(
          { error: "Colaborador fora do âmbito autorizado." },
          { status: 403 },
        );
      if (
        !body.documentTypeId ||
        !body.reference?.trim() ||
        !body.issueDate ||
        !body.fileName?.trim() ||
        !body.mimeType?.trim()
      )
        return Response.json(
          {
            error:
              "Tipo, referência, emissão e metadados do ficheiro são obrigatórios.",
          },
          { status: 400 },
        );
      const latest = await db
          .prepare(
            "SELECT COALESCE(MAX(version_number),0) version FROM employee_documents WHERE tenant_id=? AND employee_id=? AND document_type_id=?",
          )
          .bind(tenant, body.employeeId, body.documentTypeId)
          .first<{ version: number }>(),
        version = Number(latest?.version || 0) + 1,
        fileSize = Math.max(0, Math.trunc(Number(body.fileSize || 0))),
        storageKey = `pending/${tenant}/${body.employeeId}/${uid()}/${body.fileName.trim()}`;
      entityId = uid();
      action = "employee.document.registered";
      summary = `Documento ${body.reference.trim()} versão ${version} registado`;
      const evidence = await digest(
        `${tenant}|${body.employeeId}|${body.documentTypeId}|${body.reference.trim()}|${body.issueDate}|${body.expiryDate || ""}|${body.fileName.trim()}|${fileSize}|${version}`,
      );
      await db
        .prepare(
          "INSERT INTO employee_documents (id,tenant_id,employee_id,document_type_id,reference,issue_date,expiry_date,file_name,mime_type,file_size,storage_key,evidence_hash,version_number,status,submitted_by,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'Pendente',?,?)",
        )
        .bind(
          entityId,
          tenant,
          body.employeeId,
          body.documentTypeId,
          body.reference.trim(),
          body.issueDate,
          body.expiryDate || null,
          body.fileName.trim(),
          body.mimeType.trim(),
          fileSize,
          storageKey,
          evidence,
          version,
          security.email,
          now,
        )
        .run();
    } else if (body.type === "decideDocument") {
      if (
        !body.documentId ||
        !["Aprovado", "Rejeitado"].includes(body.decision) ||
        !body.note?.trim()
      )
        return Response.json(
          { error: "Documento, decisão e nota são obrigatórios." },
          { status: 400 },
        );
      const changed = await db
        .prepare(
          "UPDATE employee_documents SET status=?,decided_by=?,decided_at=?,decision_note=? WHERE id=? AND tenant_id=? AND status='Pendente' AND submitted_by<>?",
        )
        .bind(
          body.decision,
          security.email,
          now,
          body.note.trim(),
          body.documentId,
          tenant,
          security.email,
        )
        .run();
      if (!Number(changed.meta.changes || 0))
        return Response.json(
          { error: "A decisão exige maker-checker e documento pendente." },
          { status: 409 },
        );
      entityId = body.documentId;
      action = "employee.document.decided";
      summary = `Documento ${body.decision.toLowerCase()}`;
    } else
      return Response.json(
        { error: "Comando documental desconhecido." },
        { status: 400 },
      );
    await db
      .prepare(
        "INSERT INTO audit_events (id,tenant_id,actor,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(
        uid(),
        tenant,
        security.email,
        action,
        "employeeDocument",
        entityId,
        summary,
        now,
      )
      .run();
    return Response.json(await snapshot(), { status: 201 });
  } catch (error) {
    const x = classifyDataError(
      error,
      "Não foi possível processar o documento do colaborador.",
    );
    return Response.json(
      { error: x.message, code: x.code },
      { status: x.status },
    );
  }
}
