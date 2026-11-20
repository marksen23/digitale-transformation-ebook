/**
 * Areas-Source — Redesign Phase 3: Suche als schneller Weg zu allen
 * Bereichen der App, nicht nur zu Inhalten darin. Die Liste kommt aus
 * derselben Quelle wie AppFrame und das mobile Inhaltsverzeichnis
 * (`siteNav`), damit neue Seiten (wie Enkidu) nicht wieder nur in einem
 * Menü auftauchen.
 */
import type { SearchHit, SearchSource } from "@/lib/search/types";
import { lexScore } from "@/lib/search/score";
import { SITE_NAV_CLUSTERS } from "@/lib/siteNav";

interface Area { href: string; title: string; cluster: string }

const AREAS: Area[] = SITE_NAV_CLUSTERS.flatMap(cluster =>
  cluster.items.map(item => ({
    href: item.href,
    title: item.label,
    cluster: cluster.label,
  })),
);

export const areasSource: SearchSource = {
  id: "areas",
  type: "area",
  label: "Bereiche",
  search(q) {
    if (!q.trim()) return [];
    const hits: SearchHit[] = [];
    for (const a of AREAS) {
      const score = lexScore(q, a.title, a.cluster);
      if (score <= 0) continue;
      hits.push({
        id: a.href,
        type: "area",
        title: a.title,
        snippet: a.cluster,
        score,
        anchor: a.href,
        mode: "lex",
      });
    }
    hits.sort((x, y) => y.score - x.score);
    return hits;
  },
};
