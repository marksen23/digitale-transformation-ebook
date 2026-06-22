/**
 * geminiText.ts — gemeinsamer Gemini-Text-Aufruf (generateContent).
 *
 * Drop-in zu claudeClient.ts:callClaude (identische Signatur), damit Pre-Scoring
 * + Master-Synthese den LLM-Anbieter per ENV wählen können. Konsolidiert alles
 * auf Gemini (eine API, eine Rechnung) — der user-seitige Generator ist
 * `gemini-2.5-flash`; als unabhängiger RICHTER nutzen wir per Default
 * `gemini-2.5-pro` (stärker, anderes Modell → kein Selbst-Bewertungs-Bias).
 *
 * Request-/Response-Form wie die bewährten Endpunkte (server/index.ts).
 * Key-Failover via getKeys()/classifyError() aus embeddingClient — Keys der
 * Reihe nach, Rotation bei billing/quota/auth. Wirft nie; null bei Fehler.
 */
import { getKeys, classifyError } from "./embeddingClient.js";

export const DEFAULT_GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-2.5-pro";

let _claudeFailLogged = 0;
const FAIL_LOG_LIMIT = 3;

// Letzter Fehler des jüngsten callGemini — damit Endpunkte den echten Grund
// (401/429/billing/quota) sichtbar machen können, statt nur null zu schlucken.
let _lastError: string | null = null;
export function getLastGeminiError(): string | null { return _lastError; }

export function isGeminiAvailable(): boolean { return getKeys().length > 0; }

/**
 * Ruft Gemini mit system + user-Prompt auf. Returnt den Text-Output oder null
 * bei Fehler/fehlendem Key. Wirft nie. Signatur identisch zu callClaude.
 */
export async function callGemini(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}): Promise<string | null> {
  const keys = getKeys();
  if (keys.length === 0) {
    _lastError = "Kein GEMINI_API_KEY[S]/FALLBACK gesetzt";
    if (_claudeFailLogged < FAIL_LOG_LIMIT) { _claudeFailLogged++; console.warn(`[callGemini] ${_lastError}`); }
    return null;
  }
  const model = opts.model?.trim() || DEFAULT_GEMINI_TEXT_MODEL;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.user }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 4096,
    },
  });

  let lastErr = "unbekannt";
  // Keys der Reihe nach probieren; bei billing/quota/auth zum nächsten rotieren.
  for (let i = 0; i < keys.length; i++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys[i]}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body },
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        let msg = errText;
        try { msg = JSON.parse(errText)?.error?.message || errText; } catch { /* roher Text */ }
        lastErr = `HTTP ${res.status}: ${msg}`.slice(0, 300);
        const cls = classifyError(res.status, errText);
        // bei billing/quota/auth: nächster Key könnte auf anderem GCP-Projekt liegen
        if (cls === "billing" || cls === "quota" || cls === "auth") continue;
        break; // andere Fehler (400 Bad Request etc.) → nicht durch Rotation lösbar
      }
      const data = await res.json();
      const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text === "string" && text.trim()) { _lastError = null; return text; }
      lastErr = "leere Antwort (kein Text-Part)";
      break;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }

  _lastError = lastErr.slice(0, 300);
  if (_claudeFailLogged < FAIL_LOG_LIMIT) {
    _claudeFailLogged++;
    console.error(`[callGemini] failed (model=${model}): ${_lastError}`);
  }
  return null;
}
