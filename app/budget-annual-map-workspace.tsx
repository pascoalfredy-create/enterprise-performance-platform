"use client";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, readApiJson } from "../lib/api-client";
import { usePlatformLocale } from "./use-platform-locale";
import { mapCopy } from "./budget-annual-map-copy";
import { buildXlsxBlob, parseXlsxFile } from "../lib/xlsx";
import { parseMoneyMinor } from "../lib/money";
import { parseBudgetMapImport,budgetMinorDecimal } from "../lib/budget-map-import";
import { downloadBlob } from "../lib/module-export";
import "./budget-annual-map.css";

type Monthly = { period: string; amountMinor: number; manualOverride: boolean };
type LineRow = {
  id: string;
  code: string;
  name: string;
  line_kind: string;
  hidden: number;
  status: string;
  monthly: Monthly[];
  automatic: number[] | null;
  assumptions: Record<string, unknown>[];
  children: LineRow[];
};
type Snapshot = {
  historicalStructureMissing?:boolean;
  version: { id: string; name: string; fiscal_year: number; status: string };
  periods: string[];
  tree: LineRow[];
  organizations: { id: string; name: string; code: string; currency: string }[];
  members: { id: string; name: string; code: string; dimension_name: string }[];
  versions: { id: string; name: string; fiscal_year: number; status: string }[];
};
type RhPlanOption = { id: string; organization_id: string; name: string; currency: string; version_number: number; approved_at: string | null };
type RhDepartmentRow = {
  department_code: string | null;
  line_count: number;
  total_headcount: number;
  total_cost_minor: number;
  decision: string | null;
  dimension_member_id: string | null;
  dimension_member_name: string | null;
};
type RhUpdateInfo = {
  hasUpdate: boolean;
  currentVersion?: number;
  latestVersion?: number;
  latestPlanId?: string;
  currentTotalMinor?: number;
  latestTotalMinor?: number;
};
type RhStatus = {plan:RhPlanOption;mappings:{id:string}[];pendingDepartments:{departmentCode:string;totalCostMinor:number}[];pendingMovements:{id:string;period:string;component_label:string;amount_minor:number;pending_amount_minor:number;pending_source_status:string}[]};
type RhPreview = {
  byDimension: Record<string, Record<string, number>>;
  pendingDepartments: { departmentCode: string; lineCount: number; totalCostMinor: number }[];
};

const METHODS = ["Manual", "QuantidadePreco", "Crescimento", "Sazonalidade", "Contrato"] as const;
const PERIODICITIES = ["Mensal", "Trimestral", "Anual", "Pontual"] as const;
const METHOD_LABEL_KEY: Record<(typeof METHODS)[number], keyof typeof mapCopy> = {
  Manual: "methodManual",
  QuantidadePreco: "methodQuantityPrice",
  Crescimento: "methodGrowth",
  Sazonalidade: "methodSeasonality",
  Contrato: "methodContract",
};

function formatAmount(minor: number) {
  return (minor / 100).toLocaleString("pt-AO", { maximumFractionDigits: 2 });
}
function parseAmountToMinor(text: string): number {
  const cleaned = text.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function flatten(nodes: LineRow[], depth = 0): { node: LineRow; depth: number }[] {
  const out: { node: LineRow; depth: number }[] = [];
  for (const node of nodes) {
    out.push({ node, depth });
    out.push(...flatten(node.children, depth + 1));
  }
  return out;
}

// Reads a leaf's displayed value: a pending local edit wins over the
// automatic preview, which wins over the saved manual amount.
function displayedValue(node: LineRow, monthIndex: number, edits: Map<string, string>): number {
  const key = `${node.id}|${node.monthly[monthIndex].period}`;
  const edited = edits.get(key);
  if (edited !== undefined) return parseAmountToMinor(edited);
  if (node.automatic && !node.monthly[monthIndex].manualOverride) return node.automatic[monthIndex];
  return node.monthly[monthIndex].amountMinor;
}

function rollup(node: LineRow, monthIndex: number, edits: Map<string, string>): number {
  if (!node.children.length) return displayedValue(node, monthIndex, edits);
  return node.children.reduce((sum, child) => sum + rollup(child, monthIndex, edits), 0);
}

export function BudgetAnnualMapWorkspace() {
  const locale = usePlatformLocale(),
    index = { pt: 0, en: 1, es: 2, fr: 3, ru: 4 }[locale],
    t = (key: keyof typeof mapCopy) => mapCopy[key][index];
  const [data, setData] = useState<Snapshot | null>(null),
    [versionId, setVersionId] = useState(""),
    [organizationId, setOrganizationId] = useState(""),
    [dimensionMemberId, setDimensionMemberId] = useState(""),
    [currency, setCurrency] = useState("AOA"),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
    [edits, setEdits] = useState<Map<string, string>>(new Map()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [selectedLineId, setSelectedLineId] = useState(""),
    [assumptionDraft, setAssumptionDraft] = useState<Record<string, unknown>>({
      method: "Manual",
      status: "Ativo",
      precedence: 0,
      periodicity: "Mensal",
    }),
    [importRows, setImportRows] = useState<string[][] | null>(null),
    [reload, setReload] = useState(0),
    [rhPlans, setRhPlans] = useState<RhPlanOption[]>([]),
    [rhPlanId, setRhPlanId] = useState(""),
    [rhDepartments, setRhDepartments] = useState<RhDepartmentRow[]>([]),
    [rhPreview, setRhPreview] = useState<RhPreview | null>(null),
    [rhHasIntegration, setRhHasIntegration] = useState(false),
    [rhUpdateInfo, setRhUpdateInfo] = useState<RhUpdateInfo | null>(null),
    [rhSyncPolicy, setRhSyncPolicy] = useState("Manual"),
    [rhRelationPolicy, setRhRelationPolicy] = useState("Exclusiva"),
    [rhBusy, setRhBusy] = useState(false),
    [rhMessage, setRhMessage] = useState(""),
    [rhStatus,setRhStatus]=useState<RhStatus|null>(null),
    [rhRefresh,setRhRefresh]=useState(0),
    [cellOrigin, setCellOrigin] = useState<{ nodeId: string; period: string; data: Record<string, unknown> | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    const params = new URLSearchParams({ currency });
    if (versionId) params.set("versionId", versionId);
    if (organizationId) params.set("organizationId", organizationId);
    if (dimensionMemberId) params.set("dimensionMemberId", dimensionMemberId);
    apiFetch(`/api/v1/budget-annual-map?${params.toString()}`)
      .then(readApiJson<Snapshot>)
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [versionId, organizationId, dimensionMemberId, currency, reload]);

  useEffect(() => {
    if (!versionId && data?.versions?.length) setVersionId(data.versions[0].id);
    if (!organizationId && data?.organizations?.length) setOrganizationId(data.organizations[0].id);
  }, [data, versionId, organizationId]);

  const flat = useMemo(() => (data ? flatten(data.tree) : []), [data]);
  const isApproved = data?.version?.status === "Aprovado";
  const readOnlyCells=isApproved||!dimensionMemberId;
  const writeDimension=dimensionMemberId==="__NONE__"?null:dimensionMemberId||null;
  useEffect(()=>{setCellOrigin(null);setImportRows(null);},[versionId,organizationId,dimensionMemberId,currency]);
  useEffect(()=>{setRhMessage("");setRhPlanId("");},[selectedLineId,organizationId]);

  function setEdit(node: LineRow, period: string, value: string) {
    const key = `${node.id}|${period}`,
      next = new Map(edits);
    if (value === "") next.delete(key);
    else next.set(key, value);
    setEdits(next);
  }

  async function saveChanges() {
    if (!data || !organizationId || readOnlyCells) return;
    const cells: {
      code: string;
      lineName: string;
      dimensionMemberId: string | null;
      period: string;
      currency: string;
      amount: string;
      manualOverride?: boolean;
    }[] = [];
    for (const { node } of flat) {
      if (node.children.length) continue;
      for (const monthly of node.monthly) {
        const key = `${node.id}|${monthly.period}`;
        if (!edits.has(key)) continue;
        cells.push({
          code: node.code,
          lineName: node.name,
          dimensionMemberId: writeDimension,
          period: monthly.period,
          currency,
          amount: edits.get(key)!,
          manualOverride: !!node.automatic,
        });
      }
    }
    if (!cells.length) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/api/v1/budget-annual-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "batchSave", versionId, organizationId, cells }),
      });
      const json = await readApiJson<{ error?: string }>(response);
      if (!response.ok) {
        setError(json.error || "Não foi possível guardar as alterações.");
        return;
      }
      setEdits(new Map());
      setNotice(t("save"));
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  async function submitAssumption() {
    if (!selectedLineId || !organizationId || readOnlyCells) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/api/v1/budget-annual-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "assumption",
          versionId,
          lineId: selectedLineId,
          organizationId,
          dimensionMemberId: writeDimension,
          currency,
          ...assumptionDraft,
        }),
      });
      const json = await readApiJson<{ error?: string }>(response);
      if (!response.ok) {
        setError(json.error || "Não foi possível guardar o pressuposto.");
        return;
      }
      setAssumptionDraft({ method: "Manual", status: "Ativo", precedence: 0, periodicity: "Mensal" });
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  async function removeAssumption(id: string) {
    setBusy(true);
    try {
      const r=await apiFetch("/api/v1/budget-annual-map", {
        method: "POST",headers: { "content-type": "application/json" },body: JSON.stringify({ type: "deleteAssumption", id }),
      });
      const j=await readApiJson<{error?:string}>(r);if(!r.ok){setError(j.error||t("rhError"));return;}
      setReload((n) => n + 1);
    } catch(e){setError(e instanceof Error?e.message:t("rhError"));
    } finally {
      setBusy(false);
    }
  }

  // RH → Orçamento integration (Fase 3.2): the selected rubrica's own panel
  // for choosing a plano de pessoal aprovado, resolving its departments
  // against financial dimensions, and driving the Motor Comum de
  // Integração (worker/workforce-budget-integration.ts) — sync, apply,
  // and version-switch.
  useEffect(() => {
    setRhDepartments([]);
    setRhPreview(null);
    setRhStatus(null);
    if (!selectedLineId || !organizationId) {
      setRhPlans([]);
      setRhHasIntegration(false);
      setRhUpdateInfo(null);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/v1/workforce-integration?action=candidates&organizationId=${organizationId}`)
      .then(readApiJson<{ plans: RhPlanOption[] }>)
      .then((j) => {
        if (!cancelled) setRhPlans(j.plans || []);
      })
      .catch(() => {
        if (!cancelled) setRhPlans([]);
      });
    apiFetch(`/api/v1/workforce-integration?action=versionUpdate&organizationId=${organizationId}&lineId=${selectedLineId}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404) {
          setRhHasIntegration(false);
          setRhUpdateInfo(null);
          return;
        }
        const j=await readApiJson<RhUpdateInfo&{error?:string}>(r);
        if(!r.ok)throw new Error(j.error||t("rhError"));
        if(!cancelled){setRhHasIntegration(true);setRhUpdateInfo(j);}
      })
      .catch(() => {
        if (!cancelled) setRhUpdateInfo(null);
      });
    apiFetch(`/api/v1/workforce-integration?action=status&organizationId=${organizationId}&lineId=${selectedLineId}`)
      .then(async r=>{if(cancelled)return;if(r.status===404){setRhStatus(null);return;}const j=await readApiJson<RhStatus&{error?:string}>(r);if(!r.ok)throw new Error(j.error||t("rhError"));if(!cancelled){setRhStatus(j);setRhPlanId(current=>current||j.plan.id);}})
      .catch(e=>{if(!cancelled)setRhMessage(e instanceof Error?e.message:t("rhError"));});
    return () => {cancelled=true;};
  }, [selectedLineId, organizationId,rhRefresh]);

  useEffect(() => {
    if(!rhPlanId)return;
    let cancelled=false;
    apiFetch(`/api/v1/workforce-integration?action=departments&planId=${rhPlanId}`)
      .then(async r=>{const j=await readApiJson<{departments?:RhDepartmentRow[];error?:string}>(r);if(!r.ok)throw new Error(j.error||t("rhError"));if(!cancelled)setRhDepartments(j.departments||[]);})
      .catch(e=>{if(!cancelled)setRhMessage(e instanceof Error?e.message:t("rhError"));});
    apiFetch(`/api/v1/workforce-integration?action=preview&planId=${rhPlanId}`)
      .then(async r=>{const j=await readApiJson<RhPreview&{error?:string}>(r);if(!r.ok)throw new Error(j.error||t("rhError"));if(!cancelled)setRhPreview(j);})
      .catch(()=>{if(!cancelled)setRhPreview(null);});
    return()=>{cancelled=true;};
  }, [rhPlanId,rhRefresh]);

  async function rhAction(body:Record<string,unknown>,success:keyof typeof mapCopy){
    setRhBusy(true);setRhMessage("");
    try{
      const r=await apiFetch("/api/v1/workforce-integration",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,organizationId})});
      const j=await readApiJson<{error?:string;errors?:string[]}>(r);
      if(!r.ok||j.errors?.length)throw new Error(j.error||j.errors?.join(" ")||t("rhError"));
      setRhMessage(t(success));setRhRefresh(n=>n+1);setReload(n=>n+1);
    }catch(e){setRhMessage(e instanceof Error?e.message:t("rhError"));}
    finally{setRhBusy(false);}
  }
  async function recordRhDecision(departmentCode:string,decision:"Mapeado"|"SemDimensao",dimensionMemberId:string|null){
    await rhAction({type:"recordDepartmentDecision",departmentCode,decision,dimensionMemberId},"rhSynced");
  }
  async function createRhIntegration(){
    if(rhPlanId&&selectedLineId&&organizationId)await rhAction({type:"createIntegration",planId:rhPlanId,lineId:selectedLineId,syncPolicy:rhSyncPolicy,relationPolicy:rhRelationPolicy},"rhCreated");
  }
  async function syncRhIntegration(){
    await rhAction({type:"syncIntegration",lineId:selectedLineId},"rhSynced");
  }
  async function applyRhIntegration(){
    await rhAction({type:"applyIntegration",lineId:selectedLineId,versionId},"rhApplied");
  }
  async function switchRhVersion(){
    if(rhUpdateInfo?.latestPlanId)await rhAction({type:"switchVersion",lineId:selectedLineId,newPlanId:rhUpdateInfo.latestPlanId},"rhSwitched");
  }

  async function viewCellOrigin(node: LineRow, period: string) {
    if (!versionId || !organizationId || !dimensionMemberId) return;
    const params = new URLSearchParams({ versionId, lineId: node.id, organizationId, period, currency });
    if (writeDimension) params.set("dimensionMemberId", writeDimension);
    const r = await apiFetch(`/api/v1/budget-integration?action=origin&${params.toString()}`);
    const j = await readApiJson<{ origin: Record<string, unknown> | null;error?:string }>(r);
    if(!r.ok){setError(j.error||t("rhError"));return;}
    setCellOrigin({ nodeId: node.id, period, data: j.origin });
  }

  async function saveCellAdjustment(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(!cellOrigin||readOnlyCells)return;
    const form=new FormData(event.currentTarget);setBusy(true);setError("");
    try{
      const r=await apiFetch("/api/v1/budget-integration",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:"setAdjustment",versionId,lineId:cellOrigin.nodeId,organizationId,dimensionMemberId:writeDimension,currency,period:cellOrigin.period,mode:form.get("mode"),manualAdjustmentMinor:parseMoneyMinor(String(form.get("amount")||"0"))})});
      const j=await readApiJson<{error?:string}>(r);if(!r.ok)throw new Error(j.error||t("rhError"));
      setNotice(t("rhAdjustmentSaved"));setReload(n=>n+1);const node=flat.find(x=>x.node.id===cellOrigin.nodeId)?.node;if(node)await viewCellOrigin(node,cellOrigin.period);
    }catch(e){setError(e instanceof Error?e.message:t("rhError"));}finally{setBusy(false);}
  }

  async function recalc(lineId: string) {
    if (!organizationId || readOnlyCells) return;
    setBusy(true);
    setError("");
    try {
      const response=await apiFetch("/api/v1/budget-annual-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "recalculate",
          versionId,
          lineId,
          organizationId,
          dimensionMemberId: writeDimension,
          currency,
        }),
      });
      const result=await readApiJson<{error?:string}>(response);
      if(!response.ok){setError(result.error||t("recalculate"));return;}
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  function exportToExcel() {
    if (!data) return;
    const header = ["Código", "Nome", ...data.periods, "Total"];
    const rows = flat.map(({ node }) => {
      const monthly = data.periods.map((_, i) => budgetMinorDecimal(rollup(node, i, edits)));
      const total = data.periods.reduce((sum, _, i) => sum + rollup(node, i, edits), 0);
      return [node.code, node.name, ...monthly, budgetMinorDecimal(total)];
    });
    const blob = buildXlsxBlob([{ name: "Mapa Anual", rows: [header, ...rows] }]);
    downloadBlob(blob, `mapa-orcamental-${data.version.fiscal_year}.xlsx`);
  }

  async function handleImportFile(file: File) {
    try{const rows=await parseXlsxFile(file);if(!data) return;
      parseBudgetMapImport(rows,data.periods,flat.map(({node})=>({...node,leaf:!node.children.length})),currency,writeDimension);
      setImportRows(rows);setError("");
    }catch{setImportRows(null);setError(t("importInvalid"));}
  }

  async function confirmImport() {
    if (!importRows || !data || !organizationId || readOnlyCells) return;
    let cells;
    try{cells=parseBudgetMapImport(importRows,data.periods,flat.map(({node})=>({...node,leaf:!node.children.length})),currency,writeDimension).cells;}
    catch{setError(t("importInvalid"));return;}
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/api/v1/budget-annual-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "batchSave", versionId, organizationId, cells }),
      });
      const json = await readApiJson<{ error?: string }>(response);
      if (!response.ok) {
        setError(json.error || "Não foi possível importar a folha.");
        return;
      }
      setImportRows(null);
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  const selectedLine = flat.find((x) => x.node.id === selectedLineId)?.node || null;

  return (
    <section className="budget-map-workspace">
      <header>
        <div>
          <h2>{t("title")}</h2>
          <p>{t("subtitle")}</p>
        </div>
        <div className="budget-map-actions">
          <button onClick={exportToExcel} disabled={!data}>
            {t("exportExcel")}
          </button>
          <label className="budget-map-file-input">
            {t("importExcel")}
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])}
            />
          </label>
          {edits.size > 0 && !readOnlyCells ? (
            <button className="primario" onClick={saveChanges} disabled={busy}>
              {t("save")}
            </button>
          ) : null}
        </div>
      </header>
      <div className="budget-map-filters">
        <label>
          {t("version")}
          <select value={versionId} onChange={(e) => { setVersionId(e.target.value); setEdits(new Map()); }}>
            {(data?.versions || []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.fiscal_year} · {v.status}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("organization")}
          <select value={organizationId} onChange={(e) => { setOrganizationId(e.target.value); setEdits(new Map()); }}>
            {(data?.organizations || []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("dimension")}
          <select value={dimensionMemberId} onChange={(e) => { setDimensionMemberId(e.target.value); setEdits(new Map()); }}>
            <option value="">{t("allDimensions")}</option>
            <option value="__NONE__">{t("noDimension")}</option>
            {(data?.members || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.dimension_name} · {m.code} · {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("currency")}
          <input value={currency} onChange={(e) => {setCurrency(e.target.value.toUpperCase());setEdits(new Map());}} maxLength={3} />
        </label>
      </div>
      {error ? <p className="budget-map-error">{error}</p> : null}
      {notice ? <p className="budget-map-notice">{notice}</p> : null}
      {!dimensionMemberId&&!isApproved?<p className="budget-map-approved">{t("aggregateReadOnly")}</p>:null}
      {isApproved ? <p className="budget-map-approved">{t("approvedNotice")}</p> : null}
      {data?.historicalStructureMissing ? <p className="budget-map-approved">{t("legacyStructure")}</p>:null}
      {edits.size > 0 && !isApproved ? <p className="budget-map-unsaved">{t("unsavedNotice")}</p> : null}
      {!versionId ? (
        <p className="budget-map-empty">{t("noVersion")}</p>
      ) : (
        <div className="budget-map-grid-scroll">
          <table className="budget-map-grid">
            <thead>
              <tr>
                <th>{t("method")}</th>
                {(data?.periods || []).map((p) => (
                  <th key={p}>{p.slice(5)}</th>
                ))}
                <th>{t("total")}</th>
              </tr>
            </thead>
            <tbody>
              {flat.map(({ node, depth }) => {
                if (node.hidden) return null;
                const hasChildren = node.children.length > 0;
                let parentCollapsed = false;
                for (let i = 0; i < flat.length; i++)
                  if (flat[i].node.id === node.id) break;
                const isCollapsedAncestor = (() => {
                  // hide the row if any ancestor (by depth-walk) is collapsed
                  let d = depth - 1,
                    idx = flat.indexOf(flat.find((x) => x.node.id === node.id)!);
                  for (let i = idx - 1; i >= 0 && d >= 0; i--) {
                    if (flat[i].depth === d) {
                      if (collapsed.has(flat[i].node.id)) return true;
                      d -= 1;
                    }
                  }
                  return false;
                })();
                if (isCollapsedAncestor) return null;
                const total = (data?.periods || []).reduce((sum, _, i) => sum + rollup(node, i, edits), 0);
                return (
                  <tr key={node.id} className={hasChildren ? "is-group" : ""}>
                    <td style={{ paddingLeft: depth * 16 }}>
                      {hasChildren ? (
                        <button
                          className="budget-map-toggle"
                          onClick={() => {
                            const next = new Set(collapsed);
                            if (next.has(node.id)) next.delete(node.id);
                            else next.add(node.id);
                            setCollapsed(next);
                          }}
                        >
                          {collapsed.has(node.id) ? "▸" : "▾"}
                        </button>
                      ) : null}
                      <button className="budget-map-line-name" onClick={() => setSelectedLineId(node.id)}>
                        {node.code} · {node.name}
                      </button>
                      {node.automatic ? <small>{t("automatic")}</small> : null}
                    </td>
                    {node.monthly.map((monthly, i) =>
                      hasChildren ? (
                        <td key={monthly.period} className="budget-map-rollup">
                          {formatAmount(rollup(node, i, edits))}
                        </td>
                      ) : (
                        <td key={monthly.period} className="budget-map-cell">
                          <input
                            disabled={readOnlyCells}
                            value={
                              edits.get(`${node.id}|${monthly.period}`) ??
                              formatAmount(displayedValue(node, i, edits))
                            }
                            onChange={(e) => setEdit(node, monthly.period, e.target.value)}
                            className={
                              node.automatic && !monthly.manualOverride ? "budget-map-automatic-cell" : ""
                            }
                          />
                          {dimensionMemberId ? (
                            <button
                              type="button"
                              className="budget-map-origin-btn"
                              title={t("rhOrigin")}
                              onClick={() => viewCellOrigin(node, monthly.period)}
                            >
                              ⓘ
                            </button>
                          ) : null}
                        </td>
                      ),
                    )}
                    <td className="budget-map-total">{formatAmount(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {importRows ? (
        <div className="budget-map-import-preview">
          <h3>{t("importPreview")}</h3>
          <p>{importRows.filter((r) => r[0]?.trim()).length}</p>
          <button onClick={confirmImport} disabled={busy}>
            {t("confirmImport")}
          </button>
          <button onClick={() => setImportRows(null)}>{t("cancel")}</button>
        </div>
      ) : null}
      {selectedLine ? (
        <aside className="budget-map-assumptions-panel">
          <header>
            <h3>
              {t("assumptionsFor")} {selectedLine.code} · {selectedLine.name}
            </h3>
            <button onClick={() => setSelectedLineId("")}>{t("close")}</button>
          </header>
          <ul>
            {selectedLine.assumptions.map((a) => (
              <li key={String(a.id)}>
                <b>{String(a.method)}</b> · {String(a.status)} · {t("precedence")}: {String(a.precedence)}
                {!readOnlyCells ? (
                  <button onClick={() => removeAssumption(String(a.id))}>{t("delete")}</button>
                ) : null}
              </li>
            ))}
          </ul>
          {!readOnlyCells ? (
            <button onClick={() => recalc(selectedLine.id)} disabled={busy}>
              {t("recalculate")}
            </button>
          ) : null}
          {!readOnlyCells ? (
            <form
              className="budget-map-assumption-form"
              onSubmit={(e) => {
                e.preventDefault();
                submitAssumption();
              }}
            >
              <h4>{t("addAssumption")}</h4>
              <label>
                {t("method")}
                <select
                  value={String(assumptionDraft.method)}
                  onChange={(e) => setAssumptionDraft({ ...assumptionDraft, method: e.target.value })}
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(METHOD_LABEL_KEY[m])}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("precedence")}
                <input
                  type="number"
                  value={Number(assumptionDraft.precedence || 0)}
                  onChange={(e) => setAssumptionDraft({ ...assumptionDraft, precedence: Number(e.target.value) })}
                />
              </label>
              {assumptionDraft.method === "QuantidadePreco" ? (
                <>
                  <label>
                    {t("quantity")}
                    <input
                      type="number"
                      onChange={(e) =>
                        setAssumptionDraft({
                          ...assumptionDraft,
                          params: { ...(assumptionDraft.params as object), quantity: Number(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label>
                    {t("unitPrice")}
                    <input
                      type="number"
                      onChange={(e) =>
                        setAssumptionDraft({
                          ...assumptionDraft,
                          params: {
                            ...(assumptionDraft.params as object),
                            unitPriceMinor: Math.round(Number(e.target.value) * 100),
                          },
                        })
                      }
                    />
                  </label>
                </>
              ) : null}
              {assumptionDraft.method === "Crescimento" ? (
                <>
                  <label>
                    {t("periodicity")}
                    <select
                      value={String(assumptionDraft.periodicity || "Mensal")}
                      onChange={(e) => setAssumptionDraft({ ...assumptionDraft, periodicity: e.target.value })}
                    >
                      {PERIODICITIES.map((p) => (
                        <option key={p} value={p}>
                          {t(("periodicity" + (p === "Pontual" ? "OneOff" : p === "Mensal" ? "Monthly" : p === "Trimestral" ? "Quarterly" : "Yearly")) as keyof typeof mapCopy)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("growthRate")}
                    <input
                      type="number"
                      step="0.01"
                      onChange={(e) =>
                        setAssumptionDraft({
                          ...assumptionDraft,
                          params: {
                            ...(assumptionDraft.params as object),
                            cadence: assumptionDraft.periodicity,
                            rateBps: Math.round(Number(e.target.value) * 100),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      onChange={(e) =>
                        setAssumptionDraft({
                          ...assumptionDraft,
                          params: { ...(assumptionDraft.params as object), mode: e.target.checked ? "Composto" : "Simples" },
                        })
                      }
                    />
                    {t("growthModeCompound")}
                  </label>
                  {assumptionDraft.periodicity === "Anual" ? (
                    <label>
                      <input
                        type="checkbox"
                        onChange={(e) =>
                          setAssumptionDraft({
                            ...assumptionDraft,
                            params: {
                              ...(assumptionDraft.params as object),
                              distributeAsMonthlyEquivalent: e.target.checked,
                            },
                          })
                        }
                      />
                      {t("growthMonthlyEquivalent")}
                    </label>
                  ) : null}
                  {assumptionDraft.periodicity === "Pontual" ? (
                    <label>
                      {t("growthEffectiveFrom")}
                      <input
                        type="month"
                        onChange={(e) =>
                          setAssumptionDraft({
                            ...assumptionDraft,
                            params: { ...(assumptionDraft.params as object), effectiveFromPeriod: e.target.value },
                          })
                        }
                      />
                    </label>
                  ) : null}
                </>
              ) : null}
              {assumptionDraft.method === "Contrato" ? (
                <>
                  <label>
                    {t("contractStart")}
                    <input
                      type="month"
                      onChange={(e) =>
                        setAssumptionDraft({
                          ...assumptionDraft,
                          params: { ...(assumptionDraft.params as object), startPeriod: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    {t("contractEnd")}
                    <input
                      type="month"
                      onChange={(e) =>
                        setAssumptionDraft({
                          ...assumptionDraft,
                          params: { ...(assumptionDraft.params as object), endPeriod: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    {t("contractValue")}
                    <input
                      type="number"
                      onChange={(e) =>
                        setAssumptionDraft({
                          ...assumptionDraft,
                          params: {
                            ...(assumptionDraft.params as object),
                            valueMinor: Math.round(Number(e.target.value) * 100),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    {t("contractBilling")}
                    <select
                      onChange={(e) =>
                        setAssumptionDraft({
                          ...assumptionDraft,
                          params: { ...(assumptionDraft.params as object), billingPeriodicity: e.target.value },
                        })
                      }
                    >
                      <option value="Mensal">{t("periodicityMonthly")}</option>
                      <option value="Trimestral">{t("periodicityQuarterly")}</option>
                      <option value="Anual">{t("periodicityYearly")}</option>
                    </select>
                  </label>
                  <label>
                    {t("contractRelation")}
                    <select
                      onChange={(e) =>
                        setAssumptionDraft({
                          ...assumptionDraft,
                          params: { ...(assumptionDraft.params as object), relation: e.target.value },
                        })
                      }
                    >
                      <option value="Base">{t("contractRelationBase")}</option>
                      <option value="Soma">{t("contractRelationAdd")}</option>
                      <option value="Substituicao">{t("contractRelationReplace")}</option>
                    </select>
                  </label>
                </>
              ) : null}
              <button type="submit" disabled={busy}>
                {t("addAssumption")}
              </button>
            </form>
          ) : null}
        </aside>
      ) : null}
      {selectedLine&&!selectedLine.id.startsWith("legacy:") ? (
        <aside className="budget-map-assumptions-panel budget-map-rh-panel">
          <header>
            <h3>{t("rhTitle")}</h3>
          </header>
          {rhUpdateInfo?.hasUpdate ? (
            <p className="budget-map-rh-update">
              {t("rhUpdateAvailable")} ({t("version")} {rhUpdateInfo.latestVersion}) —{" "}
              {formatAmount(rhUpdateInfo.currentTotalMinor || 0)} → {formatAmount(rhUpdateInfo.latestTotalMinor || 0)}{" "}
              <button onClick={switchRhVersion} disabled={rhBusy}>
                {t("rhSwitchVersion")}
              </button>
            </p>
          ) : null}
          {rhMessage ? <p className="budget-map-notice">{rhMessage}</p> : null}
          {!rhHasIntegration ? (
            <>
              <label>
                {t("rhSelectPlan")}
                <select value={rhPlanId} onChange={(e) => setRhPlanId(e.target.value)}>
                  <option value="">{t("rhSelectPlaceholder")}</option>
                  {rhPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · v{p.version_number} · {p.currency}
                    </option>
                  ))}
                </select>
              </label>
              {rhPlanId ? (
                <>
                  <ul>
                    {rhDepartments.map((d) => (
                      <li key={d.department_code || "—"}>
                        <span>
                          {d.department_code || "—"} · {d.total_headcount} · {formatAmount(d.total_cost_minor)}
                        </span>
                        {d.decision === "Mapeado" ? (
                          <b>{t("rhMapped")} · {d.dimension_member_name}</b>
                        ) : d.decision === "SemDimensao" ? (
                          <b>{t("rhNoDimension")}</b>
                        ) : (
                          <span className="budget-map-rh-decide">
                            <b className="budget-map-rh-pending">{t("rhPending")}</b>
                            <select
                              onChange={(e) => {
                                if (!d.department_code) return;
                                if (e.target.value === "__none__") recordRhDecision(d.department_code, "SemDimensao", null);
                                else if (e.target.value) recordRhDecision(d.department_code, "Mapeado", e.target.value);
                              }}
                              defaultValue=""
                            >
                              <option value="" disabled>
                                {t("rhSelectPlaceholder")}
                              </option>
                              <option value="__none__">{t("rhMarkNoDimension")}</option>
                              {(data?.members || []).map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.dimension_name} · {m.code} · {m.name}
                                </option>
                              ))}
                            </select>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {rhPreview ? (
                    <p>
                      {t("rhPreviewTitle")}:{" "}
                      {Object.entries(rhPreview.byDimension)
                        .map(([dim, byPeriod]) => `${dim}: ${formatAmount(Object.values(byPeriod).reduce((s, v) => s + v, 0))}`)
                        .join(" · ")}
                      {rhPreview.pendingDepartments.length ? (
                        <> — {rhPreview.pendingDepartments.length} {t("rhPendingDepartments")}</>
                      ) : null}
                    </p>
                  ) : null}
                  <form
                    className="budget-map-assumption-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      createRhIntegration();
                    }}
                  >
                    <label>
                      {t("rhSyncPolicy")}
                      <select value={rhSyncPolicy} onChange={(e) => setRhSyncPolicy(e.target.value)}>
                        <option value="Manual">{t("rhPolicyManual")}</option>
                        <option value="ComConfirmacao">{t("rhPolicyComConfirmacao")}</option>
                        <option value="Automatica">{t("rhPolicyAutomatica")}</option>
                      </select>
                    </label>
                    <label>
                      {t("rhRelationPolicy")}
                      <select value={rhRelationPolicy} onChange={(e) => setRhRelationPolicy(e.target.value)}>
                        <option value="Exclusiva">{t("rhPolicyExclusiva")}</option>
                        <option value="Soma">{t("rhPolicySoma")}</option>
                        <option value="Alternativa">{t("rhPolicyAlternativa")}</option>
                      </select>
                    </label>
                    <button type="submit" disabled={rhBusy}>
                      {t("rhCreate")}
                    </button>
                  </form>
                </>
              ) : (
                <p className="budget-map-empty">{t("rhNone")}</p>
              )}
            </>
          ) : (
            <div className="budget-map-actions">
              {rhStatus ? <section className="budget-map-rh-status" aria-live="polite">
                <p>{t("rhCurrentPlan")}: <strong>{rhStatus.plan.name} · v{rhStatus.plan.version_number} · {rhStatus.plan.currency}</strong></p>
                <label>{t("rhReviewPlan")}<select value={rhPlanId} onChange={e=>setRhPlanId(e.target.value)} disabled={rhBusy}>{rhPlans.map(p=><option key={p.id} value={p.id}>{p.name} · v{p.version_number} · {p.currency}</option>)}</select></label>
                {rhStatus.pendingDepartments.map(d=><p key={d.departmentCode}>{d.departmentCode}: {t("rhPending")} · {formatAmount(d.totalCostMinor)}</p>)}
                {rhDepartments.filter(d=>d.department_code).map(d=><label key={d.department_code}>{d.department_code}
                  <select aria-label={d.department_code||""} value={d.decision==="SemDimensao"?"__none__":d.dimension_member_id||""} disabled={rhBusy} onChange={e=>{if(d.department_code&&e.target.value)recordRhDecision(d.department_code,e.target.value==="__none__"?"SemDimensao":"Mapeado",e.target.value==="__none__"?null:e.target.value);}}>
                    <option value="">{t("rhPending")}</option><option value="__none__">{t("rhNoDimension")}</option>
                    {(data?.members||[]).map(m=><option key={m.id} value={m.id}>{m.dimension_name} · {m.code} · {m.name}</option>)}
                  </select>
                </label>)}
                {rhStatus.pendingMovements.length ? <>
                  <h4>{t("rhPendingChanges")} ({rhStatus.pendingMovements.length})</h4><p>{t("rhPendingHold")}</p>
                  <table><thead><tr><th>{t("rhPeriod")}</th><th>{t("rhComponent")}</th><th>{t("rhBefore")}</th><th>{t("rhAfter")}</th></tr></thead>
                    <tbody>{rhStatus.pendingMovements.map(m=><tr key={m.id}><td>{m.period}</td><td>{m.component_label}</td><td>{formatAmount(m.amount_minor)}</td><td>{formatAmount(m.pending_amount_minor)}</td></tr>)}</tbody></table>
                  <button onClick={()=>rhAction({type:"confirmIntegration",lineId:selectedLineId},"rhConfirmed")} disabled={rhBusy}>{t("rhConfirm")}</button>
                </>:null}
              </section>:null}
              <button onClick={syncRhIntegration} disabled={rhBusy}>
                {t("rhSync")}
              </button>
              {!isApproved ? (
                <button className="primario" onClick={applyRhIntegration} disabled={rhBusy||!rhStatus||!!rhStatus.pendingMovements.length||!!rhStatus.pendingDepartments.length}>
                  {t("rhApply")}
                </button>
              ) : null}
            </div>
          )}
        </aside>
      ) : null}
      {cellOrigin ? (
        <aside className="budget-map-assumptions-panel budget-map-origin-panel">
          <header>
            <h3>
              {t("rhOriginTitle")} · {cellOrigin.period}
            </h3>
            <button onClick={() => setCellOrigin(null)}>{t("rhClose")}</button>
          </header>
          {cellOrigin.data ? (
            <ul>
              <li>
                {t("total")}: {formatAmount(Number(cellOrigin.data.amountMinor || 0))}
              </li>
              <li>
                {t("automatic")}: {formatAmount(Number(cellOrigin.data.integrationAmountMinor || 0))}
              </li>
              <li>
                {t("manualOverride")}: {formatAmount(Number(cellOrigin.data.manualAdjustmentMinor || 0))} ({String(cellOrigin.data.adjustmentMode || "—")})
              </li>
              {cellOrigin.data.integration && (cellOrigin.data.integration as Record<string,unknown>).snapshotAvailable===false?<li>{t("missingHistoricalEvidence")}</li>:null}
              {cellOrigin.data.integration ? (
                <li>
                  {String((cellOrigin.data.integration as Record<string, unknown>).sourceModule)} ·{" "}
                  {String((cellOrigin.data.integration as Record<string, unknown>).syncState)}
                </li>
              ) : null}
              {cellOrigin.data.integration ? <li><details><summary>{t("rhDetails")}</summary>
                {((cellOrigin.data.integration as {contributions?:{mappingId:string;sourceModule:string;sourceReference:string;amountMinor:number;movements?:Record<string,unknown>[]}[]}).contributions||[]).map(c=><section key={c.mappingId}><p>{c.sourceModule} · {c.sourceReference} · {formatAmount(c.amountMinor)}</p>
                  <ul>{(c.movements||[]).map((m,i)=><li key={i}>{String(m.period||cellOrigin.period)} · {String(m.component_label||m.source_movement_reference||"")} · {formatAmount(Number(m.amount_minor||0))} · {String(m.source_status||"")}</li>)}</ul>
                </section>)}
              </details></li>:null}
            </ul>
          ) : (
            <p className="budget-map-empty">{t("cellNoOrigin")}</p>
          )}
          {!readOnlyCells&&cellOrigin.data ? <form className="budget-map-assumption-form" key={`${versionId}|${organizationId}|${currency}|${dimensionMemberId}|${cellOrigin.nodeId}|${cellOrigin.period}`} onSubmit={saveCellAdjustment}>
            <h4>{t("rhAdjustment")}</h4>
            <select name="mode" defaultValue={String(cellOrigin.data.adjustmentMode||"Substituir")} aria-label={t("rhAdjustment")}><option value="Substituir">{t("rhReplace")}</option><option value="Adicionar">{t("rhAdd")}</option><option value="Bloquear">{t("rhBlock")}</option></select>
            <input name="amount" aria-label={t("rhAdjustment")} defaultValue={(Number(cellOrigin.data.manualAdjustmentMinor||0)/100).toFixed(2)} inputMode="decimal" required/>
            <button disabled={busy}>{t("rhAdjust")}</button>
          </form>:null}
        </aside>
      ) : null}
    </section>
  );
}
