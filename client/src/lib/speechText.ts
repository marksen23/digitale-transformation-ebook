/**
 * Texte für die Hörfassung. Reine Zeichenketten, ohne Browser-API.
 */

/** Minimale Kapitelgestalt, unabhängig vom Ebook-Typ. */
export interface ChapterImpulseSource {
  id: string;
  title: string;
  partTitle?: string;
  content?: string;
}

export interface ChapterImpulse<T extends ChapterImpulseSource = ChapterImpulseSource> {
  chapter: T;
  text: string;
}

export function plainSpeechText(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^>\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Die ersten zwei Sätze, gekürzt. Zu kurzer Text bleibt leer. */
export function chapterImpulse(content: string, max = 420): string {
  const plain = plainSpeechText(content);
  if (plain.length < 40) return "";
  const sentences = plain.match(/[^.!?]+[.!?]+(?:\s+|$)/g);
  if (!sentences) return plain.slice(0, max).trim();
  let out = "";
  let count = 0;
  for (const sentence of sentences) {
    if (out && out.length + sentence.length > max) break;
    out += sentence;
    count += 1;
    if (count >= 2) break;
  }
  return out.trim();
}

/** Band-/Teil-Titelseiten (`band3-intro`) und reine Teil-Übersichten. */
const TITLE_PAGE_ID = /^(band|teil)\d+-intro$/i;
const VOLUME_TITLE = /^Band\s+[IVXLCDM]+\b/i;
const OVERVIEW_HEADING = /\b(?:TEIL|BAND)\s+[IVXLCDM]+\b/gi;

export function isVolumeOrTitlePage(chapter: ChapterImpulseSource): boolean {
  if (TITLE_PAGE_ID.test(chapter.id)) return true;
  const title = chapter.title.trim();
  if (VOLUME_TITLE.test(title) && !/\b(Prolog|Kapitel|Epilog|Reflexion)\b/i.test(title)) {
    return true;
  }
  const plain = plainSpeechText(chapter.content ?? "");
  const headings = plain.match(OVERVIEW_HEADING) ?? [];
  const sentences = plain.match(/[.!?]/g) ?? [];
  return headings.length >= 2 && sentences.length === 0;
}

/**
 * Kapitelimpulse in Lesereihenfolge: Titelseiten und Übersichten entfallen,
 * doppelte IDs (Inhaltsverzeichnis-Stubs vor dem Werktext) nur einmal, und
 * zwar mit dem ersten Eintrag, der einen Impuls ergibt.
 */
export function audibleChapterImpulses<T extends ChapterImpulseSource>(
  chapters: T[],
  max = 420,
): ChapterImpulse<T>[] {
  const skipped = new Set<string>();
  const emitted = new Set<string>();
  const out: ChapterImpulse<T>[] = [];
  for (const chapter of chapters) {
    if (emitted.has(chapter.id) || skipped.has(chapter.id)) continue;
    if (isVolumeOrTitlePage(chapter)) {
      skipped.add(chapter.id);
      continue;
    }
    const text = chapterImpulse(chapter.content ?? "", max);
    if (!text) continue;
    emitted.add(chapter.id);
    out.push({ chapter, text });
  }
  return out;
}

export function audibleKernsaetze<T extends { kernsatz: string; answerId: string }>(
  items: T[],
  withdrawnAnswerIds: Iterable<string> = [],
): T[] {
  const blocked = new Set(withdrawnAnswerIds);
  return items.filter(item => item.kernsatz.trim() && item.answerId && !blocked.has(item.answerId));
}
