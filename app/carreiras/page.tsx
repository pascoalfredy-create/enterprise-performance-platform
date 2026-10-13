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
  status: string;
  organizationName: string;
};
type Data = { companyName: string; requisitions: Requisition[] };
type Target = Requisition | "spontaneous";
type Step = "form" | "documents" | "done";

const DOCUMENT_FIELDS: Array<{ type: string; label: string; required: boolean }> = [
  { type: "CV", label: "Currículo (CV)", required: true },
  { type: "Carta de Apresentação", label: "Carta de apresentação (opcional)", required: false },
  { type: "Certificado Académico", label: "Certificado académico (opcional)", required: false },
  { type: "Outro", label: "Outro documento (opcional)", required: false },
];
const STATUS_CLASS: Record<string, string> = {
  Aberta: "careers-status-open",
  Fechada: "careers-status-closed",
  Cancelada: "careers-status-cancelled",
};

export default function Carreiras() {
  const [slug, setSlug] = useState<string | null>(null),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(true),
    [target, setTarget] = useState<Target | null>(null),
    [step, setStep] = useState<Step>("form"),
    [candidateId, setCandidateId] = useState(""),
    [formBusy, setFormBusy] = useState(false),
    [formMessage, setFormMessage] = useState(""),
    [uploadedTypes, setUploadedTypes] = useState<Set<string>>(new Set()),
    [fileNames, setFileNames] = useState<Record<string, string>>({}),
    [copiedId, setCopiedId] = useState("");

  function openFor(t: Target) {
    setTarget(t);
    setStep("form");
    setFormMessage("");
    setCandidateId("");
    setUploadedTypes(new Set());
    setFileNames({});
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const empresa = params.get("empresa");
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
        const vaga = params.get("vaga");
        if (vaga) {
          const found = body.requisitions.find((r) => r.id === vaga);
          if (found && found.status === "Aberta") openFor(found);
          else if (found)
            setNotice(`A vaga "${found.title}" já não está disponível para candidatura.`);
          else setNotice("A vaga ligada a esta ligação não foi encontrada.");
        }
      })
      .catch(() => setError("Não foi possível carregar as vagas."))
      .finally(() => setBusy(false));
  }, []);

  function shareLink(id: string) {
    return `${window.location.origin}${window.location.pathname}?empresa=${slug}&vaga=${id}`;
  }
  async function copyLink(id: string) {
    try {
      await navigator.clipboard.writeText(shareLink(id));
      setCopiedId(id);
      setTimeout(() => setCopiedId(""), 2000);
    } catch {
      setCopiedId("");
    }
  }

  async function submitApplication(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slug || !target) return;
    setFormBusy(true);
    setFormMessage("");
    const f = new FormData(e.currentTarget),
      payload: Record<string, string> = {
        type: target === "spontaneous" ? "spontaneous" : "apply",
        fullName: String(f.get("fullName") || ""),
        email: String(f.get("email") || ""),
        phone: String(f.get("phone") || ""),
        consent: String(f.get("consent") || ""),
        birthDate: String(f.get("birthDate") || ""),
        nationalId: String(f.get("nationalId") || ""),
        address: String(f.get("address") || ""),
        linkedinUrl: String(f.get("linkedinUrl") || ""),
        currentEmployer: String(f.get("currentEmployer") || ""),
        currentRole: String(f.get("currentRole") || ""),
        yearsExperience: String(f.get("yearsExperience") || ""),
        highestEducation: String(f.get("highestEducation") || ""),
        fieldOfStudy: String(f.get("fieldOfStudy") || ""),
        institution: String(f.get("institution") || ""),
        presentation: String(f.get("presentation") || ""),
      };
    if (target !== "spontaneous") payload.requisitionId = target.id;
    const r = await apiFetch(`/api/careers/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
      body = (await r.json()) as { error?: string; candidateId?: string };
    setFormBusy(false);
    if (!r.ok) {
      setFormMessage(body.error || "Não foi possível submeter a candidatura.");
      return;
    }
    setCandidateId(body.candidateId || "");
    setStep("documents");
  }

  async function submitDocuments(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slug || !candidateId) return;
    setFormBusy(true);
    setFormMessage("");
    const el = e.currentTarget;
    for (const field of DOCUMENT_FIELDS) {
      if (uploadedTypes.has(field.type)) continue;
      const input = el.elements.namedItem(field.type) as HTMLInputElement | null,
        file = input?.files?.[0];
      if (!file) {
        if (field.required) {
          setFormBusy(false);
          setFormMessage("O currículo (CV) é obrigatório.");
          return;
        }
        continue;
      }
      const form = new FormData();
      form.set("candidateId", candidateId);
      form.set("documentType", field.type);
      form.set("file", file);
      const r = await apiFetch(`/api/careers/${encodeURIComponent(slug)}/documents`, {
          method: "POST",
          body: form,
        }),
        body = (await r.json()) as { error?: string };
      if (!r.ok) {
        setFormBusy(false);
        setFormMessage(`${field.label}: ${body.error || "falha ao carregar."}`);
        return;
      }
      setUploadedTypes((prev) => new Set(prev).add(field.type));
    }
    setFormBusy(false);
    setStep("done");
  }

  return (
    <PlatformLocalizedSurface>
      <main className="careers-page">
        <header className="careers-top">
          <Link href="/" className="auth-brand">
            <b>EP</b>
            <span>Enterprise Performance</span>
          </Link>
          <span>Carreiras</span>
        </header>
        <section className="careers-hero">
          {busy ? (
            <div className="careers-shell">
              <div className="careers-loading">A carregar vagas…</div>
            </div>
          ) : error && !data ? (
            <div className="careers-shell">
              <div className="careers-error">
                <b>Não foi possível continuar</b>
                <p>{error}</p>
              </div>
            </div>
          ) : (
            data && (
              <div className="careers-shell">
                <div className="careers-heading">
                  <small>OPORTUNIDADES</small>
                  <h1>Trabalhar na {data.companyName}</h1>
                  <p>
                    {data.requisitions.some((r) => r.status === "Aberta")
                      ? "Vagas abertas no momento. Candidate-se diretamente abaixo, ou envie uma candidatura espontânea."
                      : "Não há vagas abertas no momento. Pode ainda assim enviar uma candidatura espontânea."}
                  </p>
                  <button
                    type="button"
                    className="careers-spontaneous"
                    onClick={() => openFor("spontaneous")}
                  >
                    ✦ Candidatura espontânea
                  </button>
                </div>
                {notice && <p className="careers-notice">{notice}</p>}
                {data.requisitions.length > 0 && (
                  <ul className="careers-list">
                    {data.requisitions.map((r) => (
                      <li key={r.id} className="careers-card">
                        <div className="careers-card-badge" aria-hidden="true">
                          {r.title.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="careers-card-body">
                          <div className="careers-card-title">
                            <b>{r.title}</b>
                            <em className={STATUS_CLASS[r.status]}>{r.status}</em>
                          </div>
                          <div className="careers-card-meta">
                            <span>{r.organizationName}</span>
                            {r.departmentCode && <span>{r.departmentCode}</span>}
                            <span>{r.employmentType}</span>
                          </div>
                          <div className="careers-card-meta">
                            <span>{r.positions} posição(ões)</span>
                            <span>início previsto em {r.targetStartDate}</span>
                          </div>
                        </div>
                        <nav>
                          {r.status === "Aberta" && (
                            <button onClick={() => openFor(r)}>Candidatar-me</button>
                          )}
                          <button
                            type="button"
                            className="careers-copy"
                            onClick={() => copyLink(r.id)}
                          >
                            {copiedId === r.id ? "Copiado ✓" : "Copiar ligação"}
                          </button>
                        </nav>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          )}
        </section>
        {target && (
          <div className="modal-inline careers-modal">
            <form
              onSubmit={
                step === "form"
                  ? submitApplication
                  : step === "documents"
                    ? submitDocuments
                    : (e) => e.preventDefault()
              }
            >
              <header>
                <div>
                  <small>CANDIDATURA</small>
                  <h2>{target === "spontaneous" ? "Candidatura espontânea" : target.title}</h2>
                </div>
                <button type="button" onClick={() => setTarget(null)}>
                  ×
                </button>
              </header>
              {step !== "done" && (
                <div className="careers-steps" aria-hidden="true">
                  <span className={step === "form" ? "current" : "done"}>
                    <i>{step === "form" ? "1" : "✓"}</i>Dados
                  </span>
                  <em />
                  <span className={step === "documents" ? "current" : ""}>
                    <i>2</i>Documentos
                  </span>
                </div>
              )}
              {step === "done" ? (
                <div className="careers-success">
                  <i aria-hidden="true">✓</i>
                  <h3>Candidatura recebida com sucesso</h3>
                  <p>
                    A equipa de recrutamento irá contactá-lo caso o perfil
                    avance no processo.
                  </p>
                  <button
                    type="button"
                    className="primario"
                    onClick={() => setTarget(null)}
                  >
                    Concluído
                  </button>
                </div>
              ) : step === "documents" ? (
                <>
                  <p className="careers-step-hint">
                    Passo 2 de 2 — envie os seus documentos (o currículo é
                    obrigatório, os restantes são opcionais).
                  </p>
                  <div className="careers-docs">
                    {DOCUMENT_FIELDS.map((f) => {
                      const done = uploadedTypes.has(f.type),
                        chosen = fileNames[f.type];
                      return (
                        <label
                          key={f.type}
                          className={`careers-doc-tile${done ? " done" : ""}${chosen ? " picked" : ""}`}
                        >
                          <input
                            type="file"
                            name={f.type}
                            accept=".pdf,.jpg,.jpeg,.png"
                            required={f.required && !done}
                            disabled={done}
                            onChange={(e) =>
                              setFileNames((prev) => ({
                                ...prev,
                                [f.type]: e.currentTarget.files?.[0]?.name || "",
                              }))
                            }
                          />
                          <span className="careers-doc-icon" aria-hidden="true">
                            {done ? "✓" : "📎"}
                          </span>
                          <span className="careers-doc-info">
                            <b>
                              {f.label}
                              {f.required && <em> · obrigatório</em>}
                            </b>
                            <small>
                              {done
                                ? `Enviado · ${chosen}`
                                : chosen || "Clique para escolher um ficheiro"}
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {formMessage && <p className="erro-form">{formMessage}</p>}
                  <footer>
                    <button
                      type="button"
                      className="secundario"
                      onClick={() => setTarget(null)}
                    >
                      Cancelar
                    </button>
                    <button className="primario" disabled={formBusy}>
                      {formBusy ? "A enviar…" : "Enviar documentos e concluir"}
                    </button>
                  </footer>
                </>
              ) : (
                <>
                  <fieldset>
                    <legend>Dados pessoais</legend>
                    <label>
                      Nome completo
                      <input name="fullName" required minLength={2} />
                    </label>
                    <div className="careers-grid-2">
                      <label>
                        E-mail
                        <input name="email" type="email" required />
                      </label>
                      <label>
                        Telefone (opcional)
                        <input name="phone" type="tel" />
                      </label>
                    </div>
                    <div className="careers-grid-2">
                      <label>
                        Data de nascimento (opcional)
                        <input name="birthDate" type="date" />
                      </label>
                      <label>
                        Nº de identificação (opcional)
                        <input name="nationalId" />
                      </label>
                    </div>
                    <label>
                      Morada (opcional)
                      <input name="address" />
                    </label>
                    <label>
                      Perfil profissional online (opcional)
                      <input name="linkedinUrl" type="url" placeholder="https://" />
                    </label>
                  </fieldset>
                  <fieldset>
                    <legend>Dados profissionais</legend>
                    <label>
                      Empregador atual (opcional)
                      <input name="currentEmployer" />
                    </label>
                    <div className="careers-grid-2">
                      <label>
                        Função atual (opcional)
                        <input name="currentRole" />
                      </label>
                      <label>
                        Anos de experiência (opcional)
                        <input name="yearsExperience" type="number" min="0" />
                      </label>
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>Dados académicos</legend>
                    <div className="careers-grid-2">
                      <label>
                        Nível de formação (opcional)
                        <select name="highestEducation" defaultValue="">
                          <option value="">Selecionar</option>
                          <option>Ensino secundário</option>
                          <option>Licenciatura</option>
                          <option>Pós-graduação</option>
                          <option>Mestrado</option>
                          <option>Doutoramento</option>
                        </select>
                      </label>
                      <label>
                        Área de formação (opcional)
                        <input name="fieldOfStudy" />
                      </label>
                    </div>
                    <label>
                      Instituição (opcional)
                      <input name="institution" />
                    </label>
                  </fieldset>
                  <fieldset>
                    <legend>Apresentação</legend>
                    <label>
                      Fale-nos brevemente sobre si e a sua motivação
                      <textarea name="presentation" minLength={20} required />
                    </label>
                  </fieldset>
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
                      onClick={() => setTarget(null)}
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
