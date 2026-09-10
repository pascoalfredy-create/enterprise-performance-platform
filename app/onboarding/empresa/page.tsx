"use client";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PlatformLocalizedSurface } from "../../hr-localized-surface";
import "../../auth.css";
import "./provision.css";

type Result = {
  provisioning: {
    tenant_id: string;
    company_name: string;
    company_slug: string;
    status: string;
  };
  businessProfile: {
    sectorCode: string;
    sectorName: string;
    coreBusiness: string;
    industryPackCode: string;
    industryPackName: string;
    frameworkStatus: string;
  };
  subscription: {
    bundle_code: string;
    status: string;
    current_period_end: string;
  };
  modules: string[];
};
type Sector = {
  code: string;
  name: string;
  pack_code: string;
  pack_name: string;
  description: string;
  methodology_name: string;
  pack_status: string;
  version_number: number;
};
const moduleNames: Record<string, string> = {
  CORE: "Administração e segurança",
  "FINANCE_FP&A": "Finance & FP&A",
  HCM: "HCM",
  PAYROLL: "Payroll",
  WORKFORCE_PLANNING: "Workforce Planning",
  PERFORMANCE_MANAGEMENT: "Performance Management",
  ANALYTICS_REPORTING: "Analytics & Reporting",
  WORKFLOW: "Workflow",
  INTEGRATIONS: "Integration Hub",
};

export default function Empresa() {
  const [payment] = useState<{ id?: string } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("ep_confirmed_payment") || "null");
    } catch {
      return null;
    }
  });
  const [companyName, setCompanyName] = useState(""),
    [slug, setSlug] = useState(""),
    [country, setCountry] = useState("AO"),
    [currency, setCurrency] = useState("AOA"),
    [locale, setLocale] = useState("pt-AO"),
    [sector, setSector] = useState(""),
    [coreBusiness, setCoreBusiness] = useState(""),
    [sectors, setSectors] = useState<Sector[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<Result | null>(null);
  const suggested = useMemo(
    () =>
      companyName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48),
    [companyName],
  );
  useEffect(() => {
    const token = sessionStorage.getItem("ep_access_token") || "";
    fetch("/api/v1/commerce/industry-packs", {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((x) => {
        if (Array.isArray(x.sectors)) setSectors(x.sectors);
      })
      .catch(() => setError("Não foi possível carregar os setores disponíveis."));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!payment?.id) {
      setError("Não foi encontrado um pagamento confirmado nesta sessão.");
      return;
    }
    setBusy(true);
    setError("");
    const token = sessionStorage.getItem("ep_access_token") || "",
      response = await fetch("/api/v1/commerce/provision", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          paymentId: payment.id,
          companyName,
          slug: slug || suggested,
          countryCode: country,
          currency,
          locale,
          sectorCode: sector,
          coreBusiness,
        }),
      }),
      body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(body.error || "Não foi possível criar a empresa.");
      return;
    }
    localStorage.setItem("ep_active_tenant", body.provisioning.tenant_id);
    document.cookie = `ep_tenant=${encodeURIComponent(body.provisioning.tenant_id)}; Path=/; SameSite=Lax; Max-Age=31536000`;
    setResult(body);
  }
  if (result)
    return (
      <PlatformLocalizedSurface>
      <main className="provision-page">
        <header className="provision-top">
          <Link href="/" className="auth-brand">
            <b>EP</b>
            <span>Enterprise Performance</span>
          </Link>
          <span>Empresa operacional</span>
        </header>
        <section className="success-card">
          <span className="success-mark">✓</span>
          <small>PASSO 3 DE 3 CONCLUÍDO</small>
          <h1>{result.provisioning.company_name}</h1>
          <p>
            A empresa, organização principal, subscrição, Administrador e
            permissões dos módulos foram criados de forma auditável.
          </p>
          <div className="tenant-reference">
            <span>Tenant</span>
            <code>{result.provisioning.tenant_id}</code>
          </div>
          <div className="industry-result">
            <small>CONTEXTO DO NEGÓCIO</small>
            <b>{result.businessProfile.sectorName}</b>
            <span>{result.businessProfile.coreBusiness}</span>
            <em>
              {result.businessProfile.industryPackName} · framework{" "}
              {result.businessProfile.frameworkStatus}
            </em>
          </div>
          <h2>Módulos contratados</h2>
          <ul>
            {result.modules.map((code) => (
              <li key={code}>
                <b>✓</b>
                {moduleNames[code] || code}
              </li>
            ))}
          </ul>
          <aside>
            <b>Subscrição {result.subscription.status}</b>
            <span>
              Bundle {result.subscription.bundle_code} · ciclo até{" "}
              {new Date(
                result.subscription.current_period_end,
              ).toLocaleDateString("pt-AO")}
            </span>
          </aside>
          <Link className="primary-link" href="/">
            Ir para a plataforma →
          </Link>
        </section>
      </main>
      </PlatformLocalizedSurface>
    );
  return (
    <PlatformLocalizedSurface>
    <main className="provision-page">
      <header className="provision-top">
        <Link href="/" className="auth-brand">
          <b>EP</b>
          <span>Enterprise Performance</span>
        </Link>
        <span>Configuração segura</span>
      </header>
      <section className="provision-shell">
        <div className="provision-copy">
          <small>PASSO 3 DE 3</small>
          <h1>Crie a sua empresa</h1>
          <p>
            Esta será a raiz organizacional isolada onde os utilizadores,
            colaboradores, dimensões, planos, payroll e relatórios serão
            governados.
          </p>
          <dl>
            <div>
              <dt>1</dt>
              <dd>
                <b>Empresa isolada</b>
                <span>Dados e auditoria separados por tenant</span>
              </dd>
            </div>
            <div>
              <dt>2</dt>
              <dd>
                <b>Contexto do negócio</b>
                <span>Setor e core business alinham o framework inicial</span>
              </dd>
            </div>
            <div>
              <dt>3</dt>
              <dd>
                <b>Administrador inicial</b>
                <span>A sua identidade recebe a gestão da empresa</span>
              </dd>
            </div>
          </dl>
        </div>
        <form onSubmit={submit} className="company-form">
          <small>DADOS BASE</small>
          <h2>Identidade da organização</h2>
          <label>
            Nome da empresa
            <input
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Ex.: Empresa Exemplo, S.A."
            />
          </label>
          <label>
            Identificador web
            <input
              required
              value={slug || suggested}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="empresa-exemplo"
            />
            <span>Usado internamente para identificar a empresa.</span>
          </label>
          <label>
            Setor / indústria
            <select
              required
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            >
              <option value="">Selecionar o setor</option>
              {sectors.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
            {sector && (
              <span>
                {sectors.find((item) => item.code === sector)?.pack_name} ·{" "}
                {sectors.find((item) => item.code === sector)?.description}
              </span>
            )}
          </label>
          <label>
            Core business
            <textarea
              required
              minLength={10}
              value={coreBusiness}
              onChange={(e) => setCoreBusiness(e.target.value)}
              placeholder="Descreva a principal atividade, produtos, clientes e forma de geração de receita."
            />
            <span>
              Contextualiza diagnósticos e relatórios; não altera os cálculos.
            </span>
          </label>
          <div className="form-row">
            <label>
              País
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                <option value="AO">Angola</option>
                <option value="PT">Portugal</option>
                <option value="MZ">Moçambique</option>
                <option value="CV">Cabo Verde</option>
              </select>
            </label>
            <label>
              Moeda base
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option>AOA</option>
                <option>USD</option>
                <option>EUR</option>
                <option>MZN</option>
                <option>CVE</option>
              </select>
            </label>
          </div>
          <label>
            Idioma
            <select value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="pt-AO">Português (Angola)</option>
              <option value="pt-PT">Português (Portugal)</option>
              <option value="en-US">English</option>
            </select>
          </label>
          {error && <p className="provision-error">{error}</p>}
          <button disabled={busy || !payment?.id || !sector}>
            {busy
              ? "A provisionar com segurança…"
              : "Criar empresa e instalar Industry Pack →"}
          </button>
          {!payment?.id && (
            <p className="missing-payment">
              Conclua primeiro o pagamento de teste.{" "}
              <Link href="/checkout">Voltar ao checkout</Link>
            </p>
          )}
          <p className="legal-note">
            O Industry Pack instala uma metodologia configurável em rascunho.
            Nenhuma regra é ativada sem revisão e maker-checker.
          </p>
        </form>
      </section>
    </main>
    </PlatformLocalizedSurface>
  );
}
