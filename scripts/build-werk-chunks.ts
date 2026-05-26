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

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, "..");
const EBOOK_PATH = path.join(ROOT, "client/public/ebook_structured.json");
const OUTPUT     = path.join(ROOT, "client/public/werk-chunks.json");

const GEMINI_API_KEY    = (process.env.GEMINI_API_KEY ?? "").trim() || undefined;
const GEMINI_EMBED_MODEL = (process.env.GEMINI_EMBED_MODEL ?? "").trim() || "gemini-embedding-001";

const MIN_CHUNK_CHARS = 80;
const MAX_CHUNK_CHARS = 1800;

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

/** Splittet Absatz in Sätze, gruppiert zu Chunks ≤ MAX_CHUNK_CHARS. */
function splitParagraphIntoChunks(paragraph: string): string[] {
  if (paragraph.length <= MAX_CHUNK_CHARS) return [paragraph];
  const sentences = paragraph.split(/(?<=[\.\!\?])\s+/);
  const chunks: string[] = [];
  let buf = "";
  for (const sent of sentences) {
    if (buf.length + sent.length + 1 > MAX_CHUNK_CHARS && buf) {
      chunks.push(buf.trim());
      buf = sent;
    } else {
      buf = buf ? buf + " " + sent : sent;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
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

async function fetchEmbedding(text: string): Promise<number[] | null> {
  if (!GEMINI_API_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${GEMINI_EMBED_MODEL}`,
        content: { parts: [{ text: text.slice(0, 8000) }] },
      }),
    });
    if (!res.ok) {
      console.warn(`[build-werk-chunks] embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    return Array.isArray(data.embedding?.values) ? data.embedding.values : null;
  } catch (err) {
    console.warn(`[build-werk-chunks] embed net error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
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
  if (!GEMINI_API_KEY) {
    console.log("[build-werk-chunks] GEMINI_API_KEY fehlt — schreibe Chunks ohne Embeddings");
  }
  for (let i = 0; i < allChunks.length; i++) {
    const c = allChunks[i];
    const cached = existingMap.get(c.id);
    if (cached) {
      c.embedding = cached;
      reused++;
      continue;
    }
    if (!GEMINI_API_KEY) continue;
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
