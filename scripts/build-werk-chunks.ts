/**
 * build-werk-chunks.ts — Tier-1-3-Roadmap, Feature D (Werk-Text-RAG).
 *
 * Chunkt client/public/ebook_structured.json auf Absatz-Ebene,
 * embeddet jeden Chunk via Gemini, schreibt
 * client/public/werk-chunks.json — der retrievable Buchtext-Index.
 *
 * Komplementär zu den existierenden chapter:*-Embeddings (die einen
 * GEMITTELTEN Vektor pro Kapitel halten — gut für corpusVoiceScore,
 * unbrauchbar für RAG-Retrieval). Hier: ein Vektor pro Absatz, mit
 * stabiler chunkId für deterministische Zitierbarkeit.
 *
 * Inkrementell: pro Chunk wird sha1(text).slice(0,12) als ID berechnet —
 * wenn der Hash existiert, wird re-used. Re-Embed nur bei neuen Chunks.
 *
 * Lauf:  pnpm exec tsx scripts/build-werk-chunks.ts
 * Im CI: vor build-resonanzen-index, damit der Server den frischen Index
 *        beim nächsten Reload nutzen kann (Werk-Voice-Centroid bleibt
 *        unverändert — hier geht's nur um Retrieval).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchEmbedding as sharedFetchEmbedding, getKeys } from "../server/lib/embeddingClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, "..");
const EBOOK_PATH = path.join(ROOT, "client/public/ebook_structured.json");
const OUTPUT     = path.join(ROOT, "client/public/werk-chunks.json");

const GEMINI_EMBED_MODEL = (process.env.GEMINI_EMBED_MODEL ?? "").trim() || "gemini-embedding-001";

// M2: fetchEmbedding zentral (Multi-Key-Failover + Retry). Build-Zeit
// unkritisch → höhere Retry-Toleranz als der Server.
const fetchEmbedding = (text: string) => sharedFetchEmbedding(text, { maxRetries: 3 });

// R2: feinere Chunks für präziseres Retrieval.
// Vorher: bis 1800 char/Chunk (~93 Chunks total) — zu grob, ein Chunk
// matched auf zu viele unterschiedliche Anfragen mittelmäßig.
// Jetzt: Satz-Window-Chunking innerhalb jedes Absatzes — 3-Satz-Fenster
// mit 1-Satz-Overlap, ~250-500 chars pro Chunk, ~300 Chunks total.
const MIN_CHUNK_CHARS = 80;
const MAX_CHUNK_CHARS = 600;
const WINDOW_SENTENCES = 3;
const WINDOW_STRIDE = 2;     // 1-Satz-Overlap zwischen aufeinander folgenden Fenstern

interface WerkChunk {
  id: string;          // sha1(text).slice(0,12)
  chapter: string;     // chapter.id
  part: string;        // chapter.part (band1, teil5, …)
  partTitle: string;
  chapterTitle: string;
  position: number;    // Position innerhalb des Kapitels (0-basiert)
  text: string;
  embedding?: number[];
}

interface WerkChunkFile {
  generatedAt: string;
  model: string;
  chunkCount: number;
  embeddedCount: number;
  chunks: WerkChunk[];
}

function sha1Short(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
}

/** R2: Satz-Window-Chunking. Teilt einen Absatz in überlappende
 *  3-Satz-Fenster mit 1-Satz-Overlap. Jedes Fenster ist ein Chunk.
 *
 *  - Kürzere Absätze (≤3 Sätze) → ein einziger Chunk = der Absatz.
 *  - Lange Sätze (>MAX_CHUNK_CHARS) werden als Solo-Chunk gerendert,
 *    auch wenn das den max-char-Bound bricht — lieber ein langer Satz
 *    als ein abgeschnittener.
 *
 *  Sentence-Splitting: heuristisch an [.!?]+space+Großbuchstabe oder
 *  Zeilenende. Deutsche Abkürzungen (z.B. „z.B.", „bzw.") wären
 *  edge-cases, aber im Korpus selten genug.
 */
function splitParagraphIntoChunks(paragraph: string): string[] {
  // 1. Sätze isolieren
  const sentences = paragraph
    .replace(/([.!?])\s+(?=[A-ZÄÖÜ«„])/g, "$1​")
    .split("​")
    .map(s => s.trim())
    .filter(s => s.length >= 10);

  if (sentences.length === 0) return [paragraph];
  if (sentences.length <= WINDOW_SENTENCES) {
    // Kurzer Absatz → ein Chunk
    return [sentences.join(" ")];
  }

  // 2. Sliding Window
  const chunks: string[] = [];
  let i = 0;
  while (i < sentences.length) {
    const end = Math.min(i + WINDOW_SENTENCES, sentences.length);
    const window = sentences.slice(i, end).join(" ");
    if (window.length >= MIN_CHUNK_CHARS) {
      chunks.push(window);
    }
    if (end >= sentences.length) break;
    i += WINDOW_STRIDE;
  }
  return chunks.length > 0 ? chunks : [sentences.join(" ")];
}

interface Chapter { id: string; part: string; partTitle?: string; title?: string; content: string }

function chunkChapter(ch: Chapter): WerkChunk[] {
  // Erst nach Absätzen splitten (doppelter Newline oder ein Newline mit Einrückung)
  // Buchtext ist als TSX-Multi-Line-String teilweise mit erzwungenen Zeilenumbrüchen
  // — wir kollabieren erst alle Whitespace-Sequenzen, dann splitten an "echten"
  // Absatz-Trennern (\n\n).
  const normalized = ch.content
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const paragraphs = normalized.split(/\n\s*\n/);
  const out: WerkChunk[] = [];
  let pos = 0;
  for (const para of paragraphs) {
    const clean = para.replace(/\s+/g, " ").trim();
    if (clean.length < MIN_CHUNK_CHARS) continue;
    const parts = splitParagraphIntoChunks(clean);
    for (const text of parts) {
      out.push({
        id: sha1Short(text),
        chapter: ch.id,
        part: ch.part,
        partTitle: ch.partTitle ?? ch.part,
        chapterTitle: ch.title ?? ch.id,
        position: pos++,
        text,
      });
    }
  }
  return out;
}

async function main() {
  console.log(`[build-werk-chunks] reading ${EBOOK_PATH}`);
  if (!fs.existsSync(EBOOK_PATH)) {
    console.error("[build-werk-chunks] ebook_structured.json fehlt — abort");
    process.exit(0);  // soft-exit damit Vite-Build nicht bricht
  }

  let ebook: { chapters?: Chapter[] };
  try {
    ebook = JSON.parse(fs.readFileSync(EBOOK_PATH, "utf-8"));
  } catch (err) {
    console.error(`[build-werk-chunks] JSON-parse: ${err instanceof Error ? err.message : err}`);
    process.exit(0);
  }

  const chapters = (ebook.chapters ?? []).filter(c => c.content && c.content.length >= MIN_CHUNK_CHARS);
  console.log(`[build-werk-chunks] ${chapters.length} Kapitel mit Inhalt`);

  // Chunks generieren
  const allChunks: WerkChunk[] = [];
  for (const ch of chapters) {
    const chunks = chunkChapter(ch);
    allChunks.push(...chunks);
  }
  console.log(`[build-werk-chunks] ${allChunks.length} Chunks (Ø ${Math.round(allChunks.reduce((s, c) => s + c.text.length, 0) / allChunks.length)} chars)`);

  // Bestehende Embeddings laden (inkrementell)
  let existing: WerkChunkFile | null = null;
  if (fs.existsSync(OUTPUT)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUTPUT, "utf-8"));
    } catch {}
  }
  const existingMap = new Map<string, number[]>();
  if (existing?.chunks) {
    for (const c of existing.chunks) {
      if (c.embedding) existingMap.set(c.id, c.embedding);
    }
  }
  console.log(`[build-werk-chunks] reuse-pool: ${existingMap.size} existierende Embeddings`);

  // Embedden — sequentiell mit kurzer Pause, damit Rate-Limit gerecht
  let added = 0, reused = 0, failed = 0;
  const hasKeys = getKeys().length > 0;
  if (!hasKeys) {
    console.log("[build-werk-chunks] kein Embedding-Key (GEMINI_API_KEY[S]/FALLBACK) — schreibe Chunks ohne Embeddings");
  }
  for (let i = 0; i < allChunks.length; i++) {
    const c = allChunks[i];
    const cached = existingMap.get(c.id);
    if (cached) {
      c.embedding = cached;
      reused++;
      continue;
    }
    if (!hasKeys) continue;
    const vec = await fetchEmbedding(c.text);
    if (vec) {
      c.embedding = vec;
      added++;
    } else {
      failed++;
    }
    if (i % 25 === 24) console.log(`[build-werk-chunks]   …${i + 1}/${allChunks.length} (added=${added}, reused=${reused}, failed=${failed})`);
    // Sanfte Drosselung: 80ms zwischen Calls (entspricht ~750/min, weit unter Limit)
    if (vec) await new Promise(r => setTimeout(r, 80));
  }

  const embeddedCount = allChunks.filter(c => Array.isArray(c.embedding)).length;
  const out: WerkChunkFile = {
    generatedAt: new Date().toISOString(),
    model: GEMINI_EMBED_MODEL,
    chunkCount: allChunks.length,
    embeddedCount,
    chunks: allChunks,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 0));
  console.log(`[build-werk-chunks] OK — ${allChunks.length} chunks (${embeddedCount} embedded; added ${added}, reused ${reused}, failed ${failed}) → ${OUTPUT}`);
}

main().catch(err => {
  console.error(`[build-werk-chunks] FAILED: ${err instanceof Error ? err.stack : err}`);
  process.exit(0);
});
