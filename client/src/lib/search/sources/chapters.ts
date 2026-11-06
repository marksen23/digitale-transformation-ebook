/**
 * Chapters-Source — Such-Adapter für ebook.chapters (Home.tsx Reader)
 * + werk-chunks-basierte semantische Suche.
 *
 * Lex-Pfad: Substring auf Titel + Content der Kapitel.
 * Sem-Pfad: der Server vergleicht die Anfrage mit den Werk-Chunk-Embeddings
 *   und liefert pro Kapitel den besten Chunk (Text + Score). Die Vektoren
 *   selbst verlassen den Server nicht.
 */
import type { SearchHit, SearchSource } from "@/lib/search/types";
import { extractSnippet } from "@/lib/search/highlight";
import { lexScore } from "@/lib/search/score";
import { searchCorpus } from "@/lib/search/corpusSimilar";

interface Chapter {
  id: string;
  title: string;
  content: string;
  part?: string;
}

interface Ebook {
  chapters: Chapter[];
}

export function createChaptersSource(ebook: Ebook | null): SearchSource {
  return {
    id: "chapters",
    type: "chapter",
    label: "Werk-Kapitel",
    search(q) {
      if (!ebook || !q.trim()) return [];
      const lower = q.toLowerCase();
      const hits: SearchHit[] = [];
      for (const ch of ebook.chapters) {
        if (!ch.title?.toLowerCase().includes(lower) && !ch.content?.toLowerCase().includes(lower)) {
          continue;
        }
        const score = lexScore(q, ch.title ?? "", ch.content ?? "");
        hits.push({
          id: ch.id,
          type: "chapter",
          title: ch.title ?? ch.id,
          snippet: extractSnippet(ch.content ?? "", q, 60).slice(0, 200),
          score,
          payload: ch,
          anchor: ch.id,
        });
      }
      hits.sort((a, b) => b.score - a.score);
      return hits;
    },
    async semanticSearch(q, ctx) {
      if (!ebook || !q.trim()) return [];
      const ranked = await searchCorpus("werk", q, { limit: ctx.limit, minScore: 0.4 });
      if (!ranked) return [];
      const hits: SearchHit[] = [];
      for (const hit of ranked) {
        const ch = ebook.chapters.find(x => x.id === hit.id);
        if (!ch) continue;
        hits.push({
          id: ch.id,
          type: "chapter",
          title: ch.title ?? hit.id,
          snippet: extractSnippet(hit.text ?? "", q, 60).slice(0, 200),
          score: hit.score,
          payload: ch,
          anchor: ch.id,
        });
      }
      hits.sort((a, b) => b.score - a.score);
      return hits.slice(0, ctx.limit);
    },
  };
}
