/**
 * MobileFragen — Reader-first-Design, Bereich "Fragen": alle+offen+beantwortet
 * Filter, real loadQuestions() cards, "Das Werk antwortet"-Pills. Tippen auf
 * die Frage springt in den Reader, wenn der Eintrag eine echte Werk-Stelle
 * trägt (contextMeta.passage_chunk_id/werk_passages) — sonst zur Begegnung
 * (/resonanz/:id), niemals ins Leere.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, MONO, SERIF } from "@/lib/theme";
import { ENDPOINT_LABEL, ENDPOINT_COLOR, type ResonanzEntry } from "@/lib/resonanzenIndex";
import { loadQuestions, type QuestionEntry } from "@/lib/questions";
import { findPassageForEntry } from "@/lib/conceptPassageLink";
import MobileScreenShell from "@/pages/mobile/MobileScreenShell";
import MobilePill from "@/pages/mobile/MobilePill";

type StatusFilter = "all" | "open" | "answered";
const epLabel = (ep: string) => ENDPOINT_LABEL[ep as ResonanzEntry["endpoint"]] ?? ep;
const epColor = (ep: string, fallback: string) => ENDPOINT_COLOR[ep as ResonanzEntry["endpoint"]] ?? fallback;

export default function MobileFragen() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const C = isDark ? C_DARK : C_LIGHT;
  const [, navigate] = useLocation();
  const [questions, setQuestions] = useState<QuestionEntry[] | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");

  useEffect(() => { loadQuestions().then(f => setQuestions(f?.questions ?? [])); }, []);

  const counts = useMemo(() => {
    const all = questions ?? [];
    return { total: all.length, answered: all.filter(q => q.answered).length, open: all.filter(q => !q.answered).length };
  }, [questions]);

  const shown = useMemo(() => {
    const all = questions ?? [];
    if (status === "open") return all.filter(q => !q.answered);
    if (status === "answered") return all.filter(q => q.answered);
    return all;
  }, [questions, status]);

  async function jumpToQuestion(q: QuestionEntry) {
    const link = await findPassageForEntry(q.sourceId);
    if (link) navigate(`/werk/${encodeURIComponent(link.chapterId)}?chunk=${encodeURIComponent(link.chunkId)}`);
    else navigate(`/resonanz/${encodeURIComponent(q.sourceId)}`);
  }

  return (
    <MobileScreenShell C={C} title="Fragen" meta={questions ? `${counts.open} OFFEN` : ""} isDark={isDark}>
      <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 27, lineHeight: 1.12, color: C.textBright, marginBottom: 8 }}>
        Offene Fragen <span style={{ color: C.accentText }}>·</span> Der Denk-Horizont
      </div>
      <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13.5, lineHeight: 1.55, color: C.textDim, marginBottom: 12 }}>
        Jede Antwort des Werks endet mit einer offenen Frage. Hier sind sie gesammelt — und sichtbar gemacht, welche das Werk sich selbst beantwortet hat.
      </div>

      {questions && (
        <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.06em", color: C.muted, marginBottom: 12 }}>
          {counts.total} Fragen · <span style={{ color: "#7ab898" }}>{counts.answered} beantwortet</span> · <span style={{ color: C.accentText }}>{counts.open} offen</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14 }}>
        <MobilePill C={C} label="alle" active={status === "all"} onClick={() => setStatus("all")} />
        <MobilePill C={C} label="offen" active={status === "open"} onClick={() => setStatus("open")} />
        <MobilePill C={C} label="beantwortet" active={status === "answered"} onClick={() => setStatus("answered")} />
      </div>

      {!questions ? (
        <div style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</div>
      ) : shown.length === 0 ? (
        <div style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted, lineHeight: 1.6 }}>
          Keine {status === "open" ? "offenen" : "beantworteten"} Fragen — {counts.total} insgesamt warten.{" "}
          <button
            onClick={() => setStatus("all")}
            style={{ fontFamily: MONO, fontSize: 10.5, color: C.accentText, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}
          >
            Alle zeigen
          </button>
        </div>
      ) : (
        shown.map((q, i) => (
          <div key={q.sourceId + i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 5, padding: "13px 15px", marginBottom: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 7 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: epColor(q.endpoint, C.muted) }}>{epLabel(q.endpoint)}</span>
              <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: q.answered ? "#7ab898" : C.muted, flexShrink: 0 }}>
                {q.answered ? "beantwortet" : "offen"}
              </span>
            </div>
            <button
              type="button" onClick={() => void jumpToQuestion(q)}
              style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: SERIF, fontSize: 15, lineHeight: 1.5, color: C.textBright }}
            >{q.question}</button>
            <div style={{ marginTop: 7, fontFamily: MONO, fontSize: 9, color: C.muted }}>
              aus {epLabel(q.endpoint)}{q.anchor && q.anchor.includes(":") ? ` · ${q.anchor.split(":").slice(1).join(":")}` : ""}
              {q.dupCount > 0 && <span> · {q.dupCount}× ähnlich gestellt</span>}
            </div>
            {q.answered && (
              <div style={{ marginTop: 9, borderTop: `1px solid ${C.border}`, paddingTop: 9 }}>
                <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>Das Werk antwortet</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {q.answeredBy.map(a => (
                    <button
                      key={a.id} type="button" onClick={() => navigate(`/resonanz/${encodeURIComponent(a.id)}`)}
                      style={{ minHeight: 28, fontFamily: MONO, fontSize: 9, color: C.accentText, background: "none", border: `1px solid ${C.border}`, borderRadius: 3, padding: "0 8px", cursor: "pointer" }}
                    >→ {a.id.slice(0, 8)} <span style={{ color: C.muted }}>{a.score.toFixed(2)}</span></button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))
      )}
      <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 0", fontFamily: MONO, fontSize: 11, letterSpacing: "0.45em", color: C.muted }}>⁂</div>
    </MobileScreenShell>
  );
}
