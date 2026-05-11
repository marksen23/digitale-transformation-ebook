/**
 * Ornament — typografische Trenner im Geist alter Setzer-Bücher.
 *
 * Das Werk argumentiert nicht für eine Synthese aus Alt und Neu, sondern
 * für eine Überführung der Tradition in die Gegenwart. Diese Komponente
 * spiegelt das visuell: ein Fleuron (❦), das sonst nur in handgesetzten
 * Buchdrucken vorkommt, wird hier in moderner SVG-Geometrie zwischen
 * Sektionen platziert. Klassik *trägt* die digitale Oberfläche, ist nicht
 * dekorativ aufgesetzt.
 *
 * Drei Varianten:
 *   - `rule`      : Doppellinie mit Mittel-Fleuron — klassischer Buch-Section-Break
 *   - `asterism`  : drei zentrierte Asteriski — ⁂ — Kapitel-Bruch im Inneren einer Sektion
 *   - `inline`    : kleiner Middle-Dot oder Fleuron als Inline-Separator
 *
 * Verwendet keine eigenen Fonts — Unicode-Glyphen rendern in Inter und
 * Lora gleichermassen ordentlich. Farbe folgt der aktuellen Palette via
 * c-Prop (kein eigener Theme-Kopplung).
 */
import { MONO, ORNAMENT, TRACKED, type Palette } from "@/lib/theme";

interface OrnamentProps {
  /** Erscheinungs-Variante */
  variant?: "rule" | "asterism" | "inline";
  /** Palette für Farbgebung */
  c: Palette;
  /** Optional ein anderes Fleuron als ❦ wählen */
  glyph?: string;
  /** Vertikaler Abstand außen — default 1.6rem (klassischer Abstand) */
  margin?: string;
}

export default function Ornament({
  variant = "rule",
  c,
  glyph = ORNAMENT.leaf,
  margin = "1.6rem 0",
}: OrnamentProps) {
  if (variant === "inline") {
    return (
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          color: c.accentDim,
          fontSize: "0.7em",
          margin: "0 0.5em",
          opacity: 0.6,
        }}
      >{glyph}</span>
    );
  }

  if (variant === "asterism") {
    return (
      <div
        aria-hidden="true"
        style={{
          textAlign: "center",
          color: c.accentDim,
          fontFamily: MONO,
          fontSize: "0.9rem",
          letterSpacing: TRACKED.classic,
          opacity: 0.55,
          margin,
          userSelect: "none",
        }}
      >
        {ORNAMENT.asterism}
      </div>
    );
  }

  // rule (default) — Doppellinie mit Mittel-Fleuron
  return (
    <div
      aria-hidden="true"
      role="separator"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        margin,
        color: c.accentDim,
        opacity: 0.55,
        userSelect: "none",
      }}
    >
      <span style={{ flex: 1, height: 1, background: `linear-gradient(to right, transparent, ${c.border} 30%, ${c.border} 100%)` }} />
      <span style={{ fontFamily: MONO, fontSize: "0.85rem", lineHeight: 1, opacity: 0.85 }}>{glyph}</span>
      <span style={{ flex: 1, height: 1, background: `linear-gradient(to left, transparent, ${c.border} 30%, ${c.border} 100%)` }} />
    </div>
  );
}

/**
 * DropCap — buchhafte Initial-Versalie für den ersten Absatz einer
 * längeren Prosa-Passage. Im klassischen Buchdruck der "rote D" oder
 * "Aldus-Initial". Hier dezenter: warm-getönt, mit deutlicher Sperrung,
 * fließt in den Lese-Text statt ihn zu unterbrechen.
 *
 * Nutzung:
 *   <p><DropCap c={C}>D</DropCap>er Resonanzbegriff entsteht …</p>
 */
export function DropCap({ children, c }: { children: React.ReactNode; c: Palette }) {
  return (
    <span
      style={{
        float: "left",
        fontFamily: "'Lora', Georgia, serif",
        fontSize: "3.3em",
        lineHeight: 0.9,
        marginRight: "0.12em",
        marginTop: "0.12em",
        marginBottom: "-0.06em",
        color: c.accentDim,
        fontWeight: 500,
        fontStyle: "normal",
      }}
    >
      {children}
    </span>
  );
}
