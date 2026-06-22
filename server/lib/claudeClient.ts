/**
 * claudeClient.ts — gemeinsamer Anthropic-Claude-Aufruf-Helper.
 *
 * Bisher waren alle LLM-Calls Gemini (server/index.ts inline). Master-
 * Synthese braucht nuancierteren Output (mehrere Varianten konsolidieren,
 * Widersprüche markieren, philosophischen Duktus halten) — dafür ist
 * Claude besser geeignet.
 *
 * Pattern wie embeddingClient.ts: ENV-konfigurierbar, fail-soft, klare
 * Error-Logs.
 *
 * Modell-Name aus ENV überschreibbar — wenn Anthropic ein neues Modell
 * raushaut, hier ohne Code-Change wechseln (analog GEMINI_EMBED_MODEL).
 */
import Anthropic from "@anthropic-ai/sdk";

const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim() || undefined;
const client = apiKey ? new Anthropic({ apiKey }) : null;

// Aktuelle Sonnet-Generation. claude-sonnet-4-5 wurde abgelöst → ein Call darauf
// liefert 404 model_not_found (→ callClaude null → „Claude-Call fehlgeschlagen").
// Per CLAUDE_MODEL-ENV jederzeit überschreibbar, wenn Anthropic neu released.
const DEFAULT_MODEL = process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-4-6";

// Erste paar Fehler ausführlich loggen — danach silent, damit
// bei systematischem Problem (z.B. ungültiger Key) die Logs nicht überlaufen.
let _claudeFailLogged = 0;
const CLAUDE_FAIL_LOG_LIMIT = 3;

// Letzter Fehler des jüngsten callClaude — damit Endpunkte den echten Grund
// (401/429/404/credit) sichtbar machen können, statt nur null zu schlucken.
let _lastError: string | null = null;
export function getLastClaudeError(): string | null { return _lastError; }

export function isClaudeAvailable(): boolean {
  return !!client;
}

export function getClaudeModel(): string {
  return DEFAULT_MODEL;
}

/**
 * Ruft Claude mit system + user-Prompt auf. Returnt den Text-Output oder
 * null bei Fehler/fehlendem Key. Wirft nie.
 */
export async function callClaude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  if (!client) {
    _lastError = "ANTHROPIC_API_KEY nicht gesetzt";
    if (_claudeFailLogged < CLAUDE_FAIL_LOG_LIMIT) {
      _claudeFailLogged++;
      console.warn("[callClaude] ANTHROPIC_API_KEY nicht gesetzt — Synthese-Endpunkt wird 502 liefern");
    }
    return null;
  }
  try {
    const res = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.7,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    // Anthropic-SDK content ist Array von ContentBlock — wir extrahieren
    // alle text-Blöcke und joinen sie. Tool-Use-Blöcke etc. ignorieren wir,
    // weil dieser Helper rein text-getrieben ist.
    _lastError = null;
    return res.content
      .filter(b => b.type === "text")
      .map(b => (b as { text: string }).text)
      .join("\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Status aus dem SDK-Fehler (APIError) mitnehmen, wenn vorhanden.
    const status = (err as { status?: number })?.status;
    _lastError = `${status ? `HTTP ${status}: ` : ""}${msg}`.slice(0, 300);
    if (_claudeFailLogged < CLAUDE_FAIL_LOG_LIMIT) {
      _claudeFailLogged++;
      console.error(`[callClaude] failed (model=${DEFAULT_MODEL}): ${_lastError}`);
    }
    return null;
  }
}
