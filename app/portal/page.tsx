"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import { PlatformLocalizedSurface } from "../hr-localized-surface";
import "../portal.css";

type Tab = "inicio" | "recibos" | "ferias" | "tarefas" | "documentos" | "perfil";
type Profile = {
  name: string;
  email: string;
  employeeNumber: string;
  jobTitle: string;
  hireDate: string;
  status: string;
  organizationName: string | null;
};
type Payslip = {
  payslipNumber: string;
  period: string;
  currency: string;
  grossMinor: number;
  deductionMinor: number;
  netMinor: number;
  issuedAt: string;
};
type LeaveBalance = {
  fiscalYear: number;
  absenceTypeCode: string;
  absenceTypeName: string;
  unit: string;
  allowanceMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
};
type LeaveRequest = {
  id: string;
  absenceTypeName: string;
  unit: string;
  startDate: string;
  endDate: string;
  requestedMinutes: number;
  reason: string | null;
  status: string;
  requestedAt: string;
};
type AbsenceType = { id: string; code: string; name: string; unit: string };
type DocumentRow = {
  documentTypeName: string;
  reference: string;
  issueDate: string;
  expiryDate: string | null;
  status: string;
};
type Leave = { balances: LeaveBalance[]; requests: LeaveRequest[] };
type EmployeeTask = {
  id: string;
  title: string;
  description: string | null;
  deliverable: string | null;
  priority: string;
  dueDate: string | null;
  status: string;
  assignedBy: string;
  assignedAt: string;
  completedAt: string | null;
  completionNote: string | null;
};

function money(minor: number, currency: string) {
  return (
    (minor / 100).toLocaleString("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) +
    " " +
    currency
  );
}
function duration(minutes: number, unit: string) {
  return unit === "Dias"
    ? (minutes / 60 / 8).toFixed(1) + " dias"
    : (minutes / 60).toFixed(1) + " horas";
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 19) return "Boa tarde";
  return "Boa noite";
}
function daysUntil(dateStr: string) {
  return Math.ceil(
    (new Date(dateStr).getTime() - Date.now()) / 86400000,
  );
}

const Icon = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  ),
  receipt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 6.5a1 1 0 0 1 1-1H10l2 2.5h7.5a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2 20h20Z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  palm: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21V11" />
      <path d="M12 12c0-4-3-6-7-6 1 4 3 6 7 6ZM12 12c0-4 3-6 7-6-1 4-3 6-7 6Z" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="4" width="15" height="17" rx="2" />
      <path d="M8.5 10.5l1.8 1.8 3.2-3.6M8 16h8" />
    </svg>
  ),
};
function Skeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="portal-skeleton" aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="portal-skeleton-line" />
      ))}
    </div>
  );
}

export default function Portal() {
  const [authState, setAuthState] = useState<"loading" | "ready">("loading");
  const [tab, setTab] = useState<Tab>("inicio");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [payslips, setPayslips] = useState<Payslip[] | null>(null);
  const [leave, setLeave] = useState<Leave | null>(null);
  const [absenceTypes, setAbsenceTypes] = useState<AbsenceType[] | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[] | null>(null);
  const [tasks, setTasks] = useState<EmployeeTask[] | null>(null);
  const [error, setError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [expandedPayslip, setExpandedPayslip] = useState<string | null>(null);
  const [taskBusy, setTaskBusy] = useState<string | null>(null);
  const [taskNote, setTaskNote] = useState<Record<string, string>>({});

  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/portal-sw.js", { scope: "/portal" })
        .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch("/api/session")
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!ok || body.role !== "Colaborador") {
          window.location.assign(ok && body.email ? "/" : "/entrar");
          return;
        }
        setProfile({
          name: body.name,
          email: body.email,
          employeeNumber: "",
          jobTitle: "",
          hireDate: "",
          status: "",
          organizationName: body.organizationName,
        });
        setAuthState("ready");
      })
      .catch(() => window.location.assign("/entrar"));
  }, []);

  function load<T extends { error?: string }>(
    resource: string,
    assign: (body: T) => void,
  ) {
    apiFetch(`/api/self-service?resource=${resource}`)
      .then((r) => r.json() as Promise<T>)
      .then((body) => {
        if (body.error) {
          setError(body.error);
          return;
        }
        assign(body);
      })
      .catch(() => setError("Não foi possível carregar os dados."));
  }

  useEffect(() => {
    if (authState !== "ready") return;
    if (tab === "inicio" || tab === "perfil")
      load<Profile & { error?: string }>("profile", setProfile);
    if (tab === "inicio" || tab === "recibos") {
      if (payslips === null)
        load<{ payslips: Payslip[]; error?: string }>("payslips", (d) =>
          setPayslips(d.payslips),
        );
    }
    if (tab === "inicio" || tab === "ferias") {
      if (leave === null)
        load<Leave & { error?: string }>("leave", setLeave);
      if (!absenceTypes)
        load<{ absenceTypes: AbsenceType[]; error?: string }>(
          "absence-types",
          (d) => setAbsenceTypes(d.absenceTypes),
        );
    }
    if (tab === "documentos")
      load<{ documents: DocumentRow[]; error?: string }>("documents", (d) =>
        setDocuments(d.documents),
      );
    if (tab === "inicio" || tab === "tarefas") {
      if (tasks === null)
        load<{ tasks: EmployeeTask[]; error?: string }>("tasks", (d) =>
          setTasks(d.tasks),
        );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authState]);

  async function submitLeave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormBusy(true);
    setFormMessage("");
    const f = new FormData(e.currentTarget);
    const r = await apiFetch("/api/self-service", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "leaveRequest",
        absenceTypeId: f.get("absenceTypeId"),
        startDate: f.get("startDate"),
        endDate: f.get("endDate"),
        reason: f.get("reason"),
      }),
    });
    const body = (await r.json()) as { error?: string };
    setFormBusy(false);
    if (!r.ok) {
      setFormMessage(body.error || "Não foi possível submeter o pedido.");
      return;
    }
    setFormMessage("Pedido submetido com sucesso.");
    e.currentTarget.reset();
    load<Leave & { error?: string }>("leave", setLeave);
  }

  async function transitionTask(taskId: string, status: string) {
    setTaskBusy(taskId);
    const r = await apiFetch("/api/self-service", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "taskTransition",
        taskId,
        status,
        note: taskNote[taskId],
      }),
    });
    const body = (await r.json()) as { error?: string };
    setTaskBusy(null);
    if (!r.ok) {
      setError(body.error || "Não foi possível atualizar a tarefa.");
      return;
    }
    load<{ tasks: EmployeeTask[]; error?: string }>("tasks", (d) =>
      setTasks(d.tasks),
    );
  }

  if (authState === "loading")
    return (
      <div className="portal-loading">
        <div className="portal-loading-spinner" />
        <span>A validar sessão…</span>
      </div>
    );

  const firstName = profile?.name.split(" ")[0] || "";
  const pendingCount =
    leave?.requests.filter((r) => r.status === "Pendente").length ?? null;
  const totalRemainingDays = leave
    ? leave.balances.reduce(
        (sum, b) =>
          sum + (b.unit === "Dias" ? b.remainingMinutes / 60 / 8 : 0),
        0,
      )
    : null;
  const latestPayslip = payslips && payslips.length ? payslips[0] : null;
  const openTasksCount = tasks
    ? tasks.filter((t) => t.status === "Pendente" || t.status === "Em curso").length
    : null;

  return (
    <PlatformLocalizedSurface>
      <div className="portal-shell">
        <header className="portal-header">
          <div className="portal-header-top">
            <b>{profile?.organizationName || "Portal do colaborador"}</b>
          </div>
          {profile && (
            <div className="portal-header-identity">
              <span className="portal-avatar" aria-hidden>
                {initials(profile.name)}
              </span>
              <div>
                <strong>{profile.name}</strong>
                {profile.jobTitle && <small>{profile.jobTitle}</small>}
              </div>
            </div>
          )}
        </header>
        <main className="portal-content" key={tab}>
          {error && <p className="portal-error">{error}</p>}
          {tab === "inicio" && profile && (
            <>
              <h2 className="portal-greeting">
                {greeting()}, {firstName}
              </h2>
              <div className="portal-stats">
                <div className="portal-stat">
                  <span className="portal-stat-icon">{Icon.palm}</span>
                  <b>
                    {totalRemainingDays === null
                      ? "—"
                      : totalRemainingDays.toFixed(1)}
                  </b>
                  <small>Dias de férias</small>
                </div>
                <div className="portal-stat">
                  <span className="portal-stat-icon">{Icon.clock}</span>
                  <b>{pendingCount === null ? "—" : pendingCount}</b>
                  <small>Pedidos pendentes</small>
                </div>
                <div className="portal-stat">
                  <span className="portal-stat-icon">{Icon.receipt}</span>
                  <b>
                    {latestPayslip
                      ? money(latestPayslip.netMinor, latestPayslip.currency)
                      : "—"}
                  </b>
                  <small>Último recibo</small>
                </div>
                <div className="portal-stat">
                  <span className="portal-stat-icon">{Icon.tasks}</span>
                  <b>{openTasksCount === null ? "—" : openTasksCount}</b>
                  <small>Tarefas por concluir</small>
                </div>
              </div>
              <section className="portal-card">
                <dl>
                  <dt>Nº de colaborador</dt>
                  <dd>{profile.employeeNumber || "—"}</dd>
                  <dt>Admissão</dt>
                  <dd>{profile.hireDate || "—"}</dd>
                </dl>
              </section>
              <div className="portal-quick-actions">
                <button onClick={() => setTab("recibos")}>
                  {Icon.receipt} Ver recibos
                </button>
                <button onClick={() => setTab("ferias")}>
                  {Icon.calendar} Pedir férias
                </button>
                <button onClick={() => setTab("tarefas")}>
                  {Icon.tasks} Ver tarefas
                </button>
              </div>
            </>
          )}
          {tab === "recibos" && (
            <section className="portal-card">
              <h2>Recibos de vencimento</h2>
              {payslips === null ? (
                <Skeleton lines={3} />
              ) : payslips.length === 0 ? (
                <p>Ainda não existem recibos emitidos.</p>
              ) : (
                <ul className="portal-list">
                  {payslips.map((p) => {
                    const expanded = expandedPayslip === p.payslipNumber;
                    return (
                      <li key={p.payslipNumber} className="portal-expandable">
                        <button
                          className="portal-row-trigger"
                          onClick={() =>
                            setExpandedPayslip(expanded ? null : p.payslipNumber)
                          }
                        >
                          <span className="portal-row-icon">{Icon.receipt}</span>
                          <div className="portal-row-text">
                            <b>{p.period}</b>
                            <span>{p.payslipNumber}</span>
                          </div>
                          <div className="portal-amount">
                            {money(p.netMinor, p.currency)}
                          </div>
                          <span
                            className={`portal-chevron${expanded ? " open" : ""}`}
                          >
                            {Icon.chevron}
                          </span>
                        </button>
                        {expanded && (
                          <div className="portal-row-detail">
                            <div>
                              <span>Bruto</span>
                              <b>{money(p.grossMinor, p.currency)}</b>
                            </div>
                            <div>
                              <span>Descontos</span>
                              <b>−{money(p.deductionMinor, p.currency)}</b>
                            </div>
                            <div className="portal-row-detail-net">
                              <span>Líquido</span>
                              <b>{money(p.netMinor, p.currency)}</b>
                            </div>
                            <div>
                              <span>Emitido em</span>
                              <b>{p.issuedAt.slice(0, 10)}</b>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
          {tab === "ferias" && (
            <section className="portal-card">
              <h2>Saldos de férias</h2>
              {!leave ? (
                <Skeleton lines={2} />
              ) : (
                <>
                  <ul className="portal-balance-list">
                    {leave.balances.map((b, i) => {
                      const pct =
                        b.allowanceMinutes > 0
                          ? Math.min(
                              100,
                              Math.round(
                                (b.usedMinutes / b.allowanceMinutes) * 100,
                              ),
                            )
                          : 0;
                      return (
                        <li key={i}>
                          <div className="portal-balance-head">
                            <b>{b.absenceTypeName}</b>
                            <span>{duration(b.remainingMinutes, b.unit)} restantes</span>
                          </div>
                          <div className="portal-progress">
                            <div
                              className="portal-progress-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    className="portal-toggle-form"
                    onClick={() => setShowLeaveForm((v) => !v)}
                  >
                    {Icon.plus} Novo pedido
                  </button>
                  {showLeaveForm && (
                    <form className="portal-form" onSubmit={submitLeave}>
                      <label>
                        Tipo
                        <select name="absenceTypeId" required>
                          {(absenceTypes || []).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Início
                        <input name="startDate" type="date" required />
                      </label>
                      <label>
                        Fim
                        <input name="endDate" type="date" required />
                      </label>
                      <label>
                        Motivo (opcional)
                        <input name="reason" type="text" />
                      </label>
                      {formMessage && (
                        <p className="portal-form-message">{formMessage}</p>
                      )}
                      <button disabled={formBusy}>
                        {formBusy ? "A submeter…" : "Submeter pedido"}
                      </button>
                    </form>
                  )}
                  <h3>Histórico</h3>
                  {leave.requests.length === 0 ? (
                    <p>Ainda não existem pedidos.</p>
                  ) : (
                    <ul className="portal-list">
                      {leave.requests.map((r) => (
                        <li key={r.id}>
                          <div>
                            <b>{r.absenceTypeName}</b>
                            <span>
                              {r.startDate} – {r.endDate}
                            </span>
                          </div>
                          <div
                            className={`portal-status portal-status-${r.status.toLowerCase()}`}
                          >
                            {r.status}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          )}
          {tab === "tarefas" && (
            <section className="portal-card">
              <h2>As minhas tarefas</h2>
              {tasks === null ? (
                <Skeleton lines={3} />
              ) : tasks.length === 0 ? (
                <p>Ainda não tem tarefas atribuídas.</p>
              ) : (
                <ul className="portal-list portal-task-list">
                  {tasks.map((t) => {
                    const busy = taskBusy === t.id;
                    const left = t.dueDate ? daysUntil(t.dueDate) : null;
                    const overdue =
                      left !== null &&
                      left < 0 &&
                      t.status !== "Concluída" &&
                      t.status !== "Cancelada";
                    return (
                      <li key={t.id} className="portal-task-item">
                        <div className="portal-task-head">
                          <span
                            className={`portal-priority portal-priority-${t.priority
                              .toLowerCase()
                              .normalize("NFD")
                              .replace(/[̀-ͯ]/g, "")}`}
                          >
                            {t.priority}
                          </span>
                          <div
                            className={`portal-status portal-status-${t.status
                              .toLowerCase()
                              .replace(/\s+/g, "-")}`}
                          >
                            {t.status}
                          </div>
                        </div>
                        <b className="portal-task-title">{t.title}</b>
                        {t.description && <p>{t.description}</p>}
                        {t.deliverable && (
                          <p className="portal-task-deliverable">
                            Entregável: {t.deliverable}
                          </p>
                        )}
                        <div className="portal-task-meta">
                          <span>Atribuído por {t.assignedBy}</span>
                          {t.dueDate && (
                            <span className={overdue ? "critical" : ""}>
                              {overdue ? Icon.alert : Icon.clock} Entrega: {t.dueDate}
                            </span>
                          )}
                        </div>
                        {t.status === "Pendente" && (
                          <button
                            className="portal-task-action"
                            disabled={busy}
                            onClick={() => transitionTask(t.id, "Em curso")}
                          >
                            {busy ? "A atualizar…" : "Iniciar tarefa"}
                          </button>
                        )}
                        {t.status === "Em curso" && (
                          <div className="portal-task-complete">
                            <input
                              type="text"
                              placeholder="Nota de conclusão (opcional)"
                              value={taskNote[t.id] || ""}
                              onChange={(e) =>
                                setTaskNote((n) => ({
                                  ...n,
                                  [t.id]: e.target.value,
                                }))
                              }
                            />
                            <button
                              className="portal-task-action"
                              disabled={busy}
                              onClick={() => transitionTask(t.id, "Concluída")}
                            >
                              {busy ? "A atualizar…" : "Concluir tarefa"}
                            </button>
                          </div>
                        )}
                        {t.status === "Concluída" && t.completionNote && (
                          <p className="portal-task-deliverable">
                            Nota: {t.completionNote}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
          {tab === "documentos" && (
            <section className="portal-card">
              <h2>Documentos</h2>
              {documents === null ? (
                <Skeleton lines={3} />
              ) : documents.length === 0 ? (
                <p>Ainda não existem documentos.</p>
              ) : (
                <ul className="portal-list">
                  {documents.map((d, i) => {
                    const left = d.expiryDate ? daysUntil(d.expiryDate) : null;
                    const warn = left !== null && left <= 90;
                    const critical = left !== null && left <= 30;
                    return (
                      <li key={i}>
                        <span className="portal-row-icon">{Icon.folder}</span>
                        <div>
                          <b>{d.documentTypeName}</b>
                          <span>{d.reference}</span>
                          {warn && (
                            <span
                              className={`portal-expiry${critical ? " critical" : ""}`}
                            >
                              {Icon.alert}{" "}
                              {left! > 0
                                ? `Expira em ${left} dias`
                                : "Expirado"}
                            </span>
                          )}
                        </div>
                        <div
                          className={`portal-status portal-status-${d.status.toLowerCase()}`}
                        >
                          {d.status}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
          {tab === "perfil" && profile && (
            <section className="portal-card portal-profile-card">
              <span className="portal-avatar portal-avatar-lg" aria-hidden>
                {initials(profile.name)}
              </span>
              <h2>{profile.name}</h2>
              <p className="portal-profile-subtitle">
                {profile.jobTitle || "—"}
              </p>
              <dl>
                <dt>E-mail</dt>
                <dd>{profile.email}</dd>
                <dt>Nº de colaborador</dt>
                <dd>{profile.employeeNumber || "—"}</dd>
                <dt>Empresa</dt>
                <dd>{profile.organizationName || "—"}</dd>
                <dt>Data de admissão</dt>
                <dd>{profile.hireDate || "—"}</dd>
                <dt>Estado</dt>
                <dd>{profile.status || "—"}</dd>
              </dl>
              <button
                className="portal-logout"
                onClick={() => {
                  sessionStorage.clear();
                  window.location.assign("/entrar");
                }}
              >
                Terminar sessão
              </button>
            </section>
          )}
        </main>
        <nav className="portal-nav">
          <button
            className={tab === "inicio" ? "active" : ""}
            onClick={() => setTab("inicio")}
          >
            <span className="portal-nav-icon">{Icon.home}</span>
            Início
          </button>
          <button
            className={tab === "recibos" ? "active" : ""}
            onClick={() => setTab("recibos")}
          >
            <span className="portal-nav-icon">{Icon.receipt}</span>
            Recibos
          </button>
          <button
            className={tab === "ferias" ? "active" : ""}
            onClick={() => setTab("ferias")}
          >
            <span className="portal-nav-icon">{Icon.calendar}</span>
            Férias
          </button>
          <button
            className={tab === "tarefas" ? "active" : ""}
            onClick={() => setTab("tarefas")}
          >
            <span className="portal-nav-icon">{Icon.tasks}</span>
            Tarefas
          </button>
          <button
            className={tab === "documentos" ? "active" : ""}
            onClick={() => setTab("documentos")}
          >
            <span className="portal-nav-icon">{Icon.folder}</span>
            Documentos
          </button>
          <button
            className={tab === "perfil" ? "active" : ""}
            onClick={() => setTab("perfil")}
          >
            <span className="portal-nav-icon">{Icon.user}</span>
            Perfil
          </button>
        </nav>
      </div>
    </PlatformLocalizedSurface>
  );
}
