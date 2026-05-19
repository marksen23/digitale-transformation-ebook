/**
 * ToolOutputPanel — die schwebende Glas-Karte, in der Tool-Ausgaben
 * des Begriffsnetzes sitzen (Pfad-Explorer, Spannungsfeld-Analyse,
 * Dialog mit dem Begriffsnetz).
 *
 *   ┌─ Glas-Karte mit blur(8-10px) ──────────┐
 *   │  PFAD-EXPLORER                          │
 *   │  ─────────────────────────────────────  │
 *   │  Ersten Knoten anklicken …              │
 *   │  …                                      │
 *   └─────────────────────────────────────────┘
 *
 * Die drei Tool-Panels teilten bisher denselben Wrapper:
 *   position: absolute, left/bottom 1rem, zIndex 50,
 *   background panelBg, border, backdropFilter blur, borderRadius 10,
 *   fontFamily MONO.
 *
 * Die innere Layout-Logik bleibt im Aufrufer — Pfad und Analyse sind
 * Scroll-Container, der Dialog hat seine eigene flex-column-Struktur
 * (Header / Body / Footer mit eigenen Borders).
 *
 * Diese Komponente kapselt nur die Glas-Karte selbst (chrome), nicht
 * den Inhalt. CSS-Klasse `.concept-workfunc-panel` bleibt als Hook
 * für Mobile-Responsive-Override im Stylesheet.
 *
 * Verwendung:
 *   <ToolOutputPanel c={C} visible={pathMode} flavor="scroll" blur={8}>
 *     <SectionLabel c={C} color="#7eb8c8" tracking="tight">Pfad-Explorer</SectionLabel>
 *     {…}
 *   </ToolOutputPanel>
 *
 *   <ToolOutputPanel c={C} visible={chatOpen} flavor="column">
 *     {header} {messages} {input}
 *   </ToolOutputPanel>
 */
import type { Palette } from "@/lib/theme";
import { MONO } from "@/lib/theme";

interface ToolOutputPanelProps {
  c: Palette;
  /** Glas-Hintergrund (z.B. C.panelBg = "rgba(10,10,10,0.96)" / Light: 0.97). */
  background: string;
  /** Wenn false: nicht gerendert. Spart Conditional im Aufrufer. */
  visible: boolean;
  /** "scroll" — Standard für Pfad/Analyse (overflowY auto, padding intern).
   *  "column" — Dialog (flex column, kein eigenes padding, children regeln). */
  flavor?: "scroll" | "column";
  /** Backdrop-Blur in Pixeln. Default 10. */
  blur?: number;
  /** Default 380 (scroll) / min(400px, calc(100vw - 2rem)) (column). */
  width?: string;
  /** Default calc(100vh - 6rem) (scroll) / calc(100% - 5rem) (column). */
  maxHeight?: string;
  /** Default "0.85rem 1rem" (scroll), 0 (column). */
  padding?: string;
  /** Default 0.6rem. */
  fontSize?: string;
  /** Margin overrides — fallback "1rem". */
  insetLeft?: string;
  insetBottom?: string;
  children: React.ReactNode;
}

export default function ToolOutputPanel({
  c,
  background,
  visible,
  flavor = "scroll",
  blur = 10,
  width,
  maxHeight,
  padding,
  fontSize = "0.6rem",
  insetLeft = "1rem",
  insetBottom = "1rem",
  children,
}: ToolOutputPanelProps) {
  if (!visible) return null;

  const isScroll = flavor === "scroll";
  const w = width ?? (isScroll ? undefined : "min(400px, calc(100vw - 2rem))");
  const mh = maxHeight ?? (isScroll ? "calc(100vh - 6rem)" : "calc(100% - 5rem)");
  const p = padding ?? (isScroll ? "0.85rem 1rem" : "0");

  return (
    <div
      className="concept-workfunc-panel"
      style={{
        position: "absolute",
        left: insetLeft,
        bottom: insetBottom,
        zIndex: 50,
        background,
        border: `1px solid ${c.border}`,
        backdropFilter: `blur(${blur}px)`,
        WebkitBackdropFilter: `blur(${blur}px)`,
        borderRadius: 10,
        fontFamily: MONO,
        fontSize,
        padding: p,
        ...(isScroll
          ? {
              maxWidth: 380,
              width: w ?? "calc(100vw - 2rem)",
              maxHeight: mh,
              overflowY: "auto",
            }
          : {
              width: w,
              maxHeight: mh,
              display: "flex",
              flexDirection: "column",
            }),
      }}
    >
      {children}
    </div>
  );
}
