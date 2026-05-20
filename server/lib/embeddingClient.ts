/**
 * embeddingClient.ts — gemeinsamer Gemini-Embedding-Client.
 *
 * Vorher dupliziert: in scripts/build-resonanzen-index.ts (build-time)
 * und gleich kommend in server/lib/echoDetector.ts (at-ingest). Jetzt
 * an einer Stelle, beide importieren von hier.
 *
 * Verwendet Gemini gemini-embedding-001 — gleiche Modell-Wahl wie der
 * Korpus-Index (scripts/build-resonanzen-index.ts), sonst wären die
 * Cosine-Werte nicht vergleichbar. Modell-Name aus ENV überschreibbar
 * (GEMINI_EMBED_MODEL), damit beide Stellen synchron bleiben können.
 *
 * Historie: bis ~04/2026 text-embedding-004 (768-dim), dann von Google
 * aus dem v1beta-API entfernt → 404 NOT_FOUND. Umstellung auf
 * gemini-embedding-001 (3072-dim Matryoshka).
 */

const GEMINI_EMBED_MODEL = (process.env.GEMINI_EMBED_MODEL ?? "").trim() || "gemini-embedding-001";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:embedContent`;

/**
 * Erzeugt ein Embedding für `text` via Gemini.
 * Truncate auf 8000 chars (Gemini-Limit pro Request).
 *
 * Returnt null bei Fehler (Netzwerk, API, fehlender Key). Wirft nie.
 */
// Diagnose-Counter: erste N Fehler ausführlich loggen, danach silent.
// Verhindert Log-Spam bei systematischem Fehler (z.B. Key invalid → 401
// auf jeden Call).
let _embedFailLogged = 0;
const EMBED_FAIL_LOG_LIMIT = 3;

export async function fetchEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // gemini-embedding-001 verlangt das model-Feld zusätzlich zur URL.
        model: `models/${GEMINI_EMBED_MODEL}`,
        content: { parts: [{ text: text.slice(0, 8000) }] },
      }),
    });
    if (!res.ok) {
      if (_embedFailLogged < EMBED_FAIL_LOG_LIMIT) {
        _embedFailLogged++;
        const body = await res.text().catch(() => "(no body)");
        console.error(`[fetchEmbedding] ${res.status} ${res.statusText}: ${body.slice(0, 400)}`);
      }
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data.embedding?.values)) {
      if (_embedFailLogged < EMBED_FAIL_LOG_LIMIT) {
        _embedFailLogged++;
        console.error(`[fetchEmbedding] unexpected response shape: ${JSON.stringify(data).slice(0, 400)}`);
      }
      return null;
    }
    return data.embedding.values;
  } catch (err) {
    if (_embedFailLogged < EMBED_FAIL_LOG_LIMIT) {
      _embedFailLogged++;
      console.error(`[fetchEmbedding] network: ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  }
}

/**
 * Cosine-Ähnlichkeit zweier gleich-dimensionierter Vektoren. 0 bei
 * Null-Norm (vermeidet NaN). Symmetrisch, nicht normalisiert auf [-1,1] —
 * Gemini-Embeddings sind in der Praxis fast immer ≥0.
 */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
