"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api-client";
import "./payroll-country-controls.css";

type Pack = {
  countryCode: string;
  name: string;
  currency: string;
  language: string;
  checks: string[];
  status: string;
  packVersion: string;
  startedBy: string | null;
  startedAt: string | null;
  activatedBy: string | null;
  activatedAt: string | null;
};

const erpFlow = [
  "Preparar período",
  "Recolher variáveis",
  "Calcular",
  "Validar exceções",
  "Aprovar",
  "Fechar",
  "Pagar e reportar",
  "Integrar Finance",
];

export function PayrollCountryControls() {
  const [country, setCountry] = useState("AO"),
    [open, setOpen] = useState(true),
    [packs, setPacks] = useState<Pack[] | null>(null),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  const load = () =>
    apiFetch("/api/v1/payroll-country-packs")
      .then(async (r) => {
        const b = (await r.json()) as { packs?: Pack[]; error?: string };
        if (!r.ok) throw new Error(b.error);
        setPacks(b.packs || []);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
    apiFetch("/api/session")
      .then((r) => r.json())
      .then((b) => setEmail(b.email || ""))
      .catch(() => {});
  }, []);

  const c = packs?.find((p) => p.countryCode === country);

  async function act(type: "startParametrization" | "activatePack") {
    setBusy(true);
    setError("");
    const r = await apiFetch("/api/v1/payroll-country-packs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, countryCode: country }),
    });
    const b = (await r.json()) as { error?: string };
    setBusy(false);
    if (!r.ok) {
      setError(b.error || "Não foi possível processar o pedido.");
      return;
    }
    load();
  }

  return (
    <section className={open ? "payroll-governance open" : "payroll-governance"}>
      <button className="payroll-governance-head" onClick={() => setOpen(!open)}>
        <span>
          <i>§</i>
          <b>Catálogo de configuração por país</b>
          <small>
            {c ? `${c.name} · ${c.packVersion} · ${c.status}` : "A carregar…"}
          </small>
        </span>
        <em>{open ? "Ocultar −" : "Ver configuração +"}</em>
      </button>
      {open && (
        <div className="payroll-governance-body">
          <header>
            <label>
              País aplicável
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                {(packs || []).map((p) => (
                  <option key={p.countryCode} value={p.countryCode}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Moeda
              <input value={c?.currency || ""} readOnly />
            </label>
            <label>
              Idioma documental
              <input value={c?.language || ""} readOnly />
            </label>
            <label>
              Versão do Pack
              <input value={c?.packVersion || ""} readOnly />
            </label>
          </header>
          {c && (
            <div className="payroll-governance-status">
              {c.status === "Não instalado" && (
                <button disabled={busy} onClick={() => act("startParametrization")}>
                  {busy ? "A processar…" : "Iniciar parametrização"}
                </button>
              )}
              {c.status === "Em parametrização" &&
                (c.startedBy?.toLowerCase() === email.toLowerCase() ? (
                  <span className="payroll-governance-note">
                    Iniciado por si em{" "}
                    {c.startedAt && new Date(c.startedAt).toLocaleDateString("pt-PT")}{" "}
                    — aguarda ativação por outro administrador (maker-checker).
                  </span>
                ) : (
                  <button disabled title="Ativação global indisponível; escolha o regime em cada processamento" onClick={() => act("activatePack")}>
                    {busy ? "A processar…" : "Ativar pack"}
                  </button>
                ))}
              {c.status === "Ativo" && (
                <span className="payroll-governance-note">
                  Ativado por {c.activatedBy} em{" "}
                  {c.activatedAt && new Date(c.activatedAt).toLocaleDateString("pt-PT")}
                  .
                </span>
              )}
              {error && <p className="erro-form">{error}</p>}
            </div>
          )}
          {country==="AO"&&<p className="payroll-governance-note">O cálculo de IRT e INSS de Angola 2026 está disponível na escolha do regime ao criar um processamento. A seleção é explícita por processamento e exige revisão das rubricas; este catálogo não ativa regras automaticamente.</p>}
          <div className="payroll-erp-flow">
            {erpFlow.map((x, i) => (
              <span key={x}>
                <i>{i + 1}</i>
                <b>{x}</b>
                <small>
                  {i < 5 ? "Reversível" : i === 5 ? "Bloqueia cálculo" : "Pós-fecho"}
                </small>
              </span>
            ))}
          </div>
          <footer>
            <div>
              {(c?.checks || []).map((x) => (
                <span key={x}>· {x}</span>
              ))}
            </div>
            <p>
              <b>Regra de governação:</b> nenhuma lei laboral, imposto ou contribuição
              é assumida pelo Core. Cada regra exige país, fundamento, vigência,
              fórmula determinística, testes e aprovação antes de uso em produção.
            </p>
          </footer>
        </div>
      )}
    </section>
  );
}
