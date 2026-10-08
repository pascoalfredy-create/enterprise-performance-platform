"use client";
import { useEffect, useMemo, useState } from "react";
import type { PlatformLocale } from "../lib/platform-i18n";
import { usePlatformLocale } from "./use-platform-locale";
import { apiFetch } from "../lib/api-client";
import "./analytics-suite.css";

const analyticsCopy:Record<PlatformLocale,Record<string,string>>={
pt:{heading:"Uma visão governada de toda a empresa",intro:"Indicadores, tendências, explicações e ações conectados a todos os motores da plataforma.",period:"Período",comparison:"Comparação",aug:"Agosto 2026",jul:"Julho 2026",quarter:"2.º Trimestre 2026",previous:"Actual vs período anterior",executive:"Dashboard executivo",profiles:"Cockpit por perfil",reports:"Catálogo de relatórios",score:"ÍNDICE DE PERFORMANCE EMPRESARIAL",points:"+3,2 pontos",finance:"Financeiro",people:"Pessoas",operations:"Operações",execution:"Execução",reading:"LEITURA EXECUTIVA",readingTitle:"Performance sólida, com dois riscos que exigem decisão",readingText:"Logística pressiona a margem e quatro posições críticas limitam a capacidade operacional."},
en:{heading:"A governed view of the entire business",intro:"Metrics, trends, explanations and actions connected across every platform engine.",period:"Period",comparison:"Comparison",aug:"August 2026",jul:"July 2026",quarter:"Q2 2026",previous:"Actual vs previous period",executive:"Executive dashboard",profiles:"Role-based cockpit",reports:"Report catalogue",score:"ENTERPRISE PERFORMANCE INDEX",points:"+3.2 points",finance:"Financial",people:"People",operations:"Operations",execution:"Execution",reading:"EXECUTIVE READING",readingTitle:"Solid performance, with two risks requiring a decision",readingText:"Logistics pressure margins and four critical vacancies constrain operating capacity."},
es:{heading:"Una visión gobernada de toda la empresa",intro:"Indicadores, tendencias, explicaciones y acciones conectados a todos los motores de la plataforma.",period:"Período",comparison:"Comparación",aug:"Agosto de 2026",jul:"Julio de 2026",quarter:"2.º trimestre de 2026",previous:"Real vs período anterior",executive:"Panel ejecutivo",profiles:"Cockpit por perfil",reports:"Catálogo de informes",score:"ÍNDICE DE RENDIMIENTO EMPRESARIAL",points:"+3,2 puntos",finance:"Finanzas",people:"Personas",operations:"Operaciones",execution:"Ejecución",reading:"LECTURA EJECUTIVA",readingTitle:"Rendimiento sólido, con dos riesgos que requieren decisión",readingText:"La logística presiona el margen y cuatro vacantes críticas limitan la capacidad operativa."},
fr:{heading:"Une vision gouvernée de toute l’entreprise",intro:"Indicateurs, tendances, explications et actions reliés à tous les moteurs de la plateforme.",period:"Période",comparison:"Comparaison",aug:"Août 2026",jul:"Juillet 2026",quarter:"2e trimestre 2026",previous:"Réel vs période précédente",executive:"Tableau de bord exécutif",profiles:"Cockpit par profil",reports:"Catalogue des rapports",score:"INDICE DE PERFORMANCE DE L’ENTREPRISE",points:"+3,2 points",finance:"Finance",people:"Personnel",operations:"Opérations",execution:"Exécution",reading:"LECTURE EXÉCUTIVE",readingTitle:"Performance solide, avec deux risques exigeant une décision",readingText:"La logistique pèse sur la marge et quatre postes critiques limitent la capacité opérationnelle."},
ru:{heading:"Управляемый обзор всей компании",intro:"Показатели, тенденции, объяснения и действия по всем модулям платформы.",period:"Период",comparison:"Сравнение",aug:"Август 2026",jul:"Июль 2026",quarter:"2-й квартал 2026",previous:"Факт к предыдущему периоду",executive:"Панель руководителя",profiles:"Панель по роли",reports:"Каталог отчётов",score:"ИНДЕКС ЭФФЕКТИВНОСТИ КОМПАНИИ",points:"+3,2 пункта",finance:"Финансы",people:"Персонал",operations:"Операции",execution:"Исполнение",reading:"ОЦЕНКА РУКОВОДИТЕЛЯ",readingTitle:"Устойчивые результаты при двух рисках, требующих решения",readingText:"Логистика снижает маржу, а четыре критические вакансии ограничивают операционные возможности."}};

type Profile="Executivo"|"CFO"|"Controller"|"FP&A"|"RH"|"Payroll"|"Gestor";
type Metric={label:string;value:string;delta:string;tone?:"good"|"bad"|"neutral";module:string};
type RealCopy={loading:string;error:string;emptyTitle:string;emptyText:string;revenue:string;net:string;activeEmployees:string;openVacancies:string;positions:string;recruitment:string;previewLabel:string;previewText:string;openTasks:string;critical:string;accepted:string;rejected:string;validated:string;ofTotal:string;noBudget:string;finalizedReviews:string;noData:string;cash:string;netDebt:string;workingCapital:string;pendingRequests:string;onLeaveToday:string;payrollGross:string;netPay:string;employerCharges:string;reconciledEmployees:string};
const rc:Record<PlatformLocale,RealCopy>={
pt:{loading:"A carregar dados reais…",error:"Não foi possível carregar os dados reais.",emptyTitle:"Ainda sem dados suficientes",emptyText:"Este painel mostra apenas dados reais da sua empresa — ainda não há nem lançamentos financeiros nem colaboradores registados.",revenue:"Receita (real)",net:"Resultado (real)",activeEmployees:"Colaboradores ativos",openVacancies:"Vagas abertas",positions:"posições",recruitment:"Recrutamento",previewLabel:"PRÉ-VISUALIZAÇÃO",previewText:"Os valores desta secção são ilustrativos — ainda não estão ligados aos dados reais da empresa.",openTasks:"Tarefas abertas",critical:"críticas",accepted:"aceites",rejected:"rejeições",validated:"validados",ofTotal:"de",noBudget:"sem orçamento",finalizedReviews:"Avaliações finalizadas",noData:"Sem dados",cash:"Caixa",netDebt:"Dívida líquida",workingCapital:"Working Capital",pendingRequests:"Pedidos de ausência pendentes",onLeaveToday:"Ausentes hoje",payrollGross:"Payroll bruto",netPay:"Líquido",employerCharges:"Encargos empregador",reconciledEmployees:"Colaboradores reconciliados"},
en:{loading:"Loading real data…",error:"Could not load real data.",emptyTitle:"Not enough data yet",emptyText:"This panel only shows your company's real data — there are no financial entries or registered employees yet.",revenue:"Revenue (actual)",net:"Net result (actual)",activeEmployees:"Active employees",openVacancies:"Open vacancies",positions:"positions",recruitment:"Recruitment",previewLabel:"PREVIEW",previewText:"The values in this section are illustrative — not yet connected to the company's real data.",openTasks:"Open tasks",critical:"critical",accepted:"accepted",rejected:"rejections",validated:"validated",ofTotal:"of",noBudget:"no budget",finalizedReviews:"Finalized reviews",noData:"No data",cash:"Cash",netDebt:"Net debt",workingCapital:"Working Capital",pendingRequests:"Pending leave requests",onLeaveToday:"On leave today",payrollGross:"Gross payroll",netPay:"Net",employerCharges:"Employer contributions",reconciledEmployees:"Employees reconciled"},
es:{loading:"Cargando datos reales…",error:"No se pudieron cargar los datos reales.",emptyTitle:"Aún sin datos suficientes",emptyText:"Este panel solo muestra los datos reales de su empresa — todavía no hay movimientos financieros ni empleados registrados.",revenue:"Ingresos (real)",net:"Resultado (real)",activeEmployees:"Empleados activos",openVacancies:"Vacantes abiertas",positions:"puestos",recruitment:"Selección",previewLabel:"VISTA PREVIA",previewText:"Los valores de esta sección son ilustrativos — aún no están conectados a los datos reales de la empresa.",openTasks:"Tareas abiertas",critical:"críticas",accepted:"aceptados",rejected:"rechazos",validated:"validados",ofTotal:"de",noBudget:"sin presupuesto",finalizedReviews:"Evaluaciones finalizadas",noData:"Sin datos",cash:"Caja",netDebt:"Deuda neta",workingCapital:"Working Capital",pendingRequests:"Solicitudes de ausencia pendientes",onLeaveToday:"Ausentes hoy",payrollGross:"Nómina bruta",netPay:"Neto",employerCharges:"Cargas patronales",reconciledEmployees:"Empleados conciliados"},
fr:{loading:"Chargement des données réelles…",error:"Impossible de charger les données réelles.",emptyTitle:"Pas encore assez de données",emptyText:"Ce panneau n’affiche que les données réelles de votre entreprise — aucune écriture financière ni aucun salarié n’est encore enregistré.",revenue:"Chiffre d’affaires (réel)",net:"Résultat (réel)",activeEmployees:"Salariés actifs",openVacancies:"Postes ouverts",positions:"postes",recruitment:"Recrutement",previewLabel:"APERÇU",previewText:"Les valeurs de cette section sont illustratives — pas encore connectées aux données réelles de l’entreprise.",openTasks:"Tâches ouvertes",critical:"critiques",accepted:"acceptés",rejected:"rejets",validated:"validés",ofTotal:"sur",noBudget:"sans budget",finalizedReviews:"Évaluations finalisées",noData:"Aucune donnée",cash:"Trésorerie",netDebt:"Dette nette",workingCapital:"Besoin en fonds de roulement",pendingRequests:"Demandes d’absence en attente",onLeaveToday:"Absents aujourd’hui",payrollGross:"Paie brute",netPay:"Net",employerCharges:"Charges employeur",reconciledEmployees:"Salariés rapprochés"},
ru:{loading:"Загрузка реальных данных…",error:"Не удалось загрузить реальные данные.",emptyTitle:"Пока недостаточно данных",emptyText:"Эта панель показывает только реальные данные вашей компании — пока нет ни финансовых записей, ни зарегистрированных сотрудников.",revenue:"Выручка (факт)",net:"Результат (факт)",activeEmployees:"Активные сотрудники",openVacancies:"Открытые вакансии",positions:"позиций",recruitment:"Подбор персонала",previewLabel:"ПРЕДПРОСМОТР",previewText:"Значения в этом разделе иллюстративны — ещё не связаны с реальными данными компании.",openTasks:"Открытые задачи",critical:"критических",accepted:"принято",rejected:"отклонений",validated:"подтверждено",ofTotal:"из",noBudget:"нет бюджета",finalizedReviews:"Завершённые оценки",noData:"Нет данных",cash:"Денежные средства",netDebt:"Чистый долг",workingCapital:"Оборотный капитал",pendingRequests:"Заявки на отсутствие на рассмотрении",onLeaveToday:"Отсутствуют сегодня",payrollGross:"Начислено",netPay:"К выплате",employerCharges:"Взносы работодателя",reconciledEmployees:"Сверено сотрудников"}};

const profiles:Record<Profile,{focus:string;metrics:Metric[];series:number[];legend:string;insight:string;actions:string[]}>= {
 Executivo:{focus:"Valor, risco e execução empresarial",metrics:[{label:"Receita",value:"438 M AOA",delta:"+1,4% vs Budget",tone:"good",module:"Finance"},{label:"EBITDA",value:"82,4 M AOA",delta:"−3,2% vs Budget",tone:"bad",module:"Finance"},{label:"Headcount",value:"148",delta:"+4 vs plano",tone:"neutral",module:"Workforce"},{label:"Objetivos no rumo",value:"78%",delta:"+6 p.p.",tone:"good",module:"Performance"}],series:[74,78,76,81,84,87,89,92],legend:"Índice de performance empresarial",insight:"O crescimento comercial sustenta o resultado, mas logística e câmbio comprimem o EBITDA.",actions:["Rever contrato logístico","Reduzir DSO para 55 dias","Fechar 7 ações críticas"]},
 CFO:{focus:"Liquidez, resultado, capital e risco",metrics:[{label:"Caixa disponível",value:"214,8 M AOA",delta:"Runway 7,4 meses",tone:"good",module:"Tesouraria"},{label:"Forecast 13 semanas",value:"126,4 M AOA",delta:"mínimo projetado",tone:"neutral",module:"Tesouraria"},{label:"Dívida líquida/EBITDA",value:"1,8×",delta:"limite 2,5×",tone:"good",module:"Financiamento"},{label:"Working Capital",value:"48 dias",delta:"−6 dias",tone:"good",module:"Finance"}],series:[215,202,187,192,174,158,146,132],legend:"Caixa projetado · M AOA",insight:"A liquidez permanece protegida; concentração de clientes é o principal risco financeiro.",actions:["Proteger exposição cambial","Priorizar cobranças vencidas","Rever maturidade da dívida"]},
 Controller:{focus:"Fecho, integridade e conformidade",metrics:[{label:"Fecho mensal",value:"92%",delta:"23/25 tarefas",tone:"good",module:"Workflow"},{label:"Reconciliações",value:"18/21",delta:"3 pendentes",tone:"bad",module:"Finance"},{label:"Lançamentos rejeitados",value:"7",delta:"−11 vs mês",tone:"good",module:"Integrações"},{label:"Controlos aprovados",value:"8/9",delta:"1 exceção",tone:"neutral",module:"Controlo"}],series:[62,68,74,79,83,87,90,92],legend:"Progresso do fecho · %",insight:"O fecho está no rumo; três reconciliações bancárias impedem a conclusão integral.",actions:["Concluir reconciliação BFA","Rever mapping de despesas","Aprovar diário de ajustamentos"]},
 "FP&A":{focus:"Planeamento, drivers, cenários e previsão",metrics:[{label:"Forecast accuracy",value:"94,2%",delta:"+2,8 p.p.",tone:"good",module:"FP&A"},{label:"Receita FY",value:"5,28 B AOA",delta:"+3,1% vs Budget",tone:"good",module:"FP&A"},{label:"EBITDA FY",value:"988 M AOA",delta:"−1,8% vs plano",tone:"bad",module:"FP&A"},{label:"Cenários ativos",value:"4",delta:"2 para decisão",tone:"neutral",module:"Cenários"}],series:[88,89,91,90,92,93,94,94],legend:"Precisão do Forecast · %",insight:"Volume e preço permanecem favoráveis; o cenário cambial adverso reduz a margem anual.",actions:["Atualizar driver cambial","Submeter Forecast 9+3","Comparar cenário defensivo"]},
 RH:{focus:"Pessoas, talento e capacidade organizacional",metrics:[{label:"Colaboradores",value:"148",delta:"97% ativos",tone:"good",module:"HCM"},{label:"Turnover",value:"7,8%",delta:"−1,2 p.p.",tone:"good",module:"HCM"},{label:"Vagas abertas",value:"9",delta:"4 críticas",tone:"bad",module:"Recrutamento"},{label:"Performance média",value:"82%",delta:"+4 p.p.",tone:"good",module:"Performance"}],series:[128,132,136,139,141,143,146,148],legend:"Evolução do headcount",insight:"A capacidade cresceu, mas quatro vagas críticas podem atrasar a execução do plano operacional.",actions:["Acelerar vagas críticas","Fechar avaliações pendentes","Ativar plano de sucessão"]},
 Payroll:{focus:"Processamento, custo, exceções e pagamento",metrics:[{label:"Payroll bruto",value:"86,4 M AOA",delta:"+2,2% vs julho",tone:"neutral",module:"Payroll"},{label:"Custo empregador",value:"9,1 M AOA",delta:"10,5% do bruto",tone:"neutral",module:"Payroll"},{label:"Colaboradores pagos",value:"146/148",delta:"2 bloqueados",tone:"bad",module:"Payroll"},{label:"Payment batch",value:"95,5 M AOA",delta:"Aguarda aprovação",tone:"neutral",module:"Payroll"}],series:[78,79,80,82,81,83,84,86],legend:"Custo Payroll · M AOA",insight:"O processamento está reconciliado; dois contratos sem validação impedem o fecho total.",actions:["Validar 2 contratos","Aprovar payment batch","Emitir payslips"]},
 Gestor:{focus:"Metas, equipa, orçamento e ações",metrics:[{label:"Orçamento consumido",value:"64%",delta:"67% do ano",tone:"good",module:"Finance"},{label:"Metas no rumo",value:"11/14",delta:"3 em risco",tone:"bad",module:"Performance"},{label:"Ações abertas",value:"8",delta:"2 vencidas",tone:"bad",module:"Workflow"},{label:"Capacidade da equipa",value:"91%",delta:"−3 p.p.",tone:"neutral",module:"Workforce"}],series:[68,72,70,74,77,79,78,81],legend:"Índice de execução da equipa",insight:"A equipa executa dentro do orçamento, mas três metas e duas ações exigem intervenção imediata.",actions:["Reatribuir ações vencidas","Rever metas em risco","Aprovar plano de férias"]}
};
const reports=[
 ["FIN-001","Management Pack","Finance & FP&A","CFO · Conselho","Mensal"],["FIN-002","Demonstrações integradas","Finance & FP&A","Controller · Auditor","Mensal"],["FIN-003","Previsão de caixa 13 semanas","Tesouraria","CFO · Tesouraria","Semanal"],["HCM-001","People Analytics","HCM","RH · Direção","Mensal"],["PAY-001","Payroll Control Pack","Payroll","Payroll · CFO","Mensal"],["WFP-001","Workforce Plan","Workforce","RH · FP&A","Mensal"],["PER-001","Performance & Goals","Performance","RH · Gestores","Trimestral"],["OPS-001","Workflow & SLA","Workflow","Gestores","Semanal"],["INT-001","Qualidade de integrações","Integration Hub","IT · Controller","Diário"]
];

export function AnalyticsSuite({initialView="executive"}:{initialView?:"executive"|"profiles"|"reports"}){
 const locale=usePlatformLocale(),t=analyticsCopy[locale];
 const [view,setView]=useState(initialView),[profile,setProfile]=useState<Profile>("Executivo"),[period,setPeriod]=useState("Agosto 2026"),[comparison,setComparison]=useState("Actual vs Budget"),[query,setQuery]=useState(""),[selectedModule,setSelectedModule]=useState("Todos os módulos");
 const p=profiles[profile], filtered=useMemo(()=>reports.filter(r=>(r.join(" ").toLowerCase().includes(query.toLowerCase()))&&(selectedModule==="Todos os módulos"||r[2]===selectedModule)),[query,selectedModule]);
 const exportCsv=()=>{const csv=[["Código","Relatório","Módulo","Público","Frequência"],...filtered].map(r=>r.map(x=>`"${x}"`).join(";")).join("\n"),a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv"}));a.download="catalogo-analytics-reporting.csv";a.click();URL.revokeObjectURL(a.href)};
 return <section className="analytics-suite"><header className="analytics-head"><div><span>ANALYTICS & REPORTING</span><h1>{t.heading}</h1><p>{t.intro}</p></div><div><label>{t.period}<select value={period} onChange={e=>setPeriod(e.target.value)}><option>{t.aug}</option><option>{t.jul}</option><option>{t.quarter}</option></select></label><label>{t.comparison}<select value={comparison} onChange={e=>setComparison(e.target.value)}><option>Actual vs Budget</option><option>Actual vs Forecast</option><option>{t.previous}</option></select></label></div></header>
 <nav className="analytics-nav"><button className={view==="executive"?"active":""} onClick={()=>setView("executive")}>{t.executive}</button><button className={view==="profiles"?"active":""} onClick={()=>setView("profiles")}>{t.profiles}</button><button className={view==="reports"?"active":""} onClick={()=>setView("reports")}>{t.reports}</button></nav>
 {view==="executive"&&<><ExecutiveReal locale={locale}/><ModuleHealthReal locale={locale}/><PreviewBanner t={rc[locale]}/><section className="enterprise-score"><div><small>{t.score}</small><strong>87,4</strong><em>{t.points}</em></div><section><span>{t.finance}<i><b style={{width:"84%"}}/></i><em>84</em></span><span>{t.people}<i><b style={{width:"91%"}}/></i><em>91</em></span><span>{t.operations}<i><b style={{width:"86%"}}/></i><em>86</em></span><span>{t.execution}<i><b style={{width:"89%"}}/></i><em>89</em></span></section><aside><small>{t.reading}</small><b>{t.readingTitle}</b><p>{t.readingText}</p></aside></section><div className="analytics-grid"><article className="analytics-card span2"><Title label="TENDÊNCIA INTEGRADA" title="Performance dos motores"/><MultiTrend/></article><article className="analytics-card"><Title label="RISCOS" title="Mapa de atenção"/><div className="risk-map"><span className="r-high"><b>Logística</b><small>Impacto alto</small></span><span className="r-mid"><b>Vagas críticas</b><small>Probabilidade alta</small></span><span className="r-low"><b>Integrações</b><small>Controlado</small></span><span className="r-mid"><b>Clientes</b><small>Concentração 38%</small></span></div></article><article className="analytics-card"><Title label="WORKFLOW" title="Decisões e ações"/><ActionRows/></article><article className="analytics-card span2"><Title label="NARRATIVA EXECUTIVA" title="Resultado → causa → impacto → recomendação"/><div className="exec-story"><div><b>Resultado</b><p>Receita acima do Budget e performance organizacional de 87,4 pontos.</p></div><div><b>Causa</b><p>Preço e volume favoráveis, parcialmente absorvidos por logística e câmbio.</p></div><div><b>Impacto</b><p>Risco anual de 38,6 M AOA no EBITDA e atraso potencial na execução.</p></div><div><b>Ação</b><p>Renegociar logística, acelerar recrutamento e reduzir o DSO.</p></div></div></article></div></>}
 {view==="profiles"&&<><div className="profile-selector"><div><small>PERSONALIZAÇÃO POR RESPONSABILIDADE</small><h2>O cockpit muda com a decisão de cada perfil</h2></div><select value={profile} onChange={e=>setProfile(e.target.value as Profile)}>{Object.keys(profiles).map(x=><option key={x}>{x}</option>)}</select></div><section className="profile-banner"><div><small>PERFIL ATIVO</small><strong>{profile}</strong><p>{p.focus}</p></div><span>Os indicadores, o gráfico, a explicação e as ações foram ajustados ao perfil.</span></section><ProfileKpisReal profile={profile} locale={locale} fallback={p.metrics}/><PreviewBanner t={rc[locale]}/><div className="analytics-grid"><article className="analytics-card span2"><Title label="TENDÊNCIA DO PERFIL" title={p.legend}/><ProfileChart values={p.series}/></article><article className="analytics-card"><Title label="EXPLICAÇÃO" title="O que merece atenção"/><div className="profile-insight"><i>!</i><p>{p.insight}</p></div><h3>Próximas ações</h3><ol className="profile-actions">{p.actions.map((a,i)=><li key={a}><i>{i+1}</i>{a}<button>Executar →</button></li>)}</ol></article></div></>}
 {view==="reports"&&<><div className="report-tools"><input placeholder="Pesquisar relatório, módulo ou público…" value={query} onChange={e=>setQuery(e.target.value)}/><select value={selectedModule} onChange={e=>setSelectedModule(e.target.value)}><option>Todos os módulos</option>{Array.from(new Set(reports.map(r=>r[2]))).map(x=><option key={x}>{x}</option>)}</select><button onClick={exportCsv}>Exportar catálogo ↓</button></div><article className="analytics-card report-catalog"><Title label="REPORTING GOVERNADO" title={`${filtered.length} relatórios disponíveis`}/><table><thead><tr><th>Código</th><th>Relatório</th><th>Módulo</th><th>Público</th><th>Frequência</th><th></th></tr></thead><tbody>{filtered.map(r=><tr key={r[0]}><td><code>{r[0]}</code></td><td><b>{r[1]}</b></td><td>{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td><td><button>Gerar →</button></td></tr>)}</tbody></table></article></>}
 </section>
}
function Title({label,title}:{label:string;title:string}){return <header className="analytics-title"><span>{label}</span><h2>{title}</h2></header>}
function ProfileChart({values}:{values:number[]}){const max=Math.max(...values)*1.1;return <div className="profile-chart">{values.map((v,i)=><div key={i}><b>{v}</b><i style={{height:`${v/max*150}px`}}/><small>{["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago"][i]}</small></div>)}</div>}
function MultiTrend(){const sets=[[62,66,70,73,76,80,82,84],[74,77,79,81,84,86,88,91],[68,70,74,76,79,82,84,86]];return <><div className="multi-legend"><span><i/>Financeiro</span><span><i/>Pessoas</span><span><i/>Operações</span></div><div className="multi-trend">{[0,1,2,3,4,5,6,7].map(i=><div key={i}><section>{sets.map((s,j)=><i key={j} className={`s${j}`} style={{height:`${s[i]*1.45}px`}}/>)}</section><small>{["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago"][i]}</small></div>)}</div></>}
function ActionRows(){return <div className="analytics-actions">{[["Aprovar Forecast 9+3","Hoje","Alta"],["Validar payment batch","Hoje","Alta"],["Fechar reconciliações","2 dias","Média"],["Rever vagas críticas","5 dias","Média"]].map(x=><span key={x[0]}><i className={x[2]==="Alta"?"high":""}>{x[2]}</i><b>{x[0]}</b><small>{x[1]}</small></span>)}</div>}
function PreviewBanner({t}:{t:RealCopy}){return <div className="preview-banner"><b>{t.previewLabel}</b><span>{t.previewText}</span></div>}

type ExecutiveData={finance:{hasData:boolean;period:string|null;currency:string;revenue:number;costs:number;net:number};hr:{hasData:boolean;activeEmployees:number;openVacancies:{requisitions:number;positions:number}}};
function ExecutiveReal({locale}:{locale:PlatformLocale}){
 const t=rc[locale],ac=analyticsCopy[locale];
 const [state,setState]=useState<{status:"loading"}|{status:"error"}|{status:"ready";data:ExecutiveData}>({status:"loading"});
 useEffect(()=>{
  let active=true;
  apiFetch("/api/executive-cockpit")
   .then(async r=>({ok:r.ok,body:await r.json() as ExecutiveData}))
   .then(({ok,body})=>{if(active)setState(ok?{status:"ready",data:body}:{status:"error"})})
   .catch(()=>{if(active)setState({status:"error"})});
  return ()=>{active=false};
 },[]);
 if(state.status==="loading")return <div className="status-note">{t.loading}</div>;
 if(state.status==="error")return <div className="status-note bad">{t.error}</div>;
 const {data}=state;
 if(!data.finance.hasData&&!data.hr.hasData)return <article className="analytics-card"><h2>{t.emptyTitle}</h2><p>{t.emptyText}</p></article>;
 const moneyReal=(minor:number)=>new Intl.NumberFormat("pt-PT",{style:"currency",currency:data.finance.currency,maximumFractionDigits:0}).format(minor/100);
 return <section className="profile-kpis">
  <article><header>{ac.finance}</header><span>{t.revenue}</span>{data.finance.hasData?<strong>{moneyReal(data.finance.revenue)}</strong>:<small>{t.emptyText}</small>}</article>
  <article><header>{ac.finance}</header><span>{t.net}</span>{data.finance.hasData?<strong className={data.finance.net>=0?"good":"bad"}>{moneyReal(data.finance.net)}</strong>:<small>—</small>}</article>
  <article><header>{ac.people}</header><span>{t.activeEmployees}</span><strong>{data.hr.activeEmployees}</strong></article>
  <article><header>{t.recruitment}</header><span>{t.openVacancies}</span><strong>{data.hr.openVacancies.requisitions}</strong><em>{data.hr.openVacancies.positions} {t.positions}</em></article>
 </section>
}

type ModuleHealthData={finance:{hasData:boolean;currency:string;revenueMinor:number};hcm:{activeEmployees:number};payroll:{period:string;currency:string;grossMinor:number}|null;workforce:{hasBudget:boolean;varianceBps:number|null};performance:{finalizedReviews:number};workflow:{openTasks:number;criticalTasks:number};integrations:{totalRecords:number;accepted:number;rejected:number};documents:{total:number;validated:number}};
function ModuleHealthReal({locale}:{locale:PlatformLocale}){
 const t=rc[locale];
 const [state,setState]=useState<{status:"loading"}|{status:"error"}|{status:"ready";data:ModuleHealthData}>({status:"loading"});
 useEffect(()=>{
  let active=true;
  apiFetch("/api/module-health")
   .then(async r=>({ok:r.ok,body:await r.json() as ModuleHealthData}))
   .then(({ok,body})=>{if(active)setState(ok?{status:"ready",data:body}:{status:"error"})})
   .catch(()=>{if(active)setState({status:"error"})});
  return ()=>{active=false};
 },[]);
 if(state.status==="loading")return <div className="status-note">{t.loading}</div>;
 if(state.status==="error")return <div className="status-note bad">{t.error}</div>;
 const {data}=state;
 const money=(minor:number,currency:string)=>new Intl.NumberFormat("pt-PT",{style:"currency",currency,maximumFractionDigits:0}).format(minor/100);
 const integrationRate=data.integrations.totalRecords>0?(data.integrations.accepted/data.integrations.totalRecords)*100:null;
 const cards:{name:string;value:string;sublabel:string;footer:string;tone:string}[]=[
  {name:"Finance & FP&A",value:data.finance.hasData?money(data.finance.revenueMinor,data.finance.currency):t.noData,sublabel:t.revenue,footer:"",tone:data.finance.hasData?"good":"warn"},
  {name:"HCM",value:String(data.hcm.activeEmployees),sublabel:t.activeEmployees,footer:"",tone:"good"},
  {name:"Payroll",value:data.payroll?money(data.payroll.grossMinor,data.payroll.currency):t.noData,sublabel:data.payroll?data.payroll.period:"",footer:"",tone:data.payroll?"good":"warn"},
  {name:"Workforce",value:data.workforce.varianceBps!==null?`${data.workforce.varianceBps>0?"+":""}${(data.workforce.varianceBps/100).toFixed(1)}%`:t.noData,sublabel:data.workforce.hasBudget?t.net:t.noBudget,footer:"",tone:data.workforce.varianceBps===null?"warn":data.workforce.varianceBps<=0?"good":"bad"},
  {name:"Performance",value:String(data.performance.finalizedReviews),sublabel:t.finalizedReviews,footer:"",tone:"good"},
  {name:"Workflow",value:String(data.workflow.openTasks),sublabel:t.openTasks,footer:data.workflow.criticalTasks>0?`${data.workflow.criticalTasks} ${t.critical}`:"",tone:data.workflow.criticalTasks>0?"bad":"good"},
  {name:"Integrações",value:integrationRate!==null?`${integrationRate.toFixed(1)}%`:t.noData,sublabel:t.accepted,footer:data.integrations.rejected>0?`${data.integrations.rejected} ${t.rejected}`:"",tone:data.integrations.rejected>0?"warn":"good"},
  {name:"Document Hub",value:String(data.documents.validated),sublabel:t.validated,footer:data.documents.total?`${t.ofTotal} ${data.documents.total}`:"",tone:"good"},
 ];
 return <div className="module-health">{cards.map(m=><article key={m.name}><header><span>{m.name}</span><i className={m.tone}/></header><strong>{m.value}</strong><small>{m.sublabel}</small>{m.footer&&<footer className={m.tone}>{m.footer}</footer>}</article>)}</div>
}

const profileEndpoint:Partial<Record<Profile,string>>={Executivo:"/api/executive-cockpit",CFO:"/api/financial-statements",RH:"/api/hr-cockpit",Payroll:"/api/hr-payroll-cost"};
function ProfileKpisReal({profile,locale,fallback}:{profile:Profile;locale:PlatformLocale;fallback:Metric[]}){
 const t=rc[locale];
 const endpoint=profileEndpoint[profile];
 const [state,setState]=useState<{status:"loading"}|{status:"error"}|{status:"ready";data:unknown}>({status:"loading"});
 useEffect(()=>{
  if(!endpoint)return;
  let active=true;
  apiFetch(endpoint)
   .then(async r=>({ok:r.ok,body:await r.json()}))
   .then(({ok,body})=>{if(active)setState(ok?{status:"ready",data:body}:{status:"error"})})
   .catch(()=>{if(active)setState({status:"error"})});
  return ()=>{active=false};
 },[endpoint]);
 const renderFallback=()=><section className="profile-kpis">{fallback.map(m=><article key={m.label}><header>{m.module}</header><span>{m.label}</span><strong>{m.value}</strong><em className={m.tone}>{m.delta}</em></article>)}</section>;
 if(!endpoint)return renderFallback();
 if(state.status==="loading")return <div className="status-note">{t.loading}</div>;
 if(state.status==="error")return renderFallback();
 const money=(minor:number,currency:string)=>new Intl.NumberFormat("pt-PT",{style:"currency",currency,maximumFractionDigits:0}).format(minor/100);
 let real:{label:string;value:string;module:string;tone:string}[]|null=null;
 if(profile==="Executivo"){
  const d=state.data as ExecutiveData;
  if(d.finance.hasData||d.hr.hasData)
   real=[
    {label:t.revenue,value:d.finance.hasData?money(d.finance.revenue,d.finance.currency):t.noData,module:"Finance",tone:d.finance.hasData?"good":"neutral"},
    {label:t.net,value:d.finance.hasData?money(d.finance.net,d.finance.currency):t.noData,module:"Finance",tone:d.finance.hasData&&d.finance.net>=0?"good":"bad"},
    {label:t.activeEmployees,value:String(d.hr.activeEmployees),module:"HCM",tone:"good"},
    {label:t.openVacancies,value:String(d.hr.openVacancies.requisitions),module:"Recrutamento",tone:"neutral"},
   ];
 } else if(profile==="CFO"){
  const d=state.data as {hasData:boolean;currency?:string;income:{netResult:number}|null;balanceSheet:{cash:number;netDebt:number}|null;workingCapital:{ccc:number}|null};
  if(d.hasData)
   real=[
    {label:t.cash,value:d.balanceSheet?money(d.balanceSheet.cash,d.currency||"AOA"):t.noData,module:"Tesouraria",tone:d.balanceSheet?"good":"neutral"},
    {label:t.netDebt,value:d.balanceSheet?money(d.balanceSheet.netDebt,d.currency||"AOA"):t.noData,module:"Tesouraria",tone:"neutral"},
    {label:t.workingCapital,value:d.workingCapital?`${d.workingCapital.ccc.toFixed(0)} dias`:t.noData,module:"Finance",tone:"neutral"},
    {label:t.net,value:d.income?money(d.income.netResult,d.currency||"AOA"):t.noData,module:"Finance",tone:d.income&&d.income.netResult>=0?"good":"bad"},
   ];
 } else if(profile==="RH"){
  const d=state.data as {hasData:boolean;activeEmployees:number;openVacancies:{requisitions:number;positions:number};pendingAbsenceRequests:number;onLeaveToday:number};
  if(d.hasData)
   real=[
    {label:t.activeEmployees,value:String(d.activeEmployees),module:"HCM",tone:"good"},
    {label:t.openVacancies,value:String(d.openVacancies.requisitions),module:"Recrutamento",tone:"neutral"},
    {label:t.pendingRequests,value:String(d.pendingAbsenceRequests),module:"HCM",tone:"neutral"},
    {label:t.onLeaveToday,value:String(d.onLeaveToday),module:"HCM",tone:"neutral"},
   ];
 } else if(profile==="Payroll"){
  const d=state.data as {hasData:boolean;payroll:{period:string;currency:string;grossMinor:number;netMinor:number;employerMinor:number}|null;reconciliation:{reconciled:number;total:number}|null};
  if(d.hasData&&d.payroll)
   real=[
    {label:t.payrollGross,value:money(d.payroll.grossMinor,d.payroll.currency),module:"Payroll",tone:"neutral"},
    {label:t.netPay,value:money(d.payroll.netMinor,d.payroll.currency),module:"Payroll",tone:"neutral"},
    {label:t.employerCharges,value:money(d.payroll.employerMinor,d.payroll.currency),module:"Payroll",tone:"neutral"},
    {label:t.reconciledEmployees,value:d.reconciliation?`${d.reconciliation.reconciled}/${d.reconciliation.total}`:t.noData,module:"Payroll",tone:"neutral"},
   ];
 }
 if(!real)return renderFallback();
 return <section className="profile-kpis">{real.map(m=><article key={m.label}><header>{m.module}</header><span>{m.label}</span><strong className={m.tone}>{m.value}</strong></article>)}</section>
}
