"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api-client";
import "./consolidation.css";
type RateSet = {
  id: string;
  name: string;
  period: string;
  base_currency: string;
  status: string;
  rate_count: number;
  created_by: string;
};
type Rate = {
  id: string;
  rate_set_id: string;
  source_currency: string;
  target_currency: string;
  rate_scaled: number;
};
type Run = {
  id: string;
  rate_set_id: string;
  period: string;
  target_currency: string;
  run_number: number;
  status: string;
  source_count: number;
  organization_count: number;
  currency_count: number;
  converted_total_minor: number;
  adjustment_total_minor: number;
  reported_total_minor: number;
  input_hash: string;
  approval_hash?: string;
  created_by: string;
};
type Line = {
  id: string;
  organization_name: string;
  source_currency: string;
  target_currency: string;
  line_code: string;
  line_name: string;
  source_amount_minor: number;
  rate_scaled: number;
  converted_amount_minor: number;
  source_count: number;
  source_hash: string;
};
type Adjustment = {
  id: string;
  line_code: string;
  line_name: string;
  amount_minor: number;
  adjustment_type: string;
  reason: string;
  evidence: string;
};
type Data = {
  rateSets: RateSet[];
  rates: Rate[];
  runs: Run[];
  lines: Line[];
  adjustments: Adjustment[];
  currencies: string[];
};
const empty: Data = {
  rateSets: [],
  rates: [],
  runs: [],
  lines: [],
  adjustments: [],
  currencies: [],
};
export function ConsolidationWorkspace() {
  const [data, setData] = useState<Data>(empty),
    [view, setView] = useState("Consolidações"),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState(""),
    [activeRun, setActiveRun] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    (run = activeRun) =>
      apiFetch(`/api/v1/consolidation${run ? `?run=${run}` : ""}`)
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          setData(b);
        })
        .catch((e) => setError(e.message)),
    [activeRun],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function command(payload: Record<string, string>) {
    setBusy(true);
    setError("");
    const r = await apiFetch(
        `/api/v1/consolidation${activeRun ? `?run=${activeRun}` : ""}`,
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
    setModal("");
    setSelected("");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await command({
      type: modal,
      rateSetId: selected,
      runId: selected,
      ...(Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<
        string,
        string
      >),
    });
  }
  const money = (n: number, c: string) =>
      new Intl.NumberFormat("pt-PT", { style: "currency", currency: c }).format(
        n / 100,
      ),
    latest = data.runs[0],
    approvedSets = data.rateSets.filter((x) => x.status === "Aprovado"),
    open = (type: string, id = "") => {
      setError("");
      setSelected(id);
      setModal(type);
    };
  return (
    <section className="consolidation">
      <div className="consolidation-top">
        <div>
          <span>FINANCE & FP&A · CONSOLIDATION</span>
          <h1>Várias empresas, uma visão financeira comparável</h1>
          <p>
            Câmbio versionado, conversão rastreável e eliminações documentadas.
          </p>
        </div>
        <div>
          <button className="secundario" onClick={() => open("createRateSet")}>
            ＋ Taxas
          </button>
          <button className="primario" onClick={() => open("calculateRun")}>
            ▶ Consolidar
          </button>
        </div>
      </div>
      <section className="consolidation-kpis">
        <article>
          <span>Último período</span>
          <strong>{latest?.period || "—"}</strong>
          <small>{latest?.status || "Sem consolidação"}</small>
        </article>
        <article>
          <span>Total convertido</span>
          <strong>
            {latest
              ? money(latest.converted_total_minor, latest.target_currency)
              : "—"}
          </strong>
          <small>{latest?.organization_count || 0} empresa(s)</small>
        </article>
        <article>
          <span>Eliminações</span>
          <strong>
            {latest
              ? money(latest.adjustment_total_minor, latest.target_currency)
              : "—"}
          </strong>
          <small>Ajustamentos documentados</small>
        </article>
        <article>
          <span>Total reportado</span>
          <strong>
            {latest
              ? money(latest.reported_total_minor, latest.target_currency)
              : "—"}
          </strong>
          <small>{latest?.currency_count || 0} moeda(s) de origem</small>
        </article>
      </section>
      <nav className="consolidation-tabs">
        {["Consolidações", "Taxas de câmbio", "Drill-down"].map((x) => (
          <button
            key={x}
            className={view === x ? "active" : ""}
            onClick={() => setView(x)}
          >
            {x}
          </button>
        ))}
      </nav>
      {view === "Taxas de câmbio" ? (
        <div className="fx-layout">
          <article className="cartao fx-sets">
            <div className="cab">
              <div>
                <span>TABELAS VERSIONADAS</span>
                <h2>Taxas por período</h2>
              </div>
            </div>
            {data.rateSets.map((s) => (
              <section key={s.id}>
                <header>
                  <i>{s.status === "Aprovado" ? "✓" : "◇"}</i>
                  <span>
                    <b>{s.name}</b>
                    <small>
                      {s.period} · moeda de reporte {s.base_currency}
                    </small>
                  </span>
                  <p>
                    <b>{s.rate_count}</b>
                    <small>taxas</small>
                  </p>
                  <em>{s.status}</em>
                  {s.status === "Rascunho" && (
                    <nav>
                      <button onClick={() => open("addRate", s.id)}>
                        ＋ Taxa
                      </button>
                      <button
                        onClick={() =>
                          command({ type: "approveRateSet", rateSetId: s.id })
                        }
                      >
                        Aprovar
                      </button>
                    </nav>
                  )}
                </header>
                <div>
                  {data.rates
                    .filter((r) => r.rate_set_id === s.id)
                    .map((r) => (
                      <p key={r.id}>
                        <span>1 {r.source_currency}</span>
                        <b>
                          ={" "}
                          {(r.rate_scaled / 100000000).toLocaleString("pt-PT", {
                            maximumFractionDigits: 8,
                          })}{" "}
                          {r.target_currency}
                        </b>
                      </p>
                    ))}
                </div>
              </section>
            ))}
          </article>
          <aside className="cartao fx-rule">
            <span>PRECISÃO</span>
            <h2>8 casas decimais</h2>
            <p>
              As taxas são guardadas como inteiros escalados. A conversão não
              depende de ponto flutuante nem de IA.
            </p>
            <strong>
              100 000 000<small>fator de escala</small>
            </strong>
          </aside>
        </div>
      ) : view === "Consolidações" ? (
        <article className="cartao consolidation-runs">
          <div className="cab">
            <div>
              <span>RUNS CONSOLIDADOS</span>
              <h2>Conversões e aprovação</h2>
            </div>
            <em>{data.runs.length} run(s)</em>
          </div>
          {data.runs.length ? (
            data.runs.map((r) => (
              <section key={r.id}>
                <i>{r.status === "Aprovado" ? "✓" : "◷"}</i>
                <span>
                  <b>
                    {r.period} · {r.target_currency} · versão {r.run_number}
                  </b>
                  <small>
                    {r.organization_count} empresa(s) · {r.currency_count}{" "}
                    moeda(s) · {r.source_count} fontes
                  </small>
                  <code>#{r.input_hash.slice(0, 12)}</code>
                </span>
                <p>
                  <b>{money(r.reported_total_minor, r.target_currency)}</b>
                  <small>Reportado</small>
                </p>
                <em>{r.status}</em>
                <nav>
                  <button
                    onClick={() => {
                      setActiveRun(r.id);
                      setView("Drill-down");
                    }}
                  >
                    Abrir
                  </button>
                  {r.status === "Calculado" && (
                    <>
                      <button onClick={() => open("addAdjustment", r.id)}>
                        ＋ Ajuste
                      </button>
                      <button
                        onClick={() =>
                          command({ type: "approveRun", runId: r.id })
                        }
                      >
                        Aprovar
                      </button>
                    </>
                  )}
                </nav>
              </section>
            ))
          ) : (
            <p className="consolidation-empty">
              Aprove uma tabela de taxas e calcule o primeiro período.
            </p>
          )}
        </article>
      ) : (
        <article className="cartao consolidation-drill">
          <div className="cab">
            <div>
              <span>DRILL-DOWN</span>
              <h2>Origem → taxa → valor convertido</h2>
            </div>
            <select
              value={activeRun}
              onChange={(e) => setActiveRun(e.target.value)}
            >
              <option value="">Selecionar run</option>
              {data.runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.period} · {r.target_currency} · versão {r.run_number} ·{" "}
                  {r.status}
                </option>
              ))}
            </select>
          </div>
          {activeRun ? (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Linha</th>
                      <th>Origem</th>
                      <th>Taxa</th>
                      <th>Convertido</th>
                      <th>Evidência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.organization_name}</td>
                        <td>
                          <b>{l.line_name}</b>
                          <small>{l.line_code}</small>
                        </td>
                        <td>
                          {money(l.source_amount_minor, l.source_currency)}
                        </td>
                        <td>{(l.rate_scaled / 100000000).toFixed(6)}</td>
                        <td>
                          <b>
                            {money(l.converted_amount_minor, l.target_currency)}
                          </b>
                        </td>
                        <td>
                          <code>#{l.source_hash.slice(0, 9)}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.adjustments.length > 0 && (
                <section className="adjustment-list">
                  <h3>Eliminações e ajustamentos</h3>
                  {data.adjustments.map((a) => (
                    <div key={a.id}>
                      <span>
                        <b>
                          {a.adjustment_type} · {a.line_name}
                        </b>
                        <small>
                          {a.reason} · evidência: {a.evidence}
                        </small>
                      </span>
                      <strong>
                        {money(
                          a.amount_minor,
                          data.runs.find((r) => r.id === activeRun)
                            ?.target_currency || "AOA",
                        )}
                      </strong>
                    </div>
                  ))}
                </section>
              )}
            </>
          ) : (
            <p className="consolidation-empty">
              Selecione uma consolidação para rastrear as fontes.
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
                <small>FINANCIAL CONSOLIDATION</small>
                <h2>
                  {modal === "createRateSet"
                    ? "Nova tabela de taxas"
                    : modal === "addRate"
                      ? "Adicionar taxa"
                      : modal === "calculateRun"
                        ? "Calcular consolidação"
                        : "Eliminação ou ajustamento"}
                </h2>
              </div>
              <button type="button" onClick={() => setModal("")}>
                ×
              </button>
            </header>
            {modal === "createRateSet" ? (
              <>
                <label>
                  Nome
                  <input name="name" required />
                </label>
                <div>
                  <label>
                    Período
                    <input name="period" type="month" required />
                  </label>
                  <label>
                    Moeda de reporte
                    <input
                      name="baseCurrency"
                      maxLength={3}
                      defaultValue="AOA"
                      required
                    />
                  </label>
                </div>
              </>
            ) : modal === "addRate" ? (
              <>
                <label>
                  Moeda de origem
                  <input
                    name="sourceCurrency"
                    maxLength={3}
                    required
                    placeholder="USD"
                  />
                </label>
                <label>
                  Taxa para a moeda de reporte
                  <input
                    name="rate"
                    inputMode="decimal"
                    required
                    placeholder="912,50000000"
                  />
                </label>
              </>
            ) : modal === "calculateRun" ? (
              <label>
                Tabela aprovada
                <select name="rateSetId" required>
                  <option value="">Selecionar</option>
                  {approvedSets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.period} · {s.base_currency}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <div>
                  <label>
                    Código da linha
                    <input name="lineCode" required />
                  </label>
                  <label>
                    Tipo
                    <select name="adjustmentType">
                      <option>Eliminação</option>
                      <option>Ajustamento</option>
                    </select>
                  </label>
                </div>
                <label>
                  Descrição
                  <input name="lineName" required />
                </label>
                <label>
                  Montante na moeda de reporte
                  <input
                    name="amount"
                    required
                    placeholder="Use negativo para eliminar"
                  />
                </label>
                <label>
                  Motivo
                  <textarea name="reason" minLength={10} rows={3} required />
                </label>
                <label>
                  Evidência
                  <input
                    name="evidence"
                    required
                    placeholder="Documento, referência ou reconciliação"
                  />
                </label>
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
