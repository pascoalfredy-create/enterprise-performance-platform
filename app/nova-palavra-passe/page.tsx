"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { AuthShell } from "../auth-shell";
import { updatePassword } from "../../lib/supabase-browser";

export default function NovaPalavraPasse(){
 const [token]=useState(()=>typeof window==="undefined"?"":new URLSearchParams(window.location.hash.slice(1)).get("access_token")||"");
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[done,setDone]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget),password=String(f.get("password")||""),confirm=String(f.get("confirm")||"");if(password.length<8||password!==confirm){setMessage(password!==confirm?"As palavras-passe não coincidem.":"Utilize pelo menos 8 caracteres.");return}setBusy(true);const r=await updatePassword(token,password);setBusy(false);if(!r.ok){setMessage(r.message||"");return}setDone(true)}
 return <AuthShell><Link href="/entrar">← Voltar ao login</Link><header><small>NOVO ACESSO</small><h2>Defina uma nova palavra-passe</h2><p>A ligação de recuperação é temporária e só pode ser utilizada no respetivo fluxo.</p></header>{done?<p className="auth-feedback ok">Palavra-passe atualizada. <Link href="/entrar">Entrar na plataforma</Link></p>:!token?<p className="auth-feedback">A ligação é inválida ou expirou. Solicite uma nova recuperação.</p>:<form className="auth-form" onSubmit={submit}><label>Nova palavra-passe<input name="password" type="password" minLength={8} required autoComplete="new-password"/></label><label>Confirmar palavra-passe<input name="confirm" type="password" minLength={8} required autoComplete="new-password"/></label>{message&&<p className="auth-feedback">{message}</p>}<button className="auth-button" disabled={busy}>{busy?"A atualizar…":"Atualizar palavra-passe"}</button></form>}</AuthShell>
}
