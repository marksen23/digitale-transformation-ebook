/**
 * Persönliche Begriffe und Erkenntnisse. Nur localStorage, kein Konto.
 */

export type BookmarkKind = "concept" | "erkenntnis";

export interface BegriffBookmark {
  kind: BookmarkKind;
  id: string;
  savedAt: string;
}

export const BOOKMARK_KEY = "resonanzvernunft.begriff-bookmarks";

export function toggleBookmark(
  list: BegriffBookmark[],
  kind: BookmarkKind,
  id: string,
  now: string,
): BegriffBookmark[] {
  if (!id) return list;
  const exists = list.some(item => item.kind === kind && item.id === id);
  if (exists) return list.filter(item => !(item.kind === kind && item.id === id));
  return [...list, { kind, id, savedAt: now }];
}

export function densitySince(
  frames: Array<{ date: string; counts: Record<string, number> }>,
  conceptId: string,
  savedAt: string,
): { atBookmark: number; now: number } {
  const day = savedAt.slice(0, 10);
  const now = frames.length ? (frames[frames.length - 1].counts[conceptId] ?? 0) : 0;
  let atBookmark = 0;
  for (const frame of frames) {
    if (frame.date <= day) atBookmark = frame.counts[conceptId] ?? 0;
  }
  return { atBookmark, now };
}

export function insightsSince<T extends { createdAt: string; conceptAnchor: string | null; text: string }>(
  items: T[],
  conceptId: string,
  savedAt: string,
): T[] {
  return items
    .filter(item => item.conceptAnchor === conceptId && item.createdAt >= savedAt && item.text.trim())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function readBookmarks(storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage): BegriffBookmark[] {
  if (!storage) return [];
  try {
    const raw = JSON.parse(storage.getItem(BOOKMARK_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is BegriffBookmark =>
      !!item && (item.kind === "concept" || item.kind === "erkenntnis") && typeof item.id === "string" && typeof item.savedAt === "string",
    );
  } catch {
    return [];
  }
}

export function writeBookmarks(list: BegriffBookmark[], storage: Pick<Storage, "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage): void {
  if (!storage) return;
  try { storage.setItem(BOOKMARK_KEY, JSON.stringify(list)); } catch { /* privater Modus */ }
}
