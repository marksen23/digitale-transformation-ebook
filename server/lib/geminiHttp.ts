/**
 * geminiHttp.ts — Gemini-REST ohne API-Key in der URL.
 *
 * Der Key lag bisher im Query-String (`?key=`). fetch-Fehler enthalten die
 * Request-URL, und die landete in Server-Logs und vereinzelt in
 * Client-Antworten. `x-goog-api-key` ist der von Google dokumentierte Header
 * und erscheint nicht in der URL.
 */

const GEMINI_ORIGIN = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiGenerateUrl(model = "gemini-2.5-flash"): string {
  return `${GEMINI_ORIGIN}/${model}:generateContent`;
}

export function geminiStreamUrl(model = "gemini-2.5-flash"): string {
  return `${GEMINI_ORIGIN}/${model}:streamGenerateContent?alt=sse`;
}

export function geminiEmbedUrl(model: string): string {
  return `${GEMINI_ORIGIN}/${model}:embedContent`;
}

export function geminiAuthHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  };
}

/** Entfernt Query-Keys und bekannte Env-Secrets aus Text, der geloggt oder an Clients geht. */
export function redactSecrets(text: string): string {
  let out = String(text ?? "").replace(/([?&]key=)[^&\s'"]+/gi, "$1[redacted]");
  const secrets = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_FALLBACK,
    process.env.GEMINI_API_KEYS,
    process.env.ANTHROPIC_API_KEY,
    process.env.GITHUB_TOKEN,
    process.env.ADMIN_TOKEN,
  ];
  for (const secret of secrets) {
    if (!secret) continue;
    for (const part of secret.split(",")) {
      const key = part.trim();
      if (key.length >= 8) out = out.split(key).join("[redacted]");
    }
  }
  return out;
}
