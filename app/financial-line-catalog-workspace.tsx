"use client";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, readApiJson } from "../lib/api-client";
import { usePlatformLocale } from "./use-platform-locale";
import { catalogCopy } from "./financial-line-catalog-copy";
import "./financial-line-catalog.css";

type LineRow = {
  id: string;
  code: string;
  name: string;
  classification: string;
  cash_flow_category: string;
  sign_mode: string;
  status: string;
  parent_id: string | null;
  level: number;
  display_order: number;
  hidden: number;
  line_kind: string;
  source_type: string;
  manual_adjustment_allowed: number;
  description: string;
};
type TreeNode = LineRow & { children: TreeNode[] };
type Snapshot = { financialLineCatalog: LineRow[] };

const CLASSIFICATIONS = ["Receita", "Custo", "Ativo", "Passivo", "Capital", "Caixa", "Outro"];
const CASH_FLOW_CATEGORIES = ["Operacional", "Investimento", "Financiamento", "Não aplicável"];
const SIGN_MODES = ["Natural", "Inverter"];
const SOURCE_TYPES = ["Manual", "RH", "Financeiro", "Investimentos", "Forecast", "Importação externa", "Fórmula"];

function buildTree(rows: LineRow[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const row of rows) byId.set(row.id, { ...row, children: [] });
  const roots: TreeNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    const parent = row.parent_id ? byId.get(row.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortTree = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.display_order - b.display_order);
    for (const node of nodes) sortTree(node.children);
  };
  sortTree(roots);
  return roots;
}

function flattenVisible(nodes: TreeNode[], depth = 0): { node: TreeNode; depth: number }[] {
  const out: { node: TreeNode; depth: number }[] = [];
  for (const node of nodes) {
    out.push({ node, depth });
    out.push(...flattenVisible(node.children, depth + 1));
  }
  return out;
}

function flatOptions(nodes: TreeNode[], depth = 0): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const node of nodes) {
    out.push({ id: node.id, label: `${"— ".repeat(depth)}${node.code} · ${node.name}` });
    out.push(...flatOptions(node.children, depth + 1));
  }
  return out;
}

// A rubrica (and everything under it) can never become its own ancestor —
// filtered out client-side as a UX convenience; the server's cycle-guard
// trigger is the real, authoritative check either way.
function subtreeIds(node: TreeNode): Set<string> {
  const ids = new Set<string>([node.id]);
  for (const child of node.children) for (const id of subtreeIds(child)) ids.add(id);
  return ids;
}
function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

export function FinancialLineCatalogWorkspace() {
  const locale = usePlatformLocale(),
    index = { pt: 0, en: 1, es: 2, fr: 3, ru: 4 }[locale],
    t = (key: keyof typeof catalogCopy) => catalogCopy[key][index];
  const [data, setData] = useState<Snapshot | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [showHidden, setShowHidden] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [renamingId, setRenamingId] = useState(""),
    [renameValue, setRenameValue] = useState(""),
    [duplicatingId, setDuplicatingId] = useState(""),
    [duplicateCode, setDuplicateCode] = useState(""),
    [duplicateName, setDuplicateName] = useState(""),
    [form, setForm] = useState({
      parentId: "",
      code: "",
      name: "",
      classification: "Custo",
      cashFlowCategory: "Operacional",
      signMode: "Natural",
      lineKind: "Analítica",
      sourceType: "Manual",
      manualAdjustmentAllowed: true,
      description: "",
    }),
    [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    apiFetch("/api/v1/setup")
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
  }, [reload]);

  const rows = useMemo(() => data?.financialLineCatalog || [], [data]);
  const tree = useMemo(() => buildTree(rows), [rows]);
  const visibleTree = useMemo(
    () => (showHidden ? tree : buildTree(rows.filter((r) => !r.hidden))),
    [tree, rows, showHidden],
  );
  const flatRows = useMemo(() => flattenVisible(visibleTree), [visibleTree]);
  const parentOptions = useMemo(() => flatOptions(tree), [tree]);

  async function submit(type: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/v1/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, ...payload }),
      });
      const json = await readApiJson<{ error?: string }>(response);
      if (!response.ok) {
        setError(json.error || "Não foi possível concluir a operação.");
        return false;
      }
      setReload((n) => n + 1);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addLine(event: React.FormEvent) {
    event.preventDefault();
    const ok = await submit("financialLineCreate", {
      parentId: form.parentId || undefined,
      code: form.code,
      name: form.name,
      classification: advanced ? form.classification : undefined,
      cashFlowCategory: advanced ? form.cashFlowCategory : undefined,
      signMode: advanced ? form.signMode : undefined,
      lineKind: form.lineKind,
      sourceType: form.sourceType,
      manualAdjustmentAllowed: form.manualAdjustmentAllowed,
      description: form.description,
    });
    if (ok) {
      setForm({ ...form, code: "", name: "", description: "" });
      setNotice(`${t("addLine")}: ${form.name}`);
    }
  }

  async function move(node: LineRow, siblings: LineRow[], direction: -1 | 1) {
    const ordered = [...siblings].sort((a, b) => a.display_order - b.display_order);
    const index = ordered.findIndex((s) => s.id === node.id);
    const swapWith = ordered[index + direction];
    if (!swapWith) return;
    await submit("financialLineReorder", { lineId: node.id, displayOrder: swapWith.display_order });
    await submit("financialLineReorder", { lineId: swapWith.id, displayOrder: node.display_order });
  }

  async function moveToGroup(node: LineRow, newParentId: string) {
    if ((newParentId || null) === node.parent_id) return;
    const newSiblings = rows.filter((r) => (r.parent_id || "") === (newParentId || ""));
    const displayOrder = newSiblings.length
      ? Math.max(...newSiblings.map((s) => s.display_order)) + 1
      : 0;
    await submit("financialLineReorder", { lineId: node.id, parentId: newParentId || null, displayOrder });
  }

  return (
    <section className="catalog-universal-workspace">
      <header>
        <div>
          <h2>{t("title")}</h2>
          <p>{t("subtitle")}</p>
        </div>
        <button disabled={busy} onClick={() => submit("financialLineAdoptTemplate", {})}>
          {t("adopt")}
        </button>
      </header>
      <p className="catalog-universal-hint">{t("adoptNotice")}</p>
      {error ? <p className="catalog-universal-error">{error}</p> : null}
      {notice ? <p className="catalog-universal-notice">{notice}</p> : null}
      <label className="catalog-universal-toggle">
        <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
        {t("showHiddenToggle")}
      </label>
      {flatRows.length ? (
        <ul className="catalog-universal-tree">
          {flatRows.map(({ node, depth }) => {
            const siblings = rows.filter((n) => n.parent_id === node.parent_id);
            return (
              <li key={node.id} style={{ paddingLeft: depth * 20 }} className={node.hidden ? "is-hidden" : ""}>
                {renamingId === node.id ? (
                  <span className="catalog-universal-rename">
                    <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
                    <button
                      onClick={async () => {
                        if (await submit("financialLineRename", { lineId: node.id, name: renameValue }))
                          setRenamingId("");
                      }}
                    >
                      {t("save")}
                    </button>
                    <button onClick={() => setRenamingId("")}>{t("cancel")}</button>
                  </span>
                ) : (
                  <>
                    <b>{node.code}</b> <span>{node.name}</span>{" "}
                    <small>
                      {node.line_kind} · {node.classification} ·{" "}
                      {node.status === "Ativa" ? t("active") : t("inactive")} ·{" "}
                      {node.hidden ? t("hidden") : t("visible")} · {node.source_type}
                    </small>
                  </>
                )}
                <span className="catalog-universal-actions">
                  <button onClick={() => move(node, siblings, -1)} title={t("moveUp")}>
                    ↑
                  </button>
                  <button onClick={() => move(node, siblings, 1)} title={t("moveDown")}>
                    ↓
                  </button>
                  <select
                    title={t("moveToGroup")}
                    value={node.parent_id || ""}
                    onChange={(e) => moveToGroup(node, e.target.value)}
                  >
                    <option value="">{t("rootLevel")}</option>
                    {parentOptions
                      .filter((o) => !subtreeIds(node).has(o.id))
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => {
                      setRenamingId(node.id);
                      setRenameValue(node.name);
                    }}
                  >
                    {t("rename")}
                  </button>
                  <button
                    onClick={() => submit("financialLineSetHidden", { lineId: node.id, hidden: !node.hidden })}
                  >
                    {node.hidden ? t("unhide") : t("hide")}
                  </button>
                  <button
                    onClick={() =>
                      submit("financialLineSetStatus", {
                        lineId: node.id,
                        status: node.status === "Ativa" ? "Inativa" : "Ativa",
                      })
                    }
                  >
                    {node.status === "Ativa" ? t("deactivate") : t("reactivate")}
                  </button>
                  {duplicatingId === node.id ? (
                    <span className="catalog-universal-duplicate">
                      <input
                        placeholder={t("newLineCode")}
                        value={duplicateCode}
                        onChange={(e) => setDuplicateCode(e.target.value)}
                      />
                      <input
                        placeholder={t("newLineName")}
                        value={duplicateName}
                        onChange={(e) => setDuplicateName(e.target.value)}
                      />
                      <button
                        onClick={async () => {
                          if (
                            await submit("financialLineDuplicate", {
                              lineId: node.id,
                              code: duplicateCode,
                              name: duplicateName,
                            })
                          )
                            setDuplicatingId("");
                        }}
                      >
                        {t("save")}
                      </button>
                      <button onClick={() => setDuplicatingId("")}>{t("cancel")}</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setDuplicatingId(node.id);
                        setDuplicateCode("");
                        setDuplicateName(`${node.name} (2)`);
                      }}
                    >
                      {t("duplicate")}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="catalog-universal-empty">{t("empty")}</p>
      )}
      <form className="catalog-universal-add" onSubmit={addLine}>
        <h3>{t("addLine")}</h3>
        <label>
          {t("destinationGroup")}
          <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
            <option value="">{t("rootLevel")}</option>
            {parentOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("newLineCode")}
          <input
            required
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </label>
        <label>
          {t("newLineName")}
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          {t("kind")}
          <select value={form.lineKind} onChange={(e) => setForm({ ...form, lineKind: e.target.value })}>
            <option value="Analítica">{t("kindAnalytic")}</option>
            <option value="Agregação">{t("kindAggregation")}</option>
            <option value="Calculada">{t("kindCalculated")}</option>
          </select>
        </label>
        <label className="catalog-universal-toggle">
          <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
          {t("advancedOptions")}
        </label>
        {advanced ? (
          <>
            <label>
              {t("nature")}
              <select
                value={form.classification}
                onChange={(e) => setForm({ ...form, classification: e.target.value })}
              >
                {CLASSIFICATIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("cashFlowCategory")}
              <select
                value={form.cashFlowCategory}
                onChange={(e) => setForm({ ...form, cashFlowCategory: e.target.value })}
              >
                {CASH_FLOW_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("signMode")}
              <select value={form.signMode} onChange={(e) => setForm({ ...form, signMode: e.target.value })}>
                {SIGN_MODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <label>
          {t("dataOrigin")}
          <select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}>
            {SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="catalog-universal-toggle">
          <input
            type="checkbox"
            checked={form.manualAdjustmentAllowed}
            onChange={(e) => setForm({ ...form, manualAdjustmentAllowed: e.target.checked })}
          />
          {t("manualAdjustment")}
        </label>
        <label>
          {t("description")}
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <button type="submit" disabled={busy}>
          {t("addLine")}
        </button>
      </form>
    </section>
  );
}
