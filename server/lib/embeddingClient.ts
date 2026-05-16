/**
 * embeddingClient.ts — gemeinsamer Gemini-Embedding-Client.
 *
 * Vorher dupliziert: in scripts/build-resonanzen-index.ts (build-time)
 * und gleich kommend in server/lib/echoDetector.ts (at-ingest). Jetzt
 * an einer Stelle, beide importieren von hier.
 *
 * Verwendet Gemini text-embedding-004 (768-dim) — gleiche Modell-Wahl
 * wie der Korpus-Index, sonst wären die Cosine-Werte nicht vergleichbar.
 */

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent";

/**
 * Erzeugt ein Embedding für `text` via Gemini text-embedding-004.
 * Truncate auf 8000 chars (Gemini-Limit pro Request).
 *
 * Returnt null bei Fehler (Netzwerk, API, fehlender Key). Wirft nie.
 */
export async function fetchEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { parts: [{ text: text.slice(0, 8000) }] } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.embedding?.values) ? data.embedding.values : null;
  } catch {
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
