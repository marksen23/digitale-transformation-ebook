/**
 * Query-Embedding-Cache für die Hybrid-Suche.
 *
 * Eine Such-Query wird oft mehrfach pro Tipp-Vorgang ausgewertet (zwei
 * Sources rufen semanticSearch parallel). Damit nicht zwei /api/embed-Calls
 * für denselben Query gleichzeitig laufen, halten wir eine kleine
 * inflight-Map (per Query-String).
 *
 * Cache ist NICHT persistent — User-Sessions sollen frische Embeddings
 * sehen, falls das Modell sich ändert.
 */

const inflight = new Map<string, Promise<number[] | null>>();
const cache = new Map<string, number[] | null>();
const MAX_CACHE = 50;

export async function getQueryEmbedding(query: string): Promise<number[] | null> {
  const q = query.trim();
  if (!q) return null;
  if (cache.has(q)) return cache.get(q) ?? null;
  if (inflight.has(q)) return inflight.get(q)!;

  const p = (async () => {
    try {
      const res = await fetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: q }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const vec = Array.isArray(data.embedding) ? (data.embedding as number[]) : null;
      // FIFO-Verdrängung wenn Cache zu groß
      if (cache.size >= MAX_CACHE) {
        const first = cache.keys().next().value;
        if (first) cache.delete(first);
      }
      cache.set(q, vec);
      return vec;
    } catch {
      return null;
    } finally {
      inflight.delete(q);
    }
  })();
  inflight.set(q, p);
  return p;
}

/** Cosine-Similarity zwischen zwei gleichlangen Vektoren. */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
