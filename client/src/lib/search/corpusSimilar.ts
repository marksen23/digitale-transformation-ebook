/**
 * corpusSimilar.ts — semantische Suche über den Server.
 *
 * Der Browser schickt den Anfragetext und bekommt die besten ids + Scores.
 * Die Embedding-Dateien (mehrere MB) bleiben auf dem Server.
 */
import { noteSemanticResult } from "@/lib/search/queryEmbedding";

export type SimilarCorpus = "resonanzen" | "werk" | "concepts" | "philosophers";

export interface CorpusHit {
  id: string;
  score: number;
  chunkId?: string;
  text?: string;
}

const cache = new Map<string, CorpusHit[]>();
const inflight = new Map<string, Promise<CorpusHit[] | null>>();
const MAX_CACHE = 50;

export async function searchCorpus(
  corpus: SimilarCorpus,
  text: string,
  opts: { limit: number; minScore?: number },
): Promise<CorpusHit[] | null> {
  const q = text.trim();
  if (!q) return [];
  const minScore = opts.minScore ?? 0.4;
  const key = `${corpus}\n${opts.limit}\n${minScore}\n${q}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async (): Promise<CorpusHit[] | null> => {
    try {
      const res = await fetch("/api/corpus/similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpus, text: q, limit: opts.limit, minScore }),
      });
      if (!res.ok) {
        if (res.status >= 500) noteSemanticResult(false, q);
        return null;
      }
      const data = await res.json() as { hits?: CorpusHit[] };
      const hits = Array.isArray(data.hits) ? data.hits : [];
      noteSemanticResult(true, q);
      if (cache.size >= MAX_CACHE) {
        const first = cache.keys().next().value;
        if (first) cache.delete(first);
      }
      cache.set(key, hits);
      return hits;
    } catch {
      noteSemanticResult(false, q);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}
