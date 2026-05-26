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
// R1: Zweite Retrieval-Quelle — der bestehende Resonanzen-Korpus.
const RESONANZ_INDEX_PATH = path.join(ROOT, "client/public/resonanzen-index.json");
const RESONANZ_EMB_PATH = path.join(ROOT, "client/public/resonanzen-embeddings.json");

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
  /** Diskriminator: "werk" = aus Buchtext (werk-chunks), "resonanz" = aus
   *  dem kuratiertem Q&A-Korpus. Der LLM-Prompt wird beide Quellen anders
   *  formatieren, das Frontend zeigt sie unterschiedlich. */
  source: "werk" | "resonanz";
  id: string;
  // werk-spezifisch
  chapter?: string;
  part?: string;
  partTitle?: string;
  chapterTitle?: string;
  // resonanz-spezifisch
  endpoint?: string;
  anchor?: string;
  prompt?: string;          // die ursprüngliche Frage
  status?: string;          // "published"/"approved"/...
  // gemeinsam
  text: string;
  score: number;
}

// R1: Resonanzen als zweite Retrieval-Quelle.
// Wird einmal beim Server-Start geladen + bei Hot-Reload (broadcast event).
interface ResonanzEmbCache {
  embeddings: Map<string, number[]>;
  meta: Map<string, {
    endpoint: string; anchor: string; nodeIds: string[]; status: string;
    prompt: string; response: string; ts: string;
  }>;
}
let _resonanzCache: ResonanzEmbCache | null = null;
let _resonanzLoaded = false;

function loadResonanzCorpus(): ResonanzEmbCache | null {
  if (_resonanzLoaded) return _resonanzCache;
  _resonanzLoaded = true;
  try {
    if (!fs.existsSync(RESONANZ_EMB_PATH) || !fs.existsSync(RESONANZ_INDEX_PATH)) {
      console.warn(`[werkRetrieval] resonanzen-{index,embeddings}.json nicht gefunden — Resonanz-Retrieval deaktiviert`);
      return null;
    }
    const embFile = JSON.parse(fs.readFileSync(RESONANZ_EMB_PATH, "utf-8")) as { embeddings: Record<string, number[]> };
    const idxFile = JSON.parse(fs.readFileSync(RESONANZ_INDEX_PATH, "utf-8")) as {
      entries: Array<{ id: string; endpoint: string; anchor: string; nodeIds: string[]; status: string; prompt: string; response: string; ts: string }>;
    };
    const embMap = new Map<string, number[]>(Object.entries(embFile.embeddings));
    const metaMap = new Map<string, ResonanzEmbCache["meta"] extends Map<string, infer V> ? V : never>();
    for (const e of idxFile.entries ?? []) {
      // Nur kuratierte Resonanzen ins Retrieval — raw/rejected verfälschen Antworten.
      if (e.status !== "published" && e.status !== "approved") continue;
      const emb = embMap.get(e.id);
      if (!emb || !emb.length) continue;
      metaMap.set(e.id, {
        endpoint: e.endpoint, anchor: e.anchor, nodeIds: e.nodeIds ?? [],
        status: e.status, prompt: e.prompt, response: e.response, ts: e.ts,
      });
    }
    _resonanzCache = { embeddings: embMap, meta: metaMap };
    console.log(`[werkRetrieval] resonanzen geladen: ${metaMap.size} kuratierte (von ${idxFile.entries?.length ?? 0} total) für Retrieval`);
    return _resonanzCache;
  } catch (err) {
    console.error(`[werkRetrieval] Resonanz-Korpus-Load failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** Bei Hot-Reload (nach Curation-Wechsel etc.) den Cache invalidieren —
 *  damit ein eben „approved"-Eintrag sofort retrievebar wird. */
export function invalidateResonanzRetrievalCache(): void {
  _resonanzLoaded = false;
  _resonanzCache = null;
}

/**
 * Sucht die topK relevantesten Werk-Passagen für eine Query.
 * R1: Diese Funktion bleibt für reine Werk-Retrieval. Für gemischtes
 * Retrieval (Werk + Resonanzen) siehe retrieveRelevantCorpus() unten.
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
        source: "werk",
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
 * R1: Vereinte Retrieval-Strategie — Werk-Chunks UND kuratierte Resonanzen
 * gemeinsam scoren. Sortiert nach Cosine, aber mit milder Score-Anhebung
 * für Werk-Quellen (×1.05), damit der Buchtext bei Score-Gleichstand
 * primär bleibt. Resonanzen bringen historische Q&A-Tiefe rein.
 *
 * Returns mixed list of RetrievedPassage (mit source-Tag). Default-Mix:
 *   topKWerk=3 + topKResonanz=2 = 5 Quellen pro Antwort.
 */
export async function retrieveRelevantCorpus(
  query: string,
  topKWerk = 3,
  topKResonanz = 2,
): Promise<RetrievedPassage[]> {
  if (!query?.trim()) return [];
  const qVec = await fetchEmbedding(query);
  if (!qVec) return [];

  const out: RetrievedPassage[] = [];

  // Werk-Passages
  const chunks = embeddedChunks();
  if (chunks.length > 0) {
    const werkScored: RetrievedPassage[] = [];
    for (const c of chunks) {
      const s = cosineSim(qVec, c.embedding!) * 1.05;  // Werk leicht bevorzugt
      if (s > 0.1) {
        werkScored.push({
          source: "werk",
          id: c.id, chapter: c.chapter, part: c.part,
          partTitle: c.partTitle, chapterTitle: c.chapterTitle,
          text: c.text, score: s,
        });
      }
    }
    werkScored.sort((a, b) => b.score - a.score);
    out.push(...werkScored.slice(0, topKWerk));
  }

  // Resonanzen — nur kuratierte (published/approved)
  const reso = loadResonanzCorpus();
  if (reso && reso.meta.size > 0) {
    const resoScored: RetrievedPassage[] = [];
    reso.meta.forEach((meta, id) => {
      const emb = reso.embeddings.get(id);
      if (!emb) return;
      const s = cosineSim(qVec, emb);
      if (s > 0.1) {
        resoScored.push({
          source: "resonanz",
          id,
          endpoint: meta.endpoint,
          anchor: meta.anchor,
          status: meta.status,
          prompt: meta.prompt,
          // text = die Antwort (das ist das eigentliche RAG-Material)
          text: meta.response,
          score: s,
        });
      }
    });
    resoScored.sort((a, b) => b.score - a.score);
    out.push(...resoScored.slice(0, topKResonanz));
  }

  // Final-Sort über beide Quellen
  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * Formatiert eine gemischte Liste retrieved Passagen als Kontext-Block
 * für den System-Prompt. R1: unterscheidet Werk-Passagen von Resonanzen,
 * sodass der LLM die Quellen-Typen erkennt und unterschiedlich zitieren
 * kann.
 *
 * Werk-Passage:
 *   [chunkId] Band III · Resonanz im Zeitalter… :
 *   <Werktext>
 *
 * Resonanz (kuratiertes Q&A):
 *   ↩ [resonanzId] frühere Begegnung (analyse · 2026-04):
 *     Frage: <ursprüngliche Frage>
 *     Antwort: <was die KI damals geantwortet hat, kuratiert>
 */
export function formatWerkContext(passages: RetrievedPassage[]): string {
  if (passages.length === 0) return "";
  const werk = passages.filter(p => p.source === "werk");
  const reso = passages.filter(p => p.source === "resonanz");
  const parts: string[] = [];

  if (werk.length > 0) {
    parts.push("WERK-PASSAGEN (autorisierter Buchtext, zitiere via [chunkId]):");
    for (const p of werk) {
      parts.push(
        `[${p.id}] ${p.partTitle ?? ""} · ${p.chapterTitle ?? ""} (score ${p.score.toFixed(2)}):`,
        p.text,
        ""
      );
    }
  }

  if (reso.length > 0) {
    parts.push("");
    parts.push("BEREITS BEANTWORTETE FRAGEN aus dem kuratierten Korpus (zitiere via [resonanzId]):");
    for (const p of reso) {
      const dateOnly = p.endpoint ? `${p.endpoint} · ${(p as { ts?: string }).ts?.slice(0,10) ?? ""}` : "kuratiert";
      parts.push(
        `↩ [${p.id}] frühere Begegnung (${dateOnly}, score ${p.score.toFixed(2)}):`,
        `   Frage: ${(p.prompt ?? "").slice(0, 300)}`,
        `   Antwort: ${(p.text ?? "").slice(0, 800)}`,
        ""
      );
    }
  }

  return parts.join("\n");
}

/**
 * One-Shot-Helper für KI-Endpunkte: retrieved + formatted in einem Call.
 * R1: jetzt zieht aus BEIDEN Quellen (Werk + Resonanzen). Default 3+2,
 * aber konfigurierbar.
 *
 * Wenn keine Embeddings verfügbar: returnt leerer String → Endpunkt
 * läuft ohne Kontext (graceful fallback).
 */
export async function buildWerkContext(query: string, topK = 5): Promise<{
  passages: RetrievedPassage[];
  contextBlock: string;
}> {
  // Default-Mix: 60% Werk, 40% Resonanzen — der Buchtext bleibt primär,
  // die Resonanzen ergänzen mit Dialog-Tiefe.
  const topKWerk = Math.max(1, Math.round(topK * 0.6));
  const topKResonanz = Math.max(1, topK - topKWerk);
  const passages = await retrieveRelevantCorpus(query, topKWerk, topKResonanz);
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
