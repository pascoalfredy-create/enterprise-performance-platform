"use client";
import { useMemo, useState } from "react";

const staff = [
  ["Ana Manuel","EMP-001","Corporate Services","Finance Manager","Active"],
  ["Mateus Costa","EMP-002","Operations","Operations Lead","Active"],
  ["Elisa Rocha","EMP-003","People & Culture","HR Business Partner","Pending"],
  ["David Kim","EMP-004","Corporate Services","FP&A Analyst","Active"],
  ["Nádia Lopes","EMP-005","Operations","Project Controller","Active"],
];
const groups = [
  ["Workspace",["Overview","My tasks"]],
  ["Plan",["Financial planning","Workforce planning","Scenarios"]],
  ["Operate",["Actuals","People","Payroll"]],
  ["Analyze",["Dashboards","Variance analysis","Workforce cost"]],
  ["Report",["Management reports","Report studio"]],
  ["Govern",["Organization","Dimensions","Workflows","Integrations","Audit"]],
];

export default function Home(){
 const [active,setActive]=useState("Overview"),[query,setQuery]=useState(""),[drawer,setDrawer]=useState(false);
 const rows=useMemo(()=>staff.filter(r=>r.join(" ").toLowerCase().includes(query.toLowerCase())),[query]);
 return <div className="shell">
  <aside className="side"><div className="brand"><b>EP</b><span><strong>Enterprise</strong><small>Performance Platform</small></span></div><nav>{groups.map(g=><section key={g[0] as string}><p>{g[0]}</p>{(g[1] as string[]).map(x=><button key={x} className={active===x?"on":""} onClick={()=>setActive(x)}><i/>{x}{x==="My tasks"&&<em>4</em>}</button>)}</section>)}</nav><footer><i/><span><b>Platform healthy</b><small>Last sync 2 min ago</small></span></footer></aside>
  <div className="work"><header><div className="company"><small>Company</small><b>Demo Holdings⌄</b></div><div className="headtools"><button className="command">⌕ <span>Search or run a command</span><kbd>⌘ K</kbd></button><button className="bell">◌<i/></button><div className="user"><b>PF</b><span><strong>Pascoal Frederico</strong><small>Tenant Administrator</small></span></div></div></header>
   <main><div className="heading"><div><small>Workspace / {active}</small><h1>{active==="Overview"?"Executive performance overview":active}</h1><p>A governed view of financial and workforce performance across your organization.</p></div><div><button className="ghost">↥ Export</button><button className="primary">＋ Create task</button></div></div>
    <div className="context">{["Period|Aug 2026","Scenario|Actual","Version|Working v3","Currency|Reporting currency"].map(x=>{const [a,b]=x.split("|");return <label key={a}>{a}<select><option>{b}</option></select></label>})}<button>⚙ More filters <b>2</b></button><small>Data as of 17 Aug 2026, 14:30 UTC</small></div>
    <section className="kpis"><Kpi title="Operating result" value="$8.42m" change="+6.8% vs Budget" tone="green"/><Kpi title="Actual vs Budget" value="+$540k" change="Favourable variance" tone="green"/><Kpi title="Workforce cost" value="$3.18m" change="+2.4% vs Budget" tone="amber"/><Kpi title="Active workforce" value="148" change="96.2% position fill" tone="blue"/></section>
    <section className="dash"><article className="card trend"><CardTitle top="Trend & comparison" title="Performance trajectory"/><div className="legend"><span><i className="actual"/>Actual</span><span><i className="budget"/>Budget</span><b>Actual · Aug 2026</b></div><div className="chart"><div className="axis"><span>12m</span><span>9m</span><span>6m</span><span>3m</span><span>0</span></div><div className="plot"><i/><i/><i/><i/><svg viewBox="0 0 800 220" preserveAspectRatio="none"><path className="area" d="M0,183 C80,165 110,155 170,158 S270,118 330,130 S430,82 500,92 S600,45 680,58 S750,28 800,25 L800,220 L0,220Z"/><path className="actualLine" d="M0,183 C80,165 110,155 170,158 S270,118 330,130 S430,82 500,92 S600,45 680,58 S750,28 800,25"/><path className="budgetLine" d="M0,177 C100,165 150,146 210,148 S330,122 400,112 S520,90 600,82 S700,60 800,53"/></svg><div className="months">{["Mar","Apr","May","Jun","Jul","Aug"].map(x=><span key={x}>{x}</span>)}</div></div></div><div className="insight"><b>↗ What changed</b><p>Actual performance moved above plan in July, driven by service revenue and lower external spend.</p><button>Open variance drivers →</button></div></article>
     <article className="card attention"><CardTitle top="Explain & act" title="Attention required"/><Alert icon="!" tone="red" title="Payroll validation blockers" text="3 employees have incomplete payment details." meta="Payroll · Due today"/><Alert icon="↗" tone="amber" title="Operations cost variance" text="Overtime is 18.6% above the approved plan." meta="Workforce cost · High impact"/><Alert icon="◷" tone="blue" title="Budget approval pending" text="Two cost centres await management review." meta="Budget v3 · 2 days"/><div className="impact"><span>Potential impact</span><b>$214k</b><small>Estimated exposure if no action is taken.</small></div></article>
    </section>
    <section className="card people"><div className="tabletop"><CardTitle top="Organization → People" title="Workforce directory"/><div><label>⌕<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search employees"/></label><button className="ghost">☷ Columns</button><button className="primary" onClick={()=>setDrawer(true)}>＋ New employee</button></div></div><div className="tablewrap"><table><thead><tr><th>Employee</th><th>Number</th><th>Organization</th><th>Role</th><th>Start date</th><th>Status</th><th/></tr></thead><tbody>{rows.map((r,i)=><tr key={r[1]}><td><div className="person"><i>{r[0].split(" ").map(x=>x[0]).join("").slice(0,2)}</i><b>{r[0]}</b></div></td><td className="mono">{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td>{["01 Aug 2026","04 Aug 2026","08 Aug 2026","12 Aug 2026","15 Aug 2026"][i]}</td><td><span className={r[4]==="Active"?"pill active":"pill pending"}>{r[4]}</span></td><td>•••</td></tr>)}</tbody></table></div><footer>Showing {rows.length} of {staff.length} employees <span>‹　<b>1</b>　›</span></footer></section>
   </main>
  </div>
  {drawer&&<div className="overlay" onClick={()=>setDrawer(false)}><aside className="drawer" onClick={e=>e.stopPropagation()}><header><div><small>People core</small><h2>Create employee</h2></div><button onClick={()=>setDrawer(false)}>×</button></header><div className="form"><p>Create the employee master record. Contract and payroll details remain separate and permission-controlled.</p><label>Employee number<input placeholder="EMP-006"/></label><div><label>Given name<input/></label><label>Family name<input/></label></div><label>Organization<select><option>Corporate Services</option><option>Operations</option></select></label><label>Start date<input type="date"/></label><aside><b>Audit enabled</b><p>Actor, timestamp, scope and submitted values will be recorded.</p></aside></div><footer><button className="ghost" onClick={()=>setDrawer(false)}>Cancel</button><button className="primary" onClick={()=>setDrawer(false)}>Create employee</button></footer></aside></div>}
 </div>
}
function Kpi({title,value,change,tone}:{title:string,value:string,change:string,tone:string}){return <article><span>{title}</span><strong>{value}</strong><b className={tone}>{change}</b><small>{title==="Workforce cost"?"Overtime concentrated in Operations":"Governed metric · Drill-through available"}</small><i className={tone}/></article>}
function CardTitle({top,title}:{top:string,title:string}){return <div className="cardtitle"><span>{top}</span><h2>{title}</h2></div>}
function Alert({icon,tone,title,text,meta}:{icon:string,tone:string,title:string,text:string,meta:string}){return <div className="alert"><i className={tone}>{icon}</i><span><b>{title}</b><p>{text}</p><small>{meta}</small></span><button>Review</button></div>}
