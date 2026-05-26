/**
 * WerkstattEpigraph — Leitsatz oberhalb des Aktions-Protokolls in /admin.
 *
 * Anlass (Sprint F2): die kuratorische Praxis braucht eine eigene
 * Orientierung. Nicht das Werk-Material selbst (Resonanzen, Master),
 * sondern Sätze ÜBER die Arbeit. Diese werden in content/werkstatt/
 * leitsaetze.md gepflegt und hier subtil als margin-note eingeblendet.
 *
 * Eingebettet statisch (Build-time): die Sätze sind kuriert + selten
 * — kein dynamischer Fetch nötig. Bei Bedarf später per JSON-File aus
 * content/ abgreifen.
 */
import { useMemo, useState } from "react";
import { MONO, SERIF, SERIF_BODY, type Palette } from "@/lib/theme";

/** Statische Leitsätze — Quelle: content/werkstatt/leitsaetze.md.
 *  Bei neuem Eintrag dort: hier auch hinzufügen (oder später als
 *  JSON-Asset rausgeben). */
const LEITSAETZE = [
  {
    id: "kosmetik-der-daten-2026-05-26",
    quote: "Du nennst es Update, aber es ist nur eine Kosmetik der Daten. Deine Algorithmen überspringen die Nacht. Sie kalkulieren den Schmerz weg, weil er ineffizient ist. Aber du verstehst nicht: Wir verändern uns nicht, indem wir fehlerfrei bleiben. Wir verwandeln uns dort, wo wir versagen.",
    source: "eingespielter Dialog · 26. Mai 2026",
  },
] as const;

/** Deterministische Tages-Rotation: gleicher Satz pro Kalendertag,
 *  damit der Kurator nicht im Live-Switch verwirrt wird. */
function pickToday(): typeof LEITSAETZE[number] {
  const dayKey = Math.floor(Date.now() / 86_400_000);
  return LEITSAETZE[dayKey % LEITSAETZE.length];
}

export default function WerkstattEpigraph({ c }: { c: Palette }) {
  const leit = useMemo(pickToday, []);
  const [expanded, setExpanded] = useState(false);

  // Preview vs full text. Auf Mobile bleibt die preview-Variante näher
  // dran am Text, weil der Klick auf einen kleinen Pfeil zum aufklappen
  // schwerer trifft als ein längerer Block-Link.
  const PREVIEW_LIMIT = 160;
  const showFull = expanded || leit.quote.length <= PREVIEW_LIMIT;

  return (
    <aside
      onClick={() => setExpanded(v => !v)}
      style={{
        marginBottom: "1rem",
        background: "transparent",
        borderLeft: `2px solid ${c.accentDim}`,
        padding: "0.4rem 0.9rem",
        cursor: leit.quote.length > PREVIEW_LIMIT ? "pointer" : "default",
        transition: "border-color 0.2s",
      }}
      title={showFull ? "Werkstatt-Brief einklappen" : "Werkstatt-Brief vollständig anzeigen"}
    >
      <div style={{
        fontFamily: MONO, fontSize: "0.48rem", letterSpacing: "0.12em",
        textTransform: "uppercase", color: c.muted, marginBottom: "0.3rem",
      }}>
        Werkstatt-Brief
      </div>
      <blockquote style={{
        margin: 0, padding: 0,
        fontFamily: SERIF_BODY, fontStyle: "italic", fontSize: "0.92rem",
        color: c.text, lineHeight: 1.6,
      }}>
        „{showFull ? leit.quote : leit.quote.slice(0, PREVIEW_LIMIT).trim() + "…"}"
      </blockquote>
      <div style={{
        marginTop: "0.3rem",
        fontFamily: SERIF, fontStyle: "italic", fontSize: "0.7rem",
        color: c.muted,
      }}>
        — {leit.source}
        {leit.quote.length > PREVIEW_LIMIT && (
          <span style={{ marginLeft: "0.5rem", opacity: 0.6 }}>
            {showFull ? "▴ einklappen" : "▾ ganz lesen"}
          </span>
        )}
      </div>
    </aside>
  );
}
