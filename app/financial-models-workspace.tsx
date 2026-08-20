"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api-client";
import "./financial-models.css";

type Model = {
  id: string;
  name: string;
  organization_name: string;
  organization_id: string;
  currency: string;
  start_period: string;
  horizon_months: number;
  opening_cash_minor: number;
  status: string;
  version_number: number;
  line_count: number;
  created_by: string;
  input_hash?: string;
  approval_hash?: string;
};
type Line = {
  id: string;
  code: string;
  name: string;
  line_type: string;
  base_amount_minor: number;
  growth_bps: number;
  cash_lag_months: number;
};
type Month = {
  period: string;
  revenueMinor: number;
  costMinor: number;
  capexMinor: number;
  financingMinor: number;
  netIncomeMinor: number;
  netCashMinor: number;
  closingCashMinor: number;
};
type Data = {
  models: Model[];
  organizations: Array<{
    id: string;
    code: string;
    name: string;
    currency: string;
  }>;
  selectedModel: Model | null;
  lines: Line[];
  monthly: Month[];
  audit: Array<{
    id: string;
    summary: string;
    actor: string;
    created_at: string;
  }>;
};
const empty: Data = {
  models: [],
  organizations: [],
  selectedModel: null,
  lines: [],
  monthly: [],
  audit: [],
};
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value / 100);

export function FinancialModelsWorkspace({
  initialView = "Plano de negócios",
}: {
  initialView?: string;
}) {
  const [data, setData] = useState<Data>(empty),
    [selected, setSelected] = useState(""),
    [view, setView] = useState(initialView),
    [modal, setModal] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      apiFetch(
        `/api/v1/financial-models${selected ? `?model=${selected}` : ""}`,
      )
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          setData(b);
          if (!selected && b.models?.[0]) setSelected(b.models[0].id);
        })
        .catch((e) => setError(e.message)),
    [selected],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function command(payload: Record<string, string>) {
    setBusy(true);
    setError("");
    const r = await apiFetch(
        `/api/v1/financial-models${selected ? `?model=${selected}` : ""}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
      b = await r.json();
    setBusy(false);
    if (!r.ok) {
      setError(b.error);
      return;
    }
    setData(b);
    if (b.selectedModel) setSelected(b.selectedModel.id);
    setModal("");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await command({
      type: modal,
      modelId: selected,
      ...(Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<
        string,
        string
      >),
    });
  }
  const model = data.selectedModel,
    currency = model?.currency || "AOA",
    minimum = data.monthly.reduce<Month | null>(
      (a, x) => (!a || x.closingCashMinor < a.closingCashMinor ? x : a),
      null,
    ),
    total = (key: keyof Month) =>
      data.monthly.reduce((n, x) => n + Number(x[key]), 0),
    max = Math.max(1, ...data.monthly.map((x) => Math.abs(x.closingCashMinor)));
  return (
    <section className="financial-models">
      <header className="fm-top">
        <div>
          <span>FINANCE & FP&A · BUSINESS PLANNING</span>
          <h1>Do pressuposto à liquidez, sem caixas negras</h1>
          <p>
            Plano de negócios mensal, drivers, resultados, CAPEX, financiamento
            e cash-flow na mesma versão governada.
          </p>
        </div>
        <button className="primario" onClick={() => setModal("createModel")}>
          ＋ Novo plano
        </button>
      </header>
      <section className="fm-kpis">
        <article>
          <span>Receita projetada</span>
          <strong>{money(total("revenueMinor"), currency)}</strong>
          <small>
            {model ? `${model.horizon_months} meses` : "Sem plano selecionado"}
          </small>
        </article>
        <article>
          <span>Resultado projetado</span>
          <strong>{money(total("netIncomeMinor"), currency)}</strong>
          <small>Receita − custos − impostos</small>
        </article>
        <article
          className={minimum && minimum.closingCashMinor < 0 ? "risk" : ""}
        >
          <span>Caixa mínimo</span>
          <strong>
            {minimum ? money(minimum.closingCashMinor, currency) : "—"}
          </strong>
          <small>{minimum?.period || "Sem projeção"}</small>
        </article>
        <article>
          <span>Versão</span>
          <strong>{model ? `v${model.version_number}` : "—"}</strong>
          <small>{model?.status || "Não iniciada"}</small>
        </article>
      </section>
      <nav className="fm-tabs">
        {["Plano de negócios", "Drivers", "Cash-flow", "Evidência"].map((x) => (
          <button
            key={x}
            className={view === x ? "active" : ""}
            onClick={() => setView(x)}
          >
            {x}
          </button>
        ))}
      </nav>
      <section className="fm-toolbar">
        <label>
          Plano financeiro
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Selecionar</option>
            {data.models.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · v{x.version_number} · {x.status}
              </option>
            ))}
          </select>
        </label>
        {model && (
          <div>
            <span>{model.organization_name}</span>
            <span>
              {model.start_period} · {model.horizon_months} meses
            </span>
            {model.status === "Rascunho" && (
              <>
                <button onClick={() => setModal("addLine")}>＋ Driver</button>
                <button
                  className="primary-mini"
                  disabled={busy}
                  onClick={() =>
                    command({ type: "calculateModel", modelId: model.id })
                  }
                >
                  Calcular
                </button>
              </>
            )}
            {model.status === "Calculado" && (
              <button
                className="primary-mini"
                disabled={busy}
                onClick={() =>
                  command({ type: "approveModel", modelId: model.id })
                }
              >
                Aprovar
              </button>
            )}
          </div>
        )}
      </section>
      {view === "Drivers" ? (
        <article className="cartao fm-lines">
          <div className="cab">
            <div>
              <span>INPUTS GOVERNADOS</span>
              <h2>Linhas e drivers mensais</h2>
            </div>
            <em>{data.lines.length} linha(s)</em>
          </div>
          {data.lines.length ? (
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Base mensal</th>
                  <th>Crescimento</th>
                  <th>Prazo caixa</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <code>{x.code}</code>
                    </td>
                    <td>
                      <b>{x.name}</b>
                    </td>
                    <td>{x.line_type}</td>
                    <td>{money(x.base_amount_minor, currency)}</td>
                    <td>{(x.growth_bps / 100).toFixed(2)}%</td>
                    <td>{x.cash_lag_months} mês(es)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="fm-empty">
              Adicione receitas, custos, CAPEX, financiamento ou impostos ao
              plano em rascunho.
            </p>
          )}
        </article>
      ) : view === "Cash-flow" ? (
        <div className="fm-grid">
          <article className="cartao fm-cash">
            <div className="cab">
              <div>
                <span>LIQUIDEZ</span>
                <h2>Cash-flow mensal projetado</h2>
              </div>
              <em>{currency}</em>
            </div>
            {data.monthly.map((x) => (
              <div className="cash-row" key={x.period}>
                <span>
                  <b>{x.period}</b>
                  <small>Fluxo {money(x.netCashMinor, currency)}</small>
                </span>
                <div>
                  <i
                    className={x.closingCashMinor < 0 ? "negative" : ""}
                    style={{
                      width: `${Math.max(2, (Math.abs(x.closingCashMinor) / max) * 100)}%`,
                    }}
                  />
                </div>
                <strong>{money(x.closingCashMinor, currency)}</strong>
              </div>
            ))}
          </article>
          <aside className="cartao fm-rules">
            <span>LEITURA FINANCEIRA</span>
            <h2>Capacidade e risco</h2>
            <p>
              O saldo inicial evolui pelo fluxo de caixa de cada driver,
              respeitando o prazo configurado entre reconhecimento e
              recebimento/pagamento.
            </p>
            <b>
              {minimum && minimum.closingCashMinor < 0
                ? "Necessidade de financiamento identificada"
                : "Liquidez não negativa no horizonte"}
            </b>
            <small>
              Menor saldo:{" "}
              {minimum ? money(minimum.closingCashMinor, currency) : "—"}
            </small>
          </aside>
        </div>
      ) : view === "Evidência" ? (
        <div className="fm-grid">
          <article className="cartao fm-evidence">
            <div className="cab">
              <div>
                <span>LINEAGE</span>
                <h2>Evidência determinística</h2>
              </div>
            </div>
            <dl>
              <div>
                <dt>Hash dos inputs</dt>
                <dd>
                  <code>{model?.input_hash || "Disponível após cálculo"}</code>
                </dd>
              </div>
              <div>
                <dt>Hash de aprovação</dt>
                <dd>
                  <code>
                    {model?.approval_hash || "Disponível após aprovação"}
                  </code>
                </dd>
              </div>
              <div>
                <dt>Autor</dt>
                <dd>{model?.created_by || "—"}</dd>
              </div>
            </dl>
          </article>
          <aside className="cartao fm-audit">
            <span>AUDIT TRAIL</span>
            <h2>Eventos recentes</h2>
            {data.audit.map((x) => (
              <div key={x.id}>
                <i>✓</i>
                <span>
                  <b>{x.summary}</b>
                  <small>
                    {x.actor} · {new Date(x.created_at).toLocaleString("pt-AO")}
                  </small>
                </span>
              </div>
            ))}
          </aside>
        </div>
      ) : (
        <article className="cartao fm-plan">
          <div className="cab">
            <div>
              <span>PROJEÇÃO INTEGRADA</span>
              <h2>Resultado, investimento e financiamento</h2>
            </div>
            <em>{data.monthly.length} período(s)</em>
          </div>
          {data.monthly.length ? (
            <table>
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Receita</th>
                  <th>Custos/Impostos</th>
                  <th>Resultado</th>
                  <th>CAPEX</th>
                  <th>Financiamento</th>
                  <th>Caixa final</th>
                </tr>
              </thead>
              <tbody>
                {data.monthly.map((x) => (
                  <tr key={x.period}>
                    <td>
                      <b>{x.period}</b>
                    </td>
                    <td>{money(x.revenueMinor, currency)}</td>
                    <td>{money(x.costMinor, currency)}</td>
                    <td>
                      <b>{money(x.netIncomeMinor, currency)}</b>
                    </td>
                    <td>{money(x.capexMinor, currency)}</td>
                    <td>{money(x.financingMinor, currency)}</td>
                    <td
                      className={x.closingCashMinor < 0 ? "negative-text" : ""}
                    >
                      <b>{money(x.closingCashMinor, currency)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="fm-empty">
              Crie um plano, adicione drivers e execute o cálculo.
            </p>
          )}
        </article>
      )}
      {error && !modal && <p className="erro-global">{error}</p>}
      {modal && (
        <div className="modal-inline">
          <form onSubmit={submit}>
            <header>
              <div>
                <small>FINANCIAL MODEL</small>
                <h2>
                  {modal === "createModel"
                    ? "Novo plano financeiro"
                    : "Novo driver financeiro"}
                </h2>
              </div>
              <button type="button" onClick={() => setModal("")}>
                ×
              </button>
            </header>
            {modal === "createModel" ? (
              <>
                <label>
                  Organização
                  <select name="organizationId" required>
                    <option value="">Selecionar</option>
                    {data.organizations.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.code} · {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nome do plano
                  <input
                    name="name"
                    required
                    placeholder="Plano de Negócios 2027–2031"
                  />
                </label>
                <div>
                  <label>
                    Moeda
                    <input
                      name="currency"
                      maxLength={3}
                      defaultValue="AOA"
                      required
                    />
                  </label>
                  <label>
                    Período inicial
                    <input name="startPeriod" type="month" required />
                  </label>
                </div>
                <div>
                  <label>
                    Horizonte (meses)
                    <input
                      name="horizonMonths"
                      type="number"
                      min={1}
                      max={240}
                      defaultValue={60}
                      required
                    />
                  </label>
                  <label>
                    Saldo inicial de caixa
                    <input
                      name="openingCash"
                      inputMode="decimal"
                      defaultValue="0"
                      required
                    />
                  </label>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label>
                    Código
                    <input name="code" required placeholder="REV-001" />
                  </label>
                  <label>
                    Tipo
                    <select name="lineType">
                      <option>Receita</option>
                      <option>Custo</option>
                      <option>CAPEX</option>
                      <option>Financiamento</option>
                      <option>Imposto</option>
                      <option>Outro</option>
                    </select>
                  </label>
                </div>
                <label>
                  Descrição
                  <input
                    name="name"
                    required
                    placeholder="Receita mensal de serviços"
                  />
                </label>
                <label>
                  Valor base mensal
                  <input name="baseAmount" inputMode="decimal" required />
                </label>
                <div>
                  <label>
                    Crescimento mensal (%)
                    <input
                      name="growthPercent"
                      type="number"
                      min={-100}
                      max={1000}
                      step="0.01"
                      defaultValue="0"
                    />
                  </label>
                  <label>
                    Prazo de caixa (meses)
                    <input
                      name="cashLagMonths"
                      type="number"
                      min={0}
                      max={36}
                      defaultValue="0"
                    />
                  </label>
                </div>
              </>
            )}
            {error && <p className="erro-form">{error}</p>}
            <footer>
              <button
                type="button"
                className="secundario"
                onClick={() => setModal("")}
              >
                Cancelar
              </button>
              <button className="primario" disabled={busy}>
                {busy ? "A processar…" : "Confirmar"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
