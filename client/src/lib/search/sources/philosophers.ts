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
};
