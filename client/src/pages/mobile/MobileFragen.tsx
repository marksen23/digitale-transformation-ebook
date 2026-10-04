/**
 * MobileFragen — Reader-first-Design, Bereich "Fragen": alle+offen+beantwortet
 * Filter, real loadQuestions() cards, "Das Werk antwortet"-Previews.
 * Tippen auf die Frage springt in den Reader, wenn der Eintrag eine echte
 * Werk-Stelle trägt (contextMeta.passage_chunk_id/werk_passages) — sonst
 * zur Begegnung (/resonanz/:id), niemals ins Leere.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, MONO, SERIF } from "@/lib/theme";
import {
  loadResonanzenIndexLazy, ENDPOINT_LABEL, ENDPOINT_COLOR,
  type ResonanzEntry,
} from "@/lib/resonanzenIndex";
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
  const [byId, setById] = useState<Map<string, ResonanzEntry>>(new Map());
  const [status, setStatus] = useState<StatusFilter>("all");

  useEffect(() => {
    loadQuestions().then(f => setQuestions(f?.questions ?? []));
    loadResonanzenIndexLazy().then(idx => {
      if (idx) setById(new Map(idx.entries.map(e => [e.id, e])));
    });
  }, []);

  const counts = useMemo(() => {
    const all = questions ?? [];
    return {
      total: all.length,
      answered: all.filter(q => q.answered).length,
      open: all.filter(q => !q.answered).length,
    };
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
          <div key={q.sourceId + i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "14px 15px", marginBottom: 11 }}>
            {/* Endpoint + Status */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => navigate(`/resonanz/${encodeURIComponent(q.sourceId)}`)}
                style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: epColor(q.endpoint, C.muted), background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                {epLabel(q.endpoint)}{q.anchor?.includes(":") ? ` · ${q.anchor.split(":").slice(1).join(":")}` : ""}
              </button>
              <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: q.answered ? "#7ab898" : C.muted, flexShrink: 0 }}>
                {q.answered ? "beantwortet" : "offen"}
              </span>
            </div>

            {/* Die Frage selbst */}
            <button
              type="button" onClick={() => void jumpToQuestion(q)}
              style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: SERIF, fontSize: 15.5, lineHeight: 1.5, color: C.textBright, minHeight: 44 }}
            >
              {q.question}
            </button>

            {q.dupCount > 0 && (
              <div style={{ marginTop: 5, fontFamily: MONO, fontSize: 9, color: C.muted }}>
                {q.dupCount}× ähnlich gestellt
              </div>
            )}

            {/* Das Werk antwortet — mit Prompt-Vorschau statt roher ID */}
            {q.answered && q.answeredBy.length > 0 && (
              <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 7 }}>
                  Das Werk antwortet
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {q.answeredBy.slice(0, 3).map(a => {
                    const entry = byId.get(a.id);
                    const preview = entry?.prompt ?? entry?.response ?? "";
                    return (
                      <button
                        key={a.id} type="button"
                        onClick={() => navigate(`/resonanz/${encodeURIComponent(a.id)}`)}
                        style={{
                          textAlign: "left", minHeight: 40, cursor: "pointer",
                          background: C.deep, border: `1px solid ${C.border}`,
                          borderRadius: 4, padding: "8px 10px",
                          display: "flex", flexDirection: "column", gap: 3,
                        }}
                      >
                        {preview ? (
                          <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 12.5, lineHeight: 1.4, color: C.text }}>
                            {preview.slice(0, 80)}{preview.length > 80 ? "…" : ""}
                          </span>
                        ) : (
                          <span style={{ fontFamily: MONO, fontSize: 9, color: C.muted }}>
                            {a.id.slice(0, 12)}…
                          </span>
                        )}
                        <span style={{ fontFamily: MONO, fontSize: 8, color: C.muted, letterSpacing: "0.04em" }}>
                          {epLabel(entry?.endpoint ?? "")} · {a.score.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
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
