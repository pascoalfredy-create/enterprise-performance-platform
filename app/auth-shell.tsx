import Link from "next/link";
import { PlatformLocalizedSurface } from "./hr-localized-surface";
import "./auth.css";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return <PlatformLocalizedSurface><main className="auth-page"><section className="auth-story"><Link href="/" className="auth-brand"><b>EP</b><span>Enterprise Performance</span></Link><div className="auth-copy"><small>PERFORMANCE MANAGEMENT CLOUD</small><h1>Decisões melhores começam com dados governados.</h1><p>Planeamento financeiro, pessoas, payroll e reporting numa plataforma modular preparada para a realidade de cada empresa.</p></div><div className="auth-proof"><span><b>Modular</b>Pague apenas pelo que utiliza</span><span><b>Auditável</b>Cálculos rastreáveis</span><span><b>Seguro</b>Dados isolados por empresa</span></div></section><section className="auth-panel"><div className="auth-card">{children}</div></section></main></PlatformLocalizedSurface>;
}
