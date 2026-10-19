"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ANNUAL_MONTHS_CHARGED, BillingInterval, bundles, CATALOG_VERSION, EXTRA_FINANCIAL_MODEL_PROJECT_MONTHLY_MINOR, employeeTiers, formatAOA, subscriptionTotal, tierForEmployeeCount } from "../../../lib/commercial-catalog";
import { PlatformLocalizedSurface } from "../../hr-localized-surface";
import "../../auth.css";
import "./catalog.css";
import "./checkout.css";

export default function Modulos(){
 const bundle=bundles[0];
 const [interval,setInterval]=useState<BillingInterval>("monthly"),[employees,setEmployees]=useState(25),[extraProjects,setExtraProjects]=useState(0),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[checkoutId,setCheckoutId]=useState(""),[email,setEmail]=useState("Conta verificada");
 const tier=useMemo(()=>tierForEmployeeCount(employees),[employees]);
 const total=useMemo(()=>subscriptionTotal({tier,interval,extraFinancialModelProjects:extraProjects}),[tier,interval,extraProjects]);
 // sessionStorage is unavailable during SSR, so this must stay the "Conta
 // verificada" default on first render and only pick up the real email
 // after mount — reading it inline during render mismatches the server
 // markup whenever a value is already stored, breaking hydration.
 useEffect(()=>{
  const stored=sessionStorage.getItem("ep_user_email");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  if(stored)setEmail(stored)
 },[]);
 async function continueCheckout(){
  setBusy(true);setError("");
  const token=sessionStorage.getItem("ep_access_token")||"";
  const response=await fetch("/api/v1/commerce/checkout",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:JSON.stringify({interval,employees,extraFinancialModelProjects:extraProjects})});
  const body=await response.json();
  setBusy(false);
  if(!response.ok){setError(response.status===401?"A sessão expirou. Entre novamente para continuar.":body.error||"Não foi possível preparar o checkout.");return}
  localStorage.setItem("ep_checkout_draft",JSON.stringify(body.checkout));
  setCheckoutId(body.checkout.id);setSaved(true);
  window.location.assign("/checkout");
 }
 return <PlatformLocalizedSurface><main className="catalog-page">
  <header className="catalog-top"><Link href="/" className="auth-brand"><b>EP</b><span>Enterprise Performance</span></Link><div><span>{email}</span><Link href="/entrar">Terminar sessão</Link></div></header>
  <section className="catalog-intro">
   <div><small>PASSO 1 DE 3 · CATÁLOGO {CATALOG_VERSION}</small><h1>{bundle.name}</h1><p>{bundle.description}</p></div>
   <div className="billing-toggle"><button className={interval==="monthly"?"active":""} onClick={()=>{setInterval("monthly");setSaved(false)}}>Mensal</button><button className={interval==="annual"?"active":""} onClick={()=>{setInterval("annual");setSaved(false)}}>Anual <i>2 meses grátis</i></button></div>
  </section>
  <section className="bundle-grid">
   <div className="bundle-card selected">
    <span className="bundle-radio">✓</span>
    <small>{bundle.code}</small>
    <h2>{bundle.name}</h2>
    <p>{bundle.description}</p>
    <ul>{bundle.capabilities.map(x=><li key={x}>✓ {x}</li>)}</ul>
    <footer>Preço definido pelo número de colaboradores da empresa</footer>
   </div>
  </section>
  <section className="checkout-layout">
   <article className="usage-card">
    <small>DIMENSÃO DA EMPRESA</small>
    <h2>Quantos colaboradores vai processar?</h2>
    <p>O escalão e o preço ajustam-se automaticamente. Acima do limite do escalão escolhido não é possível adicionar mais colaboradores sem mudar de escalão.</p>
    <div>
     <label>Colaboradores<input type="number" min="1" max="10000" value={employees} onChange={e=>{setEmployees(Math.max(1,Number(e.target.value)));setSaved(false)}}/></label>
     <label>Projetos extra de Modelagem Financeira<input type="number" min="0" max="50" value={extraProjects} onChange={e=>{setExtraProjects(Math.max(0,Number(e.target.value)));setSaved(false)}}/></label>
    </div>
    <ul className="tier-ladder">{employeeTiers.map(t=><li key={t.code} className={t.code===tier.code?"active":""}><b>{t.label}</b><span>{formatAOA(t.monthlyMinor)}/mês · até {t.includedFinancialModelProjects} projeto(s) de Modelagem Financeira incluído(s)</span></li>)}</ul>
   </article>
   <aside className="order-card">
    <small>RESUMO DA SUBSCRIÇÃO</small>
    <h2>{bundle.name}</h2>
    <dl>
     <div><dt>Escalão</dt><dd>{tier.label}</dd></div>
     <div><dt>Preço base</dt><dd>{formatAOA(tier.monthlyMinor)}/mês</dd></div>
     <div><dt>Projetos de Modelagem Financeira incluídos</dt><dd>{tier.includedFinancialModelProjects}</dd></div>
     {extraProjects>0?<div><dt>Projetos extra</dt><dd>{extraProjects} × {formatAOA(EXTRA_FINANCIAL_MODEL_PROJECT_MONTHLY_MINOR)}</dd></div>:null}
     <div><dt>Periodicidade</dt><dd>{interval==="annual"?`${ANNUAL_MONTHS_CHARGED} mensalidades`:"Mensal"}</dd></div>
    </dl>
    <div className="order-total"><span>Total {interval==="annual"?"anual":"mensal"}</span><strong>{formatAOA(total.totalMinor)}</strong><small>Impostos aplicáveis calculados no checkout</small></div>
    {error&&<p className="checkout-error">{error}</p>}
    {saved?<div className="draft-saved"><b>✓ Rascunho persistido</b><p>Referência {checkoutId.slice(0,8)}. O PayPay ainda está em preparação e não foi efetuada qualquer cobrança.</p></div>:<button onClick={continueCheckout} disabled={busy}>{busy?"A validar no servidor…":"Continuar para checkout →"}</button>}
    <p className="order-rule">Sem pagamento confirmado, não existe empresa, subscrição ativa ou acesso a módulos.</p>
   </aside>
  </section>
 </main></PlatformLocalizedSurface>;
}
