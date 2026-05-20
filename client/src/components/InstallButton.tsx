/**
 * InstallButton — der globale "App installieren"-Knopf.
 *
 * Verhalten je Plattform:
 *   - Chrome/Edge auf Android + Desktop → echter Ein-Klick-Install via
 *     beforeinstallprompt-Event.
 *   - iOS Safari, macOS Safari, Firefox-Android → Modal mit konkreter
 *     Schritt-für-Schritt-Anleitung (Apple/Mozilla erlauben keinen
 *     JS-API für direkten Install).
 *   - Firefox Desktop → Modal mit Hinweis (Firefox unterstützt PWA-
 *     Install auf Desktop nicht; alternativ Lesezeichen).
 *   - Bereits installiert (display-mode: standalone) → Button versteckt.
 *
 * Wird in AppFrame in der Topbar gerendert, damit er auf jeder Seite
 * erreichbar ist. Der bestehende Lade-Button auf Home.tsx kann diese
 * Komponente wiederverwenden.
 */
import { useEffect, useMemo, useState } from "react";
import { useEbookTheme } from "@/hooks/useEbookTheme";
import { C_DARK, C_LIGHT, MONO, RADIUS, SERIF_BODY, TRACKED } from "@/lib/theme";
import {
  detectInstallPlatform,
  type BeforeInstallPromptEvent,
  type InstallPlatform,
} from "@/lib/installPwa";

interface InstallButtonProps {
  /** Optionale className für externes Styling. */
  className?: string;
  /** Optionale Variante: "icon" zeigt nur ⤓ ohne Label, "label" zeigt
   *  "Installieren". Default: "label". */
  variant?: "icon" | "label";
}

export default function InstallButton({ className, variant = "label" }: InstallButtonProps) {
  const isDark = useEbookTheme();
  const C = isDark ? C_DARK : C_LIGHT;

  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [installed, setInstalled] = useState(false);

  // beforeinstallprompt einfangen — Browser feuert es einmal beim Page-Load
  // wenn die Site PWA-Install-Kriterien erfüllt (manifest, SW, HTTPS).
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setShowModal(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Initial-Check für Standalone-Mode
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true
    ) {
      setInstalled(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const detection = useMemo(
    () => detectInstallPlatform(!!promptEvent),
    [promptEvent],
  );

  // Already installed → don't render
  if (installed || detection.platform === "installed") return null;

  const handleClick = async () => {
    if (detection.platform === "ready" && promptEvent) {
      // Ein-Klick-Pfad: nativen Prompt aufrufen
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === "accepted") setInstalled(true);
        setPromptEvent(null);
      } catch (err) {
        // Manche Browser werfen wenn prompt() mehrfach aufgerufen wird
        console.warn("Install prompt failed", err);
        setShowModal(true);
      }
      return;
    }
    // Alle anderen Plattformen → Anleitung
    setShowModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="App installieren"
        title="App installieren"
        className={`appframe-tap ${className ?? ""}`}
        style={{
          fontFamily: MONO,
          fontSize: variant === "icon" ? "0.95rem" : "0.6rem",
          letterSpacing: variant === "icon" ? undefined : TRACKED.tight,
          textTransform: variant === "icon" ? undefined : "uppercase",
          color: C.accent,
          background: "transparent",
          border: `1px solid ${C.accentDim}`,
          padding: variant === "icon" ? 0 : "0.5rem 0.75rem",
          width: variant === "icon" ? 30 : undefined,
          height: variant === "icon" ? 30 : undefined,
          cursor: "pointer",
          borderRadius: RADIUS.button,
          transition: "all 0.15s",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          gap: "0.4rem",
          lineHeight: 1,
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = isDark ? "rgba(245,158,11,0.08)" : "rgba(180,83,9,0.06)";
          e.currentTarget.style.borderColor = C.accent;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.borderColor = C.accentDim;
        }}
      >
        <span aria-hidden="true">⤓</span>
        {variant === "label" && <span>Installieren</span>}
      </button>
      {showModal && (
        <InstallInstructions
          platform={detection.platform}
          isDark={isDark}
          C={C}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ─── Platform-spezifische Anleitungen ────────────────────────────────────────

interface StepCardProps {
  platform: InstallPlatform;
  isDark: boolean;
  C: typeof C_DARK;
  onClose: () => void;
}

function InstallInstructions({ platform, isDark, C, onClose }: StepCardProps) {
  // Schließen bei Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const content = getInstructions(platform);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-dialog-title"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: isDark ? "rgba(28,25,23,0.98)" : "rgba(255,253,247,0.99)",
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: "1.4rem 1.6rem 1.5rem",
          maxWidth: 460, width: "100%",
          maxHeight: "calc(100dvh - 2rem)", overflowY: "auto",
          boxShadow: "0 18px 56px rgba(0,0,0,0.35)",
        }}
      >
        <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.9rem", gap: "1rem" }}>
          <h2
            id="install-dialog-title"
            style={{
              margin: 0,
              fontFamily: MONO, fontSize: "0.66rem",
              letterSpacing: TRACKED.tight,
              textTransform: "uppercase",
              color: C.accent,
            }}
          >
            {content.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            style={{
              fontFamily: MONO, fontSize: "1rem",
              color: C.muted, background: "transparent",
              border: "none", cursor: "pointer", padding: "0.2rem 0.4rem",
              lineHeight: 1,
            }}
          >×</button>
        </header>

        {content.intro && (
          <p style={{
            margin: "0 0 1rem",
            fontFamily: SERIF_BODY, fontSize: "0.92rem",
            fontStyle: "italic", color: C.textDim,
            lineHeight: 1.5,
          }}>
            {content.intro}
          </p>
        )}

        <ol style={{
          margin: 0, padding: 0, listStyle: "none",
          display: "flex", flexDirection: "column", gap: "0.8rem",
        }}>
          {content.steps.map((step, i) => (
            <li
              key={i}
              style={{
                display: "flex", gap: "0.7rem", alignItems: "flex-start",
                fontFamily: SERIF_BODY, fontSize: "0.92rem",
                color: C.text, lineHeight: 1.45,
              }}
            >
              <span style={{
                flexShrink: 0,
                width: 22, height: 22, borderRadius: "50%",
                background: C.accentDim, color: isDark ? "#0c0a09" : "#ffffff",
                fontFamily: MONO, fontSize: "0.62rem",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                marginTop: "0.1rem",
              }}>
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        {content.footnote && (
          <p style={{
            margin: "1.1rem 0 0",
            fontFamily: MONO, fontSize: "0.62rem",
            letterSpacing: "0.05em",
            color: C.muted, lineHeight: 1.5,
          }}>
            {content.footnote}
          </p>
        )}
      </div>
    </div>
  );
}

interface InstructionContent {
  title: string;
  intro?: string;
  steps: React.ReactNode[];
  footnote?: React.ReactNode;
}

function getInstructions(platform: InstallPlatform): InstructionContent {
  switch (platform) {
    case "ios":
      return {
        title: "Auf dem iPhone / iPad installieren",
        intro:
          "Apple erlaubt keinen direkten Install-Knopf — die App muss über das Teilen-Menü zum Home-Bildschirm hinzugefügt werden.",
        steps: [
          <>Tippe in Safari unten in der Adressleiste auf das <b>Teilen-Symbol</b> <span style={{ fontFamily: "monospace" }}>(⎍)</span>.</>,
          <>Wähle <b>„Zum Home-Bildschirm"</b> aus der Liste.</>,
          <>Bestätige oben rechts mit <b>„Hinzufügen"</b>. Die App erscheint dann mit eigenem Icon im Home-Screen.</>,
        ],
        footnote:
          "Hinweis: In Chrome oder Firefox auf iOS funktioniert das nicht — diese Browser nutzen Apples WebKit und haben keinen eigenen Install-Pfad. Bitte erst in Safari öffnen.",
      };

    case "macos-safari":
      return {
        title: "Auf dem Mac installieren",
        intro:
          "Safari 17+ erlaubt das Hinzufügen zum Dock direkt aus dem Datei-Menü.",
        steps: [
          <>Öffne in Safari das <b>Datei-Menü</b> (oben in der Menüleiste).</>,
          <>Wähle <b>„Zum Dock hinzufügen…"</b>.</>,
          <>Bestätige im Dialog mit <b>„Hinzufügen"</b>. Die App erscheint als eigenständiges Fenster im Dock.</>,
        ],
        footnote:
          "Tipp: In Chrome oder Edge auf dem Mac kannst du stattdessen auf den Install-Knopf in der Adressleiste klicken — dort funktioniert auch der Ein-Klick-Pfad.",
      };

    case "android-chrome":
      return {
        title: "Auf Android mit Chrome installieren",
        intro:
          "Der direkte Install-Prompt ist gerade nicht verfügbar — möglicherweise wurde er kürzlich abgelehnt (90 Tage Cooldown) oder der Service Worker ist noch nicht aktiv. So geht es manuell:",
        steps: [
          <>Tippe in Chrome auf das <b>Drei-Punkte-Menü</b> <span style={{ fontFamily: "monospace" }}>(⋮)</span> oben rechts.</>,
          <>Wähle <b>„App installieren"</b> oder <b>„Zur Startseite hinzufügen"</b> (je nach Chrome-Version).</>,
          <>Bestätige die Installation. Die App erscheint im App-Drawer mit eigenem Icon und Splash-Screen.</>,
        ],
        footnote:
          "Tipp: Lade die Seite einmal neu und warte ca. 30 Sekunden — manchmal feuert Chrome den Install-Prompt verzögert, sobald der Service Worker aktiv ist. Dann erscheint dieser Knopf als echter Ein-Klick-Install.",
      };

    case "android-firefox":
      return {
        title: "Auf Android mit Firefox installieren",
        steps: [
          <>Tippe auf das <b>Drei-Punkte-Menü</b> oben rechts.</>,
          <>Wähle <b>„Installieren"</b> oder <b>„Zum Startbildschirm hinzufügen"</b>.</>,
          <>Bestätige die Installation. Die App erscheint im Launcher.</>,
        ],
        footnote:
          "Tipp: In Chrome auf Android wird der Install-Knopf direkt funktionieren — versuche es dort für den Ein-Tap-Pfad.",
      };

    case "desktop-chrome":
      return {
        title: "Auf dem Desktop mit Chrome / Edge installieren",
        intro:
          "Der direkte Install-Prompt ist gerade nicht verfügbar — entweder wurde er kürzlich abgelehnt oder der Service Worker ist noch nicht bereit. So geht es manuell:",
        steps: [
          <>Schau in die <b>Adressleiste</b>: ganz rechts erscheint oft ein kleines <b>Install-Icon</b> <span style={{ fontFamily: "monospace" }}>(⊕)</span> oder Monitor-mit-Pfeil-Symbol. Ein Klick installiert direkt.</>,
          <>Alternativ: Öffne das <b>Drei-Punkte-Menü</b> oben rechts → <b>„Resonanzvernunft installieren"</b> oder <b>„App installieren"</b>.</>,
          <>Die App startet danach in einem eigenständigen Fenster — wie eine native Anwendung.</>,
        ],
        footnote:
          "Tipp: Bei vielen Browsern ist nach einigen Sekunden ein direkter Ein-Klick-Install möglich. Lade die Seite einmal neu und versuche es erneut.",
      };

    case "desktop-firefox":
      return {
        title: "Firefox unterstützt PWA-Install nicht",
        intro:
          "Firefox auf Desktop kann diese App leider nicht als eigenständige Anwendung installieren — Mozilla hat das Feature 2021 entfernt.",
        steps: [
          <>Setze die Seite als <b>Lesezeichen</b> mit <kbd>Strg+D</kbd> (Windows/Linux) bzw. <kbd>⌘+D</kbd> (macOS).</>,
          <>Oder öffne die Seite in <b>Chrome / Edge</b> — dort findest du einen Install-Knopf in der Adressleiste.</>,
        ],
        footnote:
          "Im Browser läuft die App vollständig offline (Service Worker) — eine Installation ist nicht zwingend nötig.",
      };

    case "manual":
    default:
      return {
        title: "App installieren",
        intro:
          "In deinem Browser ist kein direkter Install-Pfad verfügbar — versuche eine der folgenden Optionen:",
        steps: [
          <>Suche in der <b>Adressleiste</b> nach einem Install-Symbol (oft ein kleiner Monitor mit Pfeil).</>,
          <>Oder öffne das <b>Browser-Menü</b> (drei Punkte / drei Striche) und suche nach „App installieren" oder „Zum Home-Bildschirm".</>,
          <>Alternativ: Setze die Seite als Lesezeichen. Sie funktioniert vollständig offline.</>,
        ],
      };
  }
}
