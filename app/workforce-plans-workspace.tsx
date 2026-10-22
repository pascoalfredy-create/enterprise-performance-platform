"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api-client";
import "./workforce-plans.css";
import {usePlatformLocale} from "./use-platform-locale";
import {workspaceText} from "../lib/workspace-navigation";
type Plan = {
  id: string;
  name: string;
  organization_name: string;
  currency: string;
  start_period: string;
  end_period: string;
  version_number: number;
  status: string;
  planned_headcount: number;
  planned_monthly_cost_minor: number;
  line_count: number;
  approval_hash?: string;
};
type Data = {
  plans: Plan[];
  lines: Array<{
    id: string;
    job_title: string;
    department_code?: string;
    period: string;
    headcount: number;
    monthly_cost_minor: number;
    movement_type: string;
    assumption_note: string;
  }>;
  organizations: Array<{
    id: string;
    code: string;
    name: string;
    currency: string;
  }>;
  actual: { actual_headcount: number; actual_monthly_base_minor: number };
};
const empty: Data = {
  plans: [],
  lines: [],
  organizations: [],
  actual: { actual_headcount: 0, actual_monthly_base_minor: 0 },
};
export function WorkforcePlansWorkspace() {
  const locale=usePlatformLocale(),w=(key:Parameters<typeof workspaceText>[1])=>workspaceText(locale,key);
  const [tab,setTab]=useState('structure'),[department,setDepartment]=useState('');
  const [data, setData] = useState<Data>(empty),
    [period,setPeriod]=useState(new Date().toISOString().slice(0,7)),
    [selected, setSelected] = useState(""),
    [modal, setModal] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      apiFetch(`/api/v1/workforce-plans?plan=${selected}&period=${period}`)
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          setData(b);
          if (!selected && b.plans?.[0]) setSelected(b.plans[0].id);
        })
        .catch((e) => setError(e.message)),
    [selected,period],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function command(payload: Record<string, string>) {
    setBusy(true);
    setError("");
    const r = await apiFetch(`/api/v1/workforce-plans?plan=${selected}&period=${period}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
      b = await r.json();
    setBusy(false);
    if (!r.ok) {
      setError(b.error);
      return;
    }
    setData(b);
    if (payload.type === "createPlan" && b.plans?.[0])
      setSelected(b.plans[0].id);
    setModal("");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await command({
      type: modal,
      planId: selected,
      ...(Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<
        string,
        string
      >),
    });
  }
  const plan = data.plans.find((x) => x.id === selected),
    money = (n: number, c: string) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: c,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n / 100),
    variance =
      (plan?.planned_headcount || 0) -
      Number(data.actual?.actual_headcount || 0);
  useEffect(()=>{if(plan)setPeriod(current=>{return current<plan.start_period||current>plan.end_period?plan.start_period:current})},[plan?.id,plan?.start_period,plan?.end_period]);
  const byDepartment=new Map<string,{headcount:number;entries:number;exits:number;cost:number;lines:number}>();
  for(const line of data.lines.filter(line=>line.period===period)){const key=line.department_code||'—',item=byDepartment.get(key)||{headcount:0,entries:0,exits:0,cost:0,lines:0};item.headcount+=line.headcount;item.cost+=line.headcount*line.monthly_cost_minor;item.lines++;if(line.movement_type==='Nova contratação')item.entries+=line.headcount;if(line.movement_type==='Redução')item.exits+=line.headcount;byDepartment.set(key,item)}
  const currentDepartment=byDepartment.has(department)?department:byDepartment.keys().next().value,visibleLines=tab==='movements'?data.lines:data.lines.filter(line=>line.period===period&&line.department_code===currentDepartment||line.period===period&&!line.department_code&&currentDepartment==='—');
  return (<section className="headcount workspace-table-screen"><header className="workspace-screen-heading"><div><h1>{plan?.name||w('workforce')}</h1><p>{plan?w('version')+' '+plan.version_number+' · '+plan.status+' · '+plan.currency:'—'}</p></div><div className="workspace-record-actions"><label>{w('scope')}<select disabled={Boolean(modal)||busy} value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Selecionar</option>{data.plans.map(item=><option key={item.id} value={item.id}>{item.name} · v{item.version_number}</option>)}</select></label><label>{w('horizon')}<input type="month" disabled={Boolean(modal)||busy} value={period} onChange={event=>setPeriod(event.target.value)}/></label><button className="secundario" disabled={Boolean(modal)||busy} onClick={()=>setModal('createPlan')}>＋ Novo plano</button>{plan?.status==='Rascunho'&&<button className="primario" disabled={busy} onClick={()=>command({type:'submitPlan',planId:plan.id})}>Submeter</button>}{plan?.status==='Submetido'&&<button className="primario" disabled={busy} onClick={()=>command({type:'approvePlan',planId:plan.id})}>Aprovar</button>}</div></header>
   <nav className="workspace-flat-tabs">{(['structure','movements','costs','versions'] as const).map(key=><button type="button" key={key} aria-current={tab===key?'page':undefined} disabled={Boolean(modal)} onClick={()=>setTab(key)}>{w(key)}</button>)}</nav>
   {tab==='versions'?<div className="workspace-record-table"><table><thead><tr><th>{w('workforce')}</th><th>{w('scope')}</th><th>{w('version')}</th><th>{w('horizon')}</th><th>{w('status')}</th></tr></thead><tbody>{data.plans.map(item=><tr key={item.id} className={selected===item.id?'selected':''}><td><button type="button" className="workspace-row-select" onClick={()=>{setSelected(item.id);setTab('structure')}}>{item.name}</button></td><td>{item.organization_name}</td><td>{item.version_number}</td><td>{item.start_period} → {item.end_period}</td><td>{item.status}</td></tr>)}</tbody></table></div>:<>
    {tab!=='movements'&&<div className="workspace-record-table"><table><thead><tr><th>{w('department')}</th><th>{w('plannedEntries')}</th><th>{w('plannedExits')}</th><th>{w('plannedHeadcount')}</th><th>{w('monthlyCost')} ({plan?.currency||'AOA'})</th></tr></thead><tbody>{[...byDepartment].map(([key,item])=><tr key={key} className={currentDepartment===key?'selected':''} onClick={()=>{if(!modal)setDepartment(key)}}><td><button type="button" className="workspace-row-select" disabled={Boolean(modal)} onClick={()=>{if(!modal)setDepartment(key)}}>{key}</button></td><td>{item.entries}</td><td>{item.exits}</td><td>{item.headcount}</td><td>{money(item.cost,plan?.currency||'AOA')}</td></tr>)}</tbody><tfoot><tr><th>Total</th><td>{[...byDepartment.values()].reduce((sum,item)=>sum+item.entries,0)}</td><td>{[...byDepartment.values()].reduce((sum,item)=>sum+item.exits,0)}</td><td>{plan?.planned_headcount??'—'}</td><td>{plan?money(plan.planned_monthly_cost_minor,plan.currency):'—'}</td></tr></tfoot></table></div>}
    <section className="workspace-detail"><header><div><h2>{tab==='movements'?w('movements'):(currentDepartment||w('department'))+' · '+w('movements')}</h2>{plan&&<p>{plan.organization_name} · {plan.start_period} → {plan.end_period}</p>}</div>{plan?.status==='Rascunho'&&<button className="primario" disabled={busy} onClick={()=>setModal('addPlanLine')}>＋ {w('addMovement')}</button>}</header><div className="workspace-record-table"><table><thead><tr><th>Função</th><th>Período</th><th>{w('movements')}</th><th>{w('plannedHeadcount')}</th><th>Custo unit.</th><th>{w('monthlyCost')}</th><th>{w('assumptions')}</th></tr></thead><tbody>{visibleLines.map(line=><tr key={line.id}><td><b>{line.job_title}</b><small>{line.department_code||'—'}</small></td><td>{line.period}</td><td>{line.movement_type}</td><td>{line.headcount}</td><td>{money(line.monthly_cost_minor,plan?.currency||'AOA')}</td><td>{money(line.headcount*line.monthly_cost_minor,plan?.currency||'AOA')}</td><td>{line.assumption_note}</td></tr>)}</tbody></table></div>{!visibleLines.length&&<p className="hc-empty">Crie ou selecione um plano e registe as necessidades por período.</p>}</section>
   </>}
   <details className="workspace-secondary-information"><summary>{w('info')}</summary><section className="hc-kpis">
        <article>
          <span>Headcount atual</span>
          <strong>{data.actual?.actual_headcount || 0}</strong>
          <small>Employee Master ativo</small>
        </article>
        <article>
          <span>Headcount planeado</span>
          <strong>{plan?.planned_headcount || 0}</strong>
          <small>{plan?.name || "Sem plano selecionado"}</small>
        </article>
        <article className={variance > 0 ? "attention" : ""}>
          <span>Variação</span>
          <strong>{variance > 0 ? `+${variance}` : variance}</strong>
          <small>Planeado − atual</small>
        </article>
        <article>
          <span>Custo mensal planeado</span>
          <strong>
            {money(
              plan?.planned_monthly_cost_minor || 0,
              plan?.currency || "AOA",
            )}
          </strong>
          <small>Headcount × custo unitário</small>
        </article>
      </section><aside className="cartao hc-control">
          <span>GOVERNAÇÃO</span>
          <h2>Controlo do plano</h2>
          <dl>
            <dt>Estado</dt>
            <dd>{plan?.status || "—"}</dd>
            <dt>Linhas</dt>
            <dd>{plan?.line_count || 0}</dd>
            <dt>Custo base atual</dt>
            <dd>
              {money(
                Number(data.actual?.actual_monthly_base_minor || 0),
                plan?.currency || "AOA",
              )}
            </dd>
            <dt>Approval hash</dt>
            <dd>
              <code>{plan?.approval_hash || "—"}</code>
            </dd>
          </dl>
          <footer>
            Custos usam valores inteiros em minor units. Country Packs definem
            encargos legais; o Core não presume impostos ou regras laborais.
          </footer>
        </aside></details>
      {error && <p className="erro-global">{error}</p>}
      {modal && (
        <div className={modal==='addPlanLine'?'workspace-detail workforce-inline-form':'modal-inline'}>
          <form onSubmit={submit}>
            <header>
              <div>
                <small>PLANEAMENTO DE EFETIVOS</small>
                <h2>{modal === "createPlan" ? "Novo plano" : "Nova linha"}</h2>
              </div>
              <button type="button" onClick={() => setModal("")}>
                ×
              </button>
            </header>
            {modal === "createPlan" ? (
              <>
                <label>
                  Organização
                  <select name="organizationId" required>
                    <option value="">Selecionar</option>
                    {data.organizations.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.code} · {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nome
                  <input
                    name="name"
                    required
                    placeholder="Ex.: Plano de Pessoas 2027"
                  />
                </label>
                <div>
                  <label>
                    Moeda
                    <input
                      name="currency"
                      defaultValue="AOA"
                      maxLength={3}
                      required
                    />
                  </label>
                  <label>
                    Início
                    <input name="startPeriod" type="month" required />
                  </label>
                  <label>
                    Fim
                    <input name="endPeriod" type="month" required />
                  </label>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label>
                    Período
                    <input name="period" type="month" required />
                  </label>
                  <label>
                    Departamento
                    <input name="departmentCode" placeholder="Opcional" />
                  </label>
                </div>
                <label>
                  Função
                  <input name="jobTitle" required />
                </label>
                <div>
                  <label>
                    Movimento
                    <select name="movementType">
                      <option>Base</option>
                      <option>Nova contratação</option>
                      <option>Substituição</option>
                      <option>Redução</option>
                    </select>
                  </label>
                  <label>
                    Headcount
                    <input name="headcount" type="number" min="0" required />
                  </label>
                </div>
                <label>
                  Custo mensal unitário
                  <input
                    name="monthlyCost"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Pressuposto
                  <textarea
                    name="assumptionNote"
                    minLength={5}
                    rows={3}
                    required
                  />
                </label>
              </>
            )}
            {error && <p className="erro-form">{error}</p>}
            <footer>
              <button
                type="button"
                className="secundario"
                onClick={() => setModal("")}
              >
                Cancelar
              </button>
              <button className="primario" disabled={busy}>
                {busy ? "A processar…" : "Confirmar"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
