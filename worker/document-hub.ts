import { classifyDataError } from "../lib/api-error";
type Security = {
  tenantId: string;
  organizationId: string | null;
  email: string;
  role: string;
  modules: string[];
};
type Env = {
  OCR_API_URL?: string;
  OCR_API_KEY?: string;
  OCR_PROVIDER?: string;
};
const uid = () => crypto.randomUUID();
const hash = async (v: ArrayBuffer) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", v))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const modules = [
  "CORE",
  "FINANCE_FP&A",
  "HCM",
  "PAYROLL",
  "WORKFORCE_PLANNING",
  "PERFORMANCE_MANAGEMENT",
  "ANALYTICS_REPORTING",
  "WORKFLOW",
  "INTEGRATIONS",
];
export async function documentHubApi(
  request: Request,
  db: D1Database,
  bucket: R2Bucket,
  env: Env,
  s: Security,
) {
  try {
    const t = s.tenantId,
      org = s.organizationId,
      url = new URL(request.url),
      snapshot = async () => {
        const [folders, docs] = await Promise.all([
          db
            .prepare(
              "SELECT * FROM document_folders WHERE tenant_id=? AND (? IS NULL OR organization_id IS NULL OR organization_id=?) ORDER BY module_code,name",
            )
            .bind(t, org, org)
            .all(),
          db
            .prepare(
              "SELECT d.*,f.name folder_name FROM module_documents d JOIN document_folders f ON f.id=d.folder_id AND f.tenant_id=d.tenant_id WHERE d.tenant_id=? AND (? IS NULL OR d.organization_id IS NULL OR d.organization_id=?) ORDER BY d.uploaded_at DESC",
            )
            .bind(t, org, org)
            .all(),
        ]);
        return {
          folders: folders.results,
          documents: docs.results,
          modules: s.modules.filter((x) => modules.includes(x)),
          ocrConfigured: !!env.OCR_API_URL,
          ocrProvider: env.OCR_API_URL ? env.OCR_PROVIDER || "API OCR" : null,
        };
      };
    if (request.method === "GET") {
      const download = url.searchParams.get("download");
      if (!download) return Response.json(await snapshot());
      const row = await db
        .prepare(
          "SELECT * FROM module_documents WHERE id=? AND tenant_id=? AND (? IS NULL OR organization_id IS NULL OR organization_id=?) AND status<>'Rejeitado'",
        )
        .bind(download, t, org, org)
        .first<Record<string, unknown>>();
      if (!row)
        return Response.json(
          { error: "Documento não encontrado no âmbito autorizado." },
          { status: 404 },
        );
      const object = await bucket.get(String(row.storage_key));
      if (!object)
        return Response.json(
          { error: "Conteúdo documental não encontrado." },
          { status: 404 },
        );
      return new Response(object.body, {
        headers: {
          "content-type": String(row.mime_type),
          "content-disposition": `attachment; filename="${String(row.file_name).replace(/[\r\n"\\]/g, "_")}"`,
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
        file = form.get("file"),
        moduleCode = String(form.get("moduleCode") || ""),
        folderId = String(form.get("folderId") || ""),
        title = String(form.get("title") || "").trim();
      if (
        !(file instanceof File) ||
        !title ||
        !s.modules.includes(moduleCode) ||
        !modules.includes(moduleCode)
      )
        return Response.json(
          {
            error: "Módulo, pasta, título e ficheiro válidos são obrigatórios.",
          },
          { status: 400 },
        );
      if (
        file.size < 1 ||
        file.size > 20 * 1024 * 1024 ||
        ![
          "application/pdf",
          "image/jpeg",
          "image/png",
          "text/csv",
          "text/plain",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ].includes(file.type)
      )
        return Response.json(
          { error: "Formato não permitido ou ficheiro superior a 20 MB." },
          { status: 400 },
        );
      const folder = await db
        .prepare(
          "SELECT * FROM document_folders WHERE id=? AND tenant_id=? AND module_code=? AND (? IS NULL OR organization_id IS NULL OR organization_id=?) AND status='Ativa'",
        )
        .bind(folderId, t, moduleCode, org, org)
        .first();
      if (!folder)
        return Response.json(
          { error: "Pasta fora do âmbito autorizado." },
          { status: 403 },
        );
      const bytes = await file.arrayBuffer(),
        evidence = await hash(bytes),
        latest = await db
          .prepare(
            "SELECT COALESCE(MAX(version_number),0) n FROM module_documents WHERE tenant_id=? AND folder_id=? AND title=?",
          )
          .bind(t, folderId, title)
          .first<Record<string, unknown>>(),
        version = Number(latest?.n || 0) + 1,
        id = uid(),
        key = `${t}/${moduleCode}/${folderId}/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
        ocr = ["application/pdf", "image/jpeg", "image/png"].includes(file.type)
          ? "Pendente"
          : "Não aplicável",
        now = new Date().toISOString();
      await bucket.put(key, bytes, {
        httpMetadata: { contentType: file.type },
        customMetadata: { tenantId: t, moduleCode, evidenceHash: evidence },
      });
      try {
        await db.batch([
          db
            .prepare(
              "INSERT INTO module_documents (id,tenant_id,organization_id,folder_id,module_code,title,file_name,mime_type,file_size,storage_key,evidence_hash,version_number,status,ocr_status,uploaded_by,uploaded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              id,
              t,
              org,
              folderId,
              moduleCode,
              title,
              file.name,
              file.type,
              file.size,
              key,
              evidence,
              version,
              "Carregado",
              ocr,
              s.email,
              now,
            ),
          db
            .prepare(
              "INSERT INTO audit_events (id,tenant_id,created_at,action,entity_type,entity_id,actor,summary) VALUES (?,?,?,?,?,?,?,?)",
            )
            .bind(
              uid(),
              t,
              now,
              "document.uploaded",
              "moduleDocument",
              id,
              s.email,
              `${moduleCode} · ${title} v${version} carregado`,
            ),
        ]);
      } catch (e) {
        await bucket.delete(key);
        throw e;
      }
      return Response.json(await snapshot(), { status: 201 });
    }
    const body = (await request.json()) as Record<string, string>,
      now = new Date().toISOString();
    if (body.type === "provisionFolders") {
      const recommended: Record<string, string> = {
        CORE: "Governança e administração",
        "FINANCE_FP&A": "Actual, Budget e Forecast",
        HCM: "Dossiês de colaboradores",
        PAYROLL: "Processamentos salariais",
        WORKFORCE_PLANNING: "Planos de workforce",
        PERFORMANCE_MANAGEMENT: "Objetivos e avaliações",
        ANALYTICS_REPORTING: "Relatórios emitidos",
        WORKFLOW: "Evidências de aprovação",
        INTEGRATIONS: "Ficheiros de integração",
      };
      for (const moduleCode of s.modules) {
        const name = recommended[moduleCode];
        if (!name) continue;
        await db
          .prepare(
            "INSERT OR IGNORE INTO document_folders VALUES (?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            `${t}:${org || "tenant"}:recommended:${moduleCode}`,
            t,
            org,
            moduleCode,
            name,
            null,
            "Ativa",
            s.email,
            now,
          )
          .run();
      }
    } else if (body.type === "createFolder") {
      if (!s.modules.includes(body.moduleCode) || !body.name?.trim())
        return Response.json(
          { error: "Módulo e nome da pasta são obrigatórios." },
          { status: 400 },
        );
      await db
        .prepare("INSERT INTO document_folders VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(
          uid(),
          t,
          org,
          body.moduleCode,
          body.name.trim(),
          body.parentId || null,
          "Ativa",
          s.email,
          now,
        )
        .run();
    } else if (body.type === "processOcr") {
      const doc = await db
        .prepare(
          "SELECT * FROM module_documents WHERE id=? AND tenant_id=? AND (? IS NULL OR organization_id IS NULL OR organization_id=?) AND ocr_status IN ('Pendente','Falhou')",
        )
        .bind(body.documentId || "", t, org, org)
        .first<Record<string, unknown>>();
      if (!doc)
        return Response.json(
          { error: "Documento pendente de OCR não encontrado." },
          { status: 404 },
        );
      if (!env.OCR_API_URL)
        return Response.json(
          {
            error:
              "O conector OCR ainda não está configurado. O documento permanece seguro na fila.",
          },
          { status: 503 },
        );
      const object = await bucket.get(String(doc.storage_key));
      if (!object)
        return Response.json(
          { error: "Conteúdo não encontrado." },
          { status: 404 },
        );
      await db
        .prepare(
          "UPDATE module_documents SET ocr_status='Em processamento' WHERE id=? AND tenant_id=?",
        )
        .bind(doc.id, t)
        .run();
      try {
        const response = await fetch(env.OCR_API_URL, {
          method: "POST",
          headers: {
            "content-type": String(doc.mime_type),
            authorization: env.OCR_API_KEY ? `Bearer ${env.OCR_API_KEY}` : "",
            "x-document-hash": String(doc.evidence_hash),
          },
          body: object.body,
        });
        if (!response.ok) throw new Error("OCR provider failed");
        const result = (await response.json()) as {
          fields?: Record<string, unknown>;
          data?: { fields?: Record<string, unknown>; confidence?: number };
          confidenceBps?: number;
          confidence?: number;
        };
        const fields = result.fields || result.data?.fields || {},
          rawConfidence =
            result.confidenceBps ??
            (Number(result.confidence ?? result.data?.confidence ?? 0) <= 1
              ? Number(result.confidence ?? result.data?.confidence ?? 0) * 10000
              : Number(result.confidence ?? result.data?.confidence ?? 0) * 100),
          confidence = Math.max(0, Math.min(10000, Math.trunc(rawConfidence))),
          payload = JSON.stringify(fields),
          payloadHash = await hash(new TextEncoder().encode(payload).buffer),
          provider = env.OCR_PROVIDER || "API OCR";
        await db.batch([
          db
            .prepare(
              "UPDATE module_documents SET ocr_status='Extraído',ocr_confidence_bps=?,ocr_payload_json=?,ocr_provider=?,ocr_processed_at=? WHERE id=? AND tenant_id=? AND ocr_status='Em processamento'",
            )
            .bind(confidence, payload, provider, now, doc.id, t),
          db
            .prepare(
              "INSERT INTO document_ocr_events VALUES (?,?,?,?,?,?,?,?,?)",
            )
            .bind(uid(), t, doc.id, "Processado", provider, confidence, payloadHash, s.email, now),
        ]);
      } catch {
        await db.batch([
          db
            .prepare(
              "UPDATE module_documents SET ocr_status='Falhou' WHERE id=? AND tenant_id=? AND ocr_status='Em processamento'",
            )
            .bind(doc.id, t),
          db
            .prepare("INSERT INTO document_ocr_events VALUES (?,?,?,?,?,?,?,?,?)")
            .bind(uid(), t, doc.id, "Falhou", env.OCR_PROVIDER || "API OCR", null, null, s.email, now),
        ]);
        return Response.json(
          {
            error:
              "O OCR não concluiu. O original foi preservado e pode ser reprocessado.",
          },
          { status: 502 },
        );
      }
    } else if (body.type === "validate") {
      if (!body.documentId || !body.note?.trim())
        return Response.json(
          { error: "Documento e nota de validação são obrigatórios." },
          { status: 400 },
        );
      let correctedPayload: string | null = null;
      if (body.correctedPayload) {
        try {
          correctedPayload = JSON.stringify(JSON.parse(body.correctedPayload));
        } catch {
          return Response.json({ error: "Os campos corrigidos não contêm JSON válido." }, { status: 400 });
        }
      }
      const document = await db
        .prepare("SELECT ocr_status,ocr_provider,ocr_confidence_bps,ocr_payload_json FROM module_documents WHERE id=? AND tenant_id=? AND status='Carregado'")
        .bind(body.documentId, t)
        .first<Record<string, unknown>>();
      if (!document)
        return Response.json({ error: "Documento carregado não encontrado." }, { status: 404 });
      const payload = correctedPayload || (document.ocr_payload_json ? String(document.ocr_payload_json) : null),
        payloadHash = payload ? await hash(new TextEncoder().encode(payload).buffer) : null;
      await db.batch([
        db
          .prepare(
            "UPDATE module_documents SET status='Validado',ocr_status=CASE WHEN ocr_status='Extraído' THEN 'Validado' ELSE ocr_status END,validated_by=?,validated_at=?,validation_note=?,ocr_validated_payload_json=? WHERE id=? AND tenant_id=? AND status='Carregado'",
          )
          .bind(s.email, now, body.note.trim(), payload, body.documentId, t),
        db
          .prepare("INSERT INTO document_ocr_events VALUES (?,?,?,?,?,?,?,?,?)")
          .bind(uid(), t, body.documentId, "Validado", document.ocr_provider || null, document.ocr_confidence_bps || null, payloadHash, s.email, now),
      ]);
    } else
      return Response.json({ error: "Comando inválido." }, { status: 400 });
    return Response.json(await snapshot());
  } catch (error) {
    const x = classifyDataError(
      error,
      "Não foi possível concluir a operação documental.",
    );
    return Response.json(
      { error: x.message, code: x.code },
      { status: x.status },
    );
  }
}
