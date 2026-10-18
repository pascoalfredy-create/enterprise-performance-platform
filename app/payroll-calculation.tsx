"use client";
import { angolaPayroll2026, type PayrollCalculationResult } from '../lib/payroll-engine';
import './payroll-calculation.css';
export function PayrollCalculation({snapshot,currency='AOA'}:{snapshot:string;currency?:string}){
 let data:Partial<PayrollCalculationResult>;
 try{data=JSON.parse(snapshot);}catch{return <p>Não foi possível ler a evidência deste cálculo.</p>}
 const fmt=(n:number)=>new Intl.NumberFormat('pt-PT',{style:'currency',currency}).format(n/100),t=data.tax;
 return <section className="pay-calculation" aria-label="Memória de cálculo salarial">
  <header><h3>Do bruto ao líquido</h3><small>{data.ruleVersion||'Processamento parametrizado — histórico'}</small></header>
  {t?<><p>A base de IRT é o bruto, menos as parcelas não sujeitas e o INSS do trabalhador. Adiantamentos e outros descontos são retirados depois do imposto.</p><dl>
   {([['Bruto',data.grossMinor],['Parcelas não sujeitas a IRT',t.irtExemptMinor],['Base contributiva INSS',t.socialBaseMinor],[`INSS trabalhador · ${t.employeeRateBps/100}%`,t.employeeSocialMinor],['Matéria coletável IRT',t.taxableMinor],['IRT a reter',t.irtMinor],['Outros descontos',t.otherDeductionsMinor],['Líquido a receber',data.netMinor],[`INSS entidade empregadora · ${t.employerRateBps/100}%`,t.employerSocialMinor],['Custo total da empresa',data.totalCostMinor]] as [string,number|undefined][]).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{fmt(value||0)}</dd></div>)}
  </dl><p>IRT: escalão {t.bracket} · parcela fixa {fmt(t.fixedMinor)} + {(t.rateBps/100).toLocaleString('pt-PT')}% sobre o excesso de {fmt(t.excessThresholdMinor)}.</p></>:<p>Este processamento usa as rubricas parametrizadas. Não foi aplicada uma tabela automática de IRT/INSS; as bases fiscais não estão disponíveis nesta evidência.</p>}
  <details open><summary>Rubricas e incidência</summary><div className="pay-calc-scroll"><table><thead><tr><th>Rubrica</th><th>Tipo</th><th>Valor</th>{t&&<><th>Não sujeito a IRT</th><th>Base INSS</th></>}</tr></thead><tbody>
   <tr><td>Salário base</td><td>Remuneração</td><td>{fmt(data.baseMinor||0)}</td>{t&&<><td>{fmt(0)}</td><td>{fmt(data.baseMinor||0)}</td></>}</tr>
   {(data.components||[]).map((c,i)=><tr key={`${c.code}-${i}`}><td>{c.name||c.code}</td><td>{c.category==='Earning'?'Remuneração':c.category==='Deduction'?'Desconto':'Encargo patronal'}</td><td>{fmt(c.amountMinor)}</td>{t&&<><td>{fmt(c.irtExemptMinor||0)}</td><td>{fmt(c.socialBaseMinor||0)}</td></>}</tr>)}
  </tbody></table></div></details>
  {t&&<details><summary>Regras e fontes do cálculo</summary><p>Angola · Grupo A · mês completo de 2026 · regime geral não reformado, sem isenções pessoais ou remunerações em espécie. Alimentação e transporte: limite mensal de 30.000 AOA por natureza, agregado entre rubricas. Férias: sujeitas a IRT e excluídas de INSS. Os encargos patronais acrescem ao custo da empresa e não reduzem o líquido.</p>{angolaPayroll2026.sources.map(s=><p key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></p>)}</details>}
 </section>;
}
