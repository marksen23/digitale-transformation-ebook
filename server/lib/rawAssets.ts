/**
 * rawAssets.ts — serviert die Korpus-Daten-JSONs LIVE aus GitHub-Raw
 * (Render-only-Architektur, Netlify abgelöst).
 *
 * Hintergrund: Render redeployt nicht bei Daten-Commits (buildFilters ignorieren
 * client/**), die statischen JSONs sind in den Deploy eingebacken → wären zwischen
 * Server-Deploys veraltet. Diese Middleware liefert die zwischen Deploys
 * wachsenden Artefakte (resonanzen-*, Embeddings, concept-edges/nodes, werk-chunks)
 * frisch aus GitHub-Raw mit kurzem TTL-Cache — dasselbe Prinzip wie werkRetrieval
 * für die RAG. So ist das Frontend immer aktuell OHNE Redeploy und OHNE Netlify.
 *
 * Serviert den ROHEN Text (kein parse/stringify) — wichtig für die ~16 MB
 * Embeddings. Bei GitHub-Raw-Ausfall → next() → express.static (eingebackene
 * Kopie als Fallback). Inflight-Dedup verhindert parallele Doppel-Fetches.
 */
import type { Request, Response, NextFunction } from "express";

const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? "marksen23";
const REPO_NAME = process.env.GITHUB_REPO_NAME ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/client/public`;

// Genau die Artefakte, die CI/Admin ZWISCHEN Server-Deploys nach main committen.
// ebook_structured.json / bands_pages.json bleiben baked (ändern sich nur bei
// Code/Content-Deploy, der ohnehin rebuildet).
const STABLE_LIVE = new Set([
  "concepts-embeddings.json",
  "philosophers-embeddings.json",
  "concept-edges.json",
  "concept-nodes.json",
  "werk-chunks.json",
]);
function isLiveAsset(name: string): boolean {
  return /^resonanzen-[a-z0-9-]+\.json$/.test(name) || STABLE_LIVE.has(name);
}
function ttlFor(name: string): number {
  // Embeddings sind groß + ändern nur bei Full-Rebuild → längerer TTL.
  if (name.includes("embeddings")) return 30 * 60 * 1000;
  return 5 * 60 * 1000; // Index/Fragen/Kandidaten/Erkenntnisse/Edges/Nodes — frisch
}

interface CacheEntry { text: string | null; fetchedAt: number; inflight: Promise<string | null> | null }
const _cache = new Map<string, CacheEntry>();
const FETCH_TIMEOUT_MS = 15000;

async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
  finally { clearTimeout(t); }
}

/** Express-Middleware: serviert Live-Asset-JSONs aus GitHub-Raw (TTL-Cache),
 *  sonst next() (→ express.static / SPA-Fallback). */
export async function rawAssetMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const name = req.path.replace(/^\/+/, ""); // ohne führenden Slash; Query ist nicht in req.path
  if (!isLiveAsset(name)) return next();

  const url = `${RAW_BASE}/${name}`;
  const ttl = ttlFor(name);
  const now = Date.now();
  const entry = _cache.get(url);

  const send = (text: string) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.setHeader("X-Asset-Source", "github-raw");
    res.send(text);
  };

  // Frisch genug im Cache?
  if (entry && entry.text != null && now - entry.fetchedAt < ttl) { send(entry.text); return; }
  // Inflight-Dedup
  if (entry?.inflight) {
    const text = await entry.inflight;
    if (text != null) { send(text); return; }
    return next();
  }

  const inflight = fetchText(url);
  _cache.set(url, { text: entry?.text ?? null, fetchedAt: entry?.fetchedAt ?? 0, inflight });
  const text = await inflight;
  if (text != null) {
    _cache.set(url, { text, fetchedAt: Date.now(), inflight: null });
    send(text);
    return;
  }
  // Fetch fehlgeschlagen: alten (stale) Cache servieren, sonst Static-Fallback.
  _cache.set(url, { text: entry?.text ?? null, fetchedAt: entry?.fetchedAt ?? 0, inflight: null });
  if (entry?.text != null) { send(entry.text); return; }
  return next();
}
