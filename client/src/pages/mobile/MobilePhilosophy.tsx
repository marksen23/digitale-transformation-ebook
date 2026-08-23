/**
 * MobilePhilosophy — Reader-first-Design, Bereich "Philosophie": ein
 * einziger Verortungs-Scroll statt des 7-Modus-Desktop-Explorers — Pfad zur
 * Resonanzvernunft (Zeitstrahl), Traditionen (Zeitspannen-Balken), alle 25
 * Philosophen gruppiert. Tippen öffnet dasselbe BottomSheet + PhilosopherDetail
 * wie der Desktop-Mobile-Modus — nichts davon wird neu gebaut.
 */
import { useEffect, useMemo, useState } from "react";
import { useEbookTheme } from "@/hooks/useEbookTheme";
import { C_DARK, C_LIGHT, MONO, SERIF } from "@/lib/theme";
import {
  TRADITIONS, PHILOSOPHERS, RESONANZVERNUNFT_PFAD,
  getPhilosopher, getTradition, POSITION_LABEL,
  type Philosopher, type Tradition,
} from "@/data/philosophyMap";
import { BottomSheet } from "@/pages/philosophy/views";
import MobileScreenShell from "@/pages/mobile/MobileScreenShell";

const SPAN_FROM = 1620, SPAN_TO = 2030;
const yr = (y: number) => ((y - SPAN_FROM) / (SPAN_TO - SPAN_FROM)) * 100;

export default function MobilePhilosophy() {
  const isDark = useEbookTheme();
  const C = isDark ? C_DARK : C_LIGHT;

  const initialId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const id = new URLSearchParams(window.location.search).get("id");
    return id && getPhilosopher(id) ? id : null;
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  useEffect(() => { if (selectedId) setSheetExpanded(true); }, [selectedId]);

  const selected = selectedId ? getPhilosopher(selectedId) : null;
  const pfad = RESONANZVERNUNFT_PFAD.map(getPhilosopher).filter((p): p is Philosopher => !!p);
  const byTradition = new Map<string, Philosopher[]>();
  for (const p of PHILOSOPHERS) {
    const arr = byTradition.get(p.tradition);
    if (arr) arr.push(p); else byTradition.set(p.tradition, [p]);
  }

  const sectionLabel: React.CSSProperties = {
    fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.24em", textTransform: "uppercase", color: C.muted,
  };

  return (
    <>
      <MobileScreenShell C={C} title="Philosophie" meta={`${SPAN_FROM} — ${SPAN_TO}`}>
        {/* Extra Bottom-Puffer: die immer sichtbare BottomSheet-Peek-Leiste
            (64px + safe-area) würde sonst die letzten Zeilen verdecken. */}
        <div style={{ padding: "2px 4px 76px" }}>
          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14, lineHeight: 1.6, color: C.textDim, textAlign: "justify", marginBottom: 22 }}>
            Die philosophische Verortung der Resonanzvernunft: Vorgänger, Zeitgenossen, kritische Stimmen, wissenschaftliche Anschlüsse. Die Auswahl ist deutungsoffen, nicht abschließend.
          </div>

          <div style={{ ...sectionLabel, marginBottom: 6 }}>Der Pfad zur Resonanzvernunft</div>
          <div style={{ height: 1, background: C.border, marginBottom: 16 }} />
          {pfad.map((p, i) => {
            const t = getTradition(p.tradition);
            return (
              <div key={p.id} style={{ display: "flex", gap: 12, paddingBottom: i === pfad.length - 1 ? 0 : 18 }}>
                <div style={{ position: "relative", width: 11, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                  {i !== pfad.length - 1 && (
                    <span style={{ position: "absolute", top: 12, bottom: -18, width: 1, background: C.border }} />
                  )}
                  <span style={{ position: "relative", marginTop: 5, width: 9, height: 9, borderRadius: "50%", border: `1.5px solid ${t?.color ?? C.accent}`, background: C.void }} />
                </div>
                <button
                  type="button" onClick={() => setSelectedId(p.id)}
                  style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontFamily: SERIF, fontSize: 15, color: C.textBright }}>{p.name}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted, flexShrink: 0 }}>{p.died ? `${p.born}–${p.died}` : `* ${p.born}`}</span>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: t?.color ?? C.accent, margin: "2px 0" }}>
                    {POSITION_LABEL[p.position]} · {t?.name}
                  </div>
                  {p.signaturePhrase && (
                    <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 12.5, color: C.textDim }}>»{p.signaturePhrase}«</div>
                  )}
                </button>
              </div>
            );
          })}

          <div style={{ ...sectionLabel, margin: "26px 0 6px" }}>Traditionen</div>
          <div style={{ height: 1, background: C.border }} />
          {TRADITIONS.map(t => (
            <div key={t.id} style={{ padding: "12px 0" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontFamily: SERIF, fontSize: 15, color: C.textBright }}>{t.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.muted }}>{t.spanFrom}–{t.spanTo}</span>
              </div>
              <div style={{ position: "relative", height: 3, background: C.deep, marginBottom: 7 }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, left: `${yr(t.spanFrom)}%`, width: `${yr(t.spanTo) - yr(t.spanFrom)}%`, background: t.color }} />
              </div>
              <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 12.5, lineHeight: 1.5, color: C.textDim }}>{t.blurb}</div>
            </div>
          ))}

          <div style={{ ...sectionLabel, margin: "26px 0 6px" }}>Alle Philosophen ({PHILOSOPHERS.length})</div>
          {TRADITIONS.map((t: Tradition) => {
            const ps = byTradition.get(t.id) ?? [];
            if (ps.length === 0) return null;
            return (
              <div key={t.id}>
                <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 16, color: t.color, margin: "16px 0 4px" }}>{t.name}</div>
                {ps.map(p => (
                  <button
                    key={p.id} type="button" onClick={() => setSelectedId(p.id)}
                    style={{
                      display: "flex", gap: 10, width: "100%", minHeight: 44, padding: "8px 0",
                      background: "none", border: "none", borderBottom: `1px solid ${C.border}`,
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{ marginTop: 6, width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: RESONANZVERNUNFT_PFAD.includes(p.id) ? t.color : "transparent", border: `1.5px solid ${t.color}` }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontFamily: SERIF, fontSize: 14.5, color: C.text }}>{p.name}</span>
                        <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.muted, flexShrink: 0 }}>{p.died ? `${p.born}–${p.died}` : `* ${p.born}`}</span>
                      </span>
                      <span style={{ display: "block", fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.06em", textTransform: "uppercase", color: t.color, marginTop: 2 }}>
                        {POSITION_LABEL[p.position]}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "center", padding: "26px 0 0", fontFamily: MONO, fontSize: 11, letterSpacing: "0.45em", color: C.muted }}>⁂</div>
        </div>
      </MobileScreenShell>

      <BottomSheet
        philosopher={selected ?? null}
        expanded={sheetExpanded}
        onToggle={() => setSheetExpanded(v => !v)}
        onClose={() => setSheetExpanded(false)}
        onSelect={setSelectedId}
        c={C}
      />
    </>
  );
}
