/**
 * werkRetrieval.ts — Tier-1-3-Roadmap, Feature D (Werk-Text-RAG).
 *
 * Lädt client/public/werk-chunks.json einmal beim ersten Aufruf in
 * den Memory-Cache und beantwortet Retrieval-Queries via Cosine.
 *
 * Wird von den KI-Endpunkten (analyse, path-analyse, graph-chat, ask)
 * vor jedem Claude-Call aufgerufen, um den relevantesten Buchtext als
 * autorisierten Kontext einzuspielen — verhindert dass die KI vom
 * Werk semantisch driftet.
 *
 * Server-Pfad: dist/werk-chunks.json (esbuild kopiert nicht) → wir
 * lesen aus client/public/werk-chunks.json (relativ zum project root).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchEmbedding, cosineSim } from "./embeddingClient.js";

const __filename = fileURLToPath(import.meta.url);
// Up von server/lib/ ist zwei Ebenen
const ROOT = path.resolve(path.dirname(__filename), "..", "..");
const CHUNKS_PATH = path.join(ROOT, "client/public/werk-chunks.json");

export interface WerkChunk {
  id: string;
  chapter: string;
  part: string;
  partTitle: string;
  chapterTitle: string;
  position: number;
  text: string;
  embedding?: number[];
}

interface WerkChunksFile {
  generatedAt: string;
  model: string;
  chunkCount: number;
  embeddedCount: number;
  chunks: WerkChunk[];
}

let _cache: WerkChunksFile | null = null;
let _loaded = false;

function loadChunks(): WerkChunksFile | null {
  if (_loaded) return _cache;
  _loaded = true;
  try {
    if (!fs.existsSync(CHUNKS_PATH)) {
      console.warn(`[werkRetrieval] werk-chunks.json nicht gefunden bei ${CHUNKS_PATH}`);
      return null;
    }
    const raw = fs.readFileSync(CHUNKS_PATH, "utf-8");
    _cache = JSON.parse(raw);
    const withEmb = (_cache?.chunks ?? []).filter(c => Array.isArray(c.embedding)).length;
    console.log(`[werkRetrieval] geladen: ${_cache?.chunks.length} chunks, ${withEmb} mit embedding (model=${_cache?.model})`);
    return _cache;
  } catch (err) {
    console.error(`[werkRetrieval] load failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** Schlägt eine Chunk-Liste mit Embedding für Cosine-Vergleich auf. */
function embeddedChunks(): WerkChunk[] {
  const f = loadChunks();
  if (!f) return [];
  return f.chunks.filter(c => Array.isArray(c.embedding) && c.embedding!.length > 0);
}

export interface RetrievedPassage {
  id: string;
  chapter: string;
  part: string;
  partTitle: string;
  chapterTitle: string;
  text: string;
  score: number;
}

/**
 * Sucht die topK relevantesten Buchpassagen für eine Query.
 * Returnt leeres Array wenn keine Embeddings vorliegen (graceful no-op
 * für Local-Dev ohne GEMINI_API_KEY).
 */
export async function retrieveRelevantWerkPassages(
  query: string,
  topK = 5,
): Promise<RetrievedPassage[]> {
  if (!query?.trim()) return [];
  const chunks = embeddedChunks();
  if (chunks.length === 0) return [];

  const qVec = await fetchEmbedding(query);
  if (!qVec) return [];

  const scored: RetrievedPassage[] = [];
  for (const c of chunks) {
    const s = cosineSim(qVec, c.embedding!);
    if (s > 0.1) {
      scored.push({
        id: c.id, chapter: c.chapter, part: c.part,
        partTitle: c.partTitle, chapterTitle: c.chapterTitle,
        text: c.text, score: s,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Formatiert eine Liste retrieved Passagen als Werk-Kontext-Block für
 * den System-Prompt. Jede Passage bekommt ihre chunkId in eckigen
 * Klammern, damit Claude sie zitieren kann.
 */
export function formatWerkContext(passages: RetrievedPassage[]): string {
  if (passages.length === 0) return "";
  const parts = ["WERK-PASSAGEN (autorisierter Kontext, zitiere relevante via [chunkId]):"];
  for (const p of passages) {
    parts.push(
      `[${p.id}] ${p.partTitle} · ${p.chapterTitle} (score ${p.score.toFixed(2)}):`,
      p.text,
      ""
    );
  }
  return parts.join("\n");
}

/**
 * One-Shot-Helper für KI-Endpunkte: retrieved + formatted in einem Call.
 * Wenn keine Embeddings verfügbar: returnt leerer String → Endpunkt
 * läuft ohne Werk-Kontext (graceful fallback).
 */
export async function buildWerkContext(query: string, topK = 5): Promise<{
  passages: RetrievedPassage[];
  contextBlock: string;
}> {
  const passages = await retrieveRelevantWerkPassages(query, topK);
  return { passages, contextBlock: formatWerkContext(passages) };
}

/** Liefert eine flache Lookup-Map id → Chunk für die KI-Antwort-Renderer
 *  (Frontend-Code parsed [chunkId]-Anker und braucht die Quelle). */
export function getChunkLookup(): Map<string, WerkChunk> {
  const map = new Map<string, WerkChunk>();
  const f = loadChunks();
  if (!f) return map;
  for (const c of f.chunks) map.set(c.id, c);
  return map;
}
