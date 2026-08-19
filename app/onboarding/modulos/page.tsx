import Link from "next/link";
import { AuthShell } from "../../auth-shell";
export default function Modulos(){return <AuthShell><div className="auth-status"><i>1</i><small>ONBOARDING CONTROLADO</small><h2>Seleção de módulos</h2><p>A conta está pronta. A contratação, pagamento e ativação dos módulos serão implementados no próximo slice comercial; nenhum acesso empresarial foi concedido automaticamente.</p><Link className="auth-button" href="/">Voltar à apresentação</Link></div></AuthShell>}
