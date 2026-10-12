"use client";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../lib/api-client";
import "./recruitment.css";
type Requisition={id:string;title:string;organization_name:string;department_code?:string;positions:number;target_start_date:string;currency:string;budget_monthly_minor:number;status:string};
type Application={id:string;candidate_id:string;candidate_name:string;candidate_email:string;requisition_title:string;status:string;decision_note?:string;rating?:number|null};
type OnboardingCase={id:string;application_id:string;candidate_name:string;requisition_title:string;start_date:string;completed_count:number;task_count:number;employee_id:string|null;linked_employee_name:string|null;linked_employee_number:string|null};
type OnboardingTask={id:string;case_id:string;title:string;owner_email:string;due_date:string;status:string};
type Organization={id:string;code:string;name:string};
type Owner={email:string;name:string;role:string};
type ActiveEmployee={id:string;employee_number:string;first_name:string;last_name:string};
type OnboardingDocument={id:string;employee_id:string;employee_name:string;employee_number:string;title:string;description:string|null;document_url:string|null;status:string;published_by:string;published_at:string;signature_name:string|null;signed_at:string|null};
type Data = {
  requisitions: Requisition[];
  applications: Application[];
  candidates: Array<{id:string;full_name:string;email:string}>;
  onboardingCases: OnboardingCase[];
  tasks: OnboardingTask[];
  organizations: Organization[];
  owners: Owner[];
  careersSlug: string | null;
  activeEmployees: ActiveEmployee[];
  onboardingDocuments: OnboardingDocument[];
};
const empty: Data = {
  requisitions: [],
  applications: [],
  candidates: [],
  onboardingCases: [],
  tasks: [],
  organizations: [],
  owners: [],
  careersSlug: null,
  activeEmployees: [],
  onboardingDocuments: [],
};
export function RecruitmentWorkspace() {
  const [data, setData] = useState<Data>(empty),
    [view, setView] = useState("Vagas"),
    [modal, setModal] = useState(""),
    [context, setContext] = useState(""),
    [taskId, setTaskId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [linkCopied, setLinkCopied] = useState(false);
  const careersUrl = data.careersSlug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/carreiras?empresa=${data.careersSlug}`
    : "";
  async function copyCareersLink() {
    try {
      await navigator.clipboard.writeText(careersUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setLinkCopied(false);
    }
  }
  const load = () =>
    apiFetch("/api/v1/recruitment")
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
    const r = await apiFetch("/api/v1/recruitment", {
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
    setContext("");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (modal === "publishOnboardingDocument") {
      setBusy(true);
      setError("");
      const r = await apiFetch("/api/v1/employee-onboarding-documents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "publishOnboardingDocument",
            ...(Object.fromEntries(
              new FormData(e.currentTarget).entries(),
            ) as Record<string, string>),
          }),
        }),
        b = await r.json();
      setBusy(false);
      if (!r.ok) {
        setError(b.error);
        return;
      }
      setModal("");
      load();
      return;
    }
    await command({
      type: modal,
      requisitionId: context,
      applicationId: context,
      caseId: context,
      ...(Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<
        string,
        string
      >),
    });
  }
  const open = data.requisitions.filter((x) => x.status === "Aberta").length,
    offers = data.applications.filter((x) => x.status === "Oferta").length,
    pending = data.tasks.filter((x) => x.status === "Pendente").length;
  return (
    <section className="talent">
      <header>
        <div>
          <span>HCM · TALENT ACQUISITION</span>
          <h1>Da necessidade à integração do colaborador</h1>
          <p>
            Requisições aprovadas, pipeline rastreável, consentimento e
            onboarding com evidências.
          </p>
        </div>
        <button
          className="primario"
          onClick={() => setModal("createRequisition")}
        >
          ＋ Nova requisição
        </button>
      </header>
      {careersUrl && (
        <section className="talent-careers-link">
          <div>
            <span>PÁGINA PÚBLICA DE CANDIDATURAS</span>
            <code>{careersUrl}</code>
          </div>
          <button type="button" onClick={copyCareersLink}>
            {linkCopied ? "Copiado ✓" : "Copiar ligação"}
          </button>
        </section>
      )}
      <section className="talent-kpis">
        <article>
          <span>Vagas abertas</span>
          <strong>{open}</strong>
          <small>Com aprovação independente</small>
        </article>
        <article>
          <span>Candidaturas</span>
          <strong>{data.applications.length}</strong>
          <small>Pipeline ativo</small>
        </article>
        <article>
          <span>Ofertas</span>
          <strong>{offers}</strong>
          <small>Aguardam decisão</small>
        </article>
        <article>
          <span>Tarefas pendentes</span>
          <strong>{pending}</strong>
          <small>Onboarding controlado</small>
        </article>
      </section>
      <nav className="talent-tabs">
        {["Vagas", "Pipeline", "Onboarding"].map((x) => (
          <button
            key={x}
            className={view === x ? "active" : ""}
            onClick={() => setView(x)}
          >
            {x}
          </button>
        ))}
      </nav>
      {view === "Vagas" ? (
        <article className="cartao talent-list">
          <div className="cab">
            <div>
              <span>REQUISIÇÕES</span>
              <h2>Necessidades aprovadas</h2>
            </div>
          </div>
          {data.requisitions.map((x) => (
            <section key={x.id}>
              <span>
                <b>{x.title}</b>
                <small>
                  {x.organization_name} · {x.department_code || "Geral"}
                </small>
              </span>
              <p>
                <b>{x.positions} posição(ões)</b>
                <small>
                  Entrada {x.target_start_date} · {x.currency}{" "}
                  {(x.budget_monthly_minor / 100).toLocaleString("pt-PT")}
                </small>
              </p>
              <em>{x.status}</em>
              <nav>
                {x.status === "Rascunho" && (
                  <button
                    onClick={() =>
                      command({ type: "openRequisition", requisitionId: x.id })
                    }
                  >
                    Aprovar e abrir
                  </button>
                )}
                {x.status === "Aberta" && (
                  <button
                    onClick={() => {
                      setContext(x.id);
                      setModal("addCandidate");
                    }}
                  >
                    ＋ Candidato
                  </button>
                )}
              </nav>
            </section>
          ))}
        </article>
      ) : view === "Pipeline" ? (
        <article className="cartao talent-list">
          <div className="cab">
            <div>
              <span>CANDIDATURAS</span>
              <h2>Pipeline de seleção</h2>
            </div>
          </div>
          {data.applications.map((x) => (
            <section key={x.id}>
              <span>
                <b>{x.candidate_name}</b>
                <small>{x.candidate_email}</small>
              </span>
              <p>
                <b>{x.requisition_title}</b>
                <small>{x.decision_note || "Sem nota"}</small>
              </p>
              <em>
                {x.status}
                {x.rating ? (
                  <small className="talent-rating" title={`${x.rating}/5`}>
                    {"★".repeat(x.rating) + "☆".repeat(5 - x.rating)}
                  </small>
                ) : null}
              </em>
              <nav>
                {x.status !== "Contratada" && x.status !== "Rejeitada" && (
                  <button
                    onClick={() => {
                      setContext(x.id);
                      setModal("transitionApplication");
                    }}
                  >
                    Decidir
                  </button>
                )}
                {x.status === "Contratada" &&
                  !data.onboardingCases.some(
                    (c) => c.application_id === x.id,
                  ) && (
                    <button
                      onClick={() => {
                        setContext(x.id);
                        setModal("startOnboarding");
                      }}
                    >
                      Iniciar onboarding
                    </button>
                  )}
              </nav>
            </section>
          ))}
        </article>
      ) : (
        <div className="talent-onboarding">
          {data.onboardingCases.map((x) => (
            <article className="cartao" key={x.id}>
              <header>
                <span>
                  <b>{x.candidate_name}</b>
                  <small>
                    {x.requisition_title} · início {x.start_date}
                  </small>
                </span>
                <em>
                  {x.completed_count}/{x.task_count}
                </em>
                <button
                  onClick={() => {
                    setContext(x.id);
                    setModal("addOnboardingTask");
                  }}
                >
                  ＋ Tarefa
                </button>
              </header>
              <div className="talent-onboarding-employee">
                {x.employee_id ? (
                  <span>
                    Ficha de colaborador: <b>{x.linked_employee_name}</b> ·{" "}
                    {x.linked_employee_number}
                  </span>
                ) : (
                  <>
                    <span className="warn">
                      Ainda sem ficha de colaborador associada
                    </span>
                    <button
                      onClick={() => {
                        setContext(x.id);
                        setModal("linkOnboardingEmployee");
                      }}
                    >
                      Associar colaborador
                    </button>
                  </>
                )}
              </div>
              {data.tasks
                .filter((t) => t.case_id === x.id)
                .map((t) => (
                  <div key={t.id}>
                    <span>
                      <b>{t.title}</b>
                      <small>
                        {t.owner_email} · {t.due_date}
                      </small>
                    </span>
                    <em>{t.status}</em>
                    {t.status === "Pendente" && (
                      <button
                        onClick={() => {
                          setContext(x.id);
                          setModal("completeOnboardingTask");
                          setTaskId(t.id);
                        }}
                      >
                        Concluir
                      </button>
                    )}
                  </div>
                ))}
            </article>
          ))}
          <article className="cartao talent-list">
            <div className="cab">
              <div>
                <span>INTEGRAÇÃO</span>
                <h2>Documentos para assinatura</h2>
              </div>
              <button
                onClick={() => {
                  setContext("");
                  setModal("publishOnboardingDocument");
                }}
              >
                ＋ Documento
              </button>
            </div>
            {data.onboardingDocuments.length === 0 ? (
              <p className="talent-onboarding-empty">
                Ainda não existem documentos de integração enviados.
              </p>
            ) : (
              data.onboardingDocuments.map((d) => (
                <section key={d.id}>
                  <span>
                    <b>{d.employee_name}</b>
                    <small>{d.employee_number}</small>
                  </span>
                  <p>
                    <b>{d.title}</b>
                    <small>
                      {d.status === "Assinado"
                        ? `Assinado por ${d.signature_name} em ${new Date(d.signed_at!).toLocaleDateString("pt-PT")}`
                        : `Enviado por ${d.published_by}`}
                    </small>
                  </p>
                  <em>{d.status}</em>
                </section>
              ))
            )}
          </article>
        </div>
      )}
      {error && !modal && <p className="erro-global">{error}</p>}
      {modal && (
        <div className="modal-inline">
          <form onSubmit={submit}>
            <header>
              <div>
                <small>HCM · RECRUTAMENTO</small>
                <h2>{titles[modal]}</h2>
              </div>
              <button type="button" onClick={() => setModal("")}>
                ×
              </button>
            </header>
            <Fields type={modal} data={data} context={context} />
            {modal === "completeOnboardingTask" && (
              <input
                type="hidden"
                name="taskId"
                value={taskId}
              />
            )}{" "}
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
const titles: Record<string, string> = {
  createRequisition: "Nova requisição",
  addCandidate: "Nova candidatura",
  transitionApplication: "Decisão da candidatura",
  startOnboarding: "Iniciar onboarding",
  addOnboardingTask: "Nova tarefa",
  completeOnboardingTask: "Concluir tarefa",
  publishOnboardingDocument: "Enviar documento para assinatura",
  linkOnboardingEmployee: "Associar ficha de colaborador",
};
const nextApplicationStatuses: Record<string, string[]> = {
  Recebida: ["Triagem", "Rejeitada"],
  Triagem: ["Entrevista", "Rejeitada"],
  Entrevista: ["Oferta", "Rejeitada"],
  Oferta: ["Contratada", "Rejeitada"],
};
function Fields({
  type,
  data,
  context,
}: {
  type: string;
  data: Data;
  context: string;
}) {
  if (type === "createRequisition")
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
          Função
          <input name="title" required />
        </label>
        <div>
          <label>
            Departamento
            <input name="departmentCode" />
          </label>
          <label>
            Posições
            <input name="positions" type="number" min="1" required />
          </label>
        </div>
        <div>
          <label>
            Entrada prevista
            <input name="targetStartDate" type="date" required />
          </label>
          <label>
            Tipo
            <input name="employmentType" defaultValue="Efetivo" required />
          </label>
        </div>
        <div>
          <label>
            Orçamento mensal
            <input name="monthlyBudget" type="number" min="0" required />
          </label>
          <label>
            Moeda
            <input name="currency" defaultValue="AOA" required />
          </label>
        </div>
        <label>
          Justificação
          <textarea name="businessReason" minLength={10} required />
        </label>
      </>
    );
  if (type === "addCandidate")
    return (
      <>
        <label>
          Nome completo
          <input name="fullName" required />
        </label>
        <label>
          E-mail
          <input name="email" type="email" required />
        </label>
        <div>
          <label>
            Telefone
            <input name="phone" />
          </label>
          <label>
            Origem
            <input name="source" defaultValue="Direto" />
          </label>
        </div>
        <label className="check">
          <input name="consent" type="checkbox" required /> Consentimento para
          tratamento dos dados
        </label>
      </>
    );
  if (type === "transitionApplication") {
    const current = data.applications.find((a) => a.id === context)?.status || "";
    const options = nextApplicationStatuses[current] || [];
    return (
      <>
        <p className="status-note">Estado atual: {current || "—"}</p>
        <label>
          Novo estado
          <select name="status">
            {options.length === 0 ? (
              <option value="">Sem transições disponíveis</option>
            ) : (
              options.map((s) => <option key={s}>{s}</option>)
            )}
          </select>
        </label>
        <label>
          Classificação
          <input name="rating" type="number" min="1" max="5" />
        </label>
        <label>
          Nota da decisão
          <textarea name="decisionNote" required />
        </label>
      </>
    );
  }
  if (type === "startOnboarding")
    return (
      <>
        <label>
          Data de início
          <input name="startDate" type="date" required />
        </label>
        <Owner data={data} />
      </>
    );
  if (type === "addOnboardingTask")
    return (
      <>
        <label>
          Tarefa
          <input name="title" required />
        </label>
        <Owner data={data} />
        <label>
          Prazo
          <input name="dueDate" type="date" required />
        </label>
      </>
    );
  if (type === "publishOnboardingDocument")
    return (
      <>
        <label>
          Colaborador
          <select name="employeeId" required>
            <option value="">Selecionar</option>
            {data.activeEmployees.map((x) => (
              <option key={x.id} value={x.id}>
                {x.first_name} {x.last_name} · {x.employee_number}
              </option>
            ))}
          </select>
        </label>
        <label>
          Título do documento
          <input name="title" placeholder="Contrato de trabalho" required />
        </label>
        <label>
          Descrição
          <textarea name="description" />
        </label>
        <label>
          Link do documento (opcional)
          <input name="documentUrl" type="url" placeholder="https://" />
        </label>
      </>
    );
  if (type === "linkOnboardingEmployee")
    return (
      <label>
        Colaborador
        <select name="employeeId" required>
          <option value="">Selecionar</option>
          {data.activeEmployees.map((x) => (
            <option key={x.id} value={x.id}>
              {x.first_name} {x.last_name} · {x.employee_number}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <label>
      Evidência
      <textarea name="evidence" minLength={5} required />
    </label>
  );
}
function Owner({ data }: { data: Data }) {
  return (
    <label>
      Responsável
      <select name="ownerEmail" required>
        <option value="">Selecionar</option>
        {data.owners.map((x) => (
          <option key={x.email} value={x.email}>
            {x.name} · {x.role}
          </option>
        ))}
      </select>
    </label>
  );
}
