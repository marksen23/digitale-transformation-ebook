/**
 * ErkenntnissePage (/erkenntnisse) — die menschlich bestätigten Erkenntnisse
 * (Erkenntnisse-Vision, Phase 3).
 *
 * Eine Erkenntnis ist eine Antwort auf eine offene Schlussfrage, die einen neuen
 * denkerischen Schritt vollzieht — im Admin destilliert + bestätigt. Diese Seite
 * stellt sie gestaffelt dar: Übersicht = Kernsatz; Detail (aufgeklappt) = volle
 * Antwort + Entstehungsanalyse (Frage → Ursprung → Antwort → Begriff → Distinktheit).
 *
 * Eigener position:fixed-Scroll-Container (App-Scroll-Modell) + SiteFooter.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { C_DARK, C_LIGHT, MONO, SERIF, type Palette } from "@/lib/theme";
import { loadResonanzenIndexLazy, ENDPOINT_LABEL, ENDPOINT_COLOR, type ResonanzEntry } from "@/lib/resonanzenIndex";
import { extractClosingQuestion } from "@/lib/closingQuestion";
import { loadErkenntnisse, type Erkenntnis } from "@/lib/erkenntnisse";
import SiteFooter from "@/components/SiteFooter";

const epLabel = (ep: string) => ENDPOINT_LABEL[ep as ResonanzEntry["endpoint"]] ?? ep;
const epColor = (ep: string, fb: string) => ENDPOINT_COLOR[ep as ResonanzEntry["endpoint"]] ?? fb;

export default function ErkenntnissePage() {
  const { theme } = useTheme();
  const c: Palette = theme === "dark" ? C_DARK : C_LIGHT;
  const [erk, setErk] = useState<Erkenntnis[] | null>(null);
  const [byId, setById] = useState<Map<string, ResonanzEntry>>(new Map());
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    loadErkenntnisse().then(setErk);
    loadResonanzenIndexLazy().then(idx => { if (idx) setById(new Map(idx.entries.map(e => [e.id, e]))); });
  }, []);

  const items = useMemo(() => {
    return (erk ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [erk]);

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
          Erkenntnisse <span style={{ color: c.accentText }}>·</span> Was sich gezeigt hat
        </h1>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", color: c.textDim, marginTop: 0, marginBottom: "1.2rem", lineHeight: 1.5 }}>
          Wo eine offene Frage des Werks eine Antwort fand, die wirklich einen Schritt
          weitergeht — geprüft und bestätigt. Jede Erkenntnis mit ihrer Entstehung:
          aus welcher Frage, aus welcher Antwort sie erwuchs.
        </p>

        {erk && (
          <div style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.06em", color: c.muted, marginBottom: "1.2rem" }}>
            {items.length} bestätigte Erkenntnis{items.length === 1 ? "" : "se"}
          </div>
        )}

        {!erk ? (
          <div style={{ fontFamily: SERIF, fontStyle: "italic", color: c.muted }}>lädt …</div>
        ) : items.length === 0 ? (
          <div style={{ fontFamily: SERIF, fontStyle: "italic", color: c.muted, lineHeight: 1.5 }}>
            Noch keine Erkenntnisse bestätigt. Sie entstehen, wenn aus den Erkenntnis-Kandidaten
            (Antworten, die offene Fragen lösen) im Admin ein Kernsatz destilliert und bestätigt wird.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
            {items.map(e => {
              const answer = byId.get(e.answerId);
              const source = byId.get(e.questionSourceId);
              const question = source ? extractClosingQuestion(source.response) : "";
              const isOpen = open === e.id;
              return (
                <div key={e.id} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 6, padding: "0.95rem 1.1rem" }}>
                  {/* Kernsatz — die Erkenntnis selbst */}
                  <div style={{ fontFamily: SERIF, fontSize: "1.15rem", color: c.textBright, lineHeight: 1.45 }}>
                    {e.kernsatz}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.06em", color: c.muted }}>
                      Distinktheit {e.distinctness.toFixed(2)}
                      {e.conceptAnchor ? <> · <span style={{ color: c.accentText }}>{e.conceptAnchor}</span></> : null}
                    </span>
                    <button onClick={() => setOpen(isOpen ? null : e.id)}
                      style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: c.accentText, background: "none", border: `1px solid ${c.border}`, borderRadius: 3, padding: "0.25rem 0.5rem", cursor: "pointer" }}>
                      {isOpen ? "Entstehung ausblenden" : "Entstehung zeigen"}
                    </button>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: "0.7rem", borderTop: `1px solid ${c.border}`, paddingTop: "0.7rem", display: "grid", gap: "0.7rem" }}>
                      {question && (
                        <div>
                          <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>aus der Frage</span>
                          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.9rem", color: c.text, lineHeight: 1.5, marginTop: "0.2rem" }}>
                            „{question}"
                            {source && <> <Link href={`/resonanz/${encodeURIComponent(e.questionSourceId)}`} style={{ fontFamily: MONO, fontSize: "0.5rem", color: c.accentText, textDecoration: "none" }}>({epLabel(source.endpoint)} ↗)</Link></>}
                          </div>
                        </div>
                      )}
                      {answer && (
                        <div>
                          <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: epColor(answer.endpoint, c.muted) }}>die Antwort</span>
                          <div style={{ fontFamily: SERIF, fontSize: "0.88rem", color: c.textDim, lineHeight: 1.55, marginTop: "0.2rem" }}>
                            {answer.response.length > 600 ? answer.response.slice(0, 600) + "…" : answer.response}{" "}
                            <Link href={`/resonanz/${encodeURIComponent(e.answerId)}`} style={{ fontFamily: MONO, fontSize: "0.5rem", color: c.accentText, textDecoration: "none" }}>(ganz lesen ↗)</Link>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <SiteFooter c={c} />
      </div>
    </div>
  );
}
