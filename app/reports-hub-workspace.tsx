"use client";
import { useEffect, useMemo, useState } from "react";
import { usePlatformLocale } from "./use-platform-locale";
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
          groupIcon: g.icon,
          label: it.label,
          target: it.target,
        })),
      ),
    [groups],
  );

  const q = query.trim().toLocaleLowerCase(locale);
  const matches = (r: (typeof flat)[number]) =>
    (activeFilter === "Todos" || r.group === activeFilter) &&
    (q === "" || r.label.toLocaleLowerCase(locale).includes(q));
  const filtered = flat.filter(matches);
  const favourites = flat.filter((r) => pinned[r.key]);

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
        <div className="reports-hub-pills">
          <button
            className={activeFilter === "Todos" ? "ativo" : ""}
            onClick={() => setActiveFilter("Todos")}
          >
            {t("all")}
          </button>
          {groups.map((g) => (
            <button
              key={g.code}
              className={activeFilter === g.name ? "ativo" : ""}
              onClick={() => setActiveFilter(g.name)}
            >
              <i>{g.icon}</i> {g.name}
            </button>
          ))}
        </div>
      </div>

      {favourites.length > 0 && (
        <div className="reports-hub-favourites">
          <h2>★ {t("favourites")}</h2>
          <div className="reports-hub-cards">
            {favourites.map((r) => (
              <article key={r.key}>
                <i>{r.groupIcon}</i>
                <span>
                  <b>{r.label}</b>
                  <small>{r.group}</small>
                </span>
                <button onClick={() => onNavigate(r.target)}>{t("open")} →</button>
              </article>
            ))}
          </div>
        </div>
      )}

      {Array.from(byGroup.entries()).map(([groupName, { icon, rows }]) => (
        <div className="reports-hub-group" key={groupName}>
          <h2>
            <i>{icon}</i> {groupName}
          </h2>
          <div className="reports-hub-list">
            {rows.map((r) => (
              <div className="reports-hub-row" key={r.key}>
                <span>▧</span>
                <b>{r.label}</b>
                <button
                  className={pinned[r.key] ? "pin ativo" : "pin"}
                  aria-label={pinned[r.key] ? t("unpin") : t("pin")}
                  onClick={() => togglePin(r.key)}
                >
                  ★
                </button>
                <button className="abrir" onClick={() => onNavigate(r.target)}>
                  {t("open")} →
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && <p className="reports-hub-empty">{t("empty")}</p>}
    </section>
  );
}
