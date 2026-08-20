"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api-client";
import "./workforce-plans.css";
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
  const [data, setData] = useState<Data>(empty),
    [selected, setSelected] = useState(""),
    [modal, setModal] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      apiFetch(`/api/v1/workforce-plans?plan=${selected}`)
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          setData(b);
          if (!selected && b.plans?.[0]) setSelected(b.plans[0].id);
        })
        .catch((e) => setError(e.message)),
    [selected],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function command(payload: Record<string, string>) {
    setBusy(true);
    setError("");
    const r = await apiFetch(`/api/v1/workforce-plans?plan=${selected}`, {
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
      new Intl.NumberFormat("pt-PT", {
        style: "currency",
        currency: c,
        maximumFractionDigits: 0,
      }).format(n / 100),
    variance =
      (plan?.planned_headcount || 0) -
      Number(data.actual?.actual_headcount || 0);
  return (
    <section className="headcount">
      <header>
        <div>
          <span>WORKFORCE PLANNING · HEADCOUNT</span>
          <h1>Pessoas certas, custo previsto, decisão governada</h1>
          <p>
            Plano por função, departamento e período, comparado com o quadro e
            perfis salariais atuais.
          </p>
        </div>
        <button className="primario" onClick={() => setModal("createPlan")}>
          ＋ Novo plano
        </button>
      </header>
      <section className="hc-kpis">
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
      </section>
      <div className="hc-grid">
        <article className="cartao hc-lines">
          <div className="cab">
            <div>
              <span>PLANO</span>
              <h2>Funções e movimentos</h2>
            </div>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Selecionar</option>
              {data.plans.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · v{x.version_number} · {x.status}
                </option>
              ))}
            </select>
          </div>
          {plan && (
            <div className="hc-plan-head">
              <span>
                <b>{plan.organization_name}</b>
                <small>
                  {plan.start_period} → {plan.end_period}
                </small>
              </span>
              <em>{plan.status}</em>
              <nav>
                {plan.status === "Rascunho" && (
                  <>
                    <button onClick={() => setModal("addPlanLine")}>
                      ＋ Linha
                    </button>
                    <button
                      onClick={() =>
                        command({ type: "submitPlan", planId: plan.id })
                      }
                    >
                      Submeter
                    </button>
                  </>
                )}
                {plan.status === "Submetido" && (
                  <button
                    onClick={() =>
                      command({ type: "approvePlan", planId: plan.id })
                    }
                  >
                    Aprovar
                  </button>
                )}
              </nav>
            </div>
          )}
          {data.lines.length ? (
            <table>
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Função</th>
                  <th>Movimento</th>
                  <th>HC</th>
                  <th>Custo unit.</th>
                  <th>Pressuposto</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((x) => (
                  <tr key={x.id}>
                    <td>{x.period}</td>
                    <td>
                      <b>{x.job_title}</b>
                      <small>{x.department_code || "Geral"}</small>
                    </td>
                    <td>{x.movement_type}</td>
                    <td>{x.headcount}</td>
                    <td>
                      {money(x.monthly_cost_minor, plan?.currency || "AOA")}
                    </td>
                    <td>{x.assumption_note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hc-empty">
              Crie ou selecione um plano e registe as necessidades por período.
            </p>
          )}
        </article>
        <aside className="cartao hc-control">
          <span>GOVERNANCE</span>
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
        </aside>
      </div>
      {error && <p className="erro-global">{error}</p>}
      {modal && (
        <div className="modal-inline">
          <form onSubmit={submit}>
            <header>
              <div>
                <small>HEADCOUNT PLANNING</small>
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
