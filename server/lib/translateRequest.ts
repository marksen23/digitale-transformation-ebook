/**
 * /api/translate übersetzt ein Kapitel. Die Sprachkürzel stehen im Prompt;
 * ein freier String wäre eine Anweisung. Nur die Sprachen der Leseansicht
 * sind zugelassen. Der Text bleibt unter der längsten Werk-Sektion.
 */

export const TRANSLATE_TEXT_MAX = 40_000;

export const TRANSLATE_LANGS: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  tr: "Turkish",
  pl: "Polish",
  nl: "Dutch",
  zh: "Chinese (Simplified)",
  ja: "Japanese",
  ar: "Arabic",
  de: "German",
};

export interface ResolvedTranslate {
  text: string;
  targetLang: string;
  sourceLang: string;
  targetName: string;
  sourceName: string;
}

export function resolveTranslateRequest(input: {
  text?: unknown;
  targetLang?: unknown;
  sourceLang?: unknown;
}): ResolvedTranslate | { error: string } {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text || typeof input.targetLang !== "string" || !input.targetLang) {
    return { error: "Text und Zielsprache sind erforderlich." };
  }
  if (text.length > TRANSLATE_TEXT_MAX) {
    return { error: `Text zu lang (max ${TRANSLATE_TEXT_MAX} Zeichen).` };
  }
  const targetLang = input.targetLang;
  const sourceLang = typeof input.sourceLang === "string" && input.sourceLang ? input.sourceLang : "de";
  const targetName = TRANSLATE_LANGS[targetLang];
  const sourceName = TRANSLATE_LANGS[sourceLang];
  if (!targetName || !sourceName) return { error: "Unbekannte Sprache." };
  return { text, targetLang, sourceLang, targetName, sourceName };
}
