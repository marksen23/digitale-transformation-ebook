/**
 * echoDetector.ts — At-Ingest Near-Duplicate-Erkennung.
 *
 * Beim Logging einer neuen KI-Antwort prüft dieser Detektor, ob die
 * Aussage im Kern eine bestehende wiederholt (Cosine ≥0.88). Wenn ja,
 * werden die IDs ins Frontmatter geschrieben (echoes_of:).
 *
 * Pipeline:
 *   1. Cache von GitHub raw URLs (resonanzen-index.json + embeddings.json)
 *      laden — TTL 10 Min, in-flight-deduplizierung
 *   2. Embedding für den neuen prompt+response über fetchEmbedding
 *   3. Cosine über alle gecachten Embeddings, Top-5 mit Score ≥0.88
 *   4. Fail-soft: bei Cache-Fetch- oder Embedding-Fehler leeres Array
 *
 * Wird von server/lib/resonanzLog.ts vor _putToGithub aufgerufen.
 */
import { fetchEmbedding, cosineSim } from "./embeddingClient.js";

const REPO_OWNER  = process.env.GITHUB_REPO_OWNER  ?? "marksen23";
const REPO_NAME   = process.env.GITHUB_REPO_NAME   ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";

const INDEX_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/client/public/resonanzen-index.json`;
const EMB_URL   = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/client/public/resonanzen-embeddings.json`;

const NEAR_DUP_THRESHOLD = 0.88;
const TOP_K = 5;
const TTL_MS = 10 * 60 * 1000; // 10 Minuten
const FETCH_TIMEOUT_MS = 15 * 1000;

interface CacheEntry {
  embeddings: Record<string, number[]>;
  anchors: Map<string, { anchor: string; endpoint: string }>;
}

let cache: CacheEntry | null = null;
let fetchedAt = 0;
let inflight: Promise<void> | null = null;
let lastEchoCount = 0;

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cache aktualisieren wenn null oder älter als TTL. Per inflight-Promise
 * deduplizieren, damit parallele Logging-Calls nicht doppelt fetchen.
 */
async function ensureCache(): Promise<void> {
  const now = Date.now();
  if (cache && now - fetchedAt < TTL_MS) return;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const [embRes, idxRes] = await Promise.all([
        fetchWithTimeout(EMB_URL, FETCH_TIMEOUT_MS),
        fetchWithTimeout(INDEX_URL, FETCH_TIMEOUT_MS),
      ]);
      if (!embRes.ok || !idxRes.ok) {
        // 404 ist nicht-fatal: noch kein Index gebuildet — leerer Cache
        cache = { embeddings: {}, anchors: new Map() };
        fetchedAt = now;
        return;
      }
      const embData = await embRes.json();
      const idxData = await idxRes.json();

      // Nur Korpus-Embeddings (nicht chapter:*) — gegen die wird ein
      // neuer Eintrag verglichen. chapter:* sind Werkstreue-Anker,
      // keine Echo-Kandidaten.
      const allEmb = (embData?.embeddings ?? {}) as Record<string, number[]>;
      const corpusEmb: Record<string, number[]> = {};
      for (const [id, vec] of Object.entries(allEmb)) {
        if (!id.startsWith("chapter:") && Array.isArray(vec)) {
          corpusEmb[id] = vec;
        }
      }

      const anchors = new Map<string, { anchor: string; endpoint: string }>();
      for (const e of (idxData?.entries ?? [])) {
        if (e && typeof e.id === "string") {
          anchors.set(e.id, { anchor: String(e.anchor ?? ""), endpoint: String(e.endpoint ?? "") });
        }
      }

      cache = { embeddings: corpusEmb, anchors };
      fetchedAt = now;
    } catch {
      // Netzwerk-Fehler: leerer Cache, beim nächsten Aufruf wieder versuchen
      cache = { embeddings: {}, anchors: new Map() };
      fetchedAt = now;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Findet bestehende Einträge, die diese prompt+response semantisch
 * wiederholen (Cosine ≥0.88). Returnt bis zu TOP_K (5), sortiert nach
 * Score absteigend. Bei jedem Fehler → leeres Array.
 */
export async function detectEchoes(
  prompt: string,
  response: string,
): Promise<Array<{ id: string; score: number; anchor: string; endpoint: string }>> {
  try {
    await ensureCache();
    if (!cache || Object.keys(cache.embeddings).length === 0) return [];

    const text = `${prompt}\n\n${response}`;
    const vec = await fetchEmbedding(text);
    if (!vec) return [];

    const scored: Array<{ id: string; score: number; anchor: string; endpoint: string }> = [];
    for (const [id, ov] of Object.entries(cache.embeddings)) {
      const s = cosineSim(vec, ov);
      if (s >= NEAR_DUP_THRESHOLD) {
        const meta = cache.anchors.get(id);
        scored.push({ id, score: s, anchor: meta?.anchor ?? "", endpoint: meta?.endpoint ?? "" });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, TOP_K);
    lastEchoCount = top.length;
    return top;
  } catch {
    return [];
  }
}

/**
 * Health-Snapshot für /api/admin/resonanz-health.
 * Erlaubt zu prüfen, ob der Cache lebt und wie viele Einträge er trägt.
 */
export function getEchoDetectorHealth() {
  return {
    cacheAgeSec: cache ? Math.round((Date.now() - fetchedAt) / 1000) : null,
    cachedEntries: cache ? Object.keys(cache.embeddings).length : 0,
    lastEchoCount,
  };
}
