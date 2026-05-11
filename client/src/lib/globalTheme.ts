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

/** Liest gespeicherten Theme-Zustand und appliziert ihn aufs <html>. */
export function syncGlobalTheme(): void {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const isDark = JSON.parse(stored);
      document.documentElement.classList.toggle("dark", !!isDark);
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignorieren
  }
  return next;
}
