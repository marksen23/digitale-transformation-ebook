/**
 * LandkartePage (/landkarte) — Wissens-Landkarte (Roadmap „Das wachsende
 * Werk", Phase 4).
 *
 * Macht den wachsenden Korpus über dem Begriffsnetz lesbar. Das Begriffsnetz
 * ist das stabile, menschlich-autorisierte Rückgrat (Ground Truth neben dem
 * Werktext); der Korpus lagert sich an:
 *
 *   1. Korpus-Gravitation — jeder Begriff wächst mit der Zahl der
 *      Erkenntnisse, die ihn berühren (Eintrag.nodeIds).
 *   2. Werdende Verbindungen — Begriffspaare, die Erkenntnisse GEMEINSAM
 *      berühren, aber noch KEINE kanonische Kante sind (gestrichelt). Das
 *      ist die sichtbare Entwicklung des Netzes: Entdeckung, bevor sie in
 *      den Kanon erhoben wird (Phase 5).
 *
 * Rein client-seitig: liest resonanzen-index.json (nodeIds) + den
 * Begriffsgraph. Keine neue Server-Berechnung.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { SERIF, MONO, C_DARK, C_LIGHT, type Palette } from "@/lib/theme";
import {
  NODES, EDGES, CAT_COLOR, categoryLabel, CANVAS_W, CANVAS_H,
  type ConceptNode, type NodeCategory,
} from "@/data/conceptGraph";
import { loadResonanzenIndexLazy, type ResonanzEntry } from "@/lib/resonanzenIndex";
import { loadPromotedEdges, invalidatePromotedEdges, type PromotedEdge } from "@/lib/promotedEdges";
import { loadDynamicNodes, type DynamicConceptNode } from "@/lib/dynamicNodes";
import { useAdminAuth, callAdminAction } from "@/lib/adminAuth";
import SectionLabel from "@/components/SectionLabel";

const CURATED = new Set(["approved", "published"]);
const MIN_CO = 2;  // Min. gemeinsame Erkenntnisse, damit eine Verbindung „wird".

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export default function LandkartePage() {
  const { theme } = useTheme();
  const C: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [, navigate] = useLocation();

  const [allEntries, setAllEntries] = useState<ResonanzEntry[] | null>(null);
  const [curatedOnly, setCuratedOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [promoted, setPromoted] = useState<PromotedEdge[]>([]);
  const [dynamic, setDynamic] = useState<DynamicConceptNode[]>([]);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [promoteMsg, setPromoteMsg] = useState<string | null>(null);
  const { state: adminState } = useAdminAuth();
  const isAdmin = adminState === "ok";

  useEffect(() => {
    loadResonanzenIndexLazy().then(idx => idx && setAllEntries(idx.entries));
    loadPromotedEdges().then(setPromoted);
    loadDynamicNodes().then(setDynamic);
  }, []);

  // Statische + dynamische (in den Kanon erhobene) Begriffe mergen.
  const dynamicIds = useMemo(() => new Set(dynamic.map(d => d.id)), [dynamic]);
  const allNodes = useMemo<ConceptNode[]>(() => [
    ...NODES,
    ...dynamic.map(d => ({
      id: d.id, label: d.label, fullLabel: d.fullLabel, description: d.description,
      category: d.category as NodeCategory, x: d.x, y: d.y, r: d.r,
    })),
  ], [dynamic]);

  // Erhobene Kanten als Paar-Set — für „bereits kanonisch"-Ausschluss.
  const promotedPairs = useMemo(() => {
    const s = new Set<string>();
    for (const e of promoted) s.add(pairKey(e.source, e.target));
    return s;
  }, [promoted]);

  async function handlePromote(a: string, b: string, evidence: number) {
    const key = pairKey(a, b);
    setPromoting(key);
    setPromoteMsg(null);
    const r = await callAdminAction("promote-edge", { source: a, target: b, evidence });
    setPromoting(null);
    if (r.ok) {
      setPromoteMsg(`„${nodeById.get(a)?.fullLabel ?? a} — ${nodeById.get(b)?.fullLabel ?? b}" in den Kanon erhoben.`);
      invalidatePromotedEdges();
      loadPromotedEdges().then(setPromoted);
    } else {
      setPromoteMsg(`Fehler: ${r.error ?? "unbekannt"}`);
    }
  }

  const nodeById = useMemo(() => new Map<string, ConceptNode>(allNodes.map(n => [n.id, n])), [allNodes]);

  const curatedCount = useMemo(
    () => (allEntries ?? []).filter(e => CURATED.has(e.status)).length,
    [allEntries],
  );

  const entries = useMemo(() => {
    if (!allEntries) return [];
    return curatedOnly ? allEntries.filter(e => CURATED.has(e.status)) : allEntries;
  }, [allEntries, curatedOnly]);

  // Korpus-Gravitation: wie viele Erkenntnisse berühren jeden Begriff.
  const engagement = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) {
      for (const id of Array.from(new Set(e.nodeIds ?? []))) {
        if (nodeById.has(id)) m.set(id, (m.get(id) ?? 0) + 1);
      }
    }
    return m;
  }, [entries, nodeById]);
  const maxEngagement = useMemo(() => Math.max(1, ...Array.from(engagement.values())), [engagement]);

  const canonicalPairs = useMemo(() => {
    const s = new Set<string>();
    for (const ed of EDGES) s.add(pairKey(ed.source, ed.target));
    return s;
  }, []);

  // Werdende Verbindungen: Begriffspaare, die Erkenntnisse gemeinsam berühren
  // und noch keine kanonische Kante sind.
  const emerging = useMemo(() => {
    const co = new Map<string, number>();
    for (const e of entries) {
      const ids = Array.from(new Set((e.nodeIds ?? []).filter(id => nodeById.has(id))));
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const k = pairKey(ids[i], ids[j]);
          if (canonicalPairs.has(k) || promotedPairs.has(k)) continue;
          co.set(k, (co.get(k) ?? 0) + 1);
        }
      }
    }
    return Array.from(co.entries())
      .filter(([, n]) => n >= MIN_CO)
      .map(([k, n]) => { const [a, b] = k.split("|"); return { a, b, count: n }; })
      .sort((x, y) => y.count - x.count);
  }, [entries, canonicalPairs, promotedPairs, nodeById]);
  const maxEmerging = useMemo(() => Math.max(1, ...emerging.map(e => e.count)), [emerging]);

  const engagedCount = engagement.size;

  // Einträge + werdende Verbindungen für den ausgewählten Knoten.
  const selectedEntries = useMemo(() => {
    if (!selected) return [];
    return entries.filter(e => (e.nodeIds ?? []).includes(selected)).slice(0, 12);
  }, [selected, entries]);
  const selectedEmerging = useMemo(() => {
    if (!selected) return [];
    return emerging
      .filter(e => e.a === selected || e.b === selected)
      .map(e => ({ other: e.a === selected ? e.b : e.a, count: e.count }));
  }, [selected, emerging]);

  if (!allEntries) {
    return <div style={{ padding: "2rem", fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</div>;
  }

  const selNode = selected ? nodeById.get(selected) : null;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem", color: C.text, fontFamily: SERIF }}>
      <header style={{ marginBottom: "1rem", borderBottom: `1px solid ${C.border}`, paddingBottom: "1rem" }}>
        <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: "1.7rem", color: C.textBright }}>Wissens-Landkarte</h1>
        <p style={{ marginTop: "0.4rem", fontFamily: SERIF, fontStyle: "italic", color: C.textDim, fontSize: "0.95rem", lineHeight: 1.55, maxWidth: "44rem" }}>
          Das Begriffsnetz als Rückgrat — der Korpus lagert sich an. Jeder Begriff wächst mit den
          Erkenntnissen, die ihn berühren. <strong>Gestrichelte</strong> Linien sind <em>werdende
          Verbindungen</em>: Begriffe, die Erkenntnisse gemeinsam berühren, aber noch keine
          kanonische Kante des Netzes sind — Entdeckung, bevor sie in den Kanon erhoben wird.
        </p>
      </header>

      {/* Steuerung + Statistik */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.7rem 1.2rem", alignItems: "center", marginBottom: "1rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.05em", color: C.text, cursor: "pointer" }}>
          <input type="checkbox" checked={curatedOnly} onChange={() => { setCuratedOnly(v => !v); setSelected(null); }} />
          nur gesicherte Erkenntnisse ({curatedCount})
        </label>
        <Metric C={C} label="Begriffe berührt" value={`${engagedCount} / ${allNodes.length}`} />
        {dynamic.length > 0 && <Metric C={C} label="neue Begriffe" value={dynamic.length} />}
        <Metric C={C} label="werdende Verbindungen" value={emerging.length} />
        <Metric C={C} label="erhobene Kanten" value={promoted.length} />
        <Metric C={C} label="Erkenntnisse im Bild" value={entries.length} />
      </div>

      {promoteMsg && (
        <div style={{ marginBottom: "1rem", padding: "0.5rem 0.8rem", background: `${C.accent}14`, borderLeft: `3px solid ${C.accent}`, fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: C.text }}>
          {promoteMsg}
        </div>
      )}

      {!curatedOnly && curatedCount < 10 && (
        <div style={{ marginBottom: "1rem", padding: "0.5rem 0.8rem", background: `${C.accent}10`, borderLeft: `3px solid ${C.accentDim}`, fontFamily: SERIF, fontStyle: "italic", fontSize: "0.82rem", color: C.textDim, lineHeight: 1.5 }}>
          Zeigt aktuell <strong>alle</strong> Einträge (auch ungeprüfte) — der kuratierte Korpus reift noch
          ({curatedCount} gesichert). Die Erhebung werdender Verbindungen in den Kanon (Phase 5) nutzt
          ausschließlich gesicherte Erkenntnisse.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: "1.5rem", alignItems: "start" }}>
        {/* ── Karte ── */}
        <div style={{ background: C.deep, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
          <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} width="100%" height="auto" preserveAspectRatio="xMidYMid meet"
            role="group" aria-roledescription="Wissens-Landkarte"
            aria-label="Wissens-Landkarte — Begriffe als Konstellation, Größe nach gesammelten Erkenntnissen. Begriffe lassen sich anklicken; die Liste rechts bietet eine textuelle Alternative."
            style={{ display: "block" }}>
            {/* Kanonische Kanten (stabiles Rückgrat) */}
            {EDGES.map((ed, i) => {
              const s = nodeById.get(ed.source); const t = nodeById.get(ed.target);
              if (!s || !t) return null;
              return (
                <line key={`c${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke={C.border} strokeWidth={ed.weight === "primary" ? 1.4 : 0.8} strokeOpacity={0.6} />
              );
            })}
            {/* Erhobene Kanten (Phase 5b) — in den Kanon gewachsen: solide,
                Akzent, etwas kräftiger als das statische Rückgrat. */}
            {promoted.map((e, i) => {
              const s = nodeById.get(e.source); const t = nodeById.get(e.target);
              if (!s || !t) return null;
              return (
                <line key={`p${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke={C.accent} strokeWidth={1.8} strokeOpacity={0.7} />
              );
            })}
            {/* Werdende Verbindungen (gestrichelt, Akzent) */}
            {emerging.map((e, i) => {
              const s = nodeById.get(e.a); const t = nodeById.get(e.b);
              if (!s || !t) return null;
              const op = 0.25 + 0.55 * (e.count / maxEmerging);
              const active = selected === e.a || selected === e.b;
              return (
                <line key={`e${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke={C.accent} strokeWidth={active ? 2.2 : 1.2 + (e.count / maxEmerging)} strokeOpacity={active ? 0.95 : op}
                  strokeDasharray="4 4" />
              );
            })}
            {/* Knoten (statisch + dynamisch). Neue Begriffe (Phase 5c) erhalten
                einen gestrichelten Ring als Markierung des Netz-Wachstums. */}
            {allNodes.map(n => {
              const eng = engagement.get(n.id) ?? 0;
              const isSel = selected === n.id;
              const isDyn = dynamicIds.has(n.id);
              const halo = eng > 0 ? n.r + 4 + 26 * (eng / maxEngagement) : 0;
              const col = CAT_COLOR[n.category];
              return (
                <g key={n.id} style={{ cursor: "pointer" }} onClick={() => setSelected(isSel ? null : n.id)}>
                  {halo > 0 && <circle cx={n.x} cy={n.y} r={halo} fill={col} opacity={0.12} />}
                  {isDyn && (
                    <circle cx={n.x} cy={n.y} r={n.r * 0.6 + 4} fill="none"
                      stroke={C.accent} strokeWidth={1.2} strokeDasharray="3 3" opacity={0.8} />
                  )}
                  <circle cx={n.x} cy={n.y} r={n.r * 0.6}
                    fill={eng > 0 ? col : C.surface}
                    stroke={isSel ? C.textBright : col} strokeWidth={isSel ? 2.5 : 1}
                    opacity={eng > 0 ? 0.92 : 0.45} />
                  {(eng > 0 || isSel || isDyn) && (
                    <text x={n.x} y={n.y + n.r * 0.6 + 11} textAnchor="middle"
                      style={{ fontFamily: SERIF, fontSize: 11, fill: isSel ? C.textBright : (isDyn ? C.accent : C.textDim), pointerEvents: "none" }}>
                      {n.fullLabel}{eng > 0 ? ` (${eng})` : ""}{isDyn ? " ✦" : ""}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* ── Seitenpanel ── */}
        <div>
          {selNode ? (
            <div>
              <SectionLabel c={C} size="sm" tracking="open" variant="arbeit">{categoryLabel(selNode.category)}</SectionLabel>
              <h2 style={{ margin: "0.3rem 0 0.2rem", fontFamily: SERIF, fontSize: "1.25rem", color: C.textBright }}>{selNode.fullLabel}</h2>
              <p style={{ margin: 0, fontFamily: SERIF, fontStyle: "italic", fontSize: "0.82rem", color: C.textDim, lineHeight: 1.5 }}>{selNode.description}</p>
              <button onClick={() => navigate(`/begriffsnetz?focus=${selNode.id}`)} style={linkBtn(C)}>im Begriffsnetz öffnen →</button>

              {selectedEmerging.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: "0.35rem" }}>Werdende Verbindungen</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    {selectedEmerging.map(c => {
                      const key = pairKey(selNode.id, c.other);
                      return (
                        <div key={c.other} style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexWrap: "wrap" }}>
                          <button onClick={() => setSelected(c.other)} style={{ fontFamily: SERIF, fontSize: "0.78rem", color: C.accentText, background: "none", border: `1px dashed ${C.accent}`, borderRadius: 3, padding: "0.25rem 0.5rem", cursor: "pointer" }}>
                            {nodeById.get(c.other)?.fullLabel ?? c.other} · {c.count}
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => void handlePromote(selNode.id, c.other, c.count)}
                              disabled={promoting === key}
                              title="Diese werdende Verbindung in den Kanon erheben (server-persistiert)"
                              style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.06em", textTransform: "uppercase", color: C.void, background: C.accent, border: "none", borderRadius: 3, padding: "0.25rem 0.45rem", cursor: promoting === key ? "wait" : "pointer", opacity: promoting === key ? 0.6 : 1 }}
                            >
                              {promoting === key ? "…" : "↑ erheben"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ marginTop: "1rem" }}>
                <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: "0.35rem" }}>
                  Erkenntnisse an diesem Begriff ({selectedEntries.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {selectedEntries.map(e => (
                    <button key={e.id} onClick={() => navigate(`/resonanz/${e.id}`)} style={{ textAlign: "left", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.8rem", color: C.text, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, padding: "0.4rem 0.55rem", cursor: "pointer", lineHeight: 1.4 }}>
                      {e.prompt.slice(0, 90)}{e.prompt.length > 90 ? "…" : ""}
                    </button>
                  ))}
                  {selectedEntries.length === 0 && (
                    <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.8rem", color: C.muted }}>Noch keine Erkenntnisse an diesem Begriff.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <SectionLabel c={C} size="sm" tracking="open">Legende</SectionLabel>
              <p style={{ marginTop: "0.3rem", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.82rem", color: C.textDim, lineHeight: 1.5 }}>
                Klicke einen Begriff, um seine Erkenntnisse und werdenden Verbindungen zu sehen. Die Halo-Größe zeigt, wie viel Wissen sich gesammelt hat.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.6rem" }}>
                {(Object.keys(CAT_COLOR) as Array<keyof typeof CAT_COLOR>).map(cat => (
                  <div key={cat} style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontFamily: SERIF, fontSize: "0.78rem", color: C.textDim }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: CAT_COLOR[cat], flexShrink: 0 }} />
                    {categoryLabel(cat)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ C, label, value }: { C: Palette; label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontFamily: SERIF, fontSize: "1.05rem", color: C.textBright, lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontFamily: MONO, fontSize: "0.48rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>{label}</span>
    </div>
  );
}

function linkBtn(C: Palette): React.CSSProperties {
  return {
    marginTop: "0.6rem", fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
    color: C.accentText, background: "none", border: `1px solid ${C.accentDim}`,
    padding: "0.4rem 0.6rem", cursor: "pointer", borderRadius: 3, minHeight: 32,
  };
}
