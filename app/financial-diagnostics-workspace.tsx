"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api-client";
import "./financial-diagnostics.css";
type Framework = {
  id: string;
  name: string;
  description?: string;
  status: string;
  total_weight_bps: number;
  created_by: string;
};
type Run = {
  id: string;
  organization_name: string;
  framework_name: string;
  period: string;
  currency: string;
  run_number: number;
  status: string;
  overall_score_bps: number;
  input_hash: string;
  approval_hash?: string;
};
type Result = {
  id: string;
  metric_code: string;
  metric_label: string;
  value_scaled: number;
  scale: number;
  score_bps?: number;
  severity?: string;
  recommendation?: string;
  formula: string;
  input_hash: string;
};
type Case = {
  id: string;
  name: string;
  organization_name: string;
  currency: string;
  discount_rate_bps: number;
  status: string;
  version_number: number;
  npv_minor?: number;
  irr_bps?: number;
  payback_period?: number;
  flow_count: number;
  input_hash?: string;
  approval_hash?: string;
};
type Data = {
  businessProfile?: {
    sector_code: string;
    sector_name: string;
    industry_pack_code: string;
    pack_name: string;
    pack_description: string;
    methodology_name: string;
    core_business: string;
    pack_version: number;
    pack_status: string;
  } | null;
  availableSectors: Array<{
    sector_code: string;
    sector_name: string;
    pack_code: string;
    pack_name: string;
    pack_description: string;
    methodology_name: string;
    pack_version: number;
    pack_status: string;
  }>;
  installations: Array<{
    id: string;
    pack_name: string;
    pack_version: number;
    installed_at: string;
    status: string;
    framework_name: string;
    framework_status: string;
  }>;
  reports: Array<{id:string;report_number:number;title:string;status:string;input_hash:string;issued_by:string;issued_at:string;payload_json:string}>;
  actions: Array<{id:string;result_id:string;metric_label:string;title:string;owner_email:string;due_date:string;priority:string;status:string;completion_evidence?:string}>;
  owners: Array<{email:string;name:string;role:string}>;
  metricDefinitions: Array<{ code: string; label: string; formula: string }>;
  roles: Array<{
    id: string;
    line_code: string;
    line_name: string;
    role_code: string;
  }>;
  lines: Array<{ id: string; code: string; name: string }>;
  frameworks: Framework[];
  configs: Array<{
    id: string;
    framework_id: string;
    metric_code: string;
    weight_bps: number;
  }>;
  rules: Array<{
    id: string;
    framework_id: string;
    metric_code: string;
    min_value_bps?: number;
    max_value_bps?: number;
    score_bps: number;
    severity: string;
    recommendation: string;
  }>;
  runs: Run[];
  results: Result[];
  cases: Case[];
  flows: Array<{
    id: string;
    period_number: number;
    amount_minor: number;
    note?: string;
  }>;
  sensitivities: Array<{ id: string; rate_bps: number; npv_minor: number }>;
  organizations: Array<{
    id: string;
    code: string;
    name: string;
    currency: string;
  }>;
};
const empty: Data = {
  businessProfile: null,
  availableSectors: [],
  installations: [],
  reports: [],
  actions: [],
  owners: [],
  metricDefinitions: [],
  roles: [],
  lines: [],
  frameworks: [],
  configs: [],
  rules: [],
  runs: [],
  results: [],
  cases: [],
  flows: [],
  sensitivities: [],
  organizations: [],
};
const roles = [
  ["REVENUE", "Receita"],
  ["COGS", "Custo das vendas"],
  ["OPEX", "Custos operacionais"],
  ["INTEREST", "Juros"],
  ["TAX", "Impostos"],
  ["CASH", "Caixa"],
  ["RECEIVABLES", "Clientes"],
  ["INVENTORY", "Inventários"],
  ["OTHER_CURRENT_ASSET", "Outros ativos correntes"],
  ["NONCURRENT_ASSET", "Ativos não correntes"],
  ["PAYABLES", "Fornecedores"],
  ["CURRENT_DEBT", "Dívida corrente"],
  ["OTHER_CURRENT_LIABILITY", "Outros passivos correntes"],
  ["LONGTERM_DEBT", "Dívida de longo prazo"],
  ["OTHER_NONCURRENT_LIABILITY", "Outros passivos não correntes"],
  ["EQUITY", "Capital próprio"],
  ["OPERATING_CASH_FLOW", "Fluxo operacional"],
];
export function FinancialDiagnosticsWorkspace() {
  const [data, setData] = useState<Data>(empty),
    [view, setView] = useState("Diagnóstico"),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState(""),
    [selectedCase, setSelectedCase] = useState(""),
    [context, setContext] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      apiFetch(
        `/api/v1/financial-diagnostics?run=${selected}&case=${selectedCase}`,
      )
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          setData(b);
        })
        .catch((e) => setError(e.message)),
    [selected, selectedCase],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function command(payload: Record<string, string>) {
    setBusy(true);
    setError("");
    const r = await apiFetch(
        `/api/v1/financial-diagnostics?run=${selected}&case=${selectedCase}`,
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
    if (b.runs?.[0] && payload.type === "calculateDiagnostic")
      setSelected(b.runs[0].id);
    if (b.cases?.[0] && payload.type === "createInvestmentCase")
      setSelectedCase(b.cases[0].id);
    setModal("");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await command({
      type: modal,
      frameworkId: context || selected,
      caseId: context || selectedCase,
      runId: selected,
      resultId: modal === "createImprovementAction" ? context : "",
      actionId: modal === "completeImprovementAction" ? context : "",
      ...(Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<
        string,
        string
      >),
    });
  }
  const run = data.runs.find((x) => x.id === selected),
    item = data.cases.find((x) => x.id === selectedCase),
    money = (n: number, c: string) =>
      new Intl.NumberFormat("pt-PT", {
        style: "currency",
        currency: c,
        maximumFractionDigits: 0,
      }).format(n / 100),
    critical = data.results.filter((x) => x.severity === "Crítica").length;
  return (
    <section className="diagnostics">
      <header className="dg-top">
        <div>
          <span>FINANCE & FP&A · DIAGNOSTICS & INVESTMENT</span>
          <h1>Da situação financeira à decisão de investimento</h1>
          <p>
            Rácios explicáveis, score configurável, recomendações, VPL, TIR,
            payback e sensibilidade.
          </p>
        </div>
        <div>
          {view === "Diagnóstico" ? (
            <button
              className="primario"
              onClick={() => setModal("calculateDiagnostic")}
            >
              Executar diagnóstico
            </button>
          ) : view === "Investimento" ? (
            <button
              className="primario"
              onClick={() => setModal("createInvestmentCase")}
            >
              ＋ Caso de investimento
            </button>
          ) : (
            <button
              className="primario"
              onClick={() => setModal("createFramework")}
            >
              ＋ Framework
            </button>
          )}
        </div>
      </header>
      <section className="dg-kpis">
        <article>
          <span>Score financeiro</span>
          <strong>
            {run ? `${(run.overall_score_bps / 100).toFixed(0)}%` : "—"}
          </strong>
          <small>{run?.framework_name || "Sem diagnóstico"}</small>
        </article>
        <article className={critical ? "risk" : ""}>
          <span>Indicadores críticos</span>
          <strong>{critical}</strong>
          <small>Com recomendação configurada</small>
        </article>
        <article>
          <span>VPL</span>
          <strong>
            {item?.npv_minor != null
              ? money(item.npv_minor, item.currency)
              : "—"}
          </strong>
          <small>{item?.name || "Sem avaliação"}</small>
        </article>
        <article>
          <span>TIR</span>
          <strong>
            {item?.irr_bps != null
              ? `${(item.irr_bps / 100).toFixed(2)}%`
              : "—"}
          </strong>
          <small>Payback {item?.payback_period ?? "—"} período(s)</small>
        </article>
      </section>
      <nav className="dg-tabs">
        {["Diagnóstico", "Investimento", "Metodologia"].map((x) => (
          <button
            key={x}
            className={view === x ? "active" : ""}
            onClick={() => setView(x)}
          >
            {x}
          </button>
        ))}
      </nav>
      {view === "Diagnóstico" ? (
        <div className="dg-grid">
          <article className="cartao dg-results">
            <div className="cab">
              <div>
                <span>SAÚDE FINANCEIRA</span>
                <h2>Resultado e causas</h2>
              </div>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Selecionar diagnóstico</option>
                {data.runs.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.period} · {x.organization_name} · v{x.run_number} ·{" "}
                    {x.status}
                  </option>
                ))}
              </select>
            </div>
            {data.results.length ? (
              data.results.map((x) => (
                <section key={x.id}>
                  <header>
                    <i className={(x.severity || "").toLowerCase()}>
                      {x.severity === "Saudável"
                        ? "✓"
                        : x.severity === "Crítica"
                          ? "!"
                          : "◷"}
                    </i>
                    <span>
                      <b>{x.metric_label}</b>
                      <small>{x.formula}</small>
                    </span>
                    <strong>
                      {x.scale === 10000
                        ? `${(x.value_scaled / 100).toFixed(2)}%`
                        : money(x.value_scaled, run?.currency || "AOA")}
                    </strong>
                    <em>
                      {x.score_bps == null
                        ? "Sem score"
                        : `${(x.score_bps / 100).toFixed(0)}%`}
                    </em>
                  </header>
                  {x.recommendation && (
                    <div>
                      <b>{x.severity}: </b>
                      {x.recommendation}
                      {run?.status === "Aprovado" && (
                        <button onClick={() => {setContext(x.id);setModal("createImprovementAction")}}>
                          Criar ação
                        </button>
                      )}
                    </div>
                  )}
                </section>
              ))
            ) : (
              <p className="dg-empty">
                Configure a metodologia, associe as linhas financeiras e execute
                o primeiro diagnóstico.
              </p>
            )}
          </article>
          <aside className="cartao dg-summary">
            <span>AVALIAÇÃO INTEGRAL</span>
            <h2>
              {run
                ? `${(run.overall_score_bps / 100).toFixed(0)} / 100`
                : "Sem resultado"}
            </h2>
            <p>
              O score é a média ponderada das métricas classificadas pelas
              regras do framework selecionado.
            </p>
            {run?.status === "Calculado" && (
              <button
                onClick={() =>
                  command({ type: "approveDiagnostic", runId: run.id })
                }
              >
                Aprovar diagnóstico
              </button>
            )}
            {run?.status === "Aprovado" && !data.reports.length && (
              <button onClick={() => command({type:"issueDiagnosticReport",runId:run.id})}>
                Emitir relatório formal
              </button>
            )}
            {data.reports.map(report=><section key={report.id} className="dg-issued"><b>Relatório #{report.report_number} · {report.status}</b><small>{report.title}</small><code>{report.input_hash}</code></section>)}
            <dl>
              <dt>Input hash</dt>
              <dd>
                <code>{run?.input_hash || "—"}</code>
              </dd>
              <dt>Estado</dt>
              <dd>{run?.status || "—"}</dd>
            </dl>
            {data.actions.length>0&&<section className="dg-actions"><h3>Plano de melhoria</h3>{data.actions.map(action=><article key={action.id}><b>{action.title}</b><small>{action.metric_label} · {action.owner_email} · até {action.due_date}</small><em>{action.priority} · {action.status}</em>{action.status==="Aberta"&&<button onClick={()=>command({type:"transitionImprovementAction",actionId:action.id,status:"Em curso",runId:run!.id})}>Iniciar</button>}{action.status==="Em curso"&&<button onClick={()=>{setContext(action.id);setModal("completeImprovementAction")}}>Concluir</button>}</article>)}</section>}
          </aside>
        </div>
      ) : view === "Investimento" ? (
        <div className="dg-grid">
          <article className="cartao dg-investments">
            <div className="cab">
              <div>
                <span>ATRATIVIDADE FINANCEIRA</span>
                <h2>Casos e retornos</h2>
              </div>
              <select
                value={selectedCase}
                onChange={(e) => setSelectedCase(e.target.value)}
              >
                <option value="">Selecionar caso</option>
                {data.cases.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} · v{x.version_number} · {x.status}
                  </option>
                ))}
              </select>
            </div>
            {item && (
              <>
                <header className="case-head">
                  <span>
                    <b>{item.name}</b>
                    <small>
                      {item.organization_name} · taxa de desconto{" "}
                      {(item.discount_rate_bps / 100).toFixed(2)}%
                    </small>
                  </span>
                  <em>{item.status}</em>
                  <nav>
                    {item.status === "Rascunho" && (
                      <>
                        <button
                          onClick={() => {
                            setContext(item.id);
                            setModal("addCashFlow");
                          }}
                        >
                          ＋ Fluxo
                        </button>
                        <button
                          onClick={() =>
                            command({
                              type: "calculateInvestment",
                              caseId: item.id,
                            })
                          }
                        >
                          Calcular
                        </button>
                      </>
                    )}
                    {item.status === "Calculado" && (
                      <button
                        onClick={() =>
                          command({
                            type: "approveInvestment",
                            caseId: item.id,
                          })
                        }
                      >
                        Aprovar
                      </button>
                    )}
                  </nav>
                </header>
                <table>
                  <thead>
                    <tr>
                      <th>Período</th>
                      <th>Fluxo</th>
                      <th>Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.flows.map((x) => (
                      <tr key={x.id}>
                        <td>{x.period_number}</td>
                        <td>
                          <b>{money(x.amount_minor, item.currency)}</b>
                        </td>
                        <td>{x.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </article>
          <aside className="cartao dg-sensitivity">
            <span>SENSIBILIDADE</span>
            <h2>VPL por taxa</h2>
            {data.sensitivities.map((x) => (
              <div key={x.id}>
                <span>{(x.rate_bps / 100).toFixed(2)}%</span>
                <b className={x.npv_minor < 0 ? "negative" : ""}>
                  {money(x.npv_minor, item?.currency || "AOA")}
                </b>
              </div>
            ))}
            <footer>
              O VPL e a TIR usam cálculo fixed-point e os fluxos aprovados nunca
              são alterados por IA.
            </footer>
          </aside>
        </div>
      ) : (
        <div className="dg-method">
          <article className="cartao dg-industry" style={{ gridColumn: "1 / -1", padding: 21 }}>
            <div>
              <span>CONTEXTO DO NEGÓCIO</span>
              <h2>
                {data.businessProfile?.sector_name ||
                  "Industry Pack por configurar"}
              </h2>
              <p>
                {data.businessProfile?.core_business ||
                  "Defina o setor e o core business para alinhar pesos, indicadores e recomendações à atividade da empresa."}
              </p>
            </div>
            <dl>
              <dt>Pack instalado</dt>
              <dd>{data.businessProfile?.pack_name || "—"}</dd>
              <dt>Metodologia</dt>
              <dd>{data.businessProfile?.methodology_name || "—"}</dd>
              <dt>Versão</dt>
              <dd>
                {data.businessProfile
                  ? `v${data.businessProfile.pack_version} · ${data.businessProfile.pack_status}`
                  : "—"}
              </dd>
            </dl>
            <button
              className="primario"
              onClick={() => setModal("applyIndustryPack")}
            >
              {data.businessProfile
                ? "Trocar Industry Pack"
                : "Aplicar Industry Pack"}
            </button>
          </article>
          <article className="cartao dg-frameworks">
            <div className="cab">
              <div>
                <span>FRAMEWORKS</span>
                <h2>Pesos e regras configuráveis</h2>
              </div>
            </div>
            {data.frameworks.map((f) => (
              <section key={f.id}>
                <header>
                  <i>{f.status === "Ativo" ? "✓" : "◇"}</i>
                  <span>
                    <b>{f.name}</b>
                    <small>
                      {f.description || "Sem descrição"} · pesos{" "}
                      {(f.total_weight_bps / 100).toFixed(0)}%
                    </small>
                  </span>
                  <em>{f.status}</em>
                  {f.status === "Rascunho" && (
                    <nav>
                      <button
                        onClick={() => {
                          setContext(f.id);
                          setModal("addMetric");
                        }}
                      >
                        ＋ Métrica
                      </button>
                      <button
                        onClick={() => {
                          setContext(f.id);
                          setModal("addRule");
                        }}
                      >
                        ＋ Regra
                      </button>
                      <button
                        onClick={() =>
                          command({
                            type: "activateFramework",
                            frameworkId: f.id,
                          })
                        }
                      >
                        Ativar
                      </button>
                    </nav>
                  )}
                </header>
                <div>
                  {data.configs
                    .filter((x) => x.framework_id === f.id)
                    .map((x) => (
                      <span key={x.id}>
                        <b>
                          {
                            data.metricDefinitions.find(
                              (m) => m.code === x.metric_code,
                            )?.label
                          }
                        </b>{" "}
                        {(x.weight_bps / 100).toFixed(0)}%
                      </span>
                    ))}
                </div>
              </section>
            ))}
          </article>
          <aside className="cartao dg-roles">
            <div className="cab">
              <div>
                <span>SEMÂNTICA</span>
                <h2>Linhas → papéis</h2>
              </div>
              <button onClick={() => setModal("assignRole")}>
                ＋ Associar
              </button>
            </div>
            {data.roles.map((x) => (
              <div key={x.id}>
                <code>{x.line_code}</code>
                <span>
                  <b>{x.line_name}</b>
                  <small>{roles.find((r) => r[0] === x.role_code)?.[1]}</small>
                </span>
              </div>
            ))}
          </aside>
        </div>
      )}
      {error && !modal && <p className="erro-global">{error}</p>}
      {modal && (
        <div className="modal-inline">
          <form onSubmit={submit}>
            <header>
              <div>
                <small>DIAGNOSTICS & INVESTMENT</small>
                <h2>{title(modal)}</h2>
              </div>
              <button type="button" onClick={() => setModal("")}>
                ×
              </button>
            </header>
            <ModalFields type={modal} data={data} />
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
function title(x: string) {
  return (
    (
      {
        createFramework: "Novo framework",
        addMetric: "Adicionar métrica",
        addRule: "Adicionar regra",
        assignRole: "Associar papel financeiro",
        calculateDiagnostic: "Executar diagnóstico",
        createInvestmentCase: "Novo caso de investimento",
        addCashFlow: "Adicionar cash-flow",
        applyIndustryPack: "Contexto e Industry Pack",
        createImprovementAction: "Nova ação de melhoria",
        completeImprovementAction: "Concluir ação com evidência",
      } as Record<string, string>
    )[x] || x
  );
}
function ModalFields({ type, data }: { type: string; data: Data }) {
  if(type==="createImprovementAction")return <><label>Ação<input name="title" minLength={5} required placeholder="Ex.: Reduzir prazo médio de cobrança"/></label><label>Responsável<select name="ownerEmail" required><option value="">Selecionar</option>{data.owners.map(x=><option key={x.email} value={x.email}>{x.name} · {x.role}</option>)}</select></label><div><label>Prazo<input name="dueDate" type="date" required/></label><label>Prioridade<select name="priority"><option>Média</option><option>Alta</option><option>Crítica</option><option>Baixa</option></select></label></div></>;
  if(type==="completeImprovementAction")return <label>Evidência de conclusão<textarea name="evidence" minLength={10} rows={4} required placeholder="Descreva o resultado e indique a evidência verificável."/><input type="hidden" name="status" value="Concluída"/></label>;
  if (type === "applyIndustryPack")
    return (
      <>
        <label>
          Setor / atividade principal
          <select
            name="sectorCode"
            defaultValue={data.businessProfile?.sector_code || ""}
            required
          >
            <option value="">Selecionar setor</option>
            {data.availableSectors.map((x) => (
              <option key={x.sector_code} value={x.sector_code}>
                {x.sector_name} · {x.pack_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Core business
          <textarea
            name="coreBusiness"
            defaultValue={data.businessProfile?.core_business || ""}
            minLength={10}
            rows={4}
            placeholder="Descreva o que a empresa vende, a quem e como cria valor."
            required
          />
        </label>
        <p className="dg-pack-note">
          A aplicação cria um novo framework em rascunho. Um segundo utilizador
          autorizado deverá validá-lo e ativá-lo.
        </p>
      </>
    );
  if (type === "createFramework")
    return (
      <>
        <label>
          Nome
          <input name="name" required />
        </label>
        <label>
          Descrição
          <textarea name="description" rows={3} />
        </label>
      </>
    );
  if (type === "addMetric")
    return (
      <>
        <label>
          Métrica
          <select name="metricCode" required>
            <option value="">Selecionar</option>
            {data.metricDefinitions.slice(0, 10).map((x) => (
              <option key={x.code} value={x.code}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Peso (%)
          <input
            name="weightPercent"
            type="number"
            min="0.01"
            max="100"
            step="0.01"
            required
          />
        </label>
      </>
    );
  if (type === "addRule")
    return (
      <>
        <label>
          Métrica
          <select name="metricCode" required>
            <option value="">Selecionar</option>
            {data.metricDefinitions.slice(0, 10).map((x) => (
              <option key={x.code} value={x.code}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <label>
            Mínimo (%)
            <input name="minValue" type="number" step="0.01" />
          </label>
          <label>
            Máximo (%)
            <input name="maxValue" type="number" step="0.01" />
          </label>
        </div>
        <div>
          <label>
            Score (%)
            <input
              name="scorePercent"
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
            />
          </label>
          <label>
            Severidade
            <select name="severity">
              <option>Saudável</option>
              <option>Atenção</option>
              <option>Crítica</option>
            </select>
          </label>
        </div>
        <label>
          Recomendação
          <textarea name="recommendation" minLength={10} rows={3} required />
        </label>
      </>
    );
  if (type === "assignRole")
    return (
      <>
        <label>
          Linha financeira
          <select name="lineId" required>
            <option value="">Selecionar</option>
            {data.lines.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} · {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Papel diagnóstico
          <select name="roleCode" required>
            {roles.map((x) => (
              <option key={x[0]} value={x[0]}>
                {x[1]}
              </option>
            ))}
          </select>
        </label>
      </>
    );
  if (type === "calculateDiagnostic")
    return (
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
          Framework ativo
          <select name="frameworkId" required>
            <option value="">Selecionar</option>
            {data.frameworks
              .filter((x) => x.status === "Ativo")
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </label>
        <div>
          <label>
            Período
            <input name="period" type="month" required />
          </label>
          <label>
            Moeda
            <input name="currency" maxLength={3} defaultValue="AOA" required />
          </label>
        </div>
      </>
    );
  if (type === "createInvestmentCase")
    return (
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
          Nome
          <input name="name" required />
        </label>
        <div>
          <label>
            Moeda
            <input name="currency" maxLength={3} defaultValue="AOA" required />
          </label>
          <label>
            Taxa de desconto (%)
            <input name="discountRate" type="number" step="0.01" required />
          </label>
        </div>
      </>
    );
  return (
    <>
      <label>
        Período
        <input name="periodNumber" type="number" min="0" max="100" required />
      </label>
      <label>
        Fluxo de caixa
        <input name="amount" inputMode="decimal" required />
      </label>
      <label>
        Nota
        <input name="note" />
      </label>
    </>
  );
}
