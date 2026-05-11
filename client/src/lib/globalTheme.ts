/**
 * globalTheme.ts — gemeinsame Dark-Mode-Kontrolle für alle Seiten.
 *
 * Das ebook nutzt die `dark`-Klasse auf <html> als Wahrheits-Quelle
 * (siehe Home.tsx + useEbookTheme.ts). Diese Helper synchronisieren
 * den Zustand mit localStorage und erlauben jeder Seite das Umschalten.
 *
 * Damit funktioniert der Hell-/Dunkel-Toggle auf /resonanzen,
 * /philosophie, /admin/* genauso wie auf der Hauptseite.
 */

const STORAGE_KEY = "ebook-dark";

// Stone-950 (dark) und stone-50 (light) — passen zur Sub-Page-Palette.
// PWA-Header (Mobile Statusleiste / iOS Notch) übernimmt diese Farbe.
const THEME_COLOR_DARK  = "#0c0a09";
const THEME_COLOR_LIGHT = "#fafaf9";

/** Aktualisiert <meta name="theme-color"> für die PWA-Statusleiste. */
function updatePwaThemeColor(isDark: boolean): void {
  if (typeof document === "undefined") return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = isDark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
}

/** Liest gespeicherten Theme-Zustand und appliziert ihn aufs <html>. */
export function syncGlobalTheme(): void {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const isDark = JSON.parse(stored);
      document.documentElement.classList.toggle("dark", !!isDark);
      updatePwaThemeColor(!!isDark);
    } else {
      // Wenn nichts gespeichert: aktuelle DOM-Wahrheit für PWA übernehmen
      updatePwaThemeColor(document.documentElement.classList.contains("dark"));
    }
  } catch {
    // localStorage nicht verfügbar → keine Aktion
  }
}

/** Toggle: schaltet das Theme um und persistiert die Wahl. */
export function toggleGlobalTheme(): boolean {
  const isDark = document.documentElement.classList.contains("dark");
  const next = !isDark;
  document.documentElement.classList.toggle("dark", next);
  updatePwaThemeColor(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignorieren
  }
  return next;
}

/**
 * Cross-Tab-Sync: ein Toggle in Tab A spiegelt nach Tab B/C/… via
 * `storage`-Event. Wird einmalig in main.tsx initialisiert.
 *
 * Returns ein cleanup-Callback (für HMR-Hygiene).
 */
export function initCrossTabThemeSync(): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || e.newValue === null) return;
    try {
      const isDark = JSON.parse(e.newValue);
      document.documentElement.classList.toggle("dark", !!isDark);
      updatePwaThemeColor(!!isDark);
    } catch {
      // ignore parse errors
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
