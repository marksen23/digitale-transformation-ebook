/**
 * Chapters-Source — Such-Adapter für ebook.chapters (Home.tsx Reader)
 * + werk-chunks-basierte semantische Suche.
 *
 * Lex-Pfad: Substring auf Titel + Content der Kapitel.
 * Sem-Pfad: Cosine gegen werk-chunks.json Embeddings. Da chunks feingranular
 *   sind (505 Stücke), liefern sie präzise Begriffs-Matches. Wir mappen
 *   den gefundenen Chunk auf sein Kapitel zurück (chunk.chapter) für ein
 *   konsistentes Treffer-Schema mit dem Lex-Pfad.
 */
import type { SearchHit, SearchSource } from "@/lib/search/types";
import { extractSnippet } from "@/lib/search/highlight";
import { lexScore } from "@/lib/search/score";
import { getQueryEmbedding, cosineSim } from "@/lib/search/queryEmbedding";

interface Chapter {
  id: string;
  title: string;
  content: string;
  part?: string;
}

interface Ebook {
  chapters: Chapter[];
}

interface WerkChunk {
  id: string;
  chapter: string;
  chapterTitle?: string;
  text: string;
  embedding?: number[];
}

interface WerkChunksFile {
  chunks: WerkChunk[];
  model?: string;
}

// Lazy Singleton-Cache der Chunks (nur einmal geladen)
let chunksCache: WerkChunk[] | null = null;
let chunksPromise: Promise<WerkChunk[] | null> | null = null;

async function loadWerkChunks(): Promise<WerkChunk[] | null> {
  if (chunksCache) return chunksCache;
  if (chunksPromise) return chunksPromise;
  chunksPromise = fetch("/werk-chunks.json", { cache: "no-cache" })
    .then(r => r.ok ? (r.json() as Promise<WerkChunksFile>) : null)
    .then(data => {
      chunksCache = data?.chunks ?? null;
      return chunksCache;
    })
    .catch(() => null);
  return chunksPromise;
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
      const [queryVec, chunks] = await Promise.all([
        getQueryEmbedding(q),
        loadWerkChunks(),
      ]);
      if (!queryVec || !chunks) return [];
      // Per-Chapter besten Chunk halten (sonst dominieren 5x dasselbe Kapitel)
      const bestByChapter = new Map<string, { score: number; chunk: WerkChunk }>();
      for (const c of chunks) {
        if (!c.embedding) continue;
        const score = cosineSim(queryVec, c.embedding);
        if (score < 0.4) continue;
        const prev = bestByChapter.get(c.chapter);
        if (!prev || score > prev.score) bestByChapter.set(c.chapter, { score, chunk: c });
      }
      const hits: SearchHit[] = [];
      bestByChapter.forEach(({ score, chunk }, chapterId) => {
        const ch = ebook.chapters.find(x => x.id === chapterId);
        if (!ch) return;
        hits.push({
          id: ch.id,
          type: "chapter",
          title: ch.title ?? chapterId,
          snippet: extractSnippet(chunk.text, q, 60).slice(0, 200),
          score,
          payload: ch,
          anchor: ch.id,
        });
      });
      hits.sort((a, b) => b.score - a.score);
      return hits.slice(0, ctx.limit);
    },
  };
}
