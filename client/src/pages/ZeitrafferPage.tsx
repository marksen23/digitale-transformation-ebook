/**
 * Zeitraffer der Landkarte (/zeitraffer).
 * Slider über die echten Korpus-Tage; die Punktgröße ist die kuratierte Dichte.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, DISPLAY, MONO, SERIF, type Palette } from "@/lib/theme";
import { NODES as GRAPH_NODES, EDGES as GRAPH_EDGES, CAT_COLOR as GRAPH_COLOR, CANVAS_W as W, CANVAS_H as H, type NodeCategory } from "@/data/conceptGraph";
import { loadDynamicNodes, type DynamicConceptNode } from "@/lib/dynamicNodes";
import { loadResonanzenIndexLazy } from "@/lib/resonanzenIndex";
import { buildDensityTimeline, onOrBefore, type DensityFrame } from "@/lib/mapTimeline";
import SiteFooter from "@/components/SiteFooter";

function colorOf(category: string): string {
  return GRAPH_COLOR[category as NodeCategory] ?? "#a8a29e";
}

export default function ZeitrafferPage() {
  const { theme } = useTheme();
  const C: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [frames, setFrames] = useState<DensityFrame[] | null>(null);
  const [dynamic, setDynamic] = useState<DynamicConceptNode[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    loadResonanzenIndexLazy().then(idx => {
      setFrames(buildDensityTimeline(idx?.entries ?? []));
    });
    loadDynamicNodes().then(setDynamic);
  }, []);

  useEffect(() => {
    if (!playing || !frames || frames.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex(i => (i + 1 >= frames.length ? 0 : i + 1));
    }, 700);
    return () => window.clearInterval(timer);
  }, [playing, frames]);

  const frame = frames?.[index] ?? null;
  const nodes = useMemo(() => {
    const day = frame?.date ?? "";
    const extra = dynamic
      .filter(n => day && onOrBefore(n.createdAt, day))
      .map(n => ({ id: n.id, fullLabel: n.fullLabel, x: n.x, y: n.y, r: n.r, category: n.category, dynamic: true }));
    return [
      ...GRAPH_NODES.map(n => ({ id: n.id, fullLabel: n.fullLabel, x: n.x, y: n.y, r: n.r, category: n.category, dynamic: false })),
      ...extra,
    ];
  }, [dynamic, frame]);

  const max = useMemo(() => {
    if (!frame) return 1;
    return Math.max(1, ...Object.values(frame.counts));
  }, [frame]);

  const labeled = useMemo(() => {
    if (!frame) return new Set<string>();
    return new Set(Object.entries(frame.counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id));
  }, [frame]);

  return (
    <div data-scroll style={{
      position: "fixed", top: "var(--app-frame-h, 48px)", left: 0, right: 0, bottom: 0,
      overflowY: "auto", background: C.void, color: C.text,
    }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "1.6rem 1.4rem 0" }}>
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted }}>
          Landkarte
        </div>
        <h1 style={{ margin: "0.35rem 0", fontFamily: DISPLAY, fontSize: "1.8rem", color: C.textBright }}>Zeitraffer der Karte</h1>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.textDim, lineHeight: 1.5, maxWidth: "40rem" }}>
          Wie die Begriffe dichter wurden. Jeder Schritt ist ein Tag, an dem eine gesicherte Resonanz wirklich entstanden ist.{" "}
          <Link href="/landkarte" style={{ color: C.accentText }}>Zur Landkarte</Link>
        </p>

        {!frames ? (
          <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</p>
        ) : frames.length === 0 ? (
          <p style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>Noch keine datierten Erkenntnisse im Korpus.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: "0.8rem", alignItems: "center", flexWrap: "wrap", margin: "1rem 0" }}>
              <button
                type="button"
                onClick={() => setPlaying(v => !v)}
                style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.accentText, background: "none", border: `1px solid ${C.border}`, borderRadius: 4, padding: "0.45rem 0.7rem", cursor: "pointer", minHeight: 36 }}
              >
                {playing ? "Pause" : "Abspielen"}
              </button>
              <label style={{ flex: "1 1 16rem", display: "grid", gap: 4 }}>
                <span style={{ fontFamily: MONO, fontSize: "0.6rem", color: C.text }}>{frame?.date} · {frame?.total} Erkenntnisse</span>
                <input
                  type="range"
                  min={0}
                  max={frames.length - 1}
                  value={index}
                  aria-label="Tag im Zeitraffer"
                  onChange={ev => { setPlaying(false); setIndex(Number(ev.target.value)); }}
                />
              </label>
            </div>
            <div style={{ background: C.deep, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", height: "min(68vh, 620px)" }}>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" role="img" aria-label={`Karte am ${frame?.date ?? ""}`}>
                {GRAPH_EDGES.map((ed, i) => {
                  const s = GRAPH_NODES.find(n => n.id === ed.source);
                  const t = GRAPH_NODES.find(n => n.id === ed.target);
                  if (!s || !t) return null;
                  return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={C.border} strokeWidth={ed.weight === "primary" ? 1.4 : 0.8} strokeOpacity={0.55} />;
                })}
                {nodes.map(n => {
                  const count = frame?.counts[n.id] ?? 0;
                  const col = colorOf(n.category);
                  const halo = count > 0 ? n.r + 4 + 26 * (count / max) : 0;
                  return (
                    <g key={n.id}>
                      {halo > 0 && <circle cx={n.x} cy={n.y} r={halo} fill={col} opacity={0.14} />}
                      <circle cx={n.x} cy={n.y} r={n.r * 0.6} fill={count > 0 ? col : C.surface} stroke={col} strokeWidth={1} opacity={count > 0 ? 0.92 : 0.35} />
                      {labeled.has(n.id) && (
                        <text x={n.x} y={n.y + n.r * 0.6 + 12} textAnchor="middle" style={{ fontFamily: SERIF, fontSize: 11, fill: C.textDim }}>
                          {n.fullLabel} ({count})
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </>
        )}
        <SiteFooter c={C} />
      </div>
    </div>
  );
}
