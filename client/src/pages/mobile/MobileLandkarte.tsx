/**
 * MobileLandkarte — Reader-first-Design, Bereich "Landkarte": das
 * Begriffsnetz als Rückgrat, Korpus-Gravitation als Halo, werdende
 * Verbindungen gestrichelt. Alle Zahlen kommen aus LandkartePage's echten
 * Ableitungen (engagement/emerging/curatedOnly) — hier nur neu gerahmt für
 * den vollflächigen, pan/zoombaren Mobile-Screen.
 */
import { useCallback } from "react";
import { MONO, SERIF, type Palette } from "@/lib/theme";
import { EDGES, CAT_COLOR, categoryLabel, CANVAS_W, CANVAS_H, type ConceptNode } from "@/data/conceptGraph";
import type { ResonanzEntry } from "@/lib/resonanzenIndex";
import type { PromotedEdge } from "@/lib/promotedEdges";
import { useInteractiveCanvas } from "@/hooks/useInteractiveCanvas";
import MobileScreenShell from "@/pages/mobile/MobileScreenShell";

interface Emerging { a: string; b: string; count: number }
interface SelectedEmerging { other: string; count: number }

interface Props {
  C: Palette;
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
  C, navigate, allNodes, nodeById, dynamicIds, promoted, emerging, maxEmerging,
  engagement, maxEngagement, curatedOnly, setCuratedOnly,
  curatedCount, engagedCount, entriesCount, dynamicCount, promotedCount,
  selected, setSelected, selNode, selectedEntries, selectedEmerging,
}: Props) {
  const canvas = useInteractiveCanvas({ minZoom: 0.6, maxZoom: 4, initialZoom: 1, disableNodeDrag: true });

  const onNodeTap = useCallback((id: string) => {
    if (canvas.justDragged()) return;
    setSelected(selected === id ? null : id);
  }, [canvas, selected, setSelected]);

  const metrics: Array<[string, string]> = [
    [`${engagedCount} / ${allNodes.length}`, "BEGRIFFE BERÜHRT"],
    ...(dynamicCount > 0 ? [[String(dynamicCount), "NEUE BEGRIFFE"] as [string, string]] : []),
    [String(emerging.length), "WERDENDE VERBINDUNGEN"],
    [String(promotedCount), "ERHOBENE KANTEN"],
    [String(entriesCount), "ERKENNTNISSE IM BILD"],
  ];

  return (
    <MobileScreenShell C={C} title="Wissens-Landkarte" meta={`${Math.round(canvas.zoom * 100)}%`}>
      <div style={{ margin: "0 -18px" }}>
        <div style={{ padding: "0 18px 10px", fontFamily: SERIF, fontStyle: "italic", fontSize: 13, lineHeight: 1.55, color: C.textDim }}>
          Das Begriffsnetz als Rückgrat — der Korpus lagert sich an. Jeder Begriff wächst mit den Erkenntnissen, die ihn berühren; gestrichelte Linien sind werdende Verbindungen, noch nicht im Kanon.
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0 18px 10px" }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.text }}>
            {curatedOnly ? `nur gesicherte Erkenntnisse (${curatedCount})` : `alle Einträge (${entriesCount})`}
          </span>
          <button
            type="button" onClick={() => { setCuratedOnly(v => !v); setSelected(null); }}
            aria-label="Nur gesicherte Erkenntnisse"
            style={{ width: 52, height: 44, padding: 0, background: "none", border: "none", position: "relative", cursor: "pointer", flexShrink: 0 }}
          >
            <span style={{ position: "absolute", top: 7, left: 0, width: 52, height: 30, borderRadius: 15, border: `1px solid ${curatedOnly ? C.accentText : C.border}`, background: curatedOnly ? `${C.accent}1a` : "transparent" }} />
            <span style={{ position: "absolute", top: 10, left: curatedOnly ? 25 : 3, width: 22, height: 22, borderRadius: "50%", background: curatedOnly ? C.accentText : C.muted, transition: "left .16s ease" }} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 18, overflowX: "auto", padding: "0 18px 12px", borderBottom: `1px solid ${C.border}` }}>
          {metrics.map(([v, l]) => (
            <div key={l} style={{ flexShrink: 0 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 20, color: C.textBright, lineHeight: 1 }}>{v}</div>
              <div style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: "0.08em", color: C.muted, marginTop: 2, whiteSpace: "nowrap" }}>{l}</div>
            </div>
          ))}
        </div>

        <div style={{ position: "relative", height: "56vh", overflow: "hidden", background: C.deep }}>
          <svg
            {...canvas.bind}
            width="100%" height="100%" viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} preserveAspectRatio="xMidYMid meet"
            style={{ display: "block", touchAction: "none", cursor: canvas.dragging ? "grabbing" : "grab" }}
          >
            <g transform={canvas.transform}>
              {EDGES.map((ed, i) => {
                const s = nodeById.get(ed.source), t = nodeById.get(ed.target);
                if (!s || !t) return null;
                return <line key={`c${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={C.border} strokeWidth={ed.weight === "primary" ? 1.4 : 0.8} strokeOpacity={0.6} />;
              })}
              {promoted.map((e, i) => {
                const s = nodeById.get(e.source), t = nodeById.get(e.target);
                if (!s || !t) return null;
                return <line key={`p${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={C.accent} strokeWidth={1.8} strokeOpacity={0.7} />;
              })}
              {emerging.map((e, i) => {
                const s = nodeById.get(e.a), t = nodeById.get(e.b);
                if (!s || !t) return null;
                const active = selected === e.a || selected === e.b;
                const op = 0.25 + 0.55 * (e.count / maxEmerging);
                return (
                  <line key={`e${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                    stroke={C.accent} strokeWidth={active ? 2.4 : 1.2 + e.count / maxEmerging} strokeOpacity={active ? 0.95 : op}
                    strokeDasharray="4 4" />
                );
              })}
              {allNodes.map(n => {
                const eng = engagement.get(n.id) ?? 0;
                const isSel = selected === n.id;
                const isDyn = dynamicIds.has(n.id);
                const halo = eng > 0 ? n.r + 4 + 26 * (eng / maxEngagement) : 0;
                const col = CAT_COLOR[n.category];
                return (
                  <g key={n.id} style={{ cursor: "pointer" }} onClick={() => onNodeTap(n.id)}>
                    {halo > 0 && <circle cx={n.x} cy={n.y} r={halo} fill={col} opacity={0.12} />}
                    {isDyn && <circle cx={n.x} cy={n.y} r={n.r * 0.6 + 4} fill="none" stroke={C.accent} strokeWidth={1.2} strokeDasharray="3 3" opacity={0.8} />}
                    <circle cx={n.x} cy={n.y} r={Math.max(n.r * 0.6, 14)} fill={eng > 0 ? col : C.surface}
                      stroke={isSel ? C.textBright : col} strokeWidth={isSel ? 2.5 : 1} opacity={eng > 0 ? 0.92 : 0.45} />
                    {(eng > 0 || isSel || isDyn) && (
                      <text x={n.x} y={n.y + n.r * 0.6 + 12} textAnchor="middle"
                        style={{ fontFamily: SERIF, fontSize: 12 / canvas.zoom, fill: isSel ? C.textBright : (isDyn ? C.accent : C.textDim), pointerEvents: "none" }}>
                        {n.fullLabel}{eng > 0 ? ` (${eng})` : ""}{isDyn ? " ✦" : ""}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
          <div style={{ position: "absolute", left: 12, bottom: 10, fontFamily: MONO, fontSize: 8, letterSpacing: "0.06em", color: C.muted, lineHeight: 1.6, pointerEvents: "none" }}>
            HALO = GESAMMELTES WISSEN<br />GESTRICHELT = WERDENDE VERBINDUNG
          </div>
        </div>

        <div style={{ padding: "10px 18px 0" }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>Legende</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
            {(Object.keys(CAT_COLOR) as Array<keyof typeof CAT_COLOR>).map(cat => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SERIF, fontSize: 12, color: C.textDim }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: CAT_COLOR[cat], flexShrink: 0 }} />
                {categoryLabel(cat)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {selNode && (
        <div style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
          background: C.surface, borderTop: `1px solid ${C.border}`, boxShadow: "0 -8px 24px rgba(0,0,0,0.10)",
          padding: "14px 18px calc(18px + env(safe-area-inset-bottom, 0px))",
          maxHeight: "60vh", overflowY: "auto",
        }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <span style={{ width: 36, height: 3, borderRadius: 2, background: C.border, display: "block" }} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 26, color: C.textBright }}>{selNode.fullLabel}</span>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: CAT_COLOR[selNode.category], flexShrink: 0 }}>{categoryLabel(selNode.category)}</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.05em", color: C.muted, marginTop: 6 }}>
            {engagement.get(selNode.id) ?? 0} ERKENNTNISSE AN DIESEM BEGRIFF
          </div>
          <div style={{ height: 1, background: C.border, margin: "12px 0" }} />

          {selectedEmerging.length > 0 && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 7 }}>Werdende Verbindungen</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {selectedEmerging.map(e => (
                  <button
                    key={e.other} type="button" onClick={() => setSelected(e.other)}
                    style={{ minHeight: 36, padding: "0 10px", cursor: "pointer", borderRadius: 3, border: `1px dashed ${C.accent}`, background: "transparent", color: C.accentText, fontFamily: SERIF, fontSize: 12.5 }}
                  >{nodeById.get(e.other)?.fullLabel ?? e.other} · {e.count}</button>
                ))}
              </div>
            </>
          )}

          {selectedEntries.length > 0 && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 7 }}>Erkenntnisse an diesem Begriff</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {selectedEntries.slice(0, 5).map(e => (
                  <button
                    key={e.id} type="button" onClick={() => navigate(`/resonanz/${e.id}`)}
                    style={{ textAlign: "left", fontFamily: SERIF, fontStyle: "italic", fontSize: 12.5, lineHeight: 1.4, color: C.text, background: C.deep, border: `1px solid ${C.border}`, borderRadius: 4, padding: "8px 10px", cursor: "pointer" }}
                  >{e.prompt.slice(0, 90)}{e.prompt.length > 90 ? "…" : ""}</button>
                ))}
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button" onClick={() => navigate(`/begriffsnetz?node=${encodeURIComponent(selNode.id)}`)}
              style={{ flex: 1, minHeight: 46, background: "transparent", border: `1px solid ${C.accentText}`, borderRadius: 4, color: C.accentText, fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer" }}
            >Im Begriffsnetz öffnen</button>
            <button
              type="button" onClick={() => setSelected(null)}
              style={{ minHeight: 46, padding: "0 16px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.textDim, fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer" }}
            >Zurück</button>
          </div>
        </div>
      )}
    </MobileScreenShell>
  );
}
