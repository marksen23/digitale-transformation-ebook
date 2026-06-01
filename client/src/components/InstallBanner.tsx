/**
 * InstallBanner — selbst-auftauchender Install-Hinweis am oberen Bildschirm­
 * rand, sobald `beforeinstallprompt` feuert.
 *
 * Verhalten:
 *   - Lauscht global auf das Event. Wenn die PWA-Kriterien erfüllt sind
 *     (Manifest, SW, HTTPS, Engagement, nicht bereits installiert, nicht
 *     vor <90 Tagen abgelehnt) feuert Chrome/Edge das Event automatisch.
 *   - Banner slidet von oben rein, zeigt zwei Aktionen:
 *       [Installieren]  → ruft prompt() → native Chrome-Dialog
 *       [Später]        → schließt Banner, localStorage-Flag setzt 30-Tage-
 *                         Sperre damit der Banner nicht spamt
 *   - Auf bereits installierter App (display-mode: standalone) wird NIE
 *     gerendert.
 *
 * Komplementär zum InstallButton (Topbar-Icon ⤓): wer das Banner schließt
 * findet die Funktion immer noch dort wieder, wenn er sie später nutzen will.
 *
 * iOS / Safari: dort feuert beforeinstallprompt nie (Apple-Limitation).
 * Der Banner erscheint dann gar nicht erst — kein Spam mit Anleitungs-
 * Modal von alleine. User muss dort den ⤓-Knopf in der Topbar aktiv klicken.
 */
import { useEffect, useState } from "react";
import { useEbookTheme } from "@/hooks/useEbookTheme";
import { C_DARK, C_LIGHT, MONO, RADIUS, SERIF_BODY, TRACKED } from "@/lib/theme";
import type { BeforeInstallPromptEvent } from "@/lib/installPwa";

const DISMISS_STORAGE_KEY = "install-banner-dismissed-at";
const DISMISS_COOLDOWN_DAYS = 30;

export default function InstallBanner() {
  const isDark = useEbookTheme();
  const C = isDark ? C_DARK : C_LIGHT;

  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [recentlyDismissed, setRecentlyDismissed] = useState(false);

  useEffect(() => {
    // Standalone-Mode? Dann ist die App schon installiert — Banner nie zeigen.
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true
    ) {
      setInstalled(true);
      return;
    }

    // Dismiss-Cooldown prüfen
    const dismissed = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (dismissed) {
      const ageDays = (Date.now() - Number(dismissed)) / (1000 * 60 * 60 * 24);
      if (ageDays < DISMISS_COOLDOWN_DAYS) {
        setRecentlyDismissed(true);
      }
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      // Diagnose-Log: User kann in DevTools-Console sehen ob BIP feuert.
      console.info(
        "[InstallBanner] beforeinstallprompt fired — PWA install ready",
        { platforms: (e as BeforeInstallPromptEvent).platforms },
      );
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      console.info("[InstallBanner] App installed");
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Diagnostik beim Mount — hilft beim Debuggen warum BIP nicht feuert.
    // Sichtbar im Browser-DevTools-Console.
    void (async () => {
      try {
        const swReg = await navigator.serviceWorker?.getRegistration?.();
        console.info("[InstallBanner] PWA-Diagnose:", {
          serviceWorker: swReg?.active ? "active" : swReg ? "registered (not active)" : "none",
          httpsOrLocalhost: location.protocol === "https:" || location.hostname === "localhost",
          standalone: window.matchMedia("(display-mode: standalone)").matches,
          manifestLink: !!document.querySelector('link[rel="manifest"]'),
          dismissedRecently: !!dismissed && (Date.now() - Number(dismissed)) / 86400000 < DISMISS_COOLDOWN_DAYS,
          // Falls beforeinstallprompt nach 5 Sek nicht gefeuert hat, ist
          // wahrscheinlich entweder die App schon installiert, oder der
          // Browser ist Safari/Firefox (ohne BIP-API), oder die 90-Tage-
          // Ablehn-Cooldown läuft noch.
          note: "Wenn BIP innerhalb 5s nicht feuert: User-Agent, Engagement-Heuristik oder Cooldown prüfen.",
        });
      } catch (err) {
        console.warn("[InstallBanner] Diagnose-Fehler", err);
      }
    })();

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || recentlyDismissed || !promptEvent) return null;

  const handleInstall = async () => {
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
        console.info("[InstallBanner] User accepted install prompt");
      } else {
        console.info("[InstallBanner] User dismissed install prompt");
        rememberDismiss();
      }
      setPromptEvent(null);
    } catch (err) {
      console.warn("[InstallBanner] prompt() failed", err);
      setPromptEvent(null);
    }
  };

  const handleLater = () => {
    rememberDismiss();
    setRecentlyDismissed(true);
    setPromptEvent(null);
  };

  return (
    <div
      role="region"
      aria-label="App-Installation"
      style={{
        position: "fixed",
        // Bottom-Sheet-Pattern: keine Kollision mit dynamischen Top-Bars
        // (AppFrame 40/48px, Home-Reader-Topbar, ResonanzenPage-Sticky-Hero).
        // Vorher saß der Banner bei top: 48px hartkodiert — auf Mobile/Reader
        // brach das Layout, das Banner wirkte als würde es nach oben verschwinden.
        bottom: 0,
        left: 0, right: 0, zIndex: 250,
        background: isDark ? "rgba(28,25,23,0.97)" : "rgba(255,253,247,0.99)",
        borderTop: `1px solid ${C.accentDim}`,
        boxShadow: "0 -4px 16px rgba(0,0,0,0.18)",
        padding: `0.7rem 1rem calc(0.7rem + env(safe-area-inset-bottom, 0px))`,
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.8rem",
        backdropFilter: "blur(12px) saturate(140%)",
        WebkitBackdropFilter: "blur(12px) saturate(140%)",
        animation: "install-banner-slide-in 0.32s ease-out",
      }}
    >
      <div style={{ flex: "1 1 auto", minWidth: 200 }}>
        <div style={{
          fontFamily: MONO, fontSize: "0.58rem",
          letterSpacing: TRACKED.tight, textTransform: "uppercase",
          color: C.accent, marginBottom: "0.18rem",
        }}>
          ⤓ Als App installieren
        </div>
        <div style={{
          fontFamily: SERIF_BODY, fontSize: "0.85rem",
          fontStyle: "italic", color: C.text, lineHeight: 1.4,
        }}>
          Offline lesen, schneller starten, eigenes Fenster — wie eine native App.
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
        <button
          type="button"
          onClick={handleLater}
          style={{
            fontFamily: MONO, fontSize: "0.6rem", letterSpacing: TRACKED.tight,
            textTransform: "uppercase",
            color: C.muted, background: "transparent",
            border: `1px solid ${C.border}`,
            padding: "0.5rem 0.85rem", cursor: "pointer",
            borderRadius: RADIUS.button,
            transition: "all 0.15s",
            minHeight: 40,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = C.muted; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}
        >
          Später
        </button>
        <button
          type="button"
          onClick={handleInstall}
          style={{
            fontFamily: MONO, fontSize: "0.6rem", letterSpacing: TRACKED.tight,
            textTransform: "uppercase", fontWeight: 600,
            color: isDark ? "#0c0a09" : "#ffffff",
            background: C.accent,
            border: `1px solid ${C.accent}`,
            padding: "0.5rem 1rem", cursor: "pointer",
            borderRadius: RADIUS.button,
            transition: "all 0.15s",
            minHeight: 40,
            boxShadow: `0 2px 8px ${C.accent}33`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 4px 12px ${C.accent}55`; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = `0 2px 8px ${C.accent}33`; }}
        >
          Installieren
        </button>
      </div>
      <style>{`
        @keyframes install-banner-slide-in {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function rememberDismiss() {
  try {
    localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage gesperrt (private mode / cookies disabled) — egal,
    // dann zeigt sich der Banner halt beim nächsten Besuch wieder.
  }
}
