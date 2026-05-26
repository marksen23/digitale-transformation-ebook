/**
 * SectionLabel — die klassische Mono-Versalien-Beschriftung des Werks.
 *
 * Im Design-System der App ist diese Mikro-Typografie das Bindeglied
 * zwischen den großen Lese-Flächen (Lora-Italic-Titel, Serif-Body) und
 * den technischen Bereichen (UI-Buttons in Inter). Sie tritt überall
 * dort auf, wo eine Sektion ihren Namen tragen muss — "VERBUNDENE
 * BEGRIFFE", "KOHÄRENZFELDER", "HAUPTWERKE" — als ruhiger Eingang in
 * den folgenden Inhalt.
 *
 * Vor diesem Refactor war die Geste 59-mal inline gebaut — mit kleinen
 * Inkonsistenzen in fontSize, letterSpacing und marginBottom. Jetzt
 * sprechen alle Section-Header dieselbe Sprache.
 *
 * Verwendung:
 *   <SectionLabel c={C}>Verbundene Begriffe</SectionLabel>
 *   <SectionLabel c={C} count={works.length}>Hauptwerke</SectionLabel>
 *   <SectionLabel c={C} color={C.accent} count={all.length}>
 *     ❦ Begegnungen aus dem Wissen
 *   </SectionLabel>
 */
import { MONO, TRACKED, SEMANTIC, type Palette } from "@/lib/theme";

/** Semantische Variante (Sprint D4) — Konsumenten geben Bedeutung an,
 *  nicht Pixel. Resolvet auf konkrete Farbe basierend auf SEMANTIC-Tokens.
 *  Eskaliert von Farb-Variante zur Variant-API: einheitliche Sprache. */
type SectionVariant = "default" | "werk" | "arbeit" | "wachstum" | "warnung";

interface SectionLabelProps {
  children: React.ReactNode;
  c: Palette;
  /** D4: bevorzugte API — semantische Variante. Wenn nicht gesetzt:
   *  fallback auf `color`-Prop für Backward-Kompatibilität. */
  variant?: SectionVariant;
  /** @deprecated D4: nutze `variant` stattdessen. Bleibt für Migration. */
  color?: string;
  /** Optionaler Count rechts (z.B. Anzahl Werke, Begegnungen). */
  count?: number | string;
  /** Farbe des Count. Default: c.accent (Akzent). */
  countColor?: string;
  /** Größen-Variante. Default "md" (0.58rem). */
  size?: "xs" | "sm" | "md" | "lg";
  /** Letter-spacing-Variante. Default "open" (0.18em). */
  tracking?: keyof typeof TRACKED;
  /** Margin-bottom in rem. Default 0.7. */
  marginBottom?: string;
  /** Margin-top in rem. Default 0. */
  marginTop?: string;
  /** Optional ein zusätzlicher Inline-Style. */
  style?: React.CSSProperties;
}

const SIZES = {
  xs: "0.48rem",
  sm: "0.5rem",
  md: "0.58rem",
  lg: "0.65rem",
} as const;

/** Resolvet eine SectionVariant zu einer konkreten Farbe.
 *  default → palette.muted (das eigentliche Default für Labels).
 *  Andere Varianten → SEMANTIC-Tokens. */
function resolveVariantColor(variant: SectionVariant, c: Palette): string {
  switch (variant) {
    case "werk":     return SEMANTIC.werk;
    case "arbeit":   return SEMANTIC.arbeit;
    case "wachstum": return SEMANTIC.wachstum;
    case "warnung":  return SEMANTIC.warnung;
    case "default":
    default:         return c.muted;
  }
}

export default function SectionLabel({
  children,
  c,
  variant,
  color,
  count,
  countColor,
  size = "md",
  tracking = "open",
  marginBottom = "0.7rem",
  marginTop = "0",
  style,
}: SectionLabelProps) {
  // D4: variant gewinnt vor color (color ist deprecated, aber bleibt
  // gültig für Migration). Wenn weder noch: c.muted.
  const labelColor = variant ? resolveVariantColor(variant, c) : (color ?? c.muted);
  const cColor = countColor ?? c.accent;
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: SIZES[size],
        letterSpacing: TRACKED[tracking],
        color: labelColor,
        textTransform: "uppercase",
        marginTop, marginBottom,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: "0.5rem",
        ...style,
      }}
    >
      <span>{children}</span>
      {count !== undefined && count !== null && (
        <span style={{ color: cColor, flexShrink: 0 }}>{count}</span>
      )}
    </div>
  );
}
