/**
 * Areas-Source — Redesign Phase 3: Suche als schneller Weg zu allen
 * Bereichen der App, nicht nur zu Inhalten darin. Ohne diese Source
 * findet Cmd-K/Suche nur Kapitel/Begriffe/Philosophen/Resonanzen — wer
 * "Landkarte" oder "Blog" tippt, bekam bisher nichts. Statische Liste,
 * synchron mit AppFrames CLUSTERS (+ Status, öffentlich aber außerhalb
 * der Cluster verlinkt).
 */
import type { SearchHit, SearchSource } from "@/lib/search/types";
import { lexScore } from "@/lib/search/score";

interface Area { href: string; title: string; cluster: string }

const AREAS: Area[] = [
  { href: "/",             title: "Werk",         cluster: "Lesen" },
  { href: "/projekt",      title: "Projekt",      cluster: "Lesen" },
  { href: "/erkunden",     title: "Erkunden",     cluster: "Erkunden" },
  { href: "/begriffsnetz", title: "Begriffsnetz", cluster: "Erkunden" },
  { href: "/landkarte",    title: "Landkarte",    cluster: "Erkunden" },
  { href: "/philosophie",  title: "Philosophie",  cluster: "Erkunden" },
  { href: "/fragen",       title: "Fragen",       cluster: "Mitdenken" },
  { href: "/erkenntnisse", title: "Erkenntnisse", cluster: "Mitdenken" },
  { href: "/resonanzen",   title: "Wissen",       cluster: "Mitdenken" },
  { href: "/live",         title: "Live",         cluster: "Mitdenken" },
  { href: "/statistik",    title: "Statistik",    cluster: "Mitdenken" },
  { href: "/status",       title: "Status",       cluster: "Mitdenken" },
  { href: "/mein-werk",    title: "Mein Werk",    cluster: "Meins" },
  { href: "/blog",         title: "Blog",         cluster: "Meins" },
];

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
