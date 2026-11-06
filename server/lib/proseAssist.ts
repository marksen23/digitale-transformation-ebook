/**
 * Gemeinsame Helfer der KI-Prosa-Endpunkte (Thinking-Budget, Fehlertext, Werk-RAG).
 * Aus server/index.ts unverändert herausgelöst.
 */
import { recordRetrieved } from "./citationTracker.js";
import type { FlashGenResult } from "./geminiText.js";
import { buildWerkContext, type RetrievedPassage } from "./werkRetrieval.js";

// ─── KI-Prosa-Endpunkte: gemeinsames Thinking-Budget ─────────────────────
// gemini-2.5-flash verbraucht standardmäßig „Thinking"-Tokens, die vom
// maxOutputTokens-Budget abgehen → die sichtbare Antwort wird abgeschnitten
// (finishReason=MAX_TOKENS), oft genau vor der Schlussfrage. Für reine Prosa
// ist Reasoning nicht nötig: thinkingBudget:0 schaltet es ab, das volle Budget
// fließt in die Antwort. (gemini-2.5-flash akzeptiert 0 — belegt durch den
// seit je produktiven /weiterdenken-Endpunkt.) Per ENV abschaltbar, falls ein
// künftiges Modell 0 nicht mehr erlaubt → dann Budget weglassen (Modell-Default).
/** Sichtbare Prosa-Länge der leserseitigen Endpunkte. Thinking liegt separat obendrauf. */
export const PROSE_MAX_TOKENS = 8192;
/** Kapitelübersetzung: ein ganzer Teil darf nicht am Ausgabe-Limit enden. */
export const TRANSLATE_MAX_TOKENS = 32768;

export const FLASH_THINKING_BUDGET: number | undefined =
  process.env.FLASH_THINKING_BUDGET !== undefined && process.env.FLASH_THINKING_BUDGET !== ""
    ? Number(process.env.FLASH_THINKING_BUDGET)
    : 0;

/** Leser-freundliche deutsche Fehlermeldung aus einem fehlgeschlagenen
 *  generateFlashContent-Resultat (für res.status(502).json({error})). */
export function flashErrorDetail(r: FlashGenResult): string {
  if (r.status === 429) return "Zu viele Anfragen — bitte kurz warten.";
  if (r.status === 503) return "Dienst vorübergehend nicht verfügbar — bitte erneut versuchen.";
  if (r.status === 401 || r.status === 403) return "API-Key nicht autorisiert (401/403) — bitte Key auf Render prüfen.";
  if (r.status === 400) return `Ungültige Anfrage (400) — ${r.errorDetail ?? ""}`.trim();
  return r.errorDetail || "Keine Antwort erhalten.";
}

// ─── Werk-Text-RAG (Tier-1-3-Roadmap, Feature D) ─────────────────────────
// Prepend's einem KI-Prompt die top-K relevantesten Werkpassagen, damit
// die Antwort am Werktext verankert ist (statt frei zu paraphrasieren).
// Graceful degraded — wenn keine Embeddings vorliegen, kommt original
// Prompt unverändert zurück.
export async function withWerkContext(prompt: string, queryHint: string, topK = 4): Promise<{
  enrichedPrompt: string;
  passages: RetrievedPassage[];
  expandedQueries?: string[];
}> {
  const { passages, contextBlock, expandedQueries } = await buildWerkContext(queryHint, topK);
  if (passages.length === 0) {
    return { enrichedPrompt: prompt, passages: [], expandedQueries };
  }
  // R6: jede retrieval-instance zählen (auch wenn nicht zitiert wird).
  recordRetrieved(passages.map(p => ({ source: p.source, id: p.id })));
  const enriched = [
    contextBlock,
    "ANWEISUNG: Beziehe dich beim Antworten auf den obigen autorisierten Kontext.",
    "  - Werk-Passagen sind aus dem Buchtext direkt — zitiere via [chunkId], z.B. [a1b2c3d4e5f6].",
    "  - 'Frühere Begegnungen' sind bereits kuratierte Resonanzen aus dem Korpus — wenn eine ältere",
    "    Antwort die aktuelle Frage schon teilweise berührt, baue darauf auf und zitiere sie via",
    "    ihrer Resonanz-ID (z.B. [MPF4WM18-FF4843F1]). Wiederhole NICHT in voller Länge, sondern",
    "    verweise und erweitere.",
    "  - Erfinde keine IDs — nur tatsächlich vorhandene aus dem Kontext oben.",
    "",
    "--- AUFGABE ---",
    prompt,
  ].join("\n");
  return { enrichedPrompt: enriched, passages, expandedQueries };
}
