"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthShell } from "../auth-shell";
import { requestPasswordReset } from "../../lib/supabase-browser";

export default function Recuperar(){const [busy,setBusy]=useState(false),[sent,setSent]=useState(false),[message,setMessage]=useState("");async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);const r=await requestPasswordReset(String(f.get("email")||""),`${window.location.origin}/nova-palavra-passe`);setBusy(false);if(!r.ok){setMessage(r.message||"");return}setSent(true)}return <AuthShell><Link href="/entrar">← Voltar ao login</Link><header><small>RECUPERAÇÃO SEGURA</small><h2>Recupere o seu acesso</h2><p>Indique o e-mail utilizado no registo. A resposta não revelará se a conta existe.</p></header>{sent?<p className="auth-feedback ok">Se existir uma conta com este e-mail, enviámos uma ligação segura para definir uma nova palavra-passe.</p>:<form className="auth-form" onSubmit={submit}><label>E-mail<input name="email" type="email" required autoComplete="email"/></label>{message&&<p className="auth-feedback">{message}</p>}<button className="auth-button" disabled={busy}>{busy?"A enviar…":"Enviar instruções"}</button></form>}</AuthShell>}
