"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../lib/api-client";
import "./customer-activation.css";

type Activation = {
  generatedAt: string;
  subscription: Record<string, string | number> | null;
  invoices: Array<Record<string, string | number | null>>;
  requests: Array<Record<string, string | null>>;
  businessProfile: Record<string, string> | null;
  counts: Record<string, number>;
  adoption: { complete: number; total: number; score: number };
  checkpoints: Array<{
    code: string;
    name: string;
    complete: boolean;
    evidence: string;
    target: string;
    optional?: boolean;
  }>;
  maturity: Array<{
    code: string;
    status: string;
    evidence: number;
    claim: string;
  }>;
};

const moduleNames: Record<string, string> = {
  CORE: "Administração",
  "FINANCE_FP&A": "Finance & FP&A",
  HCM: "HCM",
  PAYROLL: "Payroll",
  WORKFORCE_PLANNING: "Workforce Planning",
  PERFORMANCE_MANAGEMENT: "Performance Management",
  ANALYTICS_REPORTING: "Analytics & Reporting",
  WORKFLOW: "Workflow",
  INTEGRATIONS: "Integration Hub",
};

const importTemplates = [
  {
    name: "Actual e Budget",
    target: "Dados financeiros",
    fields: "período, cenário, conta, dimensão e montante",
  },
  {
    name: "Employee Master",
    target: "Administração",
    fields: "número, nome, organização, função e admissão",
  },
  {
    name: "Payroll",
    target: "Operações",
    fields: "colaborador, componente, método, valor e vigência",
  },
  {
    name: "Workforce Plan",
    target: "Headcount",
    fields: "organização, função, período, headcount e custo",
  },
];

export function CustomerActivationWorkspace({
  onNavigate,
}: {
  onNavigate: (target: string) => void;
}) {
  const [data, setData] = useState<Activation | null>(null),
    [error, setError] = useState(""),
    [modal, setModal] = useState(false),
    [busy, setBusy] = useState(false);
  const load = () =>
    apiFetch("/api/v1/customer-activation")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        setData(body);
      })
      .catch((e) =>
        setError(e.message || "Não foi possível avaliar a ativação."),
      );
  useEffect(load, []);

  async function requestChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const payload = Object.fromEntries(
        new FormData(event.currentTarget).entries(),
      ),
      response = await apiFetch("/api/v1/customer-activation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "requestChange", ...payload }),
      }),
      body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(body.error || "Não foi possível registar o pedido.");
      return;
    }
    setData(body);
    setModal(false);
  }

  if (!data)
    return (
      <section className="activation-loading">
        <i />
        <span>{error || "A avaliar subscrição, configuração e adoção…"}</span>
      </section>
    );
  const subscription = data.subscription,
    end = subscription?.current_period_end
      ? new Date(String(subscription.current_period_end)).toLocaleDateString(
          "pt-AO",
        )
      : "—",
    money = (value: unknown, currency = "AOA") =>
      new Intl.NumberFormat("pt-AO", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(Number(value || 0) / 100);

  return (
    <section className="activation-center">
      <header className="activation-hero">
        <div>
          <small>CUSTOMER ACTIVATION CENTER</small>
          <h1>Da contratação ao primeiro resultado</h1>
          <p>
            Acompanhe configuração, adoção, importação e subscrição com
            evidências reais da empresa.
          </p>
        </div>
        <div className="activation-score">
          <strong>{data.adoption.score}%</strong>
          <span>ativação concluída</span>
          <small>
            {data.adoption.complete}/{data.adoption.total} marcos aplicáveis
          </small>
        </div>
      </header>

      {error && (
        <div className="activation-error">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}

      <section className="activation-grid">
        <article className="activation-plan">
          <header>
            <div>
              <small>MINHA SUBSCRIÇÃO</small>
              <h2>
                {subscription
                  ? `Bundle ${subscription.bundle_code}`
                  : "Sem subscrição"}
              </h2>
            </div>
            <em className={subscription?.status === "Ativa" ? "active" : ""}>
              {String(subscription?.status || "Indisponível")}
            </em>
          </header>
          <dl>
            <div>
              <dt>Ciclo</dt>
              <dd>
                {subscription?.billing_interval === "annual"
                  ? "Anual"
                  : "Mensal"}
              </dd>
            </div>
            <div>
              <dt>Próxima renovação</dt>
              <dd>{end}</dd>
            </div>
            <div>
              <dt>Utilizadores contratados</dt>
              <dd>{String(subscription?.requested_users || 0)}</dd>
            </div>
            <div>
              <dt>Colaboradores contratados</dt>
              <dd>{String(subscription?.requested_employees || 0)}</dd>
            </div>
          </dl>
          <footer>
            <span>
              {money(
                subscription?.amount_minor,
                String(subscription?.currency || "AOA"),
              )}
            </span>
            <button onClick={() => setModal(true)}>Gerir subscrição</button>
          </footer>
        </article>

        <article className="activation-context">
          <small>CONTEXTO CONFIGURADO</small>
          <h2>{data.businessProfile?.sector_name || "Setor por configurar"}</h2>
          <p>
            {data.businessProfile?.core_business ||
              "Defina o core business para alinhar métricas e metodologias."}
          </p>
          <div>
            <b>{data.businessProfile?.pack_name || "Industry Pack pendente"}</b>
            <span>
              {data.businessProfile?.methodology_name || "Metodologia neutra"}
            </span>
          </div>
        </article>
      </section>

      <section className="activation-checklist">
        <header>
          <div>
            <small>ROTEIRO DE ATIVAÇÃO</small>
            <h2>Próximas ações por evidência</h2>
          </div>
          <span>{data.adoption.complete} concluídas</span>
        </header>
        <div>
          {data.checkpoints.map((item, index) => (
            <article
              key={item.code}
              className={item.complete ? "complete" : ""}
            >
              <i>{item.complete ? "✓" : index + 1}</i>
              <span>
                <b>{item.name}</b>
                <small>{item.evidence}</small>
              </span>
              <button onClick={() => onNavigate(item.target)}>
                {item.complete ? "Rever" : "Configurar"} →
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="activation-imports">
        <header>
          <div>
            <small>IMPORTAÇÃO ASSISTIDA</small>
            <h2>Comece com estruturas governadas</h2>
          </div>
          <button onClick={() => onNavigate("Documentos")}>
            Abrir Document Hub →
          </button>
        </header>
        <div>
          {importTemplates.map((item) => (
            <article key={item.name}>
              <i>⇩</i>
              <span>
                <b>{item.name}</b>
                <small>{item.fields}</small>
              </span>
              <button onClick={() => onNavigate(item.target)}>
                Preparar importação
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="activation-maturity">
        <header>
          <div>
            <small>MATRIZ DE COMPLETUDE</small>
            <h2>Estado baseado em utilização, sem declarações artificiais</h2>
          </div>
          <span>{data.maturity.length} módulos contratados</span>
        </header>
        <div>
          {data.maturity.map((item) => (
            <article key={item.code}>
              <i className={item.evidence ? "used" : ""}>
                {item.evidence ? "✓" : "○"}
              </i>
              <span>
                <b>{moduleNames[item.code] || item.code}</b>
                <small>{item.claim}</small>
              </span>
              <em>{item.status}</em>
            </article>
          ))}
        </div>
      </section>

      <section className="activation-history">
        <header>
          <div>
            <small>FATURAÇÃO E PEDIDOS</small>
            <h2>Histórico comercial auditável</h2>
          </div>
        </header>
        <div className="activation-table">
          <table>
            <thead>
              <tr>
                <th>Referência</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((x) => (
                <tr key={String(x.invoice_number)}>
                  <td>{String(x.invoice_number)}</td>
                  <td>Fatura · {money(x.total_minor, String(x.currency))}</td>
                  <td>{String(x.status)}</td>
                  <td>
                    {new Date(String(x.created_at)).toLocaleDateString("pt-AO")}
                  </td>
                </tr>
              ))}
              {data.requests.map((x) => (
                <tr key={String(x.id)}>
                  <td>{String(x.id).slice(0, 8).toUpperCase()}</td>
                  <td>{x.request_type}</td>
                  <td>{x.status}</td>
                  <td>
                    {new Date(String(x.requested_at)).toLocaleDateString(
                      "pt-AO",
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modal && (
        <div className="modal-inline">
          <form onSubmit={requestChange}>
            <header>
              <div>
                <small>GESTÃO DA SUBSCRIÇÃO</small>
                <h2>Novo pedido</h2>
              </div>
              <button type="button" onClick={() => setModal(false)}>
                ×
              </button>
            </header>
            <label>
              Tipo
              <select name="requestType" required>
                <option>Upgrade</option>
                <option>Downgrade</option>
                <option>Cancelamento</option>
                <option>Apoio comercial</option>
              </select>
            </label>
            <label>
              Bundle pretendido
              <select name="requestedBundle">
                <option value="">Não aplicável</option>
                <option>FINANCE</option>
                <option>PEOPLE</option>
                <option>PERFORMANCE</option>
                <option>ENTERPRISE</option>
              </select>
            </label>
            <label>
              Motivo
              <textarea
                name="reason"
                minLength={10}
                required
                placeholder="Explique a necessidade e a data pretendida."
              />
            </label>
            <button disabled={busy}>
              {busy ? "A registar…" : "Registar pedido auditável"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
