/**
 * closingQuestion.ts — extrahiert die offene Schlussfrage einer KI-Ausgabe.
 *
 * Jede analytische KI-Ausgabe im Werk endet mit „einer offenen Frage, die der
 * Lesende weitertragen kann". Diese Helper findet diese Frage, damit das
 * WeiterdenkenThread sie als Saatkorn nutzen kann.
 *
 * Spiegelt die server-seitige splitClosingQuestion-Logik (server/index.ts),
 * hier aber nur die Frage extrahiert (nicht den Body abgespalten — der
 * vollständige Output bleibt sichtbar, der Faden hängt darunter an).
 */

/** Letzter Absatz/Satz, der mit „?" endet. Leerstring wenn keine Frage. */
export function extractClosingQuestion(text: string | null | undefined): string {
  if (!text) return "";
  const trimmed = text.trim();
  const paras = trimmed.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  for (let i = paras.length - 1; i >= 0; i--) {
    if (paras[i].endsWith("?")) {
      return paras[i].replace(/^##\s*Offene Frage\s*/i, "").trim();
    }
  }
  const m = trimmed.match(/([^.!?\n]*\?)\s*$/);
  return m ? m[1].trim() : "";
}
