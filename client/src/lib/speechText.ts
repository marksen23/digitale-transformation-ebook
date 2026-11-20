/**
 * Texte für die Hörfassung. Reine Zeichenketten, ohne Browser-API.
 */

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

export function audibleKernsaetze<T extends { kernsatz: string; answerId: string }>(
  items: T[],
  withdrawnAnswerIds: Iterable<string> = [],
): T[] {
  const blocked = new Set(withdrawnAnswerIds);
  return items.filter(item => item.kernsatz.trim() && item.answerId && !blocked.has(item.answerId));
}
