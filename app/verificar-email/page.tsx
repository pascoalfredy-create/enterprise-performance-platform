import Link from "next/link";
import { AuthShell } from "../auth-shell";
export default function VerificarEmail(){return <AuthShell><div className="auth-status"><i>✓</i><small>E-MAIL VERIFICADO</small><h2>A sua identidade foi confirmada</h2><p>Pode agora entrar em segurança. A criação da empresa e o acesso aos módulos continuarão condicionados à subscrição válida.</p><Link className="auth-button" href="/entrar">Continuar para o login</Link></div></AuthShell>}
