/**
 * FocusOverlay — zentriertes Lese-Modal mit Backdrop-Blur.
 *
 * Wird in den Sub-Pages benutzt, wenn etwas Einzelnes prominent
 * dargestellt werden soll: ein Zitat im Buch-View, eine Tool-Anleitung
 * im Begriffsnetz, eine Information die der Hintergrund durchscheinen
 * lassen soll.
 *
 * Geometrie + Sprache sind angelehnt an die typografische Setzkunst des
 * Werks: Lora-Italic für die zentrale Aussage, MONO für die
 * Akzent-Beschriftung, Aldus-Fleuron (❦) als Marker.
 *
 * pointerEvents: none auf dem Wrapper, damit Klicks unter dem Overlay
 * weiter zur SVG/Karte durchgereicht werden. Wenn ein Tool seine erste
 * Auswahl entgegennimmt, verschwindet das Overlay automatisch.
 *
 * Verwendung:
 *   <FocusOverlay
 *     visible={hovered !== null}
 *     accentColor="#f59e0b"
 *     label="❦ Maurice Merleau-Ponty"
 *     labelSubtitle="1908–1961"
 *     title="Der Leib ist unser Anker in der Welt."
 *     isDark={isDark}
 *     c={C}
 *   />
 */
import type { Palette } from "@/lib/theme";
import { MONO, SERIF_BODY } from "@/lib/theme";

interface FocusOverlayProps {
  /** Wenn false: nicht gerendert. Spart einen Conditional in den Call-Sites. */
  visible: boolean;
  /** Akzent-Farbe für Label + Border-Tönung. Default: #f59e0b (Amber/Gold). */
  accentColor?: string;
  /** Mono-Label oben (z.B. "❦ Maurice Merleau-Ponty" oder "◈ Pfad-Explorer"). */
  label?: string;
  /** Optional ein zweiter, dezenter Subtitle-String nach dem Label
   *  (z.B. Lebensdaten "1908–1961") — wird gemutet daneben gerendert. */
  labelSubtitle?: string;
  /** Zentrale, große Aussage (Lora-Italic, clamp 1.05-2.4rem). */
  title: string;
  /** Optionale kleine Italic-Zeile unter dem Title (Tool-Hint). */
  subtitle?: string;
  /** Dark-Mode-Flag — beeinflusst Background-Transparenz und Text-Farbe. */
  isDark: boolean;
  c: Palette;
  /** Default: "min(560px, 80%)" — für Quotes etwas größer (740px). */
  maxWidth?: string;
  /** z-index. Default 180 — über Sidebars (50), unter Mobile-Sheet (200). */
  zIndex?: number;
}

export default function FocusOverlay({
  visible,
  accentColor = "#f59e0b",
  label,
  labelSubtitle,
  title,
  subtitle,
  isDark,
  c,
  maxWidth = "min(560px, 80%)",
  zIndex = 180,
}: FocusOverlayProps) {
  if (!visible) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
        zIndex,
        padding: "2rem",
      }}
    >
      <div style={{
        maxWidth,
        background: isDark ? "rgba(12,10,9,0.84)" : "rgba(255,253,247,0.90)",
        backdropFilter: "blur(10px) saturate(140%)",
        WebkitBackdropFilter: "blur(10px) saturate(140%)",
        border: `1px solid ${accentColor}55`,
        borderRadius: 14,
        padding: "1.6rem 2rem",
        boxShadow: `0 20px 60px rgba(0,0,0,0.35), 0 0 0 1px ${accentColor}22`,
        textAlign: "center",
      }}>
        {label && (
          <div style={{
            fontFamily: MONO, fontSize: "0.6rem",
            letterSpacing: "0.22em", textTransform: "uppercase",
            color: accentColor, marginBottom: "0.7rem",
          }}>
            {label}
            {labelSubtitle && (
              <span style={{ color: c.muted, marginLeft: "0.5rem", letterSpacing: "0.18em" }}>
                {labelSubtitle}
              </span>
            )}
          </div>
        )}
        <p style={{
          fontFamily: SERIF_BODY,
          fontSize: subtitle ? "clamp(1.05rem, 2vw, 1.45rem)" : "clamp(1.4rem, 3.2vw, 2.4rem)",
          fontStyle: "italic",
          fontWeight: 500,
          lineHeight: 1.32,
          color: c.textBright,
          margin: 0,
          letterSpacing: "-0.005em",
        }}>
          {title}
        </p>
        {subtitle && (
          <p style={{
            fontFamily: SERIF_BODY, fontSize: "0.82rem", fontStyle: "italic",
            color: c.textDim, lineHeight: 1.55,
            margin: "0.7rem 0 0",
          }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
