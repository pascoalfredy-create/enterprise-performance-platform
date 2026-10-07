"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthShell } from "../auth-shell";
import { signIn, storeSession } from "../../lib/supabase-browser";
import { apiFetch } from "../../lib/api-client";

export default function Entrar(){const [busy,setBusy]=useState(false),[message,setMessage]=useState("");async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setMessage("");const f=new FormData(e.currentTarget);const result=await signIn(String(f.get("email")||""),String(f.get("password")||""));if(!result.ok){setBusy(false);setMessage(result.message||"");return}storeSession(result.data||{});
  // An account that already has an active company/tenant (from a
  // previous checkout + provisioning) must land on the real dashboard,
  // not be funnelled back through plan selection every time it signs
  // in — /api/session is the same check "/" itself relies on to decide
  // what to show, so a 401/403/no-tenant response here means exactly
  // "treat this as a first-time signup" and the onboarding redirect is
  // still correct.
  let hasTenant=false;
  try{const r=await apiFetch("/api/session");if(r.ok){const body=await r.json() as {tenantId?:string};hasTenant=Boolean(body.tenantId)}}catch{}
  setBusy(false);window.location.assign(hasTenant?"/":"/onboarding/modulos")}return <AuthShell><Link href="/">← Voltar ao site</Link><header><small>ÁREA SEGURA</small><h2>Bem-vindo novamente</h2><p>Entre para continuar a configuração da sua empresa e dos módulos contratados.</p></header><form className="auth-form" onSubmit={submit}><label>E-mail<input name="email" type="email" required autoComplete="email"/></label><label>Palavra-passe<input name="password" type="password" required autoComplete="current-password"/></label>{message&&<p className="auth-feedback">{message}</p>}<button className="auth-button" disabled={busy}>{busy?"A validar…":"Entrar"}</button></form><p className="auth-footer"><Link href="/recuperar">Esqueceu a palavra-passe?</Link></p><p className="auth-footer">Ainda não tem conta? <Link href="/registar">Criar conta</Link></p></AuthShell>}
