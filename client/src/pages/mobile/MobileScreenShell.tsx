/**
 * MobileScreenShell — der wiederkehrende Vollbild-Rahmen der mobilen
 * Werkzeug-Bildschirme (Philosophie, Landkarte, Fragen, Erkenntnisse,
 * Mein Werk, Projekt, Betrieb): ‹-Zurück, groß getrackter Titel, rechts
 * ausgerichteter Meta-Slot, darunter der scrollende Inhalt. Kein AppFrame —
 * dieselbe „reader-first"-Vollbild-Logik wie MobileReader.
 */
import { MONO, type Palette } from "@/lib/theme";
import { toggleGlobalTheme } from "@/lib/globalTheme";

interface Props {
  C: Palette;
  title: string;
  meta?: React.ReactNode;
  onBack?: () => void;
  /** Zeigt einen ☉/☾-Umschalter im Header — die einzige Stelle, an der
   *  Hell/Dunkel auf dem Telefon noch erreichbar ist, seit AppFrame's
   *  Header auf den vollflächigen Mobile-Screens unterdrückt wird. */
  isDark?: boolean;
  children: React.ReactNode;
}

export default function MobileScreenShell({ C, title, meta, onBack, isDark, children }: Props) {
  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex", flexDirection: "column",
      background: C.void, paddingTop: "env(safe-area-inset-top, 0px)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", flexShrink: 0 }}>
        <button
          type="button" onClick={onBack ?? (() => window.history.back())} aria-label="Zurück"
          style={{ minWidth: 44, minHeight: 44, background: "none", border: "none", color: C.textDim, fontFamily: MONO, fontSize: 16, cursor: "pointer" }}
        >‹</button>
        <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.28em", textTransform: "uppercase", color: C.accentText }}>{title}</span>
        {meta != null && (
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", color: C.muted, flexShrink: 0 }}>{meta}</span>
        )}
        {isDark != null && (
          <button
            type="button" onClick={() => toggleGlobalTheme()} aria-label={isDark ? "Hell-Modus" : "Dunkel-Modus"}
            style={{ marginLeft: meta == null ? "auto" : 10, minWidth: 44, minHeight: 44, background: "none", border: "none", color: C.accentText, fontFamily: MONO, fontSize: 15, cursor: "pointer", flexShrink: 0 }}
          >{isDark ? "☉" : "☾"}</button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "4px 18px 24px" }}>
        {children}
      </div>
    </div>
  );
}
