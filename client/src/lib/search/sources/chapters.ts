/**
 * Chapters-Source — Such-Adapter für ebook.chapters (Home.tsx Reader).
 *
 * Replaziert die alte useEffect-Filter-Logik aus Home.tsx Z. 306-314.
 * Lexikalisch (Substring auf Titel + Content). Semantik kommt in M6.
 */
import type { SearchHit, SearchSource } from "@/lib/search/types";
import { extractSnippet } from "@/lib/search/highlight";
import { lexScore } from "@/lib/search/score";

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
  };
}
