/**
 * similarity.ts — Cosine-Ranking über bereits geladene Vektoren.
 * Rein, ohne I/O: die Router-Schicht lädt die Korpora und embeddet die Anfrage.
 */
import { cosineSim } from "./embeddingClient.js";

export interface ScoredHit {
  id: string;
  score: number;
}

export function topSimilar(
  query: number[],
  entries: Array<{ id: string; vector?: number[] | null }>,
  opts: { minScore: number; limit: number },
): ScoredHit[] {
  const scored: ScoredHit[] = [];
  for (const e of entries) {
    const v = e.vector;
    if (!v || v.length === 0) continue;
    const score = cosineSim(query, v);
    if (score < opts.minScore) continue;
    scored.push({ id: e.id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, opts.limit));
}

export interface WerkChapterHit {
  /** Kapitel-ID — ein Treffer pro Kapitel (bester Chunk). */
  id: string;
  score: number;
  chunkId: string;
  text: string;
}

/** Bester Chunk je Kapitel, dann die stärksten Kapitel. Entspricht der
 *  bisherigen Client-Suche in search/sources/chapters.ts. */
export function topWerkChapters(
  query: number[],
  chunks: Array<{ id: string; chapter: string; text: string; embedding?: number[] | null }>,
  opts: { minScore: number; limit: number },
): WerkChapterHit[] {
  const best = new Map<string, WerkChapterHit>();
  for (const c of chunks) {
    if (!c.embedding || c.embedding.length === 0) continue;
    const score = cosineSim(query, c.embedding);
    if (score < opts.minScore) continue;
    const prev = best.get(c.chapter);
    if (!prev || score > prev.score) {
      best.set(c.chapter, { id: c.chapter, score, chunkId: c.id, text: c.text });
    }
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, Math.max(0, opts.limit));
}

export interface PublicWerkChunk {
  id: string;
  chapter: string;
  part: string;
  position: number;
  text: string;
  chapterTitle?: string;
}

/** Lesetext ohne Vektor. `embedding` darf nicht in der Antwort stehen. */
export function chunkForReader(c: {
  id: string;
  chapter: string;
  part: string;
  position: number;
  text: string;
  chapterTitle?: string;
}): PublicWerkChunk {
  const out: PublicWerkChunk = {
    id: c.id,
    chapter: c.chapter,
    part: c.part,
    position: c.position,
    text: c.text,
  };
  if (c.chapterTitle) out.chapterTitle = c.chapterTitle;
  return out;
}
