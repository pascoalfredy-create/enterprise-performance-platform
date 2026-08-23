type Security = {
  tenantId: string;
  organizationId: string | null;
  email: string;
  role: string;
  modules: string[];
};

const uid = () => crypto.randomUUID();

export async function customerActivationApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  if (security.role !== "Administrador" || security.organizationId)
    return Response.json(
      { error: "A ativação exige Administrador com âmbito de todo o tenant." },
      { status: 403 },
    );
  const tenant = security.tenantId;

  const snapshot = async () => {
    const [subscription, invoices, requests, profile, counts, entitlements] =
      await Promise.all([
        db
          .prepare(
            "SELECT s.*,c.requested_users,c.requested_employees,c.amount_minor,c.currency FROM subscriptions s JOIN checkout_sessions c ON c.id=s.checkout_id WHERE s.tenant_id=?",
          )
          .bind(tenant)
          .first<Record<string, unknown>>(),
        db
          .prepare(
            "SELECT i.invoice_number,i.total_minor,i.currency,i.status,i.due_at,i.paid_at,i.created_at FROM billing_invoices i JOIN subscriptions s ON s.checkout_id=i.checkout_id WHERE s.tenant_id=? ORDER BY i.created_at DESC",
          )
          .bind(tenant)
          .all(),
        db
          .prepare(
            "SELECT * FROM subscription_change_requests WHERE tenant_id=? ORDER BY requested_at DESC LIMIT 20",
          )
          .bind(tenant)
          .all(),
        db
          .prepare(
            "SELECT b.*,s.name sector_name,p.name pack_name,p.methodology_name FROM tenant_business_profiles b JOIN industry_sectors s ON s.code=b.sector_code JOIN industry_packs p ON p.code=b.industry_pack_code WHERE b.tenant_id=?",
          )
          .bind(tenant)
          .first(),
        db
          .prepare(
            "SELECT (SELECT COUNT(*) FROM organizations WHERE tenant_id=? AND status='Ativa') organizations,(SELECT COUNT(*) FROM tenant_memberships WHERE tenant_id=? AND status='Ativo') users,(SELECT COUNT(*) FROM employees WHERE tenant_id=? AND status='Ativo') employees,(SELECT COUNT(*) FROM financial_dimensions WHERE tenant_id=? AND status='Ativa') dimensions,(SELECT COUNT(*) FROM performance_entries WHERE tenant_id=?) financial_entries,(SELECT COUNT(*) FROM payroll_runs WHERE tenant_id=?) payroll_runs,(SELECT COUNT(*) FROM management_reports WHERE tenant_id=?) reports,(SELECT COUNT(*) FROM integration_runs WHERE tenant_id=?) integration_runs,(SELECT COUNT(*) FROM module_documents WHERE tenant_id=?) documents,(SELECT COUNT(*) FROM workflow_tasks WHERE tenant_id=?) workflow_tasks",
          )
          .bind(
            tenant,
            tenant,
            tenant,
            tenant,
            tenant,
            tenant,
            tenant,
            tenant,
            tenant,
            tenant,
          )
          .first<Record<string, unknown>>(),
        db
          .prepare(
            "SELECT module_code,status,effective_from,effective_to FROM module_entitlements WHERE tenant_id=? ORDER BY module_code",
          )
          .bind(tenant)
          .all(),
      ]);
    const n = (key: string) => Number(counts?.[key] || 0);
    const checkpoints = [
      {
        code: "organization",
        name: "Estrutura organizacional",
        complete: n("organizations") > 0,
        evidence: `${n("organizations")} organização(ões)`,
        target: "Administração",
      },
      {
        code: "users",
        name: "Utilizadores e RBAC",
        complete: n("users") > 0,
        evidence: `${n("users")} utilizador(es) ativo(s)`,
        target: "Administração",
      },
      {
        code: "dimensions",
        name: "Dimensões financeiras",
        complete: n("dimensions") > 0,
        evidence: `${n("dimensions")} dimensão(ões)`,
        target: "Administração",
      },
      {
        code: "data",
        name: "Primeiros dados importados",
        complete: n("financial_entries") + n("employees") > 0,
        evidence: `${n("financial_entries")} registos financeiros · ${n("employees")} pessoas`,
        target: security.modules.includes("FINANCE_FP&A")
          ? "Dados financeiros"
          : "Pessoas",
      },
      {
        code: "integration",
        name: "Integração validada",
        complete: n("integration_runs") > 0,
        evidence: `${n("integration_runs")} execução(ões)`,
        target: "Integrações",
        optional: !security.modules.includes("INTEGRATIONS"),
      },
      {
        code: "report",
        name: "Primeiro resultado de gestão",
        complete: n("reports") > 0,
        evidence: `${n("reports")} relatório(s) emitido(s)`,
        target: "Relatórios",
      },
    ];
    const applicable = checkpoints.filter((x) => !x.optional);
    const complete = applicable.filter((x) => x.complete).length;
    const maturity = security.modules.map((code) => {
      const evidence: Record<string, number> = {
        CORE: n("organizations") + n("users") + n("dimensions"),
        "FINANCE_FP&A": n("financial_entries"),
        HCM: n("employees"),
        PAYROLL: n("payroll_runs"),
        WORKFORCE_PLANNING: n("payroll_runs"),
        PERFORMANCE_MANAGEMENT: n("workflow_tasks"),
        ANALYTICS_REPORTING: n("reports"),
        WORKFLOW: n("workflow_tasks"),
        INTEGRATIONS: n("integration_runs"),
      };
      const value = evidence[code] || 0;
      return {
        code,
        status: value > 0 ? "Em utilização" : "Configurado",
        evidence: value,
        claim:
          value > 0
            ? "Dados reais ou demonstrativos presentes"
            : "Contratado, ainda sem evidência operacional",
      };
    });
    return {
      generatedAt: new Date().toISOString(),
      subscription,
      invoices: invoices.results,
      requests: requests.results,
      businessProfile: profile,
      entitlements: entitlements.results,
      counts,
      checkpoints,
      adoption: {
        complete,
        total: applicable.length,
        score: applicable.length
          ? Math.trunc((complete * 100) / applicable.length)
          : 0,
      },
      maturity,
    };
  };

  if (request.method === "GET") return Response.json(await snapshot());
  if (request.method !== "POST")
    return Response.json({ error: "Método não permitido." }, { status: 405 });
  const body = (await request.json()) as Record<string, string>;
  if (body.type !== "requestChange")
    return Response.json({ error: "Comando inválido." }, { status: 400 });
  if (
    !["Upgrade", "Downgrade", "Cancelamento", "Apoio comercial"].includes(
      body.requestType,
    ) ||
    !body.reason?.trim() ||
    body.reason.trim().length < 10
  )
    return Response.json(
      { error: "Tipo e motivo com pelo menos 10 caracteres são obrigatórios." },
      { status: 400 },
    );
  const subscription = await db
    .prepare("SELECT id FROM subscriptions WHERE tenant_id=?")
    .bind(tenant)
    .first<Record<string, unknown>>();
  if (!subscription)
    return Response.json(
      { error: "Subscrição não encontrada." },
      { status: 404 },
    );
  const id = uid(),
    now = new Date().toISOString();
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO subscription_change_requests VALUES (?,?,?,?,?,?,'Pendente',?,?,NULL,NULL,NULL)",
        )
        .bind(
          id,
          tenant,
          subscription.id,
          body.requestType,
          body.requestedBundle || null,
          body.reason.trim(),
          security.email,
          now,
        ),
      db
        .prepare(
          "INSERT INTO audit_events (id,tenant_id,created_at,action,entity_type,entity_id,actor,summary) VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(
          uid(),
          tenant,
          now,
          "subscription.change_requested",
          "subscriptionChange",
          id,
          security.email,
          `${body.requestType} solicitado pelo cliente`,
        ),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE"))
      return Response.json(
        { error: "Já existe um pedido deste tipo em análise." },
        { status: 409 },
      );
    throw error;
  }
  return Response.json(await snapshot(), { status: 201 });
}
