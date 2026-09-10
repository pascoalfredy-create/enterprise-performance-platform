"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api-client";
import { PlatformLocalizedSurface } from "../hr-localized-surface";
import "./platform.css";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  country_code?: string;
  base_currency?: string;
  locale?: string;
  owner_email?: string;
  organization_count: number;
  active_users: number;
  active_employees: number;
  created_at: string;
};
type Subscription = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  owner_email: string;
  bundle_code: string;
  billing_interval: string;
  status: string;
  current_period_end: string;
  invoice_status?: string;
};
type Entitlement = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  module_code: string;
  status: string;
};
type Invoice = {
  id: string;
  invoice_number: string;
  owner_email: string;
  bundle_code: string;
  billing_interval: string;
  currency: string;
  total_minor: number;
  status: string;
  due_at: string;
  paid_at?: string;
};
type Change = {
  id: string;
  change_type: string;
  target_type: string;
  target_id: string;
  tenant_name: string;
  reason: string;
  status: string;
  requested_by: string;
  requested_at: string;
  decided_by?: string;
};
type Operator = {
  id: string;
  email_normalized: string;
  role: string;
  status: string;
  mfa_required: number;
};
type Audit = {
  id: string;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string;
  reason?: string;
  evidence_hash: string;
  occurred_at: string;
};
type Data = {
  operator: { email: string; role: string };
  summary: {
    tenants: number;
    active_subscriptions: number;
    unpaid_invoices: number;
    pending_changes: number;
    collected_minor: number;
  };
  tenants: Tenant[];
  subscriptions: Subscription[];
  entitlements: Entitlement[];
  invoices: Invoice[];
  changes: Change[];
  operators: Operator[];
  audit: Audit[];
};

export default function PlatformConsole() {
  const [data, setData] = useState<Data | null>(null),
    [tab, setTab] = useState("Empresas"),
    [modal, setModal] = useState(""),
    [target, setTarget] = useState<{
      id: string;
      name: string;
      kind: "subscription" | "entitlement";
      status: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = () =>
    apiFetch("/api/v1/control-plane")
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        setData(b);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  async function command(payload: Record<string, string>) {
    setBusy(true);
    setError("");
    const r = await apiFetch("/api/v1/control-plane", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
      b = await r.json();
    setBusy(false);
    if (!r.ok) {
      setError(b.error);
      return;
    }
    setData(b);
    setModal("");
    setTarget(null);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(
      new FormData(e.currentTarget).entries(),
    ) as Record<string, string>;
    if (modal === "requestChange" && target) {
      const action = target.status === "Ativo" ? "Suspender" : "Reativar",
        noun = target.kind === "subscription" ? "subscrição" : "módulo";
      await command({
        type: modal,
        changeType: `${action} ${noun}`,
        targetId: target.id,
        ...values,
      });
      return;
    }
    await command({ type: modal, ...values });
  }
  const money = (n: number, c = "AOA") =>
    new Intl.NumberFormat("pt-AO", { style: "currency", currency: c }).format(
      n / 100,
    );
  if (error && !data)
    return (
      <PlatformLocalizedSurface>
      <main className="operator-denied">
        <b>EP CONTROL</b>
        <h1>Acesso não autorizado</h1>
        <p>{error}</p>
        <Link href="/">Voltar à plataforma</Link>
      </main>
      </PlatformLocalizedSurface>
    );
  if (!data)
    return (
      <PlatformLocalizedSurface>
      <main className="operator-denied">
        <b>EP CONTROL</b>
        <h1>A validar operador</h1>
        <p>Estamos a confirmar identidade, função e estado operacional.</p>
      </main>
      </PlatformLocalizedSurface>
    );
  const owner = data.operator.role === "Platform Owner";
  return (
    <PlatformLocalizedSurface>
    <main className="platform-console">
      <header className="platform-header">
        <div>
          <b>EP</b>
          <span>
            <small>CONTROL PLANE</small>Operações SaaS
          </span>
        </div>
        <nav>
          <Link href="/">← Plataforma empresarial</Link>
          <span>
            {data.operator.email}
            <small>{data.operator.role}</small>
          </span>
        </nav>
      </header>
      <section className="platform-intro">
        <div>
          <span>PLATFORM OPERATIONS</span>
          <h1>Empresas, receita e acessos sob controlo</h1>
          <p>
            O Control Plane gere subscrições e módulos sem abrir os dados
            operacionais dos clientes.
          </p>
        </div>
        {owner && (
          <button onClick={() => setModal("createOperator")}>
            ＋ Operador
          </button>
        )}
      </section>
      <section className="platform-kpis">
        <article>
          <span>Empresas</span>
          <strong>{data.summary.tenants}</strong>
          <small>Tenants provisionados</small>
        </article>
        <article>
          <span>Subscrições ativas</span>
          <strong>{data.summary.active_subscriptions}</strong>
          <small>Contratos em vigor</small>
        </article>
        <article>
          <span>Faturas pendentes</span>
          <strong>{data.summary.unpaid_invoices}</strong>
          <small>Requerem cobrança</small>
        </article>
        <article>
          <span>Recebido</span>
          <strong>{money(data.summary.collected_minor)}</strong>
          <small>Faturas pagas acumuladas</small>
        </article>
        <article className={data.summary.pending_changes ? "attention" : ""}>
          <span>Alterações pendentes</span>
          <strong>{data.summary.pending_changes}</strong>
          <small>Maker-checker</small>
        </article>
      </section>
      <nav className="platform-tabs">
        {[
          "Empresas",
          "Subscrições",
          "Cobrança",
          "Alterações",
          "Operadores",
          "Auditoria",
        ].map((x) => (
          <button
            key={x}
            className={tab === x ? "active" : ""}
            onClick={() => setTab(x)}
          >
            {x}
            {x === "Alterações" && data.summary.pending_changes > 0 ? (
              <em>{data.summary.pending_changes}</em>
            ) : null}
          </button>
        ))}
      </nav>
      {tab === "Empresas" ? (
        <section className="platform-table">
          <header>
            <span>EMPRESAS REGISTADAS</span>
            <h2>Tenants e utilização</h2>
          </header>
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Proprietário</th>
                <th>Localização</th>
                <th>Utilização</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.tenants.map((t) => (
                <tr key={t.id}>
                  <td>
                    <b>{t.name}</b>
                    <small>
                      {t.slug} · desde{" "}
                      {new Date(t.created_at).toLocaleDateString("pt-AO")}
                    </small>
                  </td>
                  <td>{t.owner_email || "Interno / demonstração"}</td>
                  <td>
                    {t.country_code || "—"}
                    <small>
                      {t.base_currency || "—"} · {t.locale || "—"}
                    </small>
                  </td>
                  <td>
                    {t.organization_count} org. · {t.active_users} utilizadores
                    <small>{t.active_employees} colaboradores</small>
                  </td>
                  <td>
                    <em>{t.status}</em>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : tab === "Subscrições" ? (
        <section className="subscription-grid">
          {data.subscriptions.map((s) => (
            <article key={s.id}>
              <header>
                <span>
                  <b>{s.tenant_name}</b>
                  <small>{s.owner_email}</small>
                </span>
                <em>{s.status}</em>
              </header>
              <div>
                <strong>{s.bundle_code}</strong>
                <small>
                  {s.billing_interval === "annual" ? "Anual" : "Mensal"} ·
                  renova{" "}
                  {new Date(s.current_period_end).toLocaleDateString("pt-AO")}
                </small>
              </div>
              <section>
                {data.entitlements
                  .filter((e) => e.tenant_id === s.tenant_id)
                  .map((e) => (
                    <div key={e.id}>
                      <span>{e.module_code}</span>
                      <em>{e.status}</em>
                      {owner && (
                        <button
                          disabled={e.module_code === "CORE"}
                          onClick={() => {
                            setTarget({
                              id: e.id,
                              name: e.module_code,
                              kind: "entitlement",
                              status: e.status,
                            });
                            setModal("requestChange");
                          }}
                        >
                          {e.status === "Ativo" ? "Suspender" : "Reativar"}
                        </button>
                      )}
                    </div>
                  ))}
              </section>
              {owner && (
                <footer>
                  <button
                    onClick={() => {
                      setTarget({
                        id: s.id,
                        name: s.tenant_name,
                        kind: "subscription",
                        status: s.status,
                      });
                      setModal("requestChange");
                    }}
                  >
                    {s.status === "Ativa"
                      ? "Solicitar suspensão"
                      : "Solicitar reativação"}
                  </button>
                </footer>
              )}
            </article>
          ))}
        </section>
      ) : tab === "Cobrança" ? (
        <section className="platform-table">
          <header>
            <span>FATURAÇÃO</span>
            <h2>Faturas e recebimentos</h2>
          </header>
          <table>
            <thead>
              <tr>
                <th>Fatura</th>
                <th>Cliente</th>
                <th>Plano</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((i) => (
                <tr key={i.id}>
                  <td>
                    <b>{i.invoice_number}</b>
                  </td>
                  <td>{i.owner_email}</td>
                  <td>
                    {i.bundle_code}
                    <small>{i.billing_interval}</small>
                  </td>
                  <td>
                    <b>{money(i.total_minor, i.currency)}</b>
                  </td>
                  <td>{new Date(i.due_at).toLocaleDateString("pt-AO")}</td>
                  <td>
                    <em>{i.status}</em>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : tab === "Alterações" ? (
        <section className="change-list">
          <header>
            <span>ALTERAÇÕES CONTROLADAS</span>
            <h2>Pedidos e decisões</h2>
          </header>
          {data.changes.map((c) => (
            <article key={c.id}>
              <i>
                {c.status === "Executado"
                  ? "✓"
                  : c.status === "Pendente"
                    ? "!"
                    : "◇"}
              </i>
              <span>
                <b>
                  {c.change_type} · {c.tenant_name}
                </b>
                <small>{c.reason}</small>
                <small>
                  {c.requested_by} ·{" "}
                  {new Date(c.requested_at).toLocaleString("pt-AO")}
                </small>
              </span>
              <em>{c.status}</em>
              {c.status === "Pendente" &&
                owner &&
                c.requested_by.toLowerCase() !==
                  data.operator.email.toLowerCase() && (
                  <nav>
                    <button
                      onClick={() =>
                        command({
                          type: "decideChange",
                          changeId: c.id,
                          decision: "reject",
                        })
                      }
                    >
                      Rejeitar
                    </button>
                    <button
                      onClick={() =>
                        command({
                          type: "decideChange",
                          changeId: c.id,
                          decision: "approve",
                        })
                      }
                    >
                      Aprovar e executar
                    </button>
                  </nav>
                )}
            </article>
          ))}
        </section>
      ) : tab === "Operadores" ? (
        <section className="operator-list">
          <header>
            <span>OPERADORES DA PLATAFORMA</span>
            <h2>Acesso separado dos clientes</h2>
          </header>
          {data.operators.map((o) => (
            <article key={o.id}>
              <i>
                {o.email_normalized.split("@")[0].slice(0, 2).toUpperCase()}
              </i>
              <span>
                <b>{o.email_normalized}</b>
                <small>{o.role}</small>
              </span>
              <em>{o.status}</em>
              <strong>
                {o.mfa_required ? "MFA obrigatório" : "MFA opcional"}
              </strong>
            </article>
          ))}
        </section>
      ) : (
        <section className="audit-list">
          <header>
            <span>AUDITORIA IMUTÁVEL</span>
            <h2>Atividade dos operadores</h2>
          </header>
          {data.audit.map((a) => (
            <article key={a.id}>
              <i>✓</i>
              <span>
                <b>{a.action}</b>
                <small>
                  {a.actor_email} · {a.reason || "Sem observação"}
                </small>
              </span>
              <code>#{a.evidence_hash.slice(0, 14)}</code>
              <time>{new Date(a.occurred_at).toLocaleString("pt-AO")}</time>
            </article>
          ))}
        </section>
      )}
      {error && <p className="platform-error">{error}</p>}
      {modal && (
        <div className="platform-modal">
          <form onSubmit={submit}>
            <header>
              <div>
                <small>CONTROL PLANE</small>
                <h2>
                  {modal === "createOperator"
                    ? "Novo operador"
                    : `${target?.status === "Ativo" ? "Suspender" : "Reativar"} ${target?.name}`}
                </h2>
              </div>
              <button type="button" onClick={() => setModal("")}>
                ×
              </button>
            </header>
            {modal === "createOperator" ? (
              <>
                <label>
                  E-mail
                  <input name="email" type="email" required />
                </label>
                <label>
                  Função
                  <select name="role">
                    <option>Billing Operator</option>
                    <option>Support Auditor</option>
                    <option>Platform Owner</option>
                  </select>
                </label>
                <label>
                  Justificação
                  <textarea name="reason" rows={3} />
                </label>
              </>
            ) : (
              <>
                <aside>
                  <b>Maker-checker obrigatório</b>
                  <p>
                    O pedido ficará pendente e deve ser decidido por outro
                    Platform Owner.
                  </p>
                </aside>
                <label>
                  Motivo operacional
                  <textarea name="reason" minLength={10} rows={4} required />
                </label>
              </>
            )}
            {error && <p className="platform-error">{error}</p>}
            <footer>
              <button type="button" onClick={() => setModal("")}>
                Cancelar
              </button>
              <button disabled={busy}>
                {busy ? "A processar…" : "Confirmar"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </main>
    </PlatformLocalizedSurface>
  );
}
