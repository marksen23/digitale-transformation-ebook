/**
 * readingProgress — "gelesen"-Tracking fürs Werk, geteilt zwischen dem
 * Desktop-Reader (Home.tsx, hat eine eigene lokale Kopie dieser Logik) und
 * dem mobilen Reader-first-Kern (MobileReader/MobileIndexOverlay). Bewusst
 * derselbe localStorage-Key wie Home.tsx ("ebook-completed"), damit der
 * Fortschritt geräteübergreifend im selben Browser konsistent bleibt.
 */
const KEY = "ebook-completed";

export function getCompletedChapters(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function markChapterComplete(id: string) {
  try {
    const cur = getCompletedChapters();
    if (cur.includes(id)) return;
    localStorage.setItem(KEY, JSON.stringify([...cur, id]));
  } catch {
    /* privater Modus o.ä. — Tracking ist ein Komfort-Feature, kein Muss */
  }
}
