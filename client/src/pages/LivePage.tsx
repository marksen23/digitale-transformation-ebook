/**
 * LivePage (/live) — der Live-Strom: immer das Neueste zuerst, über alle
 * Bereiche. Liest den Index (bereits ts-absteigend sortiert) und zeigt die
 * jüngsten Begegnungen. Aktualisiert sich auf das resonanzen-index-stale-Event
 * (z. B. nach Admin-Mutation oder neuem KI-Eintrag).
 *
 * Eigener position:fixed-Scroll-Container (App-Scroll-Modell) + SiteFooter.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, MONO, SERIF, type Palette } from "@/lib/theme";
import { loadResonanzenIndexLazy, ENDPOINT_LABEL, ENDPOINT_COLOR, type ResonanzEntry } from "@/lib/resonanzenIndex";
import SiteFooter from "@/components/SiteFooter";

const LIMIT = 50;

export default function LivePage() {
  const { theme } = useTheme();
  const c: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [entries, setEntries] = useState<ResonanzEntry[] | null>(null);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);

  useEffect(() => {
    const load = () => loadResonanzenIndexLazy().then(idx => { if (idx) setEntries(idx.entries); });
    load();
    window.addEventListener("resonanzen-index-stale", load);
    return () => window.removeEventListener("resonanzen-index-stale", load);
  }, []);

  // Bereiche, die tatsächlich vorkommen (für die Filter-Chips)
  const areas = useMemo(() => {
    const set = new Set<string>();
    (entries ?? []).forEach(e => set.add(e.endpoint));
    return Array.from(set);
  }, [entries]);

  const shown = useMemo(() => {
    const all = entries ?? [];
    // Index ist bereits ts-desc; defensiv erneut sortieren
    const sorted = [...all].sort((a, b) => b.ts.localeCompare(a.ts));
    const filtered = areaFilter ? sorted.filter(e => e.endpoint === areaFilter) : sorted;
    return filtered.slice(0, LIMIT);
  }, [entries, areaFilter]);

  const chip = (active: boolean): React.CSSProperties => ({
    fontFamily: MONO, fontSize: "0.62rem", letterSpacing: "0.08em", textTransform: "uppercase",
    padding: "0.5rem 0.75rem", minHeight: 40, borderRadius: 5, cursor: "pointer",
    border: `1px solid ${active ? c.accentText : c.border}`,
    color: active ? c.accentText : c.muted, background: "none",
  });

  return (
    <div
      data-scroll
      style={{
        position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
        overflowY: "auto", WebkitOverflowScrolling: "touch", background: c.void, color: c.text,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.5rem 0" }}>
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", color: c.muted }}>
          Resonanzvernunft
        </div>
        <h1 style={{ margin: "0.4rem 0 0.4rem", fontFamily: SERIF, fontSize: "1.9rem", color: c.textBright, lineHeight: 1.2 }}>
          Live <span style={{ color: c.accentText }}>·</span> Das Neueste
        </h1>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", color: c.textDim, marginTop: 0, marginBottom: "1.2rem" }}>
          Die jüngsten Begegnungen aus dem wachsenden Werk — immer das Aktuellste zuerst.
        </p>

        {areas.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1.2rem" }}>
            <button style={chip(areaFilter === null)} onClick={() => setAreaFilter(null)}>alle</button>
            {areas.map(a => (
              <button key={a} style={chip(areaFilter === a)} onClick={() => setAreaFilter(a)}>
                {ENDPOINT_LABEL[a as ResonanzEntry["endpoint"]] ?? a}
              </button>
            ))}
          </div>
        )}

        {!entries ? (
          <div style={{ fontFamily: SERIF, fontStyle: "italic", color: c.muted }}>lädt …</div>
        ) : shown.length === 0 ? (
          <div style={{ fontFamily: SERIF, fontStyle: "italic", color: c.muted }}>Noch keine Begegnungen in diesem Bereich.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {shown.map(e => (
              <Link
                key={e.id}
                href={`/resonanz/${encodeURIComponent(e.id)}`}
                style={{
                  display: "block", textDecoration: "none",
                  background: c.surface, border: `1px solid ${c.border}`, borderRadius: 5,
                  padding: "0.7rem 0.9rem", transition: "border-color 0.15s",
                }}
                onMouseEnter={ev => { ev.currentTarget.style.borderColor = c.accentText; }}
                onMouseLeave={ev => { ev.currentTarget.style.borderColor = c.border; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <span style={{ fontFamily: MONO, fontSize: "0.52rem", letterSpacing: "0.12em", textTransform: "uppercase", color: ENDPOINT_COLOR[e.endpoint] }}>
                    {ENDPOINT_LABEL[e.endpoint] ?? e.endpoint}
                  </span>
                  <time style={{ fontFamily: MONO, fontSize: "0.52rem", color: c.muted, flexShrink: 0 }}>
                    {new Date(e.ts).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" })}
                  </time>
                </div>
                <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.92rem", color: c.text, lineHeight: 1.45 }}>
                  {e.prompt.length > 140 ? e.prompt.slice(0, 140) + "…" : e.prompt}
                </div>
              </Link>
            ))}
          </div>
        )}

        <SiteFooter c={c} />
      </div>
    </div>
  );
}
