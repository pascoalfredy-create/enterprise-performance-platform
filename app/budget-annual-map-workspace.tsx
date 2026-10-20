"use client";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, readApiJson } from "../lib/api-client";
import { usePlatformLocale } from "./use-platform-locale";
import { mapCopy } from "./budget-annual-map-copy";
import { buildXlsxBlob, parseXlsxFile } from "../lib/xlsx";
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
  version: { id: string; name: string; fiscal_year: number; status: string };
  periods: string[];
  tree: LineRow[];
  organizations: { id: string; name: string; code: string; currency: string }[];
  members: { id: string; name: string; code: string; dimension_name: string }[];
  versions: { id: string; name: string; fiscal_year: number; status: string }[];
};

const METHODS = ["Manual", "QuantidadePreco", "Crescimento", "Sazonalidade", "Contrato"] as const;
const PERIODICITIES = ["Mensal", "Trimestral", "Anual", "Pontual"] as const;

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
    [reload, setReload] = useState(0);

  useEffect(() => {
    if (!versionId) return;
    let cancelled = false;
    setBusy(true);
    const params = new URLSearchParams({ versionId, currency });
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

  function setEdit(node: LineRow, period: string, value: string) {
    const key = `${node.id}|${period}`,
      next = new Map(edits);
    if (value === "") next.delete(key);
    else next.set(key, value);
    setEdits(next);
  }

  async function saveChanges() {
    if (!data || !organizationId) return;
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
          dimensionMemberId: dimensionMemberId || null,
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
    if (!selectedLineId || !organizationId) return;
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
          dimensionMemberId: dimensionMemberId || undefined,
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
      await apiFetch("/api/v1/budget-annual-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "deleteAssumption", id }),
      });
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  async function recalc(lineId: string) {
    if (!organizationId) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/budget-annual-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "recalculate",
          versionId,
          lineId,
          organizationId,
          dimensionMemberId: dimensionMemberId || undefined,
          currency,
        }),
      });
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  function exportToExcel() {
    if (!data) return;
    const header = ["Código", "Nome", ...data.periods, "Total"];
    const rows = flat.map(({ node }) => {
      const monthly = data.periods.map((_, i) => formatAmount(rollup(node, i, edits)));
      const total = data.periods.reduce((sum, _, i) => sum + rollup(node, i, edits), 0);
      return [node.code, node.name, ...monthly, formatAmount(total)];
    });
    const blob = buildXlsxBlob([{ name: "Mapa Anual", rows: [header, ...rows] }]);
    downloadBlob(blob, `mapa-orcamental-${data.version.fiscal_year}.xlsx`);
  }

  async function handleImportFile(file: File) {
    const rows = await parseXlsxFile(file);
    setImportRows(rows.slice(1)); // drop header row
  }

  async function confirmImport() {
    if (!importRows || !data || !organizationId) return;
    const cells = importRows
      .filter((row) => row[0]?.trim())
      .flatMap((row) => {
        const [code, name, ...monthsAndTotal] = row;
        return data.periods.map((period, i) => ({
          code,
          lineName: name || code,
          dimensionMemberId: dimensionMemberId || null,
          period,
          currency,
          amount: monthsAndTotal[i] || "0",
        }));
      });
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
          {edits.size > 0 && !isApproved ? (
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
            {(data?.members || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.dimension_name} · {m.code} · {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("currency")}
          <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
        </label>
      </div>
      {error ? <p className="budget-map-error">{error}</p> : null}
      {notice ? <p className="budget-map-notice">{notice}</p> : null}
      {isApproved ? <p className="budget-map-approved">{t("approvedNotice")}</p> : null}
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
                        <td key={monthly.period}>
                          <input
                            disabled={isApproved}
                            value={
                              edits.get(`${node.id}|${monthly.period}`) ??
                              formatAmount(displayedValue(node, i, edits))
                            }
                            onChange={(e) => setEdit(node, monthly.period, e.target.value)}
                            className={
                              node.automatic && !monthly.manualOverride ? "budget-map-automatic-cell" : ""
                            }
                          />
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
                {!isApproved ? (
                  <button onClick={() => removeAssumption(String(a.id))}>{t("delete")}</button>
                ) : null}
              </li>
            ))}
          </ul>
          {!isApproved ? (
            <button onClick={() => recalc(selectedLine.id)} disabled={busy}>
              {t("recalculate")}
            </button>
          ) : null}
          {!isApproved ? (
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
                      {t(("method" + m) as keyof typeof mapCopy)}
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
    </section>
  );
}
