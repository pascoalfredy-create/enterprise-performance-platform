"use client";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api-client";
import "./commercial-suite.css";
type Data = {
  generatedAt: string;
  period: string;
  currency: string;
  metrics: Record<string, number | null>;
  profiles: Array<{
    code: string;
    name: string;
    focus: string;
    kpis: string[];
  }>;
  reportsCatalog: Array<{
    code: string;
    name: string;
    module: string;
    audience: string;
    frequency: string;
    exports: string;
  }>;
  commercialReadiness: { score: number; phases: string[] };
};
const labels: Record<string, string> = {
  actual: "Actual consolidado",
  budget: "Budget",
  variance: "Desvio",
  varianceBps: "Desvio %",
  employees: "Colaboradores",
  payrollCost: "Custo Payroll",
  goals: "Objetivos ativos",
  reviewScore: "Score de performance",
  openActions: "Ações abertas",
  openRecruitment: "Vagas abertas",
  approvedTimesheets: "Timesheets aprovados",
  overtimeMinutes: "Horas extra",
  plannedHeadcount: "Headcount planeado",
  plannedWorkforceCost: "Custo Workforce",
  integrationRejected: "Rejeições de integração",
  reports: "Relatórios emitidos",
  workflowTasks: "Tarefas pendentes",
  diagnosticScore: "Saúde financeira",
  investmentNpv: "VPL de investimentos",
};
const moneyKeys = new Set([
    "actual",
    "budget",
    "variance",
    "payrollCost",
    "plannedWorkforceCost",
    "investmentNpv",
  ]),
  percentKeys = new Set(["varianceBps", "reviewScore", "diagnosticScore"]);
export function CommercialSuite({
  onNavigate,
}: {
  onNavigate: (x: string) => void;
}) {
  const [data, setData] = useState<Data | null>(null),
    [profile, setProfile] = useState("EXECUTIVO"),
    [tab, setTab] = useState<
      "cockpit" | "reports" | "templates" | "tour" | "readiness"
    >("cockpit"),
    [step, setStep] = useState(0),
    [tourStarted, setTourStarted] = useState(false),
    [query, setQuery] = useState("");
  useEffect(() => {
    apiFetch("/api/v1/commercial-suite")
      .then((r) => r.json())
      .then(setData);
  }, []);
  const selected = data?.profiles.find((x) => x.code === profile),
    reports = useMemo(
      () =>
        data?.reportsCatalog.filter((x) =>
          (x.name + x.module + x.audience)
            .toLowerCase()
            .includes(query.toLowerCase()),
        ) || [],
      [data, query],
    );
  if (!data)
    return (
      <section className="commercial-loading">
        A preparar o cockpit comercial…
      </section>
    );
  const value = (key: string) => {
    const n = Number(data.metrics[key] || 0);
    if (moneyKeys.has(key))
      return new Intl.NumberFormat("pt-AO", {
        style: "currency",
        currency: data.currency,
        maximumFractionDigits: 0,
      }).format(n / 100);
    if (percentKeys.has(key)) return `${(n / 100).toFixed(1)}%`;
    if (key === "overtimeMinutes") return `${(n / 60).toFixed(1)} h`;
    return new Intl.NumberFormat("pt-AO").format(n);
  };
  const exportCsv = () => {
    const rows = [
        [
          "Código",
          "Relatório",
          "Módulo",
          "Público",
          "Frequência",
          "Exportação",
        ],
        ...reports.map((x) => [
          x.code,
          x.name,
          x.module,
          x.audience,
          x.frequency,
          x.exports,
        ]),
      ],
      csv = rows
        .map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(";"))
        .join("\n"),
      a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    );
    a.download = "catalogo-relatorios-enterprise.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const templates = [
    {
      name: "Actual e Budget",
      module: "Finance & FP&A",
      file: "actual_budget.csv",
      headers: [
        "organization_code",
        "period",
        "scenario",
        "currency",
        "line_code",
        "line_name",
        "dimension_code",
        "amount",
      ],
    },
    {
      name: "Forecast e Cenários",
      module: "Finance & FP&A",
      file: "forecast_scenarios.csv",
      headers: [
        "version_name",
        "period",
        "organization_code",
        "currency",
        "line_code",
        "amount",
        "assumption_note",
      ],
    },
    {
      name: "Employee Master",
      module: "HCM",
      file: "employee_master.csv",
      headers: [
        "employee_number",
        "first_name",
        "last_name",
        "organization_code",
        "job_title",
        "hire_date",
        "status",
      ],
    },
    {
      name: "Payroll Components",
      module: "Payroll",
      file: "payroll_components.csv",
      headers: [
        "employee_number",
        "component_code",
        "category",
        "method",
        "value",
        "rate_bps",
        "effective_from",
      ],
    },
    {
      name: "Workforce Plan",
      module: "Workforce",
      file: "workforce_plan.csv",
      headers: [
        "organization_code",
        "department_code",
        "job_title",
        "period",
        "headcount",
        "monthly_cost",
        "movement_type",
        "assumption_note",
      ],
    },
    {
      name: "Performance Goals",
      module: "Performance",
      file: "performance_goals.csv",
      headers: [
        "cycle",
        "owner_email",
        "organization_code",
        "title",
        "metric",
        "unit",
        "direction",
        "start",
        "target",
        "weight_bps",
      ],
    },
    {
      name: "Consolidação e Câmbio",
      module: "Finance & FP&A",
      file: "fx_consolidation.csv",
      headers: [
        "period",
        "source_currency",
        "target_currency",
        "rate",
        "organization_code",
        "line_code",
        "source_amount",
      ],
    },
    {
      name: "Document Hub Index",
      module: "Document Hub",
      file: "document_index.csv",
      headers: [
        "module_code",
        "folder",
        "title",
        "reference",
        "document_date",
        "owner_email",
        "confidentiality",
      ],
    },
  ];
  const downloadTemplate = (x: (typeof templates)[number]) => {
    const sample = x.headers
        .map((h) =>
          h.includes("period")
            ? "2026-08"
            : h.includes("currency")
              ? "AOA"
              : h.includes("amount")
                ? "0"
                : "",
        )
        .join(";"),
      a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob(["\ufeff" + x.headers.join(";") + "\n" + sample + "\n"], {
        type: "text/csv;charset=utf-8",
      }),
    );
    a.download = x.file;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const tour = [
    {
      eyebrow: "ABERTURA",
      title: "A empresa numa única visão",
      text: "Apresente a Cálculo Sutil como uma empresa integrada e mostre como a direção passa de dados dispersos para decisões governadas.",
      evidence: [
        "Actual, Budget e desvio",
        "Saúde financeira",
        "Ações e decisões pendentes",
      ],
      question:
        "Hoje, quanto tempo demora a obter uma visão consolidada e confiável da empresa?",
      target: "Visão geral",
    },
    {
      eyebrow: "FINANCE & FP&A",
      title: "Do resultado à causa do desvio",
      text: "Compare Actual, Budget, Forecast e cenários. Mostre que cada indicador permite chegar ao driver, à origem e à ação recomendada.",
      evidence: [
        "Desvio em valor e percentagem",
        "Forecast versionado",
        "Drill-down por dimensão",
      ],
      question:
        "A gestão consegue explicar rapidamente por que o orçamento derrapou?",
      target: "Planeamento",
    },
    {
      eyebrow: "HCM & PAYROLL",
      title: "Pessoas ligadas ao custo real",
      text: "Percorra employee master, contratos, assiduidade, componentes salariais, processamento, aprovação, pagamento e payslip.",
      evidence: [
        "Colaboradores e contratos",
        "Payroll determinístico",
        "Reconciliação do custo salarial",
      ],
      question:
        "O custo de pessoas fecha hoje com Payroll, Finance e Workforce?",
      target: "Operações",
    },
    {
      eyebrow: "WORKFORCE",
      title: "Antecipar headcount e capacidade",
      text: "Demonstre contratações, saídas, vagas, custo futuro e impacto financeiro antes de aprovar um plano.",
      evidence: [
        "Headcount planeado",
        "Custo mensal projetado",
        "Hipóteses e versões",
      ],
      question:
        "As contratações são aprovadas com visibilidade do custo anual completo?",
      target: "Headcount",
    },
    {
      eyebrow: "PERFORMANCE",
      title: "Estratégia transformada em execução",
      text: "Ligue objetivos, métricas, avaliações, feedback e planos de desenvolvimento às prioridades da organização.",
      evidence: [
        "Objetivos mensuráveis",
        "Avaliações governadas",
        "Planos de ação com responsáveis",
      ],
      question:
        "A avaliação das equipas está ligada a resultados concretos da empresa?",
      target: "Objetivos",
    },
    {
      eyebrow: "ANALYTICS & REPORTING",
      title: "Relatórios que explicam e recomendam",
      text: "Mostre o encadeamento resultado → comparação → causa → impacto → perspetiva → recomendação e a emissão versionada.",
      evidence: [
        "Management Report emitido",
        "14 modelos de relatório",
        "Exportação e hash de evidência",
      ],
      question:
        "Os relatórios atuais apenas mostram números ou também orientam a decisão?",
      target: "Relatórios",
    },
    {
      eyebrow: "WORKFLOW & CONTROLO",
      title: "Cada decisão com responsável e evidência",
      text: "Apresente a caixa de trabalho transversal, segregação de funções, SLA, aprovações e audit trail imutável.",
      evidence: ["Tarefas por perfil", "Maker-checker", "Histórico auditável"],
      question:
        "É possível provar quem preparou, aprovou e alterou cada decisão crítica?",
      target: "Workflow",
    },
    {
      eyebrow: "ENCERRAMENTO",
      title: "Da demonstração ao plano de adoção",
      text: "Finalize com os módulos prioritários, integração de dados, Industry Pack, utilizadores e uma proposta de implementação faseada.",
      evidence: [
        "Módulos contratáveis",
        "Templates de integração",
        "Prontidão comercial e técnica",
      ],
      question:
        "Qual processo deve produzir valor primeiro: planeamento, Payroll ou reporting executivo?",
      target: "Centro Comercial",
    },
  ];
  return (
    <section className="commercial-suite">
      <header className="commercial-hero">
        <div>
          <small>COMMERCIAL VALIDATION CENTER</small>
          <h1>Uma demonstração orientada à decisão</h1>
          <p>
            Dashboards por perfil, catálogo de reporting, percurso comercial e
            readiness numa única experiência.
          </p>
        </div>
        <div>
          <strong>{data.commercialReadiness.score}%</strong>
          <span>prontidão demonstrativa</span>
          <small>
            Atualizado {new Date(data.generatedAt).toLocaleString("pt-AO")}
          </small>
          <button
            className="start-demo"
            onClick={() => {
              setStep(0);
              setTourStarted(true);
              setTab("tour");
            }}
          >
            ▶ Iniciar demonstração guiada
          </button>
        </div>
      </header>
      <nav className="commercial-tabs">
        {[
          ["cockpit", "Cockpit por perfil"],
          ["reports", "Relatórios"],
          ["templates", "Templates"],
          ["tour", "Demo guiada"],
          ["readiness", "Prontidão comercial"],
        ].map(([k, l]) => (
          <button
            key={k}
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k as typeof tab)}
          >
            {l}
          </button>
        ))}
      </nav>
      {tab === "cockpit" && (
        <>
          <section className="profile-selector">
            {data.profiles.map((x) => (
              <button
                key={x.code}
                className={profile === x.code ? "active" : ""}
                onClick={() => setProfile(x.code)}
              >
                <b>{x.name}</b>
                <small>{x.focus}</small>
              </button>
            ))}
          </section>
          <div className="profile-heading">
            <div>
              <small>PAINEL PERSONALIZADO</small>
              <h2>{selected?.name}</h2>
              <p>{selected?.focus}</p>
            </div>
            <button onClick={() => window.print()}>
              Exportar PDF / imprimir
            </button>
          </div>
          <section className="commercial-kpis">
            {selected?.kpis.map((k) => (
              <article key={k}>
                <span>{labels[k] || k}</span>
                <strong>{value(k)}</strong>
                <small>{data.period} · fonte governada</small>
              </article>
            ))}
          </section>
          <section className="commercial-visuals">
            <article>
              <header>
                <span>ACTUAL VS BUDGET</span>
                <b>{value("varianceBps")}</b>
              </header>
              <div className="visual-bars">
                <i
                  style={{
                    width: `${Math.min(100, Math.max(4, (Number(data.metrics.actual) / Math.max(1, Number(data.metrics.actual), Number(data.metrics.budget))) * 100))}%`,
                  }}
                />
                <i
                  className="budget"
                  style={{
                    width: `${Math.min(100, Math.max(4, (Number(data.metrics.budget) / Math.max(1, Number(data.metrics.actual), Number(data.metrics.budget))) * 100))}%`,
                  }}
                />
              </div>
              <footer>
                <span>Actual {value("actual")}</span>
                <span>Budget {value("budget")}</span>
              </footer>
            </article>
            <article className="visual-score">
              <div
                style={
                  {
                    "--score": `${Number(data.metrics.diagnosticScore || 0) / 100}%`,
                  } as React.CSSProperties
                }
              >
                <strong>{value("diagnosticScore")}</strong>
                <small>Saúde financeira</small>
              </div>
              <p>Score determinístico do diagnóstico aprovado.</p>
            </article>
            <article>
              <header>
                <span>EXECUÇÃO</span>
                <b>{data.metrics.openActions} ações</b>
              </header>
              <div className="visual-stack">
                <i style={{ flex: Math.max(1, Number(data.metrics.goals)) }} />
                <i
                  style={{
                    flex: Math.max(1, Number(data.metrics.workflowTasks)),
                  }}
                />
                <i
                  style={{
                    flex: Math.max(1, Number(data.metrics.openActions)),
                  }}
                />
              </div>
              <footer>
                <span>{data.metrics.goals} objetivos</span>
                <span>{data.metrics.workflowTasks} tarefas</span>
              </footer>
            </article>
          </section>
          <section className="commercial-story">
            <article>
              <small>CONTEXTO</small>
              <h3>Performance integrada</h3>
              <p>
                Finance, pessoas e execução operacional no mesmo período e
                moeda.
              </p>
            </article>
            <article>
              <small>EXPLICAÇÃO</small>
              <h3>
                {Number(data.metrics.variance) >= 0
                  ? "Crescimento com pressão de custos"
                  : "Resultado abaixo do plano"}
              </h3>
              <p>O desvio é calculado diretamente entre Actual e Budget.</p>
            </article>
            <article>
              <small>AÇÃO</small>
              <h3>{data.metrics.openActions} planos em acompanhamento</h3>
              <button onClick={() => onNavigate("Ações")}>
                Abrir planos de ação →
              </button>
            </article>
          </section>
        </>
      )}
      {tab === "reports" && (
        <>
          <div className="report-catalog-tools">
            <div>
              <small>CATÁLOGO GOVERNADO</small>
              <h2>{reports.length} relatórios disponíveis</h2>
            </div>
            <input
              placeholder="Pesquisar relatório, módulo ou público…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button onClick={exportCsv}>Exportar catálogo CSV</button>
          </div>
          <div className="commercial-report-table">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Relatório</th>
                  <th>Módulo</th>
                  <th>Público</th>
                  <th>Frequência</th>
                  <th>Saída</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((x) => (
                  <tr key={x.code}>
                    <td>
                      <b>{x.code}</b>
                    </td>
                    <td>{x.name}</td>
                    <td>{x.module}</td>
                    <td>{x.audience}</td>
                    <td>{x.frequency}</td>
                    <td>{x.exports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "templates" && (
        <section className="template-catalog">
          <header>
            <div>
              <small>IMPORTAÇÃO PADRONIZADA</small>
              <h2>Templates prontos para download</h2>
              <p>
                Estruturas neutras, sem plano de contas, país ou ERP hardcoded.
              </p>
            </div>
            <button onClick={() => onNavigate("Documentos")}>
              Abrir Document Hub →
            </button>
          </header>
          <div>
            {templates.map((x) => (
              <article key={x.file}>
                <i>⇩</i>
                <span>
                  <b>{x.name}</b>
                  <small>
                    {x.module} · CSV UTF-8 · {x.headers.length} campos
                  </small>
                </span>
                <button onClick={() => downloadTemplate(x)}>Download</button>
              </article>
            ))}
          </div>
        </section>
      )}
      {tab === "tour" && (
        <div className="commercial-tour">
          <aside>
            {tour.map((x, i) => (
              <button
                key={x.title}
                className={step === i ? "active" : ""}
                onClick={() => setStep(i)}
              >
                <i>{i + 1}</i>
                <span>
                  <b>{x.title}</b>
                  <small>
                    {i < step
                      ? "Concluído"
                      : i === step
                        ? "Em apresentação"
                        : "Por apresentar"}
                  </small>
                </span>
              </button>
            ))}
          </aside>
          <article className="tour-stage">
            <div
              className="tour-progress"
              aria-label={`Passo ${step + 1} de ${tour.length}`}
            >
              <i style={{ width: `${((step + 1) / tour.length) * 100}%` }} />
            </div>
            <small>
              {tour[step].eyebrow} · PASSO {step + 1}/{tour.length}
            </small>
            <h2>{tour[step].title}</h2>
            <p>{tour[step].text}</p>
            <section className="tour-evidence">
              <div>
                <small>EVIDÊNCIAS A MOSTRAR</small>
                <ul>
                  {tour[step].evidence.map((x) => (
                    <li key={x}>✓ {x}</li>
                  ))}
                </ul>
              </div>
              <blockquote>
                <small>PERGUNTA DE DESCOBERTA</small>“{tour[step].question}”
              </blockquote>
            </section>
            <div className="tour-actions">
              <button
                className="secondary"
                disabled={step === 0}
                onClick={() => setStep(step - 1)}
              >
                ← Anterior
              </button>
              <button
                className="secondary"
                onClick={() => {
                  onNavigate(tour[step].target);
                }}
              >
                Explorar módulo ↗
              </button>
              {step < tour.length - 1 ? (
                <button
                  onClick={() => {
                    setTourStarted(true);
                    setStep(step + 1);
                  }}
                >
                  Próximo passo →
                </button>
              ) : (
                <button
                  onClick={() => {
                    setTourStarted(false);
                    setTab("readiness");
                  }}
                >
                  Concluir demonstração ✓
                </button>
              )}
            </div>
            <footer>
              {tourStarted
                ? "Apresentação em curso"
                : "Selecione Iniciar demonstração para começar o roteiro"}
            </footer>
          </article>
        </div>
      )}
      {tab === "readiness" && (
        <div className="commercial-readiness">
          <header>
            <strong>{data.commercialReadiness.score}%</strong>
            <div>
              <h2>As oito fases estão cobertas</h2>
              <p>
                Critérios funcionais, dados demonstrativos e controlos
                automatizados.
              </p>
            </div>
          </header>
          <ol>
            {data.commercialReadiness.phases.map((x, i) => (
              <li key={x}>
                <i>✓</i>
                <span>
                  <b>
                    {i + 1}. {x}
                  </b>
                  <small>Implementado e incluído na auditoria</small>
                </span>
              </li>
            ))}
          </ol>
          <footer>
            <button onClick={() => onNavigate("Controlo")}>
              Abrir auditoria de integridade →
            </button>
            <button onClick={() => onNavigate("Relatórios")}>
              Gerar Management Report →
            </button>
          </footer>
        </div>
      )}
    </section>
  );
}
