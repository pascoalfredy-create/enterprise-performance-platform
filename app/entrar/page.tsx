"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import {usePlatformLocale} from "../use-platform-locale";
import {platformLanguages} from "../../lib/platform-i18n";
import {loginCopy} from "../login-copy";
import "./login.css";
import { signIn, storeSession } from "../../lib/supabase-browser";
import { apiFetch } from "../../lib/api-client";

export default function Entrar(){const locale=usePlatformLocale(),index={pt:0,en:1,es:2,fr:3,ru:4}[locale],t=(key:keyof typeof loginCopy)=>loginCopy[key][index];const [busy,setBusy]=useState(false),[message,setMessage]=useState("");async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setMessage("");const f=new FormData(e.currentTarget);const result=await signIn(String(f.get("email")||""),String(f.get("password")||""));if(!result.ok){setBusy(false);setMessage(result.message||"");return}storeSession(result.data||{});
  // An account that already has an active company/tenant (from a
  // previous checkout + provisioning) must land on the real dashboard,
  // not be funnelled back through plan selection every time it signs
  // in — /api/session is the same check "/" itself relies on to decide
  // what to show, so a 401/403/no-tenant response here means exactly
  // "treat this as a first-time signup" and the onboarding redirect is
  // still correct.
  let hasTenant=false,role="";
  try{const r=await apiFetch("/api/session");if(r.ok){const body=await r.json() as {tenantId?:string;role?:string};hasTenant=Boolean(body.tenantId);role=body.role||""}}catch{}
  setBusy(false);window.location.assign(role==="Colaborador"?"/portal":hasTenant?"/":"/onboarding/modulos")}return <div className="platform-login"><header className="platform-login-top"><Link href="/" className="platform-login-brand"><img src="/brand-icon.png" alt=""/><span><strong>Enterprise Performance</strong><small>{t('subtitle')}</small></span></Link><select aria-label={t('language')} value={locale} onChange={e=>{localStorage.setItem('ep_locale',e.target.value);window.dispatchEvent(new Event('ep:locale'))}}>{Object.entries(platformLanguages).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></header><main className="platform-login-main"><div className="platform-login-wrap"><section className="platform-login-card" aria-labelledby="login-title"><header><h1 id="login-title">{t('title')}</h1><p>{t('intro')}</p></header><form onSubmit={submit}><label htmlFor="login-email">{t('email')}</label><input id="login-email" name="email" type="email" required autoComplete="email" placeholder={t('emailHint')}/><div className="platform-login-password-label"><label htmlFor="login-password">{t('password')}</label><Link href="/recuperar">{t('recover')}</Link></div><input id="login-password" name="password" type="password" required autoComplete="current-password" placeholder={t('password')}/>{message&&<p className="platform-login-feedback" role="alert">{message}</p>}<button type="submit" disabled={busy} aria-busy={busy}>{busy?t('busy'):t('enter')}<span aria-hidden="true">→</span></button></form><p className="platform-login-register">{t('noAccount')} <Link href="/registar">{t('register')}</Link></p></section><div className="platform-login-caption"><span><i aria-hidden="true"/>Enterprise Performance</span><span>{t('purpose')}</span></div></div></main><footer className="platform-login-bottom"><span>©{' Enterprise Performance'}</span><nav><Link href="/privacidade">{t('privacy')}</Link><span aria-hidden="true"> · </span><Link href="/termos">{t('terms')}</Link><span aria-hidden="true"> · </span><Link href="/recuperar">{t('help')}</Link></nav></footer></div>}
