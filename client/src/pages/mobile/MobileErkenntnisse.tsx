/**
 * MobileErkenntnisse — Reader-first-Design, Bereich "Erkenntnisse": Kernsatz
 * + Distinktheit + "Entstehung zeigen"-Akkordeon (aus der Frage / die
 * Antwort), aus den echten loadErkenntnisse()/resonanzenIndex-Quellen —
 * exakt dieselbe Ableitung wie ErkenntnissePage, nur neu gerahmt.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, MONO, SERIF } from "@/lib/theme";
import { loadResonanzenIndexLazy, ENDPOINT_LABEL, ENDPOINT_COLOR, type ResonanzEntry } from "@/lib/resonanzenIndex";
import { extractClosingQuestion } from "@/lib/closingQuestion";
import { loadErkenntnisse, type Erkenntnis } from "@/lib/erkenntnisse";
import MobileScreenShell from "@/pages/mobile/MobileScreenShell";

const epLabel = (ep: string) => ENDPOINT_LABEL[ep as ResonanzEntry["endpoint"]] ?? ep;
const epColor = (ep: string, fb: string) => ENDPOINT_COLOR[ep as ResonanzEntry["endpoint"]] ?? fb;

export default function MobileErkenntnisse() {
  const { theme } = useTheme();
  const C = theme === "dark" ? C_DARK : C_LIGHT;
  const [, navigate] = useLocation();
  const [erk, setErk] = useState<Erkenntnis[] | null>(null);
  const [byId, setById] = useState<Map<string, ResonanzEntry>>(new Map());
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    loadErkenntnisse().then(setErk);
    loadResonanzenIndexLazy().then(idx => { if (idx) setById(new Map(idx.entries.map(e => [e.id, e]))); });
  }, []);

  const items = useMemo(() => (erk ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [erk]);

  return (
    <MobileScreenShell C={C} title="Erkenntnisse" meta={erk ? `${items.length} BESTÄTIGT` : ""}>
      <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 27, lineHeight: 1.12, color: C.textBright, marginBottom: 8 }}>
        Erkenntnisse <span style={{ color: C.accentText }}>·</span> Was sich gezeigt hat
      </div>
      <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13.5, lineHeight: 1.55, color: C.textDim, marginBottom: 16 }}>
        Wo eine offene Frage des Werks eine Antwort fand, die wirklich einen Schritt weitergeht — geprüft und bestätigt. Jede mit ihrer Entstehung.
      </div>

      {!erk ? (
        <div style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</div>
      ) : items.length === 0 ? (
        <div style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted, lineHeight: 1.5 }}>
          Noch keine Erkenntnisse bestätigt.
        </div>
      ) : (
        items.map(e => {
          const answer = byId.get(e.answerId);
          const source = byId.get(e.questionSourceId);
          const question = source ? extractClosingQuestion(source.response) : "";
          const isOpen = open === e.id;
          return (
            <div key={e.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "15px 16px", marginBottom: 12 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 23, lineHeight: 1.28, color: C.textBright }}>{e.kernsatz}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", color: C.muted }}>
                  Distinktheit {e.distinctness.toFixed(2)}
                  {e.conceptAnchor && <> · <span style={{ color: C.accentText }}>{e.conceptAnchor}</span></>}
                </span>
                <button
                  type="button" onClick={() => setOpen(isOpen ? null : e.id)}
                  style={{ minHeight: 44, padding: "0 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 3, color: C.accentText, fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
                >{isOpen ? "Entstehung ausblenden" : "Entstehung zeigen"}</button>
              </div>

              {isOpen && (
                <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12, display: "grid", gap: 12 }}>
                  {question && (
                    <div>
                      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>aus der Frage</span>
                      <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13, color: C.text, lineHeight: 1.5, marginTop: 3 }}>
                        „{question}"{source && (
                          <> <button type="button" onClick={() => navigate(`/resonanz/${encodeURIComponent(e.questionSourceId)}`)}
                            style={{ fontFamily: MONO, fontSize: 9, color: C.accentText, background: "none", border: "none", padding: 0, cursor: "pointer" }}
                          >({epLabel(source.endpoint)} ↗)</button></>
                        )}
                      </div>
                    </div>
                  )}
                  {answer && (
                    <div>
                      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: epColor(answer.endpoint, C.muted) }}>die Antwort</span>
                      <div style={{ fontFamily: SERIF, fontSize: 12.5, color: C.textDim, lineHeight: 1.55, marginTop: 3 }}>
                        {answer.response.length > 600 ? answer.response.slice(0, 600) + "…" : answer.response}{" "}
                        <button type="button" onClick={() => navigate(`/resonanz/${encodeURIComponent(e.answerId)}`)}
                          style={{ fontFamily: MONO, fontSize: 9, color: C.accentText, background: "none", border: "none", padding: 0, cursor: "pointer" }}
                        >(ganz lesen ↗)</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
      <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 0", fontFamily: MONO, fontSize: 11, letterSpacing: "0.45em", color: C.muted }}>⁂</div>
    </MobileScreenShell>
  );
}
