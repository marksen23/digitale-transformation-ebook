/**
 * glossary — teilt die Eintrags-Parsing-Logik des Glossar-Kapitels zwischen
 * dem Desktop-Reader (Home.tsx, eigene inline Implementierung) und dem
 * mobilen Reader-first-Kern (MobileReader), der bislang gar keine
 * spezialisierte Glossar-Ansicht hatte (nur Fließtext ohne Anfangs-
 * buchstaben-Register).
 */
export interface GlossaryEntry { term: string; definition: string }

/** Parst "Begriff  Definitionstext …"-Zeilen (zwei-oder-mehr Leerzeichen als
 *  Trenner) aus dem rohen Kapiteltext, alphabetisch sortiert (de-Kollation). */
export function parseGlossaryEntries(content: string): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];
  const lines = content.split("\n");
  let currentTerm = "";
  let currentDef = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\s\-()„"]+?)\s{2,}(.+)$/);
    if (match) {
      if (currentTerm) entries.push({ term: currentTerm, definition: currentDef.trim() });
      currentTerm = match[1].trim();
      currentDef = match[2];
    } else if (currentTerm) {
      currentDef += " " + trimmed;
    }
  }
  if (currentTerm) entries.push({ term: currentTerm, definition: currentDef.trim() });

  entries.sort((a, b) => a.term.localeCompare(b.term, "de"));
  return entries;
}

/** Gruppiert bereits sortierte Einträge nach Anfangsbuchstabe. */
export function groupGlossaryByLetter(entries: GlossaryEntry[]): Map<string, GlossaryEntry[]> {
  const grouped = new Map<string, GlossaryEntry[]>();
  for (const entry of entries) {
    const letter = entry.term[0].toUpperCase();
    const list = grouped.get(letter);
    if (list) list.push(entry); else grouped.set(letter, [entry]);
  }
  return grouped;
}
