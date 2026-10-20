"use client";
import { useEffect, useMemo, useState } from "react";
import { usePlatformLocale } from "./use-platform-locale";
import {workspaceText} from '../lib/workspace-navigation';
import { reportsHubCopy } from "./reports-hub-copy";
import "./reports-hub.css";

export type ReportsHubGroup = {
  code: string;
  name: string;
  icon: string;
  items: { label: string; target: string }[];
};

const PIN_STORAGE_KEY = "ep_pinned_reports";

function loadPinned(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function ReportsHubWorkspace({
  groups,
  onNavigate,
}: {
  groups: ReportsHubGroup[];
  onNavigate: (target: string) => void;
}) {
  const locale = usePlatformLocale(),
    index = { pt: 0, en: 1, es: 2, fr: 3, ru: 4 }[locale],
    t = (key: keyof typeof reportsHubCopy) => reportsHubCopy[key][index];
  const [query, setQuery] = useState(""),
    [activeFilter, setActiveFilter] = useState("Todos"),
    [onlyPinned,setOnlyPinned]=useState(false),
    [pinned, setPinned] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setPinned(loadPinned());
  }, []);

  function togglePin(key: string) {
    setPinned((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* best-effort only — a per-viewer convenience, never load-bearing */
      }
      return next;
    });
  }

  const flat = useMemo(
    () =>
      groups.flatMap((g) =>
        g.items.map((it) => ({
          key: `${g.code}::${it.label}`,
          group: g.name,
          groupCode:g.code,
          groupIcon: g.icon,
          label: it.label,
          target: it.target,
        })),
      ),
    [groups],
  );

  const q = query.trim().toLocaleLowerCase(locale);
  const matches = (r: (typeof flat)[number]) =>
    (activeFilter === "Todos" || r.groupCode === activeFilter) &&
    (!onlyPinned||pinned[r.key]) &&
    (q === "" || (r.label+' '+r.group).toLocaleLowerCase(locale).includes(q));
  const filtered = flat.filter(matches);

  const byGroup = new Map<string, { icon: string; rows: typeof filtered }>();
  for (const r of filtered) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, { icon: r.groupIcon, rows: [] });
    byGroup.get(r.group)!.rows.push(r);
  }

  return (
    <section className="reports-hub">
      <header className="reports-hub-top">
        <div>
          <span>{t("eyebrow")}</span>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
      </header>

      <div className="reports-hub-filters">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
        />
        <select aria-label={workspaceText(locale,'module')} value={activeFilter} onChange={e=>setActiveFilter(e.target.value)}><option value="Todos">{t('all')}</option>{groups.map(g=><option key={g.code} value={g.code}>{g.name}</option>)}</select><label className="reports-hub-pin-filter"><input type="checkbox" checked={onlyPinned} onChange={e=>setOnlyPinned(e.target.checked)}/>{t('favourites')}</label>
      </div>

      {Array.from(byGroup.entries()).map(([groupName, { icon, rows }]) => (
        <div className="reports-hub-group" key={groupName}>
          <h2>
            <i>{icon}</i> {groupName}
          </h2>
          <div className="reports-hub-list table-scroll"><table><thead><tr><th>{workspaceText(locale,'filename')}</th><th>{workspaceText(locale,'area')}</th><th>{t('favourites')}</th><th>{workspaceText(locale,'open')}</th></tr></thead><tbody>{rows.map(r=><tr key={r.key}><td><b>{r.label}</b></td><td>{r.group}</td><td><button type="button" className={pinned[r.key]?'pin ativo':'pin'} aria-pressed={!!pinned[r.key]} aria-label={pinned[r.key]?t('unpin'):t('pin')} onClick={()=>togglePin(r.key)}>★</button></td><td><button type="button" className="abrir" onClick={()=>onNavigate(r.target)}>{t('open')} →</button></td></tr>)}</tbody></table></div>
        </div>
      ))}

      {filtered.length === 0 && <p className="reports-hub-empty">{t("empty")}</p>}
    </section>
  );
}
