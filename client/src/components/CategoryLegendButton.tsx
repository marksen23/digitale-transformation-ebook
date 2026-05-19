/**
 * CategoryLegendButton — der Toggle-Button für ein Kohärenzfeld in der
 * Legende des Begriffsnetzes.
 *
 *   ●  Selbst und Anderes              [aus]
 *   ●  Wahrnehmung und Leib              ·
 *   ○  Erkenntnis und Wahrheit         aus
 *
 * Dot zeigt die Kategorie-Farbe (gefüllt = sichtbar, leer-mit-Rahmen =
 * ausgeblendet). Optional ein kleiner Glow-Schatten am Dot wenn die
 * Kategorie zusätzlich als "active" markiert ist (z.B. weil ein Begriff
 * dieser Ebene selektiert ist). Optional ein "aus"-Badge rechts wenn
 * ausgeblendet, oder ein Mini-Dot wenn active.
 *
 * Drei Größen-Varianten — md (Desktop-Sidebar), sm (LEFT-Sidebar),
 * xs (Mobile-Sheet) — mit angepasster Dot-Größe, Schriftgröße und
 * Padding.
 *
 * Verwendung:
 *   <CategoryLegendButton
 *     label="Selbst und Anderes" color="#f59e0b" c={C}
 *     hidden={hiddenCats.has(cat)}
 *     isActive={activeCats.has(cat)}
 *     onToggle={() => setHiddenCats(prev => toggle(prev, cat))}
 *     size="md"
 *   />
 */
import type { Palette } from "@/lib/theme";
import { MONO, SERIF } from "@/lib/theme";

interface CategoryLegendButtonProps {
  label: string;
  color: string;
  c: Palette;
  hidden: boolean;
  /** Optional zusätzliche Hervorhebung (Glow + Text in textBright). */
  isActive?: boolean;
  onToggle: () => void;
  /** md (10/0.85rem) — Desktop, sm (9/0.82rem) — LEFT-Sidebar, xs (7/0.76rem) — Mobile. */
  size?: "md" | "sm" | "xs";
}

const SIZES = {
  md: { dot: 10, fontSize: "0.85rem", gap: "0.55rem", padding: "0.3rem 0", badgeFont: "0.5rem",  badgePad: "0.05rem 0.3rem" },
  sm: { dot: 9,  fontSize: "0.82rem", gap: "0.5rem",  padding: "0.28rem 0", badgeFont: "0.48rem", badgePad: "0.04rem 0.28rem" },
  xs: { dot: 7,  fontSize: "0.76rem", gap: "0.38rem", padding: "0.18rem 0", badgeFont: "0.46rem", badgePad: "0.03rem 0.22rem" },
} as const;

export default function CategoryLegendButton({
  label, color, c, hidden, isActive = false, onToggle, size = "md",
}: CategoryLegendButtonProps) {
  const s = SIZES[size];
  const labelColor = hidden ? c.muted : isActive ? c.textBright : size === "md" ? c.text : c.textDim;
  const showActiveDot = size === "sm" && isActive && !hidden;
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: s.gap,
        width: size === "xs" ? undefined : "100%",
        background: "none", border: "none", cursor: "pointer",
        padding: s.padding, transition: "opacity 0.15s",
      }}
    >
      <span style={{
        width: s.dot, height: s.dot, borderRadius: "50%",
        background: hidden ? "transparent" : color,
        border: `1.5px solid ${hidden ? c.muted : color}`,
        flexShrink: 0, opacity: hidden ? 0.45 : 1,
        boxShadow: isActive && !hidden ? `0 0 ${size === "md" ? 0 : size === "sm" ? 7 : 5}px ${color}${size === "sm" ? "66" : "55"}` : "none",
        transition: "all 0.2s",
      }} />
      <span style={{
        fontFamily: SERIF, fontStyle: "italic", fontSize: s.fontSize,
        color: labelColor, flex: size === "xs" ? undefined : 1,
        textAlign: "left", transition: "color 0.2s",
      }}>
        {label}
      </span>
      {hidden ? (
        <span style={{
          fontFamily: MONO, fontSize: s.badgeFont,
          letterSpacing: size === "xs" ? undefined : "0.08em",
          color: c.muted, border: `1px solid ${c.border}`,
          padding: s.badgePad, borderRadius: 2,
        }}>
          aus
        </span>
      ) : showActiveDot ? (
        <span style={{
          width: 3, height: 3, borderRadius: "50%",
          background: color, flexShrink: 0,
        }} />
      ) : null}
    </button>
  );
}
