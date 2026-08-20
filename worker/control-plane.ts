import { classifyDataError } from "../lib/api-error";

type Operator = {
  id: string;
  email_normalized: string;
  identity_subject?: string;
  role: "Platform Owner" | "Billing Operator" | "Support Auditor";
  status: string;
};
const uid = () => crypto.randomUUID();
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const actor = (request: Request) =>
  String(
    request.headers.get("x-ep-verified-user-email") ||
      request.headers.get("oai-authenticated-user-email") ||
      request.headers.get("x-openai-user-email") ||
      "",
  ).toLowerCase();
async function operatorContext(request: Request, db: D1Database) {
  const email = actor(request),
    subject =
      request.headers.get("x-ep-verified-user-sub") || `workspace:${email}`;
  if (!email) return null;
  const row = await db
    .prepare(
      "SELECT * FROM operator_users WHERE email_normalized=? AND status='Ativo'",
    )
    .bind(email)
    .first<Operator>();
  if (!row) return null;
  if (row.identity_subject && row.identity_subject !== subject) return null;
  if (!row.identity_subject)
    await db
      .prepare(
        "UPDATE operator_users SET identity_subject=?,updated_at=? WHERE id=? AND identity_subject IS NULL",
      )
      .bind(subject, new Date().toISOString(), row.id)
      .run();
  return row;
}
const apiError = (error: unknown) => {
  const x = classifyDataError(
    error,
    "Não foi possível processar a operação da plataforma.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};

export async function controlPlaneApi(request: Request, db: D1Database) {
  try {
    const operator = await operatorContext(request, db);
    if (!operator)
      return Response.json(
        { error: "Acesso reservado a operadores autorizados." },
        { status: 403 },
      );
    const now = new Date().toISOString();
    const snapshot = async () => {
      const [
        tenants,
        subscriptions,
        entitlements,
        invoices,
        changes,
        operators,
        audit,
        summary,
      ] = await Promise.all([
        db
          .prepare(
            "SELECT t.id,t.name,t.slug,t.status,t.created_at,p.country_code,p.base_currency,p.locale,a.email owner_email,(SELECT COUNT(*) FROM organizations o WHERE o.tenant_id=t.id) organization_count,(SELECT COUNT(*) FROM platform_users u WHERE u.tenant_id=t.id AND u.status='Ativo') active_users,(SELECT COUNT(*) FROM employees e WHERE e.tenant_id=t.id AND e.status='Ativo') active_employees FROM tenants t LEFT JOIN provisioning_orders p ON p.tenant_id=t.id LEFT JOIN subscriptions s ON s.tenant_id=t.id LEFT JOIN commerce_accounts a ON a.id=s.account_id ORDER BY t.created_at DESC",
          )
          .all(),
        db
          .prepare(
            "SELECT s.*,t.name tenant_name,a.email owner_email,(SELECT i.status FROM billing_invoices i WHERE i.checkout_id=s.checkout_id) invoice_status FROM subscriptions s JOIN tenants t ON t.id=s.tenant_id JOIN commerce_accounts a ON a.id=s.account_id ORDER BY s.created_at DESC",
          )
          .all(),
        db
          .prepare(
            "SELECT e.*,t.name tenant_name FROM module_entitlements e JOIN tenants t ON t.id=e.tenant_id ORDER BY t.name,e.module_code",
          )
          .all(),
        db
          .prepare(
            "SELECT i.*,a.email owner_email,c.bundle_code,c.billing_interval FROM billing_invoices i JOIN commerce_accounts a ON a.id=i.account_id JOIN checkout_sessions c ON c.id=i.checkout_id ORDER BY i.created_at DESC LIMIT 100",
          )
          .all(),
        db
          .prepare(
            "SELECT c.*,t.name tenant_name FROM control_plane_change_requests c JOIN tenants t ON t.id=c.tenant_id ORDER BY c.requested_at DESC LIMIT 100",
          )
          .all(),
        db
          .prepare(
            "SELECT id,email_normalized,role,status,mfa_required,created_at,updated_at FROM operator_users ORDER BY created_at",
          )
          .all(),
        db
          .prepare(
            "SELECT * FROM operator_audit_events ORDER BY occurred_at DESC LIMIT 50",
          )
          .all(),
        db
          .prepare(
            "SELECT (SELECT COUNT(*) FROM tenants) tenants,(SELECT COUNT(*) FROM subscriptions WHERE status='Ativa') active_subscriptions,(SELECT COUNT(*) FROM billing_invoices WHERE status='Aguarda pagamento') unpaid_invoices,(SELECT COUNT(*) FROM control_plane_change_requests WHERE status='Pendente') pending_changes,(SELECT COALESCE(SUM(total_minor),0) FROM billing_invoices WHERE status='Paga') collected_minor",
          )
          .first(),
      ]);
      return {
        operator: { email: operator.email_normalized, role: operator.role },
        tenants: tenants.results,
        subscriptions: subscriptions.results,
        entitlements: entitlements.results,
        invoices: invoices.results,
        changes: changes.results,
        operators: operators.results,
        audit: audit.results,
        summary,
      };
    };
    if (request.method === "GET") return Response.json(await snapshot());
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const body = (await request.json()) as Record<string, string>;
    if (body.type === "createOperator") {
      if (operator.role !== "Platform Owner")
        return Response.json(
          { error: "Apenas Platform Owner pode criar operadores." },
          { status: 403 },
        );
      const email = body.email?.trim().toLowerCase();
      if (
        !email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) ||
        !["Platform Owner", "Billing Operator", "Support Auditor"].includes(
          body.role,
        )
      )
        return Response.json(
          { error: "E-mail e função de operador válidos são obrigatórios." },
          { status: 400 },
        );
      const id = uid();
      await db
        .prepare(
          "INSERT INTO operator_users (id,email_normalized,identity_subject,role,status,mfa_required,created_at,updated_at) VALUES (?,?,NULL,?,'Ativo',1,?,?)",
        )
        .bind(id, email, body.role, now, now)
        .run();
      const evidence = await hash(
        `${operator.email_normalized}|createOperator|${id}|${now}`,
      );
      await db
        .prepare("INSERT INTO operator_audit_events VALUES (?,?,?,?,?,?,?,?)")
        .bind(
          uid(),
          operator.email_normalized,
          "CREATE_OPERATOR",
          "operator",
          id,
          body.reason?.trim() || "Operador autorizado",
          evidence,
          now,
        )
        .run();
    } else if (body.type === "requestChange") {
      if (operator.role === "Support Auditor")
        return Response.json(
          { error: "Support Auditor possui acesso apenas de leitura." },
          { status: 403 },
        );
      if (
        ![
          "Suspender subscrição",
          "Reativar subscrição",
          "Suspender módulo",
          "Reativar módulo",
        ].includes(body.changeType) ||
        !body.targetId ||
        !body.reason?.trim() ||
        body.reason.trim().length < 10
      )
        return Response.json(
          {
            error:
              "Tipo, alvo e motivo com pelo menos 10 caracteres são obrigatórios.",
          },
          { status: 400 },
        );
      const subscriptionChange = body.changeType.includes("subscrição"),
        target = subscriptionChange
          ? await db
              .prepare(
                "SELECT s.*,t.status tenant_status FROM subscriptions s JOIN tenants t ON t.id=s.tenant_id WHERE s.id=?",
              )
              .bind(body.targetId)
              .first<Record<string, unknown>>()
          : await db
              .prepare(
                "SELECT e.*,s.status subscription_status FROM module_entitlements e JOIN subscriptions s ON s.id=e.subscription_id WHERE e.id=? AND e.module_code<>'CORE'",
              )
              .bind(body.targetId)
              .first<Record<string, unknown>>();
      if (!target)
        return Response.json(
          { error: "Alvo elegível não encontrado." },
          { status: 404 },
        );
      const expected = body.changeType.startsWith("Suspender")
        ? "Ativo"
        : "Suspenso";
      if (target.status !== expected)
        return Response.json(
          { error: "O estado atual do alvo não permite esta alteração." },
          { status: 409 },
        );
      const id = uid(),
        targetType = subscriptionChange ? "subscription" : "entitlement",
        before = JSON.stringify(target);
      await db
        .prepare(
          "INSERT INTO control_plane_change_requests (id,change_type,target_type,target_id,tenant_id,reason,status,requested_by,requested_at,before_json) VALUES (?,?,?,?,?,?,'Pendente',?,?,?)",
        )
        .bind(
          id,
          body.changeType,
          targetType,
          body.targetId,
          target.tenant_id,
          body.reason.trim(),
          operator.email_normalized,
          now,
          before,
        )
        .run();
      const evidence = await hash(
        `${operator.email_normalized}|${body.changeType}|${body.targetId}|${before}|${now}`,
      );
      await db
        .prepare("INSERT INTO operator_audit_events VALUES (?,?,?,?,?,?,?,?)")
        .bind(
          uid(),
          operator.email_normalized,
          "REQUEST_CHANGE",
          targetType,
          body.targetId,
          body.reason.trim(),
          evidence,
          now,
        )
        .run();
    } else if (body.type === "decideChange") {
      if (operator.role !== "Platform Owner")
        return Response.json(
          { error: "A decisão exige Platform Owner." },
          { status: 403 },
        );
      if (!["approve", "reject"].includes(body.decision))
        return Response.json({ error: "Decisão inválida." }, { status: 400 });
      const change = await db
        .prepare(
          "SELECT * FROM control_plane_change_requests WHERE id=? AND status='Pendente'",
        )
        .bind(body.changeId)
        .first<Record<string, unknown>>();
      if (!change)
        return Response.json(
          { error: "Pedido pendente não encontrado." },
          { status: 404 },
        );
      if (
        String(change.requested_by).toLowerCase() === operator.email_normalized
      )
        return Response.json(
          { error: "Segregação de funções: o solicitante não pode decidir." },
          { status: 403 },
        );
      if (body.decision === "reject") {
        await db
          .prepare(
            "UPDATE control_plane_change_requests SET status='Rejeitado',decided_by=?,decided_at=? WHERE id=? AND status='Pendente'",
          )
          .bind(operator.email_normalized, now, body.changeId)
          .run();
      } else {
        const active = String(change.change_type).startsWith("Reativar"),
          newStatus = active ? "Ativo" : "Suspenso",
          statements: D1PreparedStatement[] = [
            db
              .prepare(
                "UPDATE control_plane_change_requests SET status='Aprovado',decided_by=?,decided_at=? WHERE id=? AND status='Pendente'",
              )
              .bind(operator.email_normalized, now, body.changeId),
          ];
        if (change.target_type === "subscription") {
          statements.push(
            db
              .prepare(
                "UPDATE subscriptions SET status=? WHERE id=? AND status=?",
              )
              .bind(
                active ? "Ativa" : "Suspensa",
                change.target_id,
                active ? "Suspensa" : "Ativa",
              ),
            db
              .prepare("UPDATE tenants SET status=? WHERE id=?")
              .bind(newStatus, change.tenant_id),
            db
              .prepare(
                "UPDATE module_entitlements SET status=?,effective_to=? WHERE tenant_id=? AND status=?",
              )
              .bind(
                newStatus,
                active ? null : now,
                change.tenant_id,
                active ? "Suspenso" : "Ativo",
              ),
          );
        } else
          statements.push(
            db
            .prepare(
              "UPDATE module_entitlements SET status=?,effective_to=? WHERE id=? AND status=?",
            )
            .bind(
              newStatus,
              active ? null : now,
              change.target_id,
              active ? "Suspenso" : "Ativo",
            ),
          );
        statements.push(
          db
            .prepare(
              "UPDATE control_plane_change_requests SET status='Executado',executed_at=?,after_json=? WHERE id=? AND status='Aprovado'",
            )
            .bind(
              now,
              JSON.stringify({ status: newStatus, effectiveAt: now }),
              body.changeId,
            ),
        );
        await db.batch(statements);
      }
      const evidence = await hash(
        `${operator.email_normalized}|${body.decision}|${body.changeId}|${now}`,
      );
      await db
        .prepare("INSERT INTO operator_audit_events VALUES (?,?,?,?,?,?,?,?)")
        .bind(
          uid(),
          operator.email_normalized,
          body.decision === "approve" ? "APPROVE_CHANGE" : "REJECT_CHANGE",
          "changeRequest",
          body.changeId,
          String(change.reason),
          evidence,
          now,
        )
        .run();
    } else
      return Response.json(
        { error: "Operação do Control Plane não suportada." },
        { status: 400 },
      );
    return Response.json(await snapshot(), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
