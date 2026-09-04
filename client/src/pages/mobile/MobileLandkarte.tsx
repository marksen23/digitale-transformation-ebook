/**
 * MobileLandkarte — vollflächig, pan/zoom, Bottom-Sheet-Auswahl.
 *
 * Layout: Flex-Spalte (kein MobileScreenShell) damit das Canvas flex:1
 * den echten Rest-Platz füllt statt eine fixe 56vh-Box zu sein.
 * Der selektierte Knoten erscheint in einem Bottom-Sheet mit CSS-Transition.
 */
import { useCallback, useMemo, useRef } from "react";
import { MONO, SERIF, type Palette } from "@/lib/theme";
import {
  EDGES, CAT_COLOR, categoryLabel, CANVAS_W, CANVAS_H, type ConceptNode,
} from "@/data/conceptGraph";
import type { ResonanzEntry } from "@/lib/resonanzenIndex";
import type { PromotedEdge } from "@/lib/promotedEdges";
import { useInteractiveCanvas } from "@/hooks/useInteractiveCanvas";
import { toggleGlobalTheme } from "@/lib/globalTheme";

interface Emerging { a: string; b: string; count: number }
interface SelectedEmerging { other: string; count: number }

interface Props {
  C: Palette;
  isDark: boolean;
  navigate: (to: string) => void;
  allNodes: ConceptNode[];
  nodeById: Map<string, ConceptNode>;
  dynamicIds: Set<string>;
  promoted: PromotedEdge[];
  emerging: Emerging[];
  maxEmerging: number;
  engagement: Map<string, number>;
  maxEngagement: number;
  curatedOnly: boolean;
  setCuratedOnly: (fn: (v: boolean) => boolean) => void;
  curatedCount: number;
  engagedCount: number;
  entriesCount: number;
  dynamicCount: number;
  promotedCount: number;
  selected: string | null;
  setSelected: (id: string | null) => void;
  selNode: ConceptNode | null | undefined;
  selectedEntries: ResonanzEntry[];
  selectedEmerging: SelectedEmerging[];
}

export default function MobileLandkarte({
  C, isDark, navigate, allNodes, nodeById, dynamicIds, promoted, emerging, maxEmerging,
  engagement, maxEngagement, curatedOnly, setCuratedOnly,
  curatedCount, engagedCount, entriesCount, dynamicCount, promotedCount,
  selected, setSelected, selNode, selectedEntries, selectedEmerging,
}: Props) {
  const canvas = useInteractiveCanvas({ minZoom: 0.35, maxZoom: 5, initialZoom: 1, disableNodeDrag: true });

  // Letzten selektierten Knoten für die Sheet-Schließ-Animation cachen:
  // Damit der Inhalt sichtbar bleibt während das Sheet herausglitten.
  const lastSelNode = useRef<ConceptNode | null | undefined>(null);
  const lastEntries = useRef<ResonanzEntry[]>([]);
  const lastEmerging = useRef<SelectedEmerging[]>([]);
  if (selNode) {
    lastSelNode.current = selNode;
    lastEntries.current = selectedEntries;
    lastEmerging.current = selectedEmerging;
  }
  const sheetNode = lastSelNode.current;
  const sheetEntries = lastEntries.current;
  const sheetEmerging = lastEmerging.current;

  // Nur die am stärksten berührten Begriffe + der aktuelle Selektion
  // erhalten sichtbare Labels — reduziert Überfrachtung auf dem kleinen Screen.
  const labelSet = useMemo(() => {
    const top = Array.from(engagement.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => id);
    const s = new Set(top);
    if (selected) s.add(selected);
    return s;
  }, [engagement, selected]);

  const onNodeTap = useCallback((id: string) => {
    if (canvas.justDragged()) return;
    setSelected(selected === id ? null : id);
  }, [canvas, selected, setSelected]);

  const metrics: Array<[string, string]> = [
    [`${engagedCount}/${allNodes.length}`, "Begriffe"],
    ...(dynamicCount > 0 ? [[String(dynamicCount), "Neu"] as [string, string]] : []),
    [String(emerging.length), "Werdend"],
    [String(promotedCount), "Erhoben"],
    [String(entriesCount), "Erkenntnisse"],
  ];

  const sheetOpen = !!selNode;

  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex", flexDirection: "column",
      background: C.void, color: C.text,
      paddingTop: "env(safe-area-inset-top, 0px)",
    }}>
      {/* ── Header ── */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
        padding: "8px 10px", borderBottom: `1px solid ${C.border}`,
      }}>
        <button
          type="button" aria-label="Zurück"
          onClick={() => window.history.back()}
          style={{ minWidth: 44, minHeight: 44, background: "none", border: "none", color: C.textDim, fontFamily: MONO, fontSize: 18, cursor: "pointer", padding: 0 }}
        >‹</button>
        <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.28em", textTransform: "uppercase", color: C.accentText }}>
          WISSENS-LANDKARTE
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.muted }}>{Math.round(canvas.zoom * 100)}%</span>
          <button
            type="button" aria-label={isDark ? "Hell-Modus" : "Dunkel-Modus"}
            onClick={() => toggleGlobalTheme()}
            style={{ minWidth: 44, minHeight: 44, background: "none", border: "none", color: C.accentText, fontFamily: MONO, fontSize: 15, cursor: "pointer" }}
          >{isDark ? "☉" : "☾"}</button>
        </div>
      </div>

      {/* ── Steuerleiste ── */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
        padding: "6px 14px", borderBottom: `1px solid ${C.border}`,
        overflowX: "auto", WebkitOverflowScrolling: "touch",
      }}>
        {/* Toggle */}
        <button
          type="button" aria-label="Nur gesicherte Erkenntnisse"
          onClick={() => { setCuratedOnly(v => !v); setSelected(null); }}
          style={{ display: "flex", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}
        >
          <span style={{ position: "relative", width: 44, height: 26, flexShrink: 0 }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: 13, border: `1px solid ${curatedOnly ? C.accentText : C.border}`, background: curatedOnly ? `${C.accent}1a` : "transparent", transition: "background .16s,border-color .16s" }} />
            <span style={{ position: "absolute", top: 3, left: curatedOnly ? 20 : 3, width: 20, height: 20, borderRadius: "50%", background: curatedOnly ? C.accentText : C.muted, transition: "left .16s ease" }} />
          </span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, whiteSpace: "nowrap" }}>
            {curatedOnly ? `gesichert (${curatedCount})` : `alle (${entriesCount})`}
          </span>
        </button>

        <span style={{ width: 1, height: 18, background: C.border, flexShrink: 0 }} />

        {/* Metriken */}
        {metrics.map(([v, l]) => (
          <div key={l} style={{ flexShrink: 0, textAlign: "center" }}>
            <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 17, color: C.textBright, lineHeight: 1 }}>{v}</div>
            <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: "0.06em", color: C.muted, whiteSpace: "nowrap", marginTop: 1 }}>{l.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* ── Karte ── */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", background: C.deep }}>
        <svg
          {...canvas.bind}
          width="100%" height="100%"
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          preserveAspectRatio="xMidYMid meet"
          role="group" aria-roledescription="Wissens-Landkarte"
          style={{ display: "block", touchAction: "none", cursor: canvas.dragging ? "grabbing" : "grab" }}
        >
          <g transform={canvas.transform}>
            {/* Kanonische Kanten */}
            {EDGES.map((ed, i) => {
              const s = nodeById.get(ed.source), t = nodeById.get(ed.target);
              if (!s || !t) return null;
              return (
                <line key={`c${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke={C.border} strokeWidth={ed.weight === "primary" ? 1.4 : 0.8} strokeOpacity={0.6} />
              );
            })}
            {/* Erhobene Kanten */}
            {promoted.map((e, i) => {
              const s = nodeById.get(e.source), t = nodeById.get(e.target);
              if (!s || !t) return null;
              return (
                <line key={`p${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke={C.accent} strokeWidth={1.8} strokeOpacity={0.7} />
              );
            })}
            {/* Werdende Verbindungen */}
            {emerging.map((e, i) => {
              const s = nodeById.get(e.a), t = nodeById.get(e.b);
              if (!s || !t) return null;
              const active = selected === e.a || selected === e.b;
              const op = 0.25 + 0.55 * (e.count / maxEmerging);
              return (
                <line key={`e${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke={C.accent}
                  strokeWidth={active ? 2.4 : 1.2 + e.count / maxEmerging}
                  strokeOpacity={active ? 0.95 : op}
                  strokeDasharray="4 4" />
              );
            })}
            {/* Knoten */}
            {allNodes.map(n => {
              const eng = engagement.get(n.id) ?? 0;
              const isSel = selected === n.id;
              const isDyn = dynamicIds.has(n.id);
              const halo = eng > 0 ? n.r + 4 + 26 * (eng / maxEngagement) : 0;
              const visR = Math.max(n.r * 0.6, 10);
              const touchR = Math.max(visR, 22);
              const col = CAT_COLOR[n.category];
              const showLabel = labelSet.has(n.id);
              return (
                <g key={n.id} onClick={() => onNodeTap(n.id)} style={{ cursor: "pointer" }}>
                  {halo > 0 && <circle cx={n.x} cy={n.y} r={halo} fill={col} opacity={0.12} />}
                  {isDyn && (
                    <circle cx={n.x} cy={n.y} r={visR + 5} fill="none"
                      stroke={C.accent} strokeWidth={1.2} strokeDasharray="3 3" opacity={0.8} />
                  )}
                  <circle cx={n.x} cy={n.y} r={visR}
                    fill={eng > 0 ? col : C.surface}
                    stroke={isSel ? C.textBright : col}
                    strokeWidth={isSel ? 2.5 : 1}
                    opacity={eng > 0 ? 0.92 : 0.45} />
                  {/* Größerer unsichtbarer Touch-Bereich */}
                  <circle cx={n.x} cy={n.y} r={touchR} fill="transparent" />
                  {showLabel && (
                    <text
                      x={n.x} y={n.y + visR + 12}
                      textAnchor="middle"
                      style={{
                        fontFamily: SERIF,
                        fontSize: 12 / canvas.zoom,
                        fill: isSel ? C.textBright : (isDyn ? C.accent : C.textDim),
                        pointerEvents: "none",
                      }}
                    >
                      {n.fullLabel}{eng > 0 ? ` (${eng})` : ""}{isDyn ? " ✦" : ""}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Zoom-Buttons */}
        <div style={{ position: "absolute", right: 12, bottom: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          {([["＋", 1.35], ["－", 1 / 1.35]] as [string, number][]).map(([label, factor]) => (
            <button key={label} type="button" aria-label={label}
              onClick={() => canvas.zoomBy(factor)}
              style={{
                width: 40, height: 40, borderRadius: 8,
                background: C.surface, border: `1px solid ${C.border}`,
                color: C.text, fontFamily: MONO, fontSize: 18, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              }}
            >{label}</button>
          ))}
        </div>

        {/* Legende (Overlay, unten links) */}
        <div style={{
          position: "absolute", left: 10, bottom: 12,
          display: "flex", flexDirection: "column", gap: 4,
          background: `${C.surface}cc`, backdropFilter: "blur(6px)",
          borderRadius: 6, padding: "6px 8px",
          border: `1px solid ${C.border}`,
        }}>
          {(Object.keys(CAT_COLOR) as Array<keyof typeof CAT_COLOR>).map(cat => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: CAT_COLOR[cat], flexShrink: 0 }} />
              <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: "0.06em", color: C.muted, whiteSpace: "nowrap" }}>
                {categoryLabel(cat)}
              </span>
            </div>
          ))}
          <div style={{ height: 1, background: C.border, margin: "2px 0" }} />
          <div style={{ fontFamily: MONO, fontSize: 6.5, color: C.muted, lineHeight: 1.5 }}>
            HALO = WISSEN<br />
            ╌ = WERDEND
          </div>
        </div>

        {/* Hinweis wenn kein Begriff gewählt */}
        {!selected && (
          <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }}>
            <span style={{
              fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.1em", color: C.muted,
              background: `${C.surface}cc`, backdropFilter: "blur(4px)",
              padding: "4px 10px", borderRadius: 20, border: `1px solid ${C.border}`,
              whiteSpace: "nowrap",
            }}>
              Begriff antippen zum Öffnen
            </span>
          </div>
        )}
      </div>

      {/* ── Bottom Sheet (immer im DOM für Transition) ── */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50,
        transform: sheetOpen ? "translateY(0)" : "translateY(110%)",
        transition: "transform 0.24s cubic-bezier(0.32,0.72,0,1)",
        background: C.surface,
        borderTop: `1.5px solid ${C.border}`,
        borderRadius: "14px 14px 0 0",
        boxShadow: "0 -6px 32px rgba(0,0,0,0.18)",
        maxHeight: "52vh",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {/* Drag-Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px", flexShrink: 0 }}>
          <span style={{ width: 36, height: 3, borderRadius: 2, background: C.border, display: "block" }} />
        </div>

        {sheetNode && (
          <div style={{ padding: "0 16px 20px" }}>
            {/* Knoten-Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 24, color: C.textBright, lineHeight: 1.15, wordBreak: "break-word" }}>
                  {sheetNode.fullLabel}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: CAT_COLOR[sheetNode.category], marginTop: 4 }}>
                  {categoryLabel(sheetNode.category)}
                </div>
              </div>
              <button
                type="button" aria-label="Schließen"
                onClick={() => setSelected(null)}
                style={{ minWidth: 44, minHeight: 44, background: "none", border: "none", color: C.textDim, fontSize: 22, cursor: "pointer", padding: 0, flexShrink: 0, marginLeft: 4 }}
              >×</button>
            </div>

            <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.muted, marginBottom: 10, letterSpacing: "0.06em" }}>
              {engagement.get(sheetNode.id) ?? 0} ERKENNTNISSE AN DIESEM BEGRIFF
            </div>

            {sheetNode.description && (
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13, color: C.textDim, lineHeight: 1.5, margin: "0 0 12px" }}>
                {sheetNode.description}
              </p>
            )}

            <div style={{ height: 1, background: C.border, marginBottom: 12 }} />

            {/* Werdende Verbindungen */}
            {sheetEmerging.length > 0 && (
              <section style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>
                  Werdende Verbindungen
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {sheetEmerging.map(e => (
                    <button
                      key={e.other} type="button"
                      onClick={() => setSelected(e.other)}
                      style={{
                        minHeight: 36, padding: "0 11px", cursor: "pointer",
                        borderRadius: 4, border: `1px dashed ${C.accent}`,
                        background: "transparent", color: C.accentText,
                        fontFamily: SERIF, fontSize: 13,
                      }}
                    >
                      {nodeById.get(e.other)?.fullLabel ?? e.other} · {e.count}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Erkenntnisse */}
            {sheetEntries.length > 0 && (
              <section style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>
                  Erkenntnisse ({sheetEntries.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sheetEntries.slice(0, 5).map(e => (
                    <button
                      key={e.id} type="button"
                      onClick={() => navigate(`/resonanz/${e.id}`)}
                      style={{
                        textAlign: "left", fontFamily: SERIF, fontStyle: "italic",
                        fontSize: 13, lineHeight: 1.45, color: C.text,
                        background: C.deep, border: `1px solid ${C.border}`,
                        borderRadius: 5, padding: "9px 11px", cursor: "pointer",
                      }}
                    >
                      {e.prompt.slice(0, 85)}{e.prompt.length > 85 ? "…" : ""}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Aktionen */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => navigate(`/begriffsnetz?node=${encodeURIComponent(sheetNode.id)}`)}
                style={{
                  flex: 1, minHeight: 48, background: "transparent",
                  border: `1px solid ${C.accentText}`, borderRadius: 6,
                  color: C.accentText, fontFamily: MONO, fontSize: 10,
                  letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer",
                }}
              >Im Begriffsnetz öffnen</button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                style={{
                  minHeight: 48, padding: "0 16px",
                  background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.textDim, fontFamily: MONO, fontSize: 10,
                  letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer",
                }}
              >Zurück</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
