import { classifyDataError } from "../lib/api-error";
type Security = { tenantId: string; email: string };
const uid = () => crypto.randomUUID();
const fail = (error: unknown) => {
  const x = classifyDataError(
    error,
    "Não foi possível processar os country packs de payroll.",
  );
  return Response.json(
    { error: x.message, code: x.code },
    { status: x.status },
  );
};

const CATALOG: Record<
  string,
  { name: string; currency: string; language: string; checks: string[] }
> = {
  AO: {
    name: "Angola",
    currency: "AOA",
    language: "Português",
    checks: [
      "Contrato e elegibilidade",
      "Tempo, faltas e horas extra",
      "Proventos e descontos",
      "Impostos e contribuições",
      "Líquido e reconciliação",
    ],
  },
  PT: {
    name: "Portugal",
    currency: "EUR",
    language: "Português",
    checks: [
      "Contrato e elegibilidade",
      "Tempo e ausências",
      "Remuneração",
      "Fiscal e segurança social",
      "Pagamento",
    ],
  },
  GB: {
    name: "Reino Unido",
    currency: "GBP",
    language: "English",
    checks: [
      "Employment eligibility",
      "Time & leave",
      "Earnings & deductions",
      "Tax & contributions",
      "Net payment",
    ],
  },
  ES: {
    name: "Espanha",
    currency: "EUR",
    language: "Español",
    checks: [
      "Contrato y elegibilidad",
      "Tiempo y ausencias",
      "Devengos y deducciones",
      "Fiscal y cotizaciones",
      "Pago neto",
    ],
  },
  FR: {
    name: "França",
    currency: "EUR",
    language: "Français",
    checks: [
      "Contrat et éligibilité",
      "Temps et absences",
      "Gains et retenues",
      "Fiscalité et cotisations",
      "Paiement net",
    ],
  },
};

export async function payrollCountryPacksApi(
  request: Request,
  db: D1Database,
  security: Security,
) {
  try {
    const tenant = security.tenantId;
    if (request.method === "GET") {
      const rows = await db
        .prepare(
          "SELECT country_code,status,pack_version,started_by,started_at,activated_by,activated_at FROM payroll_country_packs WHERE tenant_id=?",
        )
        .bind(tenant)
        .all<{
          country_code: string;
          status: string;
          pack_version: string;
          started_by: string;
          started_at: string;
          activated_by: string | null;
          activated_at: string | null;
        }>();
      const byCountry = new Map(rows.results.map((r) => [r.country_code, r]));
      return Response.json({
        packs: Object.entries(CATALOG).map(([code, meta]) => {
          const row = byCountry.get(code);
          return {
            countryCode: code,
            name: meta.name,
            currency: meta.currency,
            language: meta.language,
            checks: meta.checks,
            status: row?.status || "Não instalado",
            packVersion: row?.pack_version || `${code}-PAYROLL-DRAFT`,
            startedBy: row?.started_by || null,
            startedAt: row?.started_at || null,
            activatedBy: row?.activated_by || null,
            activatedAt: row?.activated_at || null,
          };
        }),
      });
    }
    if (request.method !== "POST")
      return Response.json({ error: "Método não permitido." }, { status: 405 });
    const body = (await request.json()) as Record<string, string>,
      now = new Date().toISOString();
    const countryCode = (body.countryCode || "").toUpperCase();
    if (!CATALOG[countryCode])
      return Response.json({ error: "País não suportado." }, { status: 400 });
    if (body.type === "startParametrization") {
      const existing = await db
        .prepare(
          "SELECT status FROM payroll_country_packs WHERE tenant_id=? AND country_code=?",
        )
        .bind(tenant, countryCode)
        .first<{ status: string }>();
      if (existing)
        return Response.json(
          {
            error:
              existing.status === "Ativo"
                ? "Este country pack já está ativo."
                : "Este country pack já está em parametrização.",
          },
          { status: 409 },
        );
      const id = uid();
      await db
        .prepare(
          "INSERT INTO payroll_country_packs (id,tenant_id,country_code,status,pack_version,started_by,started_at,created_at) VALUES (?,?,?,'Em parametrização',?,?,?,?)",
        )
        .bind(
          id,
          tenant,
          countryCode,
          `${countryCode}-PAYROLL-DRAFT`,
          security.email,
          now,
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
          "START_PARAMETRIZATION",
          "payrollCountryPack",
          id,
          security.email,
          `Parametrização do country pack ${countryCode} iniciada`,
        )
        .run();
      return Response.json({ countryCode, status: "Em parametrização" }, { status: 201 });
    }
    if (body.type === "activatePack") {
      const existing = await db
        .prepare(
          "SELECT id,started_by FROM payroll_country_packs WHERE tenant_id=? AND country_code=? AND status='Em parametrização'",
        )
        .bind(tenant, countryCode)
        .first<{ id: string; started_by: string }>();
      if (!existing)
        return Response.json(
          { error: "Country pack em parametrização não encontrado." },
          { status: 404 },
        );
      if (existing.started_by.toLowerCase() === security.email.toLowerCase())
        return Response.json(
          {
            error:
              "Maker-checker: quem iniciou a parametrização não pode ativar o mesmo pack.",
          },
          { status: 403 },
        );
      await db
        .prepare(
          "UPDATE payroll_country_packs SET status='Ativo',activated_by=?,activated_at=? WHERE id=? AND tenant_id=? AND status='Em parametrização'",
        )
        .bind(security.email, now, existing.id, tenant)
        .run();
      await db
        .prepare(
          "INSERT INTO audit_events (id,tenant_id,created_at,action,entity_type,entity_id,actor,summary) VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(
          uid(),
          tenant,
          now,
          "ACTIVATE",
          "payrollCountryPack",
          existing.id,
          security.email,
          `Country pack ${countryCode} ativado`,
        )
        .run();
      return Response.json({ countryCode, status: "Ativo" });
    }
    return Response.json({ error: "Operação não suportada." }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}
