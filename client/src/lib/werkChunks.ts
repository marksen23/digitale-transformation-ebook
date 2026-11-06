/**
 * werkChunks.ts — geteilte Typen + Chunk-Helfer für den Werk-Reader.
 *
 * Extrahiert aus WerkPage.tsx, damit MobileReader dieselbe Chunk-/
 * Deoverlap-Logik nutzt statt sie zu duplizieren.
 */

export interface EbookChapter {
  id: string;
  title: string;
  subtitle: string | null;
  chapter: number | null;
  part: string;
  partTitle: string;
  content: string;
}

export interface EbookFile {
  meta: { title: string; subtitle: string; author: string; date: string; copyright: string };
  parts: Array<{ id: string; title: string; subtitle?: string }>;
  chapters: EbookChapter[];
}

export interface WerkChunk {
  id: string;
  chapter: string;
  part: string;
  position: number;
  text: string;
  chapterTitle?: string;
  /** 3072-dim Embedding — der Löwenanteil der Dateigröße; nur die semantische Suche liest es. */
  embedding?: number[];
}

export interface WerkChunksFile {
  chunkCount: number;
  chunks: WerkChunk[];
}

// Kapiteltext ohne Embeddings. Der Server liefert nur das angefragte Kapitel
// (`/api/werk/chunks`) bzw. eine id→Kapitel-Karte (`/api/werk/chunk-map`).
const chapterCache = new Map<string, WerkChunk[]>();
const chapterInflight = new Map<string, Promise<WerkChunk[] | null>>();

export function loadWerkChapterChunks(chapterId: string): Promise<WerkChunk[] | null> {
  const cached = chapterCache.get(chapterId);
  if (cached) return Promise.resolve(cached);
  const pending = chapterInflight.get(chapterId);
  if (pending) return pending;
  const job = fetch(`/api/werk/chunks?chapter=${encodeURIComponent(chapterId)}`)
    .then(r => r.ok ? r.json() as Promise<{ chunks?: WerkChunk[] }> : null)
    .then(data => {
      chapterInflight.delete(chapterId);
      if (!data?.chunks) return null;
      chapterCache.set(chapterId, data.chunks);
      return data.chunks;
    })
    .catch(() => {
      chapterInflight.delete(chapterId);
      return null;
    });
  chapterInflight.set(chapterId, job);
  return job;
}

let chunkIndexPromise: Promise<Map<string, string> | null> | null = null;

/** id → chapter, ohne Chunk-Text und ohne Vektoren. Für „Zur Passage". */
export function loadWerkChunkIndex(): Promise<Map<string, string> | null> {
  if (!chunkIndexPromise) {
    chunkIndexPromise = fetch("/api/werk/chunk-map")
      .then(r => r.ok ? r.json() as Promise<{ chunks?: Array<{ id: string; chapter: string }> }> : null)
      .then(data => {
        if (!data?.chunks) { chunkIndexPromise = null; return null; }
        const map = new Map<string, string>();
        for (const c of data.chunks) map.set(c.id, c.chapter);
        return map;
      })
      .catch(() => { chunkIndexPromise = null; return null; });
  }
  return chunkIndexPromise;
}

/** Grober Satz-Splitter — genügt, um den 1-Satz-Overlap zwischen aufeinander
 *  folgenden RAG-Chunks zu erkennen (beide Chunks teilen denselben Quelltext,
 *  also liefert derselbe Splitter identische Satz-Strings). */
export function splitSentencesForDisplay(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]+["'»)\]]*\s*/g) ?? [text])
    .map(s => s.trim())
    .filter(Boolean);
}

/** Ent-überlappt eine geordnete Liste von Chunk-Texten für die ANZEIGE:
 *  entfernt aus jedem Chunk die führenden Sätze, die bereits am Ende des
 *  vorigen Chunks standen (Sliding-Window-Overlap aus build-werk-chunks.ts).
 *  Robust gegen Lücken (kein gemeinsamer Satz → k=0 → unverändert). */
export function deoverlapTexts(texts: string[]): string[] {
  const out: string[] = [];
  let prevSentences: string[] = [];
  for (const text of texts) {
    const cur = splitSentencesForDisplay(text);
    let k = 0;
    const maxK = Math.min(prevSentences.length, cur.length);
    for (let cand = maxK; cand >= 1; cand--) {
      let match = true;
      for (let j = 0; j < cand; j++) {
        if (cur[j] !== prevSentences[prevSentences.length - cand + j]) { match = false; break; }
      }
      if (match) { k = cand; break; }
    }
    out.push(cur.slice(k).join(" "));
    prevSentences = cur;  // Overlap-Vergleich gegen den ORIGINAL-Chunk
  }
  return out;
}

/** Splittet Kapitel-Content in dieselben Chunks wie build-werk-chunks.ts
 *  produziert hat. Pragmatisches Re-Implement: Absätze trennen, die kurzen
 *  filtern. Falls werk-chunks.json verfügbar ist, machen wir Matching per
 *  Position+Text statt rekonstruktiv. */
export function paragraphsForChapter(content: string): string[] {
  const normalized = content.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return normalized.split(/\n\s*\n/).map(p => p.replace(/\s+/g, " ").trim()).filter(p => p.length >= 80);
}
