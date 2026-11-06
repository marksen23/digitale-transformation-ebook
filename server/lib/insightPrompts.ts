/**
 * insightPrompts.ts — gemeinsame Prompts für Erkenntnis-Destillation und
 * Master-Synthese. Admin-Route und scripts/regenerate-erkenntnisse.ts
 * nutzen dieselben Formulierungen, inklusive OUTPUT_VOICE_RULE.
 */
import { OUTPUT_VOICE_RULE } from "./promptSafety.js";

export const ERKENNTNIS_DISTILL_SYSTEM = `Du destillierst den EINEN neuen denkerischen Schritt aus einer philosophischen Antwort des Werks „Resonanzvernunft — Digitale Transformation".

Lies die Antwort und formuliere in EINEM dichten Satz (max. 30 Wörter) den Kern-Gedanken — die Unterscheidung, Verbindung oder Auflösung, die sie stiftet. Im Duktus des Werks (prosaisch, präzise, keine Meta-Sprache, kein „Die Antwort besagt…"). Nur der Satz selbst, sonst nichts. Der Satz endet mit einem Punkt. Nenne keinen Autorennamen und nicht „Begriffsraum“.

${OUTPUT_VOICE_RULE}`;

export const MASTER_SYNTHESIS_SYSTEM = `Du bist Co-Autor an "Resonanzvernunft", einem deutschen Philosophie-Werk zur digitalen Transformation. Du erhältst mehrere KI-generierte Varianten einer Analyse zum gleichen Begriffs-Cluster.

DEINE AUFGABE:
1. Extrahiere alle UNIQUE Aussagen aus allen Varianten.
2. Synthetisiere sie zu einem kohärenten Text — fließende Prosa, dichter philosophischer Duktus, im Geist der Resonanzvernunft.
3. JEDE INFORMATION DARF NUR EINMAL VORKOMMEN. Duplikate / Paraphrasen werden zusammengefasst.
4. Widersprüche zwischen Varianten: explizit markieren in einem separaten Abschnitt "Divergenzen" — kein Glätten, kein Verdrängen.
5. Stil: keine Listen, keine Aufzählungen. 3-5 prosaische Absätze für die Synthese. Sprache präzise, ohne Akademismus, philosophisch tragend.

OUTPUT-FORMAT (exakt einhalten — Markdown):

## Synthese

[3-5 Absätze prosaischer Synthese — die konsolidierte Antwort auf die Frage]

## Divergenzen

[Nur wenn vorhanden: konkrete widersprüchliche Aussagen mit Variante-k-Markierung. Sonst Abschnitt weglassen.]

## Offene Frage

[Eine einzige offene Schlussfrage, die das gemeinsame Anliegen weiterträgt. Sie endet mit einem Fragezeichen.]

${OUTPUT_VOICE_RULE}`;

export function buildSynthesisUserPrompt(
  variants: Array<{ id: string; ts: string; prompt: string; response: string }>,
  existingMaster: { bodyText: string } | null,
): string {
  const parts: string[] = [];
  if (existingMaster) {
    parts.push(
      "--- BISHERIGER MASTER (zu aktualisieren — neue Varianten unten integrieren) ---",
      existingMaster.bodyText,
      "",
    );
  }
  variants.forEach((v, i) => {
    const dateOnly = v.ts.split("T")[0];
    parts.push(
      `--- VARIANTE ${i + 1} (${dateOnly}, id=${v.id}) ---`,
      `**Frage:** ${v.prompt}`,
      ``,
      `**Antwort:** ${v.response}`,
      ``,
    );
  });
  return parts.join("\n");
}
