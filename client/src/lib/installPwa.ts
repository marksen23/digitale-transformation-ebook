/**
 * installPwa — Plattform-Detection + Native-Install-Prompt-Vermittlung.
 *
 * Hintergrund:
 *   - Chrome/Edge auf Android und Desktop (Windows/macOS/Linux/ChromeOS)
 *     liefern ein `beforeinstallprompt`-Event, das wir abfangen und auf
 *     Knopfdruck via `prompt()` aufrufen können → echter Ein-Klick-Install.
 *   - Safari (iOS + macOS) hat keinen JS-Install-API. Hier zeigen wir
 *     Schritt-für-Schritt-Anleitung mit dem nativen Share/Datei-Pfad.
 *   - Firefox-Desktop unterstützt PWA-Install nicht. Auf Android hat Firefox
 *     einen eigenen Install-Flow im Browser-Menü.
 *   - Chrome/Firefox auf iOS nutzen WKWebView und können nicht installieren —
 *     der User muss zu Safari wechseln (zeigen wir aber als gleichen Flow).
 *
 * Detection-Strategie: User-Agent für OS, dann Feature-Detection für
 * `beforeinstallprompt`. Standalone-Mode wird über `display-mode: standalone`
 * + iOS-`navigator.standalone` erkannt.
 */

/** BeforeInstallPromptEvent — nicht in lib.dom.d.ts. */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type InstallPlatform =
  | "installed"           // App läuft bereits standalone
  | "ready"               // beforeinstallprompt verfügbar → Ein-Klick
  | "ios"                 // iOS Safari (oder Chrome/Firefox in WKWebView)
  | "macos-safari"        // macOS Safari
  | "android-firefox"     // Firefox auf Android
  | "desktop-firefox"     // Firefox Desktop (kein Install-Support)
  | "manual";             // Unbekannt — generischer Fallback

interface DetectResult {
  platform: InstallPlatform;
  os: "ios" | "android" | "macos" | "windows" | "linux" | "unknown";
}

export function detectInstallPlatform(hasPrompt: boolean): DetectResult {
  if (typeof window === "undefined") return { platform: "manual", os: "unknown" };

  // Installed?
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  if (isStandalone) return { platform: "installed", os: detectOs() };

  const os = detectOs();
  const ua = navigator.userAgent;
  const isFirefox = /Firefox/.test(ua);

  // beforeinstallprompt verfügbar → einfacher Pfad
  if (hasPrompt) return { platform: "ready", os };

  // iOS-Familie (inkl. iPadOS, das sich teils als Mac ausgibt)
  if (os === "ios") return { platform: "ios", os };

  // Android Firefox: kein BIP, aber Browser-Menü kann installieren
  if (os === "android" && isFirefox) return { platform: "android-firefox", os };

  // macOS Safari: Datei → Zum Dock hinzufügen (Safari 17+)
  if (os === "macos" && /Safari/.test(ua) && !/Chrome|Edg|CriOS|FxiOS/.test(ua)) {
    return { platform: "macos-safari", os };
  }

  // Firefox Desktop: kein PWA-Install
  if ((os === "windows" || os === "linux" || os === "macos") && isFirefox) {
    return { platform: "desktop-firefox", os };
  }

  return { platform: "manual", os };
}

function detectOs(): DetectResult["os"] {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;

  // iPadOS 13+ gibt sich als Mac aus — Touch-Test entlarvt es
  if (/iPhone|iPad|iPod/.test(ua) || (/Mac/.test(ua) && "ontouchend" in document)) {
    return "ios";
  }
  if (/Android/.test(ua)) return "android";
  if (/Mac/.test(ua)) return "macos";
  if (/Win/.test(ua)) return "windows";
  if (/Linux|X11/.test(ua)) return "linux";
  return "unknown";
}
