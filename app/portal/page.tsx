"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import { PlatformLocalizedSurface } from "../hr-localized-surface";
import "../portal.css";

type Tab = "inicio" | "recibos" | "ferias" | "documentos" | "perfil";
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

export default function Portal() {
  const [authState, setAuthState] = useState<"loading" | "ready">("loading");
  const [tab, setTab] = useState<Tab>("inicio");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [payslips, setPayslips] = useState<Payslip[] | null>(null);
  const [leave, setLeave] = useState<
    { balances: LeaveBalance[]; requests: LeaveRequest[] } | null
  >(null);
  const [absenceTypes, setAbsenceTypes] = useState<AbsenceType[] | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formMessage, setFormMessage] = useState("");

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
    if (tab === "recibos")
      load<{ payslips: Payslip[]; error?: string }>("payslips", (d) =>
        setPayslips(d.payslips),
      );
    if (tab === "ferias") {
      load<
        { balances: LeaveBalance[]; requests: LeaveRequest[]; error?: string }
      >("leave", setLeave);
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
    load<{ balances: LeaveBalance[]; requests: LeaveRequest[]; error?: string }>(
      "leave",
      setLeave,
    );
  }

  if (authState === "loading")
    return <div className="portal-loading">A validar sessão…</div>;

  return (
    <PlatformLocalizedSurface>
      <div className="portal-shell">
        <header className="portal-header">
          <b>{profile?.organizationName || "Portal do colaborador"}</b>
          <span>{profile?.name}</span>
        </header>
        <main className="portal-content">
          {error && <p className="portal-error">{error}</p>}
          {tab === "inicio" && profile && (
            <section className="portal-card">
              <h2>Olá, {profile.name.split(" ")[0]}</h2>
              <p>
                {profile.jobTitle}
                {profile.jobTitle && profile.organizationName ? " · " : ""}
                {profile.organizationName}
              </p>
              <dl>
                <dt>Nº de colaborador</dt>
                <dd>{profile.employeeNumber || "—"}</dd>
                <dt>Admissão</dt>
                <dd>{profile.hireDate || "—"}</dd>
              </dl>
            </section>
          )}
          {tab === "recibos" && (
            <section className="portal-card">
              <h2>Recibos de vencimento</h2>
              {payslips === null ? (
                <p>A carregar…</p>
              ) : payslips.length === 0 ? (
                <p>Ainda não existem recibos emitidos.</p>
              ) : (
                <ul className="portal-list">
                  {payslips.map((p) => (
                    <li key={p.payslipNumber}>
                      <div>
                        <b>{p.period}</b>
                        <span>{p.payslipNumber}</span>
                      </div>
                      <div className="portal-amount">
                        {money(p.netMinor, p.currency)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {tab === "ferias" && (
            <section className="portal-card">
              <h2>Saldos de férias</h2>
              {!leave ? (
                <p>A carregar…</p>
              ) : (
                <>
                  <ul className="portal-list">
                    {leave.balances.map((b, i) => (
                      <li key={i}>
                        <div>
                          <b>{b.absenceTypeName}</b>
                          <span>{b.fiscalYear}</span>
                        </div>
                        <div className="portal-amount">
                          {duration(b.remainingMinutes, b.unit)}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <h3>Novo pedido</h3>
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
          {tab === "documentos" && (
            <section className="portal-card">
              <h2>Documentos</h2>
              {documents === null ? (
                <p>A carregar…</p>
              ) : documents.length === 0 ? (
                <p>Ainda não existem documentos.</p>
              ) : (
                <ul className="portal-list">
                  {documents.map((d, i) => (
                    <li key={i}>
                      <div>
                        <b>{d.documentTypeName}</b>
                        <span>{d.reference}</span>
                      </div>
                      <div
                        className={`portal-status portal-status-${d.status.toLowerCase()}`}
                      >
                        {d.status}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {tab === "perfil" && profile && (
            <section className="portal-card">
              <h2>Perfil</h2>
              <dl>
                <dt>Nome</dt>
                <dd>{profile.name}</dd>
                <dt>E-mail</dt>
                <dd>{profile.email}</dd>
                <dt>Nº de colaborador</dt>
                <dd>{profile.employeeNumber || "—"}</dd>
                <dt>Cargo</dt>
                <dd>{profile.jobTitle || "—"}</dd>
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
            Início
          </button>
          <button
            className={tab === "recibos" ? "active" : ""}
            onClick={() => setTab("recibos")}
          >
            Recibos
          </button>
          <button
            className={tab === "ferias" ? "active" : ""}
            onClick={() => setTab("ferias")}
          >
            Férias
          </button>
          <button
            className={tab === "documentos" ? "active" : ""}
            onClick={() => setTab("documentos")}
          >
            Documentos
          </button>
          <button
            className={tab === "perfil" ? "active" : ""}
            onClick={() => setTab("perfil")}
          >
            Perfil
          </button>
        </nav>
      </div>
    </PlatformLocalizedSurface>
  );
}
