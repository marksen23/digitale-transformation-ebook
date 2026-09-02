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

// Geteilter Lazy-Cache für werk-chunks.json (~20 MB, Embeddings inklusive).
// Reader (WerkPage), Volltextsuche (search/sources/chapters.ts) und der
// Begriffsnetz-Passagen-Link (conceptPassageLink.ts) brauchten früher je
// einen eigenen Fetch derselben Datei — bis zu drei parallele 20-MB-Downloads
// für eine einzige Navigation. Ein Modul-Singleton-Promise genügt, da die
// Datei sich innerhalb einer Sitzung nicht ändert.
let werkChunksPromise: Promise<WerkChunksFile | null> | null = null;
export function loadWerkChunksLazy(): Promise<WerkChunksFile | null> {
  if (!werkChunksPromise) {
    werkChunksPromise = fetch("/werk-chunks.json").then(r => r.ok ? r.json() : null).catch(() => null);
  }
  return werkChunksPromise;
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
