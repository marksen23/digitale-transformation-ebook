/**
 * ResonanzCard — eine einzelne Begegnung aus dem Wissen.
 *
 * Eine kompakte Karte mit drei Elementen:
 *   ┌─────────────────────────────────────────┐
 *   │ ENDPOINT-LABEL ········· 17. JAN        │
 *   │ "Das ist die Prompt-Frage…"             │
 *   └─────────────────────────────────────────┘
 *
 * Vorher in zwei Varianten inline gerendert (LEFT-Sidebar des
 * Begriffsnetzes + Mobile-Sheet), mit fast identischer Struktur
 * aber subtilen Unterschieden in Background, Border-Radius und
 * Hover-Verhalten. Jetzt eine geteilte Komponente mit Varianten.
 *
 * Verwendung:
 *   <ResonanzCard entry={entry} c={C} variant="framed" />
 *   <ResonanzCard entry={entry} c={C} variant="flat" />
 */
import type { Palette } from "@/lib/theme";
import { MONO, SERIF } from "@/lib/theme";
import { ENDPOINT_LABEL, ENDPOINT_COLOR, type ResonanzEntry } from "@/lib/resonanzenIndex";

interface ResonanzCardProps {
  entry: ResonanzEntry;
  c: Palette;
  /** "framed" — Surface-Background, abgerundet, mit Hover-Effekt (Desktop-Sidebar).
   *  "flat"  — Deep-Background, eckig, kein Hover (Mobile-Sheet). */
  variant?: "framed" | "flat";
  /** Schriftgröße der Mono-Beschriftung. Default 0.48rem (framed) / 0.5rem (flat). */
  labelSize?: string;
}

export default function ResonanzCard({
  entry,
  c,
  variant = "framed",
  labelSize,
}: ResonanzCardProps) {
  const isFramed = variant === "framed";
  const size = labelSize ?? (isFramed ? "0.48rem" : "0.5rem");
  return (
    <a
      href={`/resonanzen?id=${entry.id}`}
      style={{
        display: "block",
        background: isFramed ? c.surface : c.deep,
        border: `1px solid ${c.border}`,
        borderRadius: isFramed ? 4 : 0,
        padding: "0.45rem 0.6rem",
        textDecoration: "none",
        transition: isFramed ? "border-color 0.15s, background 0.15s" : undefined,
      }}
      onMouseEnter={isFramed ? (e) => {
        e.currentTarget.style.borderColor = c.accentDim;
        e.currentTarget.style.background = c.deep;
      } : undefined}
      onMouseLeave={isFramed ? (e) => {
        e.currentTarget.style.borderColor = c.border;
        e.currentTarget.style.background = c.surface;
      } : undefined}
    >
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "baseline", marginBottom: "0.18rem", gap: "0.3rem",
      }}>
        <span style={{
          fontFamily: MONO, fontSize: size, letterSpacing: "0.12em",
          textTransform: "uppercase", color: ENDPOINT_COLOR[entry.endpoint],
        }}>
          {ENDPOINT_LABEL[entry.endpoint]}
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: "0.3rem" }}>
          {entry.related === undefined && (
            <span
              title="Neu hinzugekommen — Querbezüge und Einordnung werden beim nächsten Korpus-Rebuild berechnet."
              style={{ fontFamily: MONO, fontSize: size, color: c.muted, opacity: 0.85 }}
            >↻ neu</span>
          )}
          <time style={{ fontFamily: MONO, fontSize: size, color: c.muted }}>
            {new Date(entry.ts).toLocaleDateString("de-DE", { month: "short", day: "numeric" })}
          </time>
        </span>
      </div>
      <div style={{
        fontFamily: SERIF, fontStyle: "italic", fontSize: "0.76rem",
        color: c.text, lineHeight: 1.4,
      }}>
        {entry.prompt.length > 100 ? entry.prompt.slice(0, 100) + "…" : entry.prompt}
      </div>
    </a>
  );
}
