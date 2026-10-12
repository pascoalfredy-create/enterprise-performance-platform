"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import { PlatformLocalizedSurface } from "../hr-localized-surface";
import "../auth.css";
import "./careers-page.css";

type Requisition = {
  id: string;
  title: string;
  departmentCode: string | null;
  positions: number;
  employmentType: string;
  targetStartDate: string;
  organizationName: string;
};
type Data = { companyName: string; requisitions: Requisition[] };

export default function Carreiras() {
  const [slug, setSlug] = useState<string | null>(null),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [applyingTo, setApplyingTo] = useState<Requisition | null>(null),
    [formBusy, setFormBusy] = useState(false),
    [formMessage, setFormMessage] = useState(""),
    [applied, setApplied] = useState(false);

  useEffect(() => {
    const empresa = new URLSearchParams(window.location.search).get("empresa");
    if (!empresa) {
      setError("Ligação de candidaturas inválida ou incompleta.");
      setBusy(false);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlug(empresa);
    apiFetch(`/api/careers/${encodeURIComponent(empresa)}`)
      .then(async (r) => ({ ok: r.ok, body: (await r.json()) as Data & { error?: string } }))
      .then(({ ok, body }) => {
        if (!ok) {
          setError(body.error || "Não foi possível carregar as vagas.");
          return;
        }
        setData(body);
      })
      .catch(() => setError("Não foi possível carregar as vagas."))
      .finally(() => setBusy(false));
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slug || !applyingTo) return;
    setFormBusy(true);
    setFormMessage("");
    const f = new FormData(e.currentTarget),
      r = await apiFetch(`/api/careers/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requisitionId: applyingTo.id,
          fullName: f.get("fullName"),
          email: f.get("email"),
          phone: f.get("phone"),
          consent: f.get("consent"),
        }),
      }),
      body = (await r.json()) as { error?: string };
    setFormBusy(false);
    if (!r.ok) {
      setFormMessage(body.error || "Não foi possível submeter a candidatura.");
      return;
    }
    setApplied(true);
  }

  return (
    <PlatformLocalizedSurface>
      <main className="payment-page careers-page">
        <header className="payment-top">
          <Link href="/" className="auth-brand">
            <b>EP</b>
            <span>Enterprise Performance</span>
          </Link>
          <span>Carreiras</span>
        </header>
        <section className="careers-shell">
          {busy ? (
            <div className="payment-loading">A carregar vagas…</div>
          ) : error && !data ? (
            <div className="payment-error">
              <b>Não foi possível continuar</b>
              <p>{error}</p>
            </div>
          ) : (
            data && (
              <>
                <div className="careers-heading">
                  <small>OPORTUNIDADES</small>
                  <h1>Trabalhar na {data.companyName}</h1>
                  <p>
                    {data.requisitions.length
                      ? "Vagas abertas no momento. Candidate-se diretamente abaixo."
                      : "Não há vagas abertas no momento. Volte a verificar brevemente."}
                  </p>
                </div>
                <ul className="careers-list">
                  {data.requisitions.map((r) => (
                    <li key={r.id} className="careers-card">
                      <div>
                        <b>{r.title}</b>
                        <small>
                          {r.organizationName}
                          {r.departmentCode ? ` · ${r.departmentCode}` : ""} ·{" "}
                          {r.employmentType}
                        </small>
                        <small>
                          {r.positions} posição(ões) · início previsto em{" "}
                          {r.targetStartDate}
                        </small>
                      </div>
                      <button
                        onClick={() => {
                          setApplyingTo(r);
                          setApplied(false);
                          setFormMessage("");
                        }}
                      >
                        Candidatar-me
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )
          )}
        </section>
        {applyingTo && (
          <div className="modal-inline">
            <form onSubmit={submit}>
              <header>
                <div>
                  <small>CANDIDATURA</small>
                  <h2>{applyingTo.title}</h2>
                </div>
                <button type="button" onClick={() => setApplyingTo(null)}>
                  ×
                </button>
              </header>
              {applied ? (
                <p className="auth-feedback">
                  Candidatura recebida com sucesso. A equipa de recrutamento
                  irá contactá-lo caso o perfil avance no processo.
                </p>
              ) : (
                <>
                  <label>
                    Nome completo
                    <input name="fullName" required minLength={2} />
                  </label>
                  <label>
                    E-mail
                    <input name="email" type="email" required />
                  </label>
                  <label>
                    Telefone (opcional)
                    <input name="phone" type="tel" />
                  </label>
                  <label className="auth-check">
                    <input type="checkbox" name="consent" required />
                    <span>
                      Autorizo o tratamento dos meus dados pessoais para fins
                      de recrutamento e seleção para esta e futuras vagas.
                    </span>
                  </label>
                  {formMessage && <p className="erro-form">{formMessage}</p>}
                  <footer>
                    <button
                      type="button"
                      className="secundario"
                      onClick={() => setApplyingTo(null)}
                    >
                      Cancelar
                    </button>
                    <button className="primario" disabled={formBusy}>
                      {formBusy ? "A submeter…" : "Submeter candidatura"}
                    </button>
                  </footer>
                </>
              )}
            </form>
          </div>
        )}
      </main>
    </PlatformLocalizedSurface>
  );
}
