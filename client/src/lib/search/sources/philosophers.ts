/**
 * Philosophers-Source — Such-Adapter für PhilosophyPage.
 *
 * Sucht in Name, Tradition-Label, Key-Works-Titeln, Concepts.
 * Auswahl im Dropdown selektiert den Philosophen für Detail-Panel.
 */
import type { SearchHit, SearchSource } from "@/lib/search/types";
import { extractSnippet } from "@/lib/search/highlight";
import { lexScore } from "@/lib/search/score";
import { philosophersByBirth, getTradition, type Philosopher } from "@/data/philosophyMap";
import { getQueryEmbedding, cosineSim } from "@/lib/search/queryEmbedding";

interface EmbeddingsFile { embeddings: Record<string, number[]> }
let embCache: Record<string, number[]> | null = null;
let embPromise: Promise<Record<string, number[]> | null> | null = null;

async function loadPhilEmbeddings(): Promise<Record<string, number[]> | null> {
  if (embCache) return embCache;
  if (embPromise) return embPromise;
  embPromise = fetch("/philosophers-embeddings.json", { cache: "no-cache" })
    .then(r => r.ok ? (r.json() as Promise<EmbeddingsFile>) : null)
    .then(data => {
      embCache = data?.embeddings ?? null;
      return embCache;
    })
    .catch(() => null);
  return embPromise;
}

export const philosophersSource: SearchSource = {
  id: "philosophers",
  type: "philosopher",
  label: "Philosophen",
  search(q) {
    if (!q.trim()) return [];
    const lower = q.toLowerCase();
    const all = philosophersByBirth();
    const hits: SearchHit[] = [];
    for (const p of all as Philosopher[]) {
      const tradLabel = getTradition(p.tradition)?.name ?? "";
      const worksText = (p.keyWorks ?? []).map(w => w.title).join(" · ");
      const conceptsText = (p.concepts ?? []).join(" · ");
      const haystack = `${p.name} ${tradLabel} ${worksText} ${conceptsText}`.toLowerCase();
      if (!haystack.includes(lower)) continue;
      const score = lexScore(q, p.name, `${worksText} ${conceptsText}`);
      const snippetParts = [tradLabel, worksText].filter(Boolean).join(" · ");
      hits.push({
        id: p.id ?? p.name,
        type: "philosopher",
        title: p.name,
        snippet: extractSnippet(snippetParts || conceptsText, q, 60).slice(0, 200),
        score,
        payload: p,
      });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits;
  },
  async semanticSearch(q, ctx) {
    if (!q.trim()) return [];
    const [queryVec, embeddings] = await Promise.all([
      getQueryEmbedding(q),
      loadPhilEmbeddings(),
    ]);
    if (!queryVec || !embeddings) return [];
    const all = philosophersByBirth();
    const hits: SearchHit[] = [];
    for (const p of all as Philosopher[]) {
      const vec = embeddings[p.id];
      if (!vec) continue;
      const score = cosineSim(queryVec, vec);
      if (score < 0.4) continue;
      const tradLabel = getTradition(p.tradition)?.name ?? "";
      const snippetText = `${tradLabel} · ${p.resonanzNote ?? ""}`;
      hits.push({
        id: p.id,
        type: "philosopher",
        title: p.name,
        snippet: extractSnippet(snippetText, q, 60).slice(0, 200),
        score,
        payload: p,
      });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, ctx.limit);
  },
};
