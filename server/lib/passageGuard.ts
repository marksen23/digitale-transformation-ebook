/**
 * Markierter Werktext für /api/passage-resonanz.
 *
 * Die Auswahl kommt vom Client. Sie zählt nur, wenn sie (Leerraum normalisiert)
 * im Kapitel der aufgelösten Stelle steht. Sonst wäre der Endpoint ein
 * allgemeiner Prompt mit einer echten Chunk-ID als Tarnung.
 */

export const PASSAGE_SELECTION_MAX = 8000;
export const PASSAGE_PROMPT_MAX = 2000;

export function normalizePassage(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function selectionInSource(selected: string, sources: string[]): boolean {
  const needle = normalizePassage(selected);
  if (needle.length < 20) return false;
  const hay = normalizePassage(sources.filter((s) => typeof s === "string" && s).join("\n"));
  return hay.includes(needle);
}
