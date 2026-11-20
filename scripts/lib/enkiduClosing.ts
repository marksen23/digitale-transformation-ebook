/**
 * Enkidu-Abschlussformel „Nach diesem Gespräch warten drei kurze Fragen auf
 * dich — nicht über mich, sondern über dich.“
 *
 * Bis 2026-11-20 verlangte der Enkidu-Systemprompt diesen Satz als
 * Gesprächsabschluss. Gemini hängte ihn an jede Antwort, so stand er in 55
 * Korpus-Texten. Prompt und „Nachklang“-Fragebogen sind entfernt, die Texte
 * bereinigt. Der Validator (Regel `enkidu-closing-announcement`) und der
 * Korpus-Test in scripts/__tests__/enkiduClosing.test.ts nutzen dieses Muster,
 * damit der Satz nicht unbemerkt zurückkehrt.
 */

/** Erkennt die Formel (beide Strichvarianten, optionale Hervorhebung). */
export const ENKIDU_CLOSING_RE =
  /(?:[*_]{0,2})Nach (?:diesem|unserem) Gespräch warten drei (?:kurze )?Fragen auf dich\s*[—–-]\s*nicht über mich, sondern über dich\.?(?:[*_]{0,2})/i;

export function hasEnkiduClosing(text: string): boolean {
  return ENKIDU_CLOSING_RE.test(text);
}

/**
 * Entfernt die Formel, wenn sie als eigener Absatz steht (so kam sie in allen
 * bekannten Fällen vor). Andere Absätze bleiben Wort für Wort erhalten.
 * Gibt `changed: false` zurück, wenn kein eigenständiger Formel-Absatz da ist.
 */
export function stripEnkiduClosing(text: string): { text: string; changed: boolean } {
  const paras = text.split(/\n[ \t]*\n/);
  const kept = paras.filter(p => {
    const t = p.trim();
    if (!t) return true;
    const m = t.match(ENKIDU_CLOSING_RE);
    return !(m && m[0].length === t.length);
  });
  if (kept.length === paras.length) return { text, changed: false };
  return { text: kept.join("\n\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "") + (text.endsWith("\n") ? "\n" : ""), changed: true };
}
