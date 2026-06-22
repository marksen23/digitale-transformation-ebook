/**
 * ConceptCandidatesPanel — Admin-UI für die build-präkomputierten
 * Begriffs-Kandidaten (Phase 5c-Erweiterung, Knoten-Analog zu den
 * Kanten-Vorschlägen auf /admin/health).
 *
 * Listet emergente Themen (Cluster kuratierter Resonanzen, distinkt zu allen
 * bestehenden Begriffen). „Als Vorschlag übernehmen" befüllt das darunter
 * liegende ProposeConceptPanel vor — die Definition + Autorisierung bleiben
 * menschlich (Schutzwall unverändert). Fail-soft: keine Datei → dezenter Hinweis.
 */
import { useEffect, useState } from "react";
import { loadConceptCandidates, type ConceptCandidate, type ConceptCandidatesFile } from "@/lib/conceptCandidates";
import type { ConceptPrefill } from "@/components/admin/ProposeConceptPanel";
import { MONO, SERIF, type Palette } from "@/lib/theme";
import SectionLabel from "@/components/SectionLabel";

/** macht aus einem Keyword eine gültige id (a-z0-9-) bzw. ein Label mit Großbuchstaben. */
const slugId = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-+|-+$/g, "");
const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default function ConceptCandidatesPanel({
  C, onPrefill, lookupPrompt,
}: {
  C: Palette;
  onPrefill: (p: ConceptPrefill) => void;
  lookupPrompt: (id: string) => string | undefined;
}) {
  const [file, setFile] = useState<ConceptCandidatesFile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    loadConceptCandidates().then(f => { setFile(f); setLoaded(true); });
  }, []);

  const take = (cand: ConceptCandidate, idx: number) => {
    onPrefill({
      id: slugId(cand.suggestedLabel),
      fullLabel: capitalize(cand.suggestedLabel),
      description: "",
      anchorId: cand.nearestConcept ?? undefined,
      nonce: Date.now() + idx,
    });
    // Sanftes Hochscrollen zum Formular passiert im Parent-Layout (Panel direkt darüber/​darunter).
  };

  const candidates = file?.candidates ?? [];

  return (
    <section style={{ marginBottom: "1.5rem", border: `1px solid ${C.border}`, borderRadius: 6, padding: "1rem 1.1rem", background: C.surface }}>
      <SectionLabel c={C} size="sm" tracking="open" variant="arbeit">Begriffs-Kandidaten (aus dem Korpus)</SectionLabel>
      <p style={{ marginTop: "0.3rem", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.82rem", color: C.textDim, lineHeight: 1.5 }}>
        Vom Build erkannte emergente Themen: Cluster kuratierter Resonanzen, die
        distinkt zu allen bestehenden Begriffen sind. „Übernehmen" befüllt das
        Formular unten vor — du formulierst die Definition und gibst frei.
      </p>

      {!loaded ? (
        <div style={{ marginTop: "0.8rem", fontFamily: MONO, fontSize: "0.6rem", color: C.muted }}>lädt …</div>
      ) : candidates.length === 0 ? (
        <div style={{ marginTop: "0.8rem", fontFamily: SERIF, fontStyle: "italic", fontSize: "0.8rem", color: C.muted, lineHeight: 1.5 }}>
          Aktuell keine Kandidaten — der kuratierte Korpus trägt noch kein distinktes,
          ausreichend belegtes neues Thema (oder die Datei wurde noch nicht gebaut).
          Wächst mit der Kuratierung.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.7rem", marginTop: "0.9rem" }}>
          {candidates.map((cand, idx) => (
            <div key={idx} style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: "0.7rem 0.85rem", background: C.deep }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap" }}>
                <span style={{ fontFamily: SERIF, fontSize: "1.05rem", color: C.text }}>{capitalize(cand.suggestedLabel) || "—"}</span>
                <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.06em", color: C.muted }}>
                  Evidenz {cand.evidence} · Distinktheit {cand.distinctness.toFixed(2)}
                  {cand.nearestConcept ? <> · nah an <span style={{ color: C.accentText }}>{cand.nearestConcept}</span> @ {cand.nearestSim.toFixed(2)}</> : null}
                </span>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.5rem" }}>
                {cand.keywords.slice(0, 6).map(k => (
                  <span key={k.word} style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.04em", color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 3, padding: "0.12rem 0.35rem" }}>
                    {k.word}<span style={{ color: C.muted }}> ×{k.count}</span>
                  </span>
                ))}
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.65rem", flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={() => take(cand, idx)}
                  style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.void, background: C.accent, border: `1px solid ${C.accent}`, borderRadius: 3, padding: "0.4rem 0.7rem", cursor: "pointer", minHeight: 34 }}>
                  ↑ Als Vorschlag übernehmen
                </button>
                {cand.sampleEntryIds.length > 0 && (
                  <button onClick={() => setExpanded(expanded === idx ? null : idx)}
                    style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.accentText, background: "none", border: `1px solid ${C.border}`, borderRadius: 3, padding: "0.4rem 0.7rem", cursor: "pointer", minHeight: 34 }}>
                    {expanded === idx ? "Beispiele ausblenden" : `${cand.sampleEntryIds.length} Beispiele`}
                  </button>
                )}
              </div>

              {expanded === idx && (
                <ul style={{ margin: "0.6rem 0 0", padding: 0, listStyle: "none", display: "grid", gap: "0.4rem" }}>
                  {cand.sampleEntryIds.map(eid => (
                    <li key={eid} style={{ fontFamily: SERIF, fontSize: "0.78rem", color: C.textDim, lineHeight: 1.4 }}>
                      <a href={`/resonanz/${eid}`} target="_blank" rel="noreferrer" style={{ color: C.accentText, textDecoration: "none" }}>
                        „{(lookupPrompt(eid) ?? eid).slice(0, 110)}{(lookupPrompt(eid) ?? "").length > 110 ? " …" : ""}"
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {file && candidates.length > 0 && (
        <div style={{ marginTop: "0.9rem", fontFamily: MONO, fontSize: "0.48rem", letterSpacing: "0.06em", color: C.muted }}>
          {candidates.length} Kandidaten · Schwellen {Object.entries(file.thresholds).map(([k, v]) => `${k}=${v}`).join(" · ")} · Build {new Date(file.generatedAt).toLocaleString("de-DE")}
        </div>
      )}
    </section>
  );
}
