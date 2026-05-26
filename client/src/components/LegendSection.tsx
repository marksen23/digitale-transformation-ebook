/**
 * LegendSection — der geteilte Wrapper für die Legenden im Begriffsnetz.
 *
 * Jede Legende im Begriffsnetz folgt derselben Geste:
 *   ── KOHÄRENZFELDER ─────────────────────────
 *   ● Selbst und Anderes           [aus]
 *   ● Wahrnehmung und Leib            ·
 *   ●  …
 *   ─────────────────────────────────────────
 *   [    Alle einblenden    ]
 *
 * Diese Komponente trägt nur Header + Reset-Footer; die mittlere Toggle-
 * Liste kommt als `children` rein — entweder als <CategoryLegendButton>-Reihe
 * für Kohärenzfelder, oder als inline-Buttons für Leitmotive / Prinzipien.
 *
 * Drei Sektionen lassen sich vertikal stapeln, indem die zweite und dritte
 * `showSeparator` setzen (borderTop + paddingTop).
 *
 * Verwendung:
 *   <LegendSection title="Kohärenzfelder" c={C}
 *                  showReset={hiddenCats.size > 0}
 *                  onReset={() => setHiddenCats(new Set())}>
 *     {cats.map(([cat, color]) => <CategoryLegendButton … />)}
 *   </LegendSection>
 *
 *   <LegendSection title="Erkenntnisprinzipien" c={C} showSeparator
 *                  resetColor={PR_GLOW} resetBorderColor={PR_COLOR}
 *                  showReset={hidden.size > 0} onReset={reset}>
 *     {…group buttons…}
 *   </LegendSection>
 */
import { useState } from "react";
import type { Palette } from "@/lib/theme";
import { MONO } from "@/lib/theme";

interface LegendSectionProps {
  title: string;
  c: Palette;
  /** Mobile-compact-Stufen: kleinere Schrift, weniger margin, horizontales Wrap-Layout. */
  compact?: boolean;
  /** borderTop + paddingTop oben — für gestapelte Sektionen (Leitmotive nach Kohärenzfeldern usw.). */
  showSeparator?: boolean;
  /** Sichtbarkeit des "Alle einblenden"-Buttons (caller kontrolliert: hidden.size > 0). */
  showReset?: boolean;
  onReset?: () => void;
  /** Default c.accent. Für Prinzipien: PR_GLOW. */
  resetColor?: string;
  /** Default c.accentDim. Für Prinzipien: PR_COLOR. */
  resetBorderColor?: string;
  /** Layout der inneren Items: "stack" (vertical, default) oder "wrap" (horizontal, für compact). */
  layout?: "stack" | "wrap";
  /** RIGHT-Sidebar-Refactor: kollabier-Pattern. Wenn true: nur Title +
   *  Chevron sichtbar, Children werden ein-/ausgeklappt. */
  collapsible?: boolean;
  /** Default-Zustand bei collapsible=true. */
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

export default function LegendSection({
  title,
  c,
  compact = false,
  showSeparator = false,
  showReset = false,
  onReset,
  resetColor,
  resetBorderColor,
  layout = "stack",
  collapsible = false,
  defaultCollapsed = false,
  children,
}: LegendSectionProps) {
  const rColor = resetColor ?? c.accent;
  const rBorder = resetBorderColor ?? c.accentDim;
  const [collapsed, setCollapsed] = useState(defaultCollapsed && collapsible);

  // Wenn collapsible: Title als Button mit Chevron, sonst statisches Div.
  const titleStyle: React.CSSProperties = {
    fontFamily: MONO,
    fontSize: compact ? "0.54rem" : "0.58rem",
    letterSpacing: "0.15em",
    color: c.muted,
    textTransform: "uppercase",
    marginBottom: collapsed ? 0 : (compact ? "0.5rem" : "0.7rem"),
    marginTop: showSeparator ? (compact ? "0.6rem" : "0.9rem") : 0,
    borderTop: showSeparator ? `1px solid ${c.border}` : "none",
    paddingTop: showSeparator ? (compact ? "0.6rem" : "0.7rem") : 0,
  };

  return (
    <>
      {collapsible ? (
        <button
          onClick={() => setCollapsed(v => !v)}
          aria-expanded={!collapsed}
          style={{
            ...titleStyle,
            background: "none", border: "none", padding: 0, cursor: "pointer",
            width: "100%", textAlign: "left",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <span>{title}</span>
          <span style={{ marginLeft: "0.5rem", opacity: 0.7 }}>{collapsed ? "▸" : "▾"}</span>
        </button>
      ) : (
        <div style={titleStyle}>{title}</div>
      )}
      {!collapsed && (
        <div style={layout === "wrap" ? { display: "flex", flexWrap: "wrap", gap: "0.25rem 0.9rem" } : {}}>
          {children}
        </div>
      )}
      {showReset && onReset && !collapsed && (
        <button
          onClick={onReset}
          style={{
            marginTop: "0.5rem",
            width: compact && layout === "wrap" ? "auto" : "100%",
            fontFamily: MONO,
            fontSize: compact ? "0.54rem" : "0.56rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: rColor,
            background: "none",
            border: `1px solid ${rBorder}`,
            padding: "0.25rem 0.5rem",
            cursor: "pointer",
            borderRadius: 4,
          }}
        >
          Alle einblenden
        </button>
      )}
    </>
  );
}
