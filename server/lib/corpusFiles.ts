/**
 * corpusFiles.ts — TTL-Cache für die großen Korpus-JSONs.
 *
 * GitHub-Raw zuerst (frisch ohne Redeploy), lokale Platte als Fallback.
 * Eine gemeinsame Cache-Map für RAG (werkRetrieval) und die Lese-/
 * Ähnlichkeits-APIs, damit die Vektoren nicht doppelt im Speicher liegen.
 *
 * Pfad-Auflösung: in DEV liegt der Code in server/lib/ (zwei Ebenen unter
 * Root), im PROD-Build ist alles in dist/index.js gebündelt (eine Ebene).
 * Deshalb mehrere Kandidaten, ersten existierenden nehmen.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dir = path.dirname(__filename);

export function resolveDataPath(rel: string): string {
  const candidates = [
    path.resolve(process.cwd(), rel),
    path.resolve(__dir, "..", "..", rel),
    path.resolve(__dir, "..", rel),
    path.resolve(__dir, rel),
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return candidates[0];
}

const REPO_OWNER = process.env.CORPUS_REPO_OWNER || "marksen23";
const REPO_NAME = process.env.CORPUS_REPO_NAME || "digitale-transformation-ebook";
const REPO_BRANCH = process.env.CORPUS_REPO_BRANCH || "main";
export const CORPUS_RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/client/public`;

export const CHUNKS_URL = `${CORPUS_RAW_BASE}/werk-chunks.json`;
export const RESONANZ_INDEX_URL = `${CORPUS_RAW_BASE}/resonanzen-index.json`;
export const RESONANZ_EMB_URL = `${CORPUS_RAW_BASE}/resonanzen-embeddings.json`;
export const CONCEPTS_EMB_URL = `${CORPUS_RAW_BASE}/concepts-embeddings.json`;
export const PHILOSOPHERS_EMB_URL = `${CORPUS_RAW_BASE}/philosophers-embeddings.json`;

export const CHUNKS_TTL_MS = 60 * 60 * 1000;
export const RESONANZ_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30 * 1000;

export const CHUNKS_PATH = resolveDataPath("client/public/werk-chunks.json");
export const RESONANZ_INDEX_PATH = resolveDataPath("client/public/resonanzen-index.json");
export const RESONANZ_EMB_PATH = resolveDataPath("client/public/resonanzen-embeddings.json");
export const CONCEPTS_EMB_PATH = resolveDataPath("client/public/concepts-embeddings.json");
export const PHILOSOPHERS_EMB_PATH = resolveDataPath("client/public/philosophers-embeddings.json");

interface JsonCacheEntry { data: unknown; fetchedAt: number; inflight: Promise<unknown> | null }
const _jsonCache = new Map<string, JsonCacheEntry>();

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function invalidateCorpusJson(rawUrl: string): void {
  _jsonCache.delete(rawUrl);
}

/**
 * Lädt eine Korpus-JSON mit TTL-Cache. Reihenfolge: (1) GitHub-Raw,
 * (2) lokale Platte als Fallback, (3) fail-soft = letzten guten Cache
 * behalten. `CORPUS_SOURCE=disk` überspringt GitHub (Tests, Offline).
 * Inflight-Dedup verhindert parallele Doppel-Fetches.
 */
export async function loadJsonCached(
  localPath: string, rawUrl: string, ttlMs: number, label: string,
): Promise<unknown | null> {
  const now = Date.now();
  const entry = _jsonCache.get(rawUrl);
  if (entry && entry.data != null && now - entry.fetchedAt < ttlMs) return entry.data;
  if (entry?.inflight) return entry.inflight;

  const inflight = (async (): Promise<unknown | null> => {
    const preferDisk = process.env.CORPUS_SOURCE === "disk";
    if (!preferDisk) {
      try {
        const res = await fetchWithTimeout(rawUrl, FETCH_TIMEOUT_MS);
        if (res.ok) {
          const json = await res.json();
          _jsonCache.set(rawUrl, { data: json, fetchedAt: Date.now(), inflight: null });
          console.log(`[werkRetrieval] ${label}: GitHub-Raw geladen`);
          return json;
        }
        console.warn(`[werkRetrieval] ${label}: GitHub-Raw HTTP ${res.status} — Fallback lokale Platte`);
      } catch (err) {
        console.warn(`[werkRetrieval] ${label}: GitHub-Raw fehlgeschlagen (${err instanceof Error ? err.message : err}) — Fallback lokale Platte`);
      }
    }
    try {
      if (fs.existsSync(localPath)) {
        const json = JSON.parse(fs.readFileSync(localPath, "utf-8"));
        _jsonCache.set(rawUrl, { data: json, fetchedAt: Date.now(), inflight: null });
        console.log(`[werkRetrieval] ${label}: lokale Platte geladen (${localPath})`);
        return json;
      }
      console.warn(`[werkRetrieval] ${label}: weder GitHub-Raw noch lokale Platte (${localPath})`);
    } catch (err) {
      console.error(`[werkRetrieval] ${label}: disk-load failed: ${err instanceof Error ? err.message : err}`);
    }
    const prev = _jsonCache.get(rawUrl);
    if (prev?.data != null) { prev.inflight = null; return prev.data; }
    _jsonCache.delete(rawUrl);
    return null;
  })();

  _jsonCache.set(rawUrl, { data: entry?.data ?? null, fetchedAt: entry?.fetchedAt ?? 0, inflight });
  return inflight;
}
