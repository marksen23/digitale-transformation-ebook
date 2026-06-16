/**
 * BlogPage (/blog) — die Begegnungen nach BEREICH geordnet, mit den
 * Masterdokumenten je Bereich. Ein Masterdokument fasst die Dopplungen eines
 * Clusters zu einer dedup-freien, geordneten Synthese zusammen
 * (is_master-Eintrag, vom /api/admin/synthesize-master erzeugt).
 *
 * Aktuell sind 0 Master erzeugt → Empty-State je Bereich. Sobald ein Admin
 * synthetisiert, erscheint das Masterdokument hier oben im jeweiligen Bereich.
 *
 * Eigener position:fixed-Scroll-Container (App-Scroll-Modell) + SiteFooter.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, MONO, SERIF, SERIF_BODY, type Palette } from "@/lib/theme";
import { loadResonanzenIndexLazy, ENDPOINT_LABEL, ENDPOINT_COLOR, type ResonanzEntry } from "@/lib/resonanzenIndex";
import SiteFooter from "@/components/SiteFooter";

const ENTRIES_PER_AREA = 6;

interface Area { endpoint: string; entries: ResonanzEntry[]; masters: ResonanzEntry[]; }

export default function BlogPage() {
  const { theme } = useTheme();
  const c: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [entries, setEntries] = useState<ResonanzEntry[] | null>(null);

  useEffect(() => {
    const load = () => loadResonanzenIndexLazy().then(idx => { if (idx) setEntries(idx.entries); });
    load();
    window.addEventListener("resonanzen-index-stale", load);
    return () => window.removeEventListener("resonanzen-index-stale", load);
  }, []);

  const areas: Area[] = useMemo(() => {
    const all = entries ?? [];
    const byEp = new Map<string, ResonanzEntry[]>();
    for (const e of all) {
      const arr = byEp.get(e.endpoint) ?? [];
      arr.push(e);
      byEp.set(e.endpoint, arr);
    }
    return Array.from(byEp.entries())
      .map(([endpoint, list]) => ({
        endpoint,
        masters: list.filter(e => e.is_master),
        entries: list
          .filter(e => !e.is_master && (e.status === "approved" || e.status === "published"))
          .sort((a, b) => b.ts.localeCompare(a.ts)),
      }))
      .sort((a, b) => (b.entries.length + b.masters.length) - (a.entries.length + a.masters.length));
  }, [entries]);

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const areaId = (ep: string) => `bereich-${ep}`;
  const label: React.CSSProperties = {
    fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.16em", textTransform: "uppercase", color: c.muted,
  };

  return (
    <div
      data-scroll
      style={{
        position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
        overflowY: "auto", WebkitOverflowScrolling: "touch", background: c.void, color: c.text,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1.5rem 0" }}>
        <div style={label}>Resonanzvernunft</div>
        <h1 style={{ margin: "0.4rem 0 0.4rem", fontFamily: SERIF, fontSize: "1.9rem", color: c.textBright, lineHeight: 1.2 }}>
          Blog <span style={{ color: c.accentText }}>·</span> Nach Bereichen
        </h1>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", color: c.textDim, marginTop: 0, marginBottom: "1.2rem" }}>
          Die Begegnungen geordnet — und je Bereich das Masterdokument, das die Dopplungen
          zu einer klaren Struktur zusammenführt.
        </p>

        {!entries ? (
          <div style={{ fontFamily: SERIF, fontStyle: "italic", color: c.muted }}>lädt …</div>
        ) : (
          <>
            {/* Sprungmarken */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1.8rem" }}>
              {areas.map(a => (
                <button
                  key={a.endpoint}
                  onClick={() => jump(areaId(a.endpoint))}
                  style={{
                    fontFamily: MONO, fontSize: "0.62rem", letterSpacing: "0.06em", textTransform: "uppercase",
                    padding: "0.55rem 0.75rem", minHeight: 40, borderRadius: 5, cursor: "pointer",
                    border: `1px solid ${c.border}`, color: c.textDim, background: "none",
                  }}
                >
                  {ENDPOINT_LABEL[a.endpoint as ResonanzEntry["endpoint"]] ?? a.endpoint} ({a.entries.length + a.masters.length})
                </button>
              ))}
            </div>

            {areas.map(a => (
              <section key={a.endpoint} id={areaId(a.endpoint)} style={{ marginBottom: "2.6rem", scrollMarginTop: "1rem" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", borderBottom: `1px solid ${c.border}`, paddingBottom: "0.5rem", marginBottom: "1rem" }}>
                  <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: "1.25rem", color: ENDPOINT_COLOR[a.endpoint as ResonanzEntry["endpoint"]] }}>
                    {ENDPOINT_LABEL[a.endpoint as ResonanzEntry["endpoint"]] ?? a.endpoint}
                  </h2>
                  <span style={{ ...label }}>{a.entries.length + a.masters.length} Begegnungen</span>
                </div>

                {/* Masterdokumente */}
                {a.masters.length > 0 ? (
                  a.masters.map(m => (
                    <Link key={m.id} href={`/resonanz/${encodeURIComponent(m.id)}`} style={{ display: "block", textDecoration: "none", marginBottom: "1rem" }}>
                      <div style={{ background: c.surface, border: `1px solid ${c.accentText}`, borderRadius: 6, padding: "1rem 1.1rem" }}>
                        <div style={{ ...label, color: c.accentText, marginBottom: "0.4rem" }}>
                          ◆ Masterdokument{typeof m.variant_count === "number" ? ` · ${m.variant_count} Varianten` : ""}
                        </div>
                        <div style={{ fontFamily: SERIF_BODY, fontSize: "0.92rem", color: c.text, lineHeight: 1.6 }}>
                          {m.response.length > 360 ? m.response.slice(0, 360) + "…" : m.response}
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div style={{ border: `1px dashed ${c.border}`, borderRadius: 6, padding: "0.7rem 0.9rem", color: c.muted, fontFamily: MONO, fontSize: "0.65rem", marginBottom: "1rem" }}>
                    ◇ Noch kein Masterdokument — über das Admin-Panel synthetisierbar.
                  </div>
                )}

                {/* Neueste kuratierte Einträge */}
                {a.entries.slice(0, ENTRIES_PER_AREA).map(e => (
                  <Link
                    key={e.id}
                    href={`/resonanz/${encodeURIComponent(e.id)}`}
                    style={{ display: "block", textDecoration: "none", borderLeft: `2px solid ${c.border}`, padding: "0.6rem 0 0.6rem 0.8rem", marginBottom: "0.25rem" }}
                  >
                    <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.88rem", color: c.textDim, lineHeight: 1.45 }}>
                      {e.prompt.length > 120 ? e.prompt.slice(0, 120) + "…" : e.prompt}
                    </div>
                  </Link>
                ))}
                {a.entries.length === 0 && a.masters.length === 0 && (
                  <div style={{ fontFamily: SERIF, fontStyle: "italic", color: c.muted, fontSize: "0.85rem" }}>Noch keine kuratierten Begegnungen.</div>
                )}
              </section>
            ))}
          </>
        )}

        <SiteFooter c={c} />
      </div>
    </div>
  );
}
