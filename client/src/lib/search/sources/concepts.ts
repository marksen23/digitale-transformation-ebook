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
};
