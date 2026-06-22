/**
 * FragenPage (/fragen) — die offenen Fragen des Werks (Erkenntnisse-Phase 1).
 *
 * Jede KI-Antwort endet mit einer offenen Schlussfrage. Diese Seite sammelt sie
 * (build-präkomputiert, resonanzen-questions.json) und zeigt, welche das Werk
 * sich SELBST bereits beantwortet hat (semantisches Matching gegen spätere
 * Einträge) und welche offen bleiben — der Denk-Horizont des wachsenden Werks.
 *
 * Eigener position:fixed-Scroll-Container (App-Scroll-Modell) + SiteFooter.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, MONO, SERIF, type Palette } from "@/lib/theme";
import { ENDPOINT_LABEL, ENDPOINT_COLOR, type ResonanzEntry } from "@/lib/resonanzenIndex";
import { loadQuestions, type QuestionEntry } from "@/lib/questions";
import SiteFooter from "@/components/SiteFooter";

type StatusFilter = "all" | "open" | "answered";

const epLabel = (ep: string) => ENDPOINT_LABEL[ep as ResonanzEntry["endpoint"]] ?? ep;
const epColor = (ep: string, fallback: string) => ENDPOINT_COLOR[ep as ResonanzEntry["endpoint"]] ?? fallback;

export default function FragenPage() {
  const { theme } = useTheme();
  const c: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [questions, setQuestions] = useState<QuestionEntry[] | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [area, setArea] = useState<string | null>(null);

  useEffect(() => { loadQuestions().then(f => setQuestions(f?.questions ?? [])); }, []);

  const areas = useMemo(() => {
    const set = new Set<string>();
    (questions ?? []).forEach(q => set.add(q.endpoint));
    return Array.from(set);
  }, [questions]);

  const counts = useMemo(() => {
    const all = questions ?? [];
    return { total: all.length, answered: all.filter(q => q.answered).length, open: all.filter(q => !q.answered).length };
  }, [questions]);

  const shown = useMemo(() => {
    let all = questions ?? [];
    if (status === "open") all = all.filter(q => !q.answered);
    if (status === "answered") all = all.filter(q => q.answered);
    if (area) all = all.filter(q => q.endpoint === area);
    return all;
  }, [questions, status, area]);

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
          Offene Fragen <span style={{ color: c.accentText }}>·</span> Der Denk-Horizont
        </h1>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", color: c.textDim, marginTop: 0, marginBottom: "1rem", lineHeight: 1.5 }}>
          Jede Antwort des Werks endet mit einer offenen Frage. Hier sind sie gesammelt —
          und sichtbar gemacht, welche das Werk sich im Laufe seines Wachsens selbst
          beantwortet hat und welche noch offen vor uns liegen.
        </p>

        {questions && (
          <div style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.06em", color: c.muted, marginBottom: "1rem" }}>
            {counts.total} Fragen · <span style={{ color: "#7ab898" }}>{counts.answered} beantwortet</span> · <span style={{ color: c.accentText }}>{counts.open} offen</span>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
          <button style={chip(status === "all")} onClick={() => setStatus("all")}>alle</button>
          <button style={chip(status === "open")} onClick={() => setStatus("open")}>offen</button>
          <button style={chip(status === "answered")} onClick={() => setStatus("answered")}>beantwortet</button>
        </div>
        {areas.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1.2rem" }}>
            <button style={chip(area === null)} onClick={() => setArea(null)}>alle Bereiche</button>
            {areas.map(a => (
              <button key={a} style={chip(area === a)} onClick={() => setArea(a)}>{epLabel(a)}</button>
            ))}
          </div>
        )}

        {!questions ? (
          <div style={{ fontFamily: SERIF, fontStyle: "italic", color: c.muted }}>lädt …</div>
        ) : shown.length === 0 ? (
          <div style={{ fontFamily: SERIF, fontStyle: "italic", color: c.muted }}>Keine Fragen mit diesem Filter.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
            {shown.map((q, i) => (
              <div key={q.sourceId + i} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 5, padding: "0.8rem 0.95rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.4rem" }}>
                  <span style={{ fontFamily: MONO, fontSize: "0.52rem", letterSpacing: "0.12em", textTransform: "uppercase", color: epColor(q.endpoint, c.muted) }}>
                    {epLabel(q.endpoint)}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: q.answered ? "#7ab898" : c.muted, flexShrink: 0 }}>
                    {q.answered ? "beantwortet" : "offen"}
                  </span>
                </div>

                <div style={{ fontFamily: SERIF, fontSize: "1rem", color: c.textBright, lineHeight: 1.5 }}>
                  {q.question}
                </div>

                <div style={{ marginTop: "0.5rem", fontFamily: MONO, fontSize: "0.55rem", color: c.muted }}>
                  aus{" "}
                  <Link href={`/resonanz/${encodeURIComponent(q.sourceId)}`} style={{ color: c.accentText, textDecoration: "none" }}>
                    {epLabel(q.endpoint)}{q.anchor && q.anchor.includes(":") ? ` · ${q.anchor.split(":").slice(1).join(":")}` : ""}
                  </Link>
                  {q.dupCount > 0 && <span> · {q.dupCount}× ähnlich gestellt</span>}
                </div>

                {q.answered && (
                  <div style={{ marginTop: "0.55rem", borderTop: `1px solid ${c.border}`, paddingTop: "0.5rem" }}>
                    <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>
                      Das Werk antwortet
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
                      {q.answeredBy.map(a => (
                        <Link key={a.id} href={`/resonanz/${encodeURIComponent(a.id)}`}
                          style={{ fontFamily: MONO, fontSize: "0.5rem", color: c.accentText, textDecoration: "none", border: `1px solid ${c.border}`, borderRadius: 3, padding: "0.15rem 0.4rem" }}>
                          → {a.id.slice(0, 8)} <span style={{ color: c.muted }}>{a.score.toFixed(2)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <SiteFooter c={c} />
      </div>
    </div>
  );
}
