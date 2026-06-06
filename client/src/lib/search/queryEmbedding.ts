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

// Degradations-Tracking: wenn /api/embed wiederholt mit Server-Fehler (502/503,
// z.B. Billing-Block / kein Key) antwortet, ist die semantische Suche temporär
// aus. Wir merken uns das, damit die UI einen dezenten Hinweis zeigen kann
// statt stiller Leere. Wird bei jedem Erfolg zurückgesetzt.
let _semFailStreak = 0;
let _semDegradedSince = 0;
const SEM_DEGRADED_THRESHOLD = 2;   // ab 2 Fehlern in Folge gilt: degradiert

export interface SemanticStatus {
  degraded: boolean;
  since: number;   // Timestamp des Übergangs in degraded, 0 wenn nicht degradiert
}

export function getSemanticStatus(): SemanticStatus {
  return { degraded: _semFailStreak >= SEM_DEGRADED_THRESHOLD, since: _semDegradedSince };
}

function noteSemFailure() {
  _semFailStreak++;
  if (_semFailStreak === SEM_DEGRADED_THRESHOLD) _semDegradedSince = Date.now();
}
function noteSemSuccess() {
  _semFailStreak = 0;
  _semDegradedSince = 0;
}

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
      if (!res.ok) {
        // 5xx / 503 = Server-/Key-/Billing-Problem → Degradation tracken.
        // 4xx (z.B. 400 zu langer Text) NICHT als Degradation werten.
        if (res.status >= 500) noteSemFailure();
        return null;
      }
      const data = await res.json();
      const vec = Array.isArray(data.embedding) ? (data.embedding as number[]) : null;
      if (vec) noteSemSuccess();
      // FIFO-Verdrängung wenn Cache zu groß
      if (cache.size >= MAX_CACHE) {
        const first = cache.keys().next().value;
        if (first) cache.delete(first);
      }
      cache.set(q, vec);
      return vec;
    } catch {
      noteSemFailure();   // Netzwerk-Fehler
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
