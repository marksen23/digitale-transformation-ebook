/**
 * corpusRead.ts — kleine Lese- und Ähnlichkeits-APIs.
 *
 * Der Browser bekommt Kapiteltext ohne Vektoren, eine id→Kapitel-Karte
 * und Top-Treffer (id + Score). Die 3072-dim-Embeddings bleiben hier.
 */
import { Router, type Response } from "express";
import { fetchEmbedding } from "../lib/embeddingClient.js";
import { rateLimiter } from "../middleware/rateLimit.js";
import {
  CHUNKS_PATH, CHUNKS_TTL_MS, CHUNKS_URL,
  CONCEPTS_EMB_PATH, CONCEPTS_EMB_URL,
  PHILOSOPHERS_EMB_PATH, PHILOSOPHERS_EMB_URL,
  RESONANZ_EMB_PATH, RESONANZ_EMB_URL,
  RESONANZ_INDEX_PATH, RESONANZ_INDEX_URL, RESONANZ_TTL_MS,
  loadJsonCached,
} from "../lib/corpusFiles.js";
import { chunkForReader, topSimilar, topWerkChapters, type ScoredHit } from "../lib/similarity.js";
import { analyzeClusters, type ClusterAnalysis } from "../../client/src/lib/clusterAnalysis.js";
import { detectAnchorTensions, type TensionResult } from "../../client/src/lib/widerspruchs.js";
import type { ResonanzEntry } from "../../client/src/lib/resonanzenIndex.js";

const READER_CACHE = "public, max-age=3600, stale-while-revalidate=86400";
const META_CACHE = "public, max-age=300";
const ANALYSIS_TTL_MS = 10 * 60 * 1000;
const EMBED_TTL_MS = 10 * 60 * 1000;
const EMBED_CACHE_MAX = 100;
const CHAPTER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;
const CORPORA = new Set(["resonanzen", "werk", "concepts", "philosophers"]);

export interface WerkChunkRecord {
  id: string;
  chapter: string;
  part: string;
  position: number;
  text: string;
  chapterTitle?: string;
  embedding?: number[];
}

export interface WerkChunksFile {
  generatedAt?: string;
  chunkCount?: number;
  embeddedCount?: number;
  chunks: WerkChunkRecord[];
}

export interface EmbeddingFile {
  generatedAt?: string;
  embeddings?: Record<string, number[]>;
}

export interface ResonanzIndexFile {
  entries?: ResonanzEntry[];
}

export interface CorpusDeps {
  embed: (text: string) => Promise<number[] | null>;
  werkChunks: () => Promise<WerkChunksFile | null>;
  resonanzEmbeddings: () => Promise<EmbeddingFile | null>;
  resonanzIndex: () => Promise<ResonanzIndexFile | null>;
  conceptEmbeddings: () => Promise<EmbeddingFile | null>;
  philosopherEmbeddings: () => Promise<EmbeddingFile | null>;
}

interface EmbedFileStatus {
  name: string;
  path: string;
  exists: boolean;
  count: number | null;
  generatedAt: string | null;
  ageHours: number | null;
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function clampNum(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function ageHours(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3_600_000;
}

async function asObject<T>(loader: () => Promise<T | null>): Promise<T | null> {
  const data = await loader();
  if (!data || typeof data !== "object") return null;
  return data;
}

const productionDeps: CorpusDeps = {
  embed: text => fetchEmbedding(text, { maxRetries: 2 }),
  werkChunks: () => readJson<WerkChunksFile>(CHUNKS_PATH, CHUNKS_URL, CHUNKS_TTL_MS, "werk-chunks"),
  resonanzEmbeddings: () => readJson<EmbeddingFile>(RESONANZ_EMB_PATH, RESONANZ_EMB_URL, RESONANZ_TTL_MS, "resonanzen-embeddings"),
  resonanzIndex: () => readJson<ResonanzIndexFile>(RESONANZ_INDEX_PATH, RESONANZ_INDEX_URL, RESONANZ_TTL_MS, "resonanzen-index"),
  conceptEmbeddings: () => readJson<EmbeddingFile>(CONCEPTS_EMB_PATH, CONCEPTS_EMB_URL, CHUNKS_TTL_MS, "concepts-embeddings"),
  philosopherEmbeddings: () => readJson<EmbeddingFile>(PHILOSOPHERS_EMB_PATH, PHILOSOPHERS_EMB_URL, CHUNKS_TTL_MS, "philosophers-embeddings"),
};

export function createCorpusReadRouter(deps: CorpusDeps = productionDeps): Router {
  const router = Router();
  const similarLimit = rateLimiter("corpus-similar", 120, 60_000);
  const embedCache = new Map<string, { vec: number[]; at: number }>();
  const embedInflight = new Map<string, Promise<number[] | null>>();
  let tensionsCache: { at: number; body: TensionResult } | null = null;
  let tensionsInflight: Promise<TensionResult> | null = null;
  let clustersCache: { at: number; body: { status: string; analysis?: ClusterAnalysis } } | null = null;
  let clustersInflight: Promise<{ status: string; analysis?: ClusterAnalysis }> | null = null;

  async function embedQuery(text: string): Promise<number[] | null> {
    const key = text.trim();
    const hit = embedCache.get(key);
    if (hit && Date.now() - hit.at < EMBED_TTL_MS) return hit.vec;
    const pending = embedInflight.get(key);
    if (pending) return pending;
    const job = deps.embed(key).then(vec => {
      embedInflight.delete(key);
      if (vec && vec.length > 0) {
        if (embedCache.size >= EMBED_CACHE_MAX) {
          const first = embedCache.keys().next().value;
          if (first !== undefined) embedCache.delete(first);
        }
        embedCache.set(key, { vec, at: Date.now() });
      }
      return vec;
    }).catch(() => {
      embedInflight.delete(key);
      return null;
    });
    embedInflight.set(key, job);
    return job;
  }

  router.get("/api/corpus/meta", async (_req, res) => {
    const [werk, resonanzen, concepts, philosophers] = await Promise.all([
      deps.werkChunks(),
      deps.resonanzEmbeddings(),
      deps.conceptEmbeddings(),
      deps.philosopherEmbeddings(),
    ]);
    const row = (
      name: string, file: string, generatedAt: string | undefined,
      count: number | null, exists: boolean,
    ): EmbedFileStatus => ({
      name, path: file, exists, count, generatedAt: generatedAt ?? null, ageHours: ageHours(generatedAt),
    });
    const files: EmbedFileStatus[] = [
      row(
        "Werk-Chunks", "werk-chunks.json", werk?.generatedAt,
        werk?.chunks ? (typeof werk.embeddedCount === "number"
          ? werk.embeddedCount
          : werk.chunks.filter(c => Array.isArray(c.embedding) && c.embedding.length > 0).length)
          : null,
        !!werk,
      ),
      row(
        "Resonanzen", "resonanzen-embeddings.json", resonanzen?.generatedAt,
        resonanzen?.embeddings ? Object.keys(resonanzen.embeddings).length : null,
        !!resonanzen?.embeddings,
      ),
      row(
        "Begriffe", "concepts-embeddings.json", concepts?.generatedAt,
        concepts?.embeddings ? Object.keys(concepts.embeddings).length : null,
        !!concepts?.embeddings,
      ),
      row(
        "Philosophen", "philosophers-embeddings.json", philosophers?.generatedAt,
        philosophers?.embeddings ? Object.keys(philosophers.embeddings).length : null,
        !!philosophers?.embeddings,
      ),
    ];
    res.setHeader("Cache-Control", META_CACHE);
    res.json({ files });
  });

  router.get("/api/werk/chunks", async (req, res) => {
    const chapter = typeof req.query.chapter === "string" ? req.query.chapter : "";
    if (!CHAPTER_ID.test(chapter)) {
      noStore(res);
      res.status(400).json({ error: "chapter ist erforderlich." });
      return;
    }
    const file = await deps.werkChunks();
    if (!file?.chunks) {
      noStore(res);
      res.status(503).json({ error: "Werk-Chunks nicht verfügbar." });
      return;
    }
    const chunks = file.chunks
      .filter(c => c.chapter === chapter)
      .sort((a, b) => a.position - b.position)
      .map(chunkForReader);
    res.setHeader("Cache-Control", READER_CACHE);
    res.json({ generatedAt: file.generatedAt ?? null, chapter, chunks });
  });

  router.get("/api/werk/chunk-map", async (_req, res) => {
    const file = await deps.werkChunks();
    if (!file?.chunks) {
      noStore(res);
      res.status(503).json({ error: "Werk-Chunks nicht verfügbar." });
      return;
    }
    res.setHeader("Cache-Control", READER_CACHE);
    res.json({
      generatedAt: file.generatedAt ?? null,
      chunks: file.chunks.map(c => ({ id: c.id, chapter: c.chapter })),
    });
  });

  router.post("/api/corpus/similar", similarLimit, async (req, res) => {
    const body = (req.body ?? {}) as { corpus?: unknown; text?: unknown; limit?: unknown; minScore?: unknown };
    if (typeof body.corpus !== "string" || !CORPORA.has(body.corpus)) {
      noStore(res);
      res.status(400).json({ error: "Unbekanntes Korpus." });
      return;
    }
    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      noStore(res);
      res.status(400).json({ error: "text ist erforderlich." });
      return;
    }
    if (body.text.length > 8000) {
      noStore(res);
      res.status(400).json({ error: "text zu lang (max 8000 Zeichen)." });
      return;
    }
    const limit = clampInt(body.limit, 8, 1, 30);
    const minScore = clampNum(body.minScore, 0.4, 0, 1);
    const vec = await embedQuery(body.text);
    if (!vec) {
      noStore(res);
      res.status(503).json({ error: "Ähnlichkeit konnte nicht berechnet werden." });
      return;
    }

    let hits: Array<ScoredHit & { chunkId?: string; text?: string }> = [];
    if (body.corpus === "werk") {
      const file = await deps.werkChunks();
      hits = file?.chunks ? topWerkChapters(vec, file.chunks, { minScore, limit }) : [];
    } else if (body.corpus === "resonanzen") {
      const [idx, emb] = await Promise.all([deps.resonanzIndex(), deps.resonanzEmbeddings()]);
      const vectors = emb?.embeddings ?? {};
      const entries = (idx?.entries ?? [])
        .filter(e => e.status === "published" || e.status === "approved")
        .map(e => ({ id: e.id, vector: vectors[e.id] }));
      hits = topSimilar(vec, entries, { minScore, limit });
    } else if (body.corpus === "concepts") {
      const emb = await deps.conceptEmbeddings();
      const entries = Object.entries(emb?.embeddings ?? {}).map(([id, vector]) => ({ id, vector }));
      hits = topSimilar(vec, entries, { minScore, limit });
    } else {
      const emb = await deps.philosopherEmbeddings();
      const entries = Object.entries(emb?.embeddings ?? {}).map(([id, vector]) => ({ id, vector }));
      hits = topSimilar(vec, entries, { minScore, limit });
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.json({ hits });
  });

  async function computeTensions(): Promise<TensionResult> {
    if (tensionsCache && Date.now() - tensionsCache.at < ANALYSIS_TTL_MS) return tensionsCache.body;
    if (tensionsInflight) return tensionsInflight;
    tensionsInflight = (async () => {
      const [idx, emb] = await Promise.all([deps.resonanzIndex(), deps.resonanzEmbeddings()]);
      const entries = idx?.entries ?? [];
      const vectors = emb?.embeddings ?? {};
      const body = detectAnchorTensions(entries, vectors);
      tensionsCache = { at: Date.now(), body };
      return body;
    })().finally(() => { tensionsInflight = null; });
    return tensionsInflight;
  }

  async function computeClusters(): Promise<{ status: string; analysis?: ClusterAnalysis }> {
    if (clustersCache && Date.now() - clustersCache.at < ANALYSIS_TTL_MS) return clustersCache.body;
    if (clustersInflight) return clustersInflight;
    clustersInflight = (async () => {
      const [idx, emb] = await Promise.all([deps.resonanzIndex(), deps.resonanzEmbeddings()]);
      const entries = idx?.entries ?? [];
      const vectors = emb?.embeddings ?? {};
      let body: { status: string; analysis?: ClusterAnalysis };
      if (Object.keys(vectors).length === 0) body = { status: "no-embeddings" };
      else {
        const analysis = analyzeClusters(entries, vectors);
        body = analysis ? { status: "ready", analysis } : { status: "too-few" };
      }
      clustersCache = { at: Date.now(), body };
      return body;
    })().finally(() => { clustersInflight = null; });
    return clustersInflight;
  }

  router.get("/api/corpus/tensions", async (_req, res) => {
    const body = await computeTensions();
    res.setHeader("Cache-Control", META_CACHE);
    res.json(body);
  });

  router.get("/api/corpus/clusters", async (_req, res) => {
    const body = await computeClusters();
    res.setHeader("Cache-Control", META_CACHE);
    res.json(body);
  });

  return router;
}

async function readJson<T>(localPath: string, rawUrl: string, ttlMs: number, label: string): Promise<T | null> {
  const data = await loadJsonCached(localPath, rawUrl, ttlMs, label);
  return asObject<T>(() => Promise.resolve(data as T | null));
}
