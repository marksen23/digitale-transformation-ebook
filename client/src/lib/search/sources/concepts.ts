/**
 * Concepts-Source — Such-Adapter für NODES (Begriffsnetz).
 *
 * Durchsucht label, fullLabel, description. Liefert Hits, die auch
 * im SearchDropdown anklickbar sind (Klick selektiert den Knoten im Graph).
 */
import type { SearchHit, SearchSource } from "@/lib/search/types";
import { extractSnippet } from "@/lib/search/highlight";
import { lexScore } from "@/lib/search/score";
import { NODES } from "@/data/conceptGraph";
import { getQueryEmbedding, cosineSim } from "@/lib/search/queryEmbedding";

// Lazy-Cache für concepts-embeddings.json
interface EmbeddingsFile { embeddings: Record<string, number[]> }
let embCache: Record<string, number[]> | null = null;
let embPromise: Promise<Record<string, number[]> | null> | null = null;

async function loadConceptEmbeddings(): Promise<Record<string, number[]> | null> {
  if (embCache) return embCache;
  if (embPromise) return embPromise;
  embPromise = fetch("/concepts-embeddings.json", { cache: "no-cache" })
    .then(r => r.ok ? (r.json() as Promise<EmbeddingsFile>) : null)
    .then(data => {
      embCache = data?.embeddings ?? null;
      return embCache;
    })
    .catch(() => null);
  return embPromise;
}

export const conceptsSource: SearchSource = {
  id: "concepts",
  type: "concept",
  label: "Begriffe",
  search(q) {
    if (!q.trim()) return [];
    const lower = q.toLowerCase();
    const hits: SearchHit[] = [];
    for (const n of NODES) {
      const label = n.label ?? n.id;
      const fullLabel = n.fullLabel ?? label;
      const description = n.description ?? "";
      if (
        !label.toLowerCase().includes(lower) &&
        !fullLabel.toLowerCase().includes(lower) &&
        !description.toLowerCase().includes(lower)
      ) {
        continue;
      }
      const score = lexScore(q, fullLabel, description);
      hits.push({
        id: n.id,
        type: "concept",
        title: fullLabel.replace(/\n/g, " "),
        snippet: extractSnippet(description, q, 60).slice(0, 200),
        score,
        payload: n,
      });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits;
  },
  async semanticSearch(q, ctx) {
    if (!q.trim()) return [];
    const [queryVec, embeddings] = await Promise.all([
      getQueryEmbedding(q),
      loadConceptEmbeddings(),
    ]);
    if (!queryVec || !embeddings) return [];
    const hits: SearchHit[] = [];
    for (const n of NODES) {
      const vec = embeddings[n.id];
      if (!vec) continue;
      const score = cosineSim(queryVec, vec);
      if (score < 0.4) continue;
      const fullLabel = (n.fullLabel ?? n.label).replace(/\n/g, " ");
      hits.push({
        id: n.id,
        type: "concept",
        title: fullLabel,
        snippet: extractSnippet(n.description ?? "", q, 60).slice(0, 200),
        score,
        payload: n,
      });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, ctx.limit);
  },
};
