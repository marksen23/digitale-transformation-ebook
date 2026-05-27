/**
 * eval-rag.ts — RAG-Retrieval messbar machen (Sprint R5).
 *
 * Bisher waren alle RAG-Verbesserungen (R1: Resonanzen-Pool, geplant
 * R2-R4: Chunks/Rewriting/Re-Ranking) Vibes. Dieses Skript misst, ob
 * sie wirklich helfen.
 *
 * Zwei Eval-Modi:
 *
 * 1. AUTO-MODE (offline, keine API-Calls nötig):
 *    - Für jeden published+approved Resonanz-Eintrag:
 *      → benutze sein bereits berechnetes Embedding als „Query"
 *      → run retrieval (Werk-Chunks + andere Resonanzen)
 *      → Metriken:
 *        a) self-recall@5: erscheint der Eintrag selbst in top-5?
 *           (kann er sich selbst finden, wenn nicht aus dem Pool entfernt?)
 *        b) sibling-recall@5: wie viele von related[]-Geschwistern erscheinen?
 *        c) node-overlap-avg: durchschnittliche gemeinsame nodeIds mit top-5
 *
 * 2. MANUAL-MODE (mit GEMINI_API_KEY):
 *    - Lädt eval/manual-queries.json
 *    - Embeddet jede Query live
 *    - Misst: min_score-Erfüllung, expected_chunks-Coverage
 *
 * Output: eval/rag-results-<timestamp>.json + Console-Tabelle.
 *
 * Lauf: pnpm exec tsx scripts/eval-rag.ts
 *       (optional: GEMINI_API_KEY=… für Manual-Mode mit-aktivieren)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const RESONANZ_IDX = path.join(ROOT, "client/public/resonanzen-index.json");
const RESONANZ_EMB = path.join(ROOT, "client/public/resonanzen-embeddings.json");
const WERK_CHUNKS  = path.join(ROOT, "client/public/werk-chunks.json");
const MANUAL_PATH  = path.join(ROOT, "eval/manual-queries.json");
const OUT_DIR      = path.join(ROOT, "eval");

const TOP_K = 5;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY ?? "").trim() || undefined;
const GEMINI_EMBED_MODEL = (process.env.GEMINI_EMBED_MODEL ?? "").trim() || "gemini-embedding-001";

// ─── Daten-Typen ─────────────────────────────────────────────────────────

interface ResonanzEntry {
  id: string; ts: string; endpoint: string; status: string;
  prompt: string; response: string; nodeIds: string[];
  related?: string[];
}

interface WerkChunk {
  id: string; chapter: string; partTitle: string; chapterTitle: string;
  text: string; embedding?: number[];
}

interface ManualQuery {
  query: string;
  category?: string;
  expected_werk_chunks: string[];
  expected_resonanzen: string[];
  min_score?: number;
  note?: string;
}

// ─── Cosine ──────────────────────────────────────────────────────────────

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// ─── Gemini-Embedding (für Manual-Mode) ──────────────────────────────────

async function embedQuery(text: string): Promise<number[] | null> {
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
      console.warn(`[eval-rag] embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    return Array.isArray(data.embedding?.values) ? data.embedding.values : null;
  } catch (err) {
    console.warn(`[eval-rag] embed net error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ─── Retrieval (gleiche Logik wie server/lib/werkRetrieval.ts) ───────────

interface Pool {
  werkChunks: Array<WerkChunk & { embedding: number[] }>;
  resoEntries: Array<ResonanzEntry & { embedding: number[] }>;
}

function buildPool(includeResonanzInRetrieval: (id: string) => boolean): Pool | null {
  if (!fs.existsSync(WERK_CHUNKS) || !fs.existsSync(RESONANZ_IDX) || !fs.existsSync(RESONANZ_EMB)) {
    console.error("[eval-rag] Fehlende Daten-Files. Werk-Chunks/Resonanzen-Index/-Embeddings nötig.");
    return null;
  }
  const chunks = JSON.parse(fs.readFileSync(WERK_CHUNKS, "utf-8")) as { chunks: WerkChunk[] };
  const idx = JSON.parse(fs.readFileSync(RESONANZ_IDX, "utf-8")) as { entries: ResonanzEntry[] };
  const emb = JSON.parse(fs.readFileSync(RESONANZ_EMB, "utf-8")) as { embeddings: Record<string, number[]> };
  const werkChunks = (chunks.chunks ?? []).filter((c: WerkChunk) => Array.isArray(c.embedding) && c.embedding.length > 0) as Array<WerkChunk & { embedding: number[] }>;
  const resoEntries: Array<ResonanzEntry & { embedding: number[] }> = [];
  for (const e of idx.entries ?? []) {
    if (!includeResonanzInRetrieval(e.id)) continue;
    if (e.status !== "published" && e.status !== "approved") continue;
    const v = emb.embeddings[e.id];
    if (!v?.length) continue;
    resoEntries.push({ ...e, embedding: v });
  }
  return { werkChunks, resoEntries };
}

interface RankItem { source: "werk" | "resonanz"; id: string; score: number; meta?: WerkChunk | ResonanzEntry }

function retrieveTopK(pool: Pool, qVec: number[], topK: number): RankItem[] {
  const all: RankItem[] = [];
  for (const c of pool.werkChunks) {
    all.push({ source: "werk", id: c.id, score: cosine(qVec, c.embedding) * 1.05, meta: c });
  }
  for (const e of pool.resoEntries) {
    all.push({ source: "resonanz", id: e.id, score: cosine(qVec, e.embedding), meta: e });
  }
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, topK);
}

// ─── Metriken ────────────────────────────────────────────────────────────

interface AutoQueryResult {
  queryId: string;
  prompt: string;
  selfRecall: boolean;
  siblingRecallCount: number;
  siblingRecallExpected: number;
  nodeOverlapAvg: number;
  topResults: Array<{ source: string; id: string; score: number }>;
}

function evalSelfRecall(entry: ResonanzEntry & { embedding: number[] }, pool: Pool): AutoQueryResult {
  const top = retrieveTopK(pool, entry.embedding, TOP_K);
  const selfRecall = top.some(r => r.source === "resonanz" && r.id === entry.id);
  const expectedSiblings = entry.related ?? [];
  const siblingRecallCount = expectedSiblings.filter(sid => top.some(r => r.source === "resonanz" && r.id === sid)).length;
  // Node-Overlap: durchschnittlich-geteilte nodeIds zwischen entry und top-K-Resonanzen
  const myNodes = new Set(entry.nodeIds ?? []);
  const overlaps: number[] = [];
  for (const r of top) {
    if (r.source !== "resonanz") continue;
    const otherNodes = (r.meta as ResonanzEntry)?.nodeIds ?? [];
    const shared = otherNodes.filter(n => myNodes.has(n)).length;
    overlaps.push(shared);
  }
  const nodeOverlapAvg = overlaps.length > 0 ? overlaps.reduce((s, n) => s + n, 0) / overlaps.length : 0;
  return {
    queryId: entry.id,
    prompt: entry.prompt.slice(0, 120),
    selfRecall,
    siblingRecallCount,
    siblingRecallExpected: expectedSiblings.length,
    nodeOverlapAvg: Number(nodeOverlapAvg.toFixed(2)),
    topResults: top.map(r => ({ source: r.source, id: r.id, score: Number(r.score.toFixed(3)) })),
  };
}

interface ManualQueryResult {
  query: string;
  category?: string;
  topResults: Array<{ source: string; id: string; score: number }>;
  expectedChunksHit: number;
  expectedChunksTotal: number;
  expectedResoHit: number;
  expectedResoTotal: number;
  topScore: number;
  meetsMinScore: boolean;
}

async function evalManualQuery(q: ManualQuery, pool: Pool): Promise<ManualQueryResult | null> {
  const qVec = await embedQuery(q.query);
  if (!qVec) return null;
  const top = retrieveTopK(pool, qVec, TOP_K);
  const expectedChunksHit = q.expected_werk_chunks.filter(id => top.some(r => r.source === "werk" && r.id === id)).length;
  const expectedResoHit = q.expected_resonanzen.filter(id => top.some(r => r.source === "resonanz" && r.id === id)).length;
  const topScore = top[0]?.score ?? 0;
  const minScore = q.min_score ?? 0;
  return {
    query: q.query,
    category: q.category,
    topResults: top.map(r => ({ source: r.source, id: r.id, score: Number(r.score.toFixed(3)) })),
    expectedChunksHit,
    expectedChunksTotal: q.expected_werk_chunks.length,
    expectedResoHit,
    expectedResoTotal: q.expected_resonanzen.length,
    topScore: Number(topScore.toFixed(3)),
    meetsMinScore: topScore >= minScore,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("[eval-rag] RAG-Retrieval-Eval startet");

  // ─── Auto-Mode: jede published+approved Resonanz als Self-Query
  const idxRaw = fs.readFileSync(RESONANZ_IDX, "utf-8");
  const idx = JSON.parse(idxRaw) as { entries: ResonanzEntry[] };
  const embRaw = fs.readFileSync(RESONANZ_EMB, "utf-8");
  const emb = JSON.parse(embRaw) as { embeddings: Record<string, number[]> };

  const curated = (idx.entries ?? []).filter(e =>
    (e.status === "published" || e.status === "approved") && Array.isArray(emb.embeddings[e.id])
  );
  console.log(`[eval-rag] Auto-Mode: ${curated.length} kuratierte Resonanzen mit Embedding`);
  if (curated.length === 0) {
    console.warn("[eval-rag] keine kuratierten Resonanzen → Auto-Eval übersprungen");
  }

  // Self-Recall ist nur sinnvoll wenn der Eintrag SELBST aus dem Pool
  // ausgenommen wird — sonst ist self-recall trivial 100% (Cosine zu sich
  // selbst ist 1.0). Für jeden Eintrag: Pool ohne diesen Eintrag bauen.
  const autoResults: AutoQueryResult[] = [];
  for (const entry of curated) {
    const pool = buildPool(id => id !== entry.id);
    if (!pool) break;
    autoResults.push(evalSelfRecall({ ...entry, embedding: emb.embeddings[entry.id] }, pool));
  }

  const autoStats = (() => {
    if (autoResults.length === 0) return null;
    // Sibling-Recall: nur über Einträge mit >0 erwarteten Geschwistern
    const withSiblings = autoResults.filter(r => r.siblingRecallExpected > 0);
    const siblingRecallRate = withSiblings.length === 0 ? 0 :
      withSiblings.reduce((s, r) => s + (r.siblingRecallCount / r.siblingRecallExpected), 0) / withSiblings.length;
    const nodeOverlapAvg = autoResults.reduce((s, r) => s + r.nodeOverlapAvg, 0) / autoResults.length;
    return {
      total: autoResults.length,
      siblingRecallAvg: Number(siblingRecallRate.toFixed(3)),
      nodeOverlapAvg: Number(nodeOverlapAvg.toFixed(2)),
      withSiblingsCount: withSiblings.length,
    };
  })();

  // ─── Manual-Mode (nur wenn GEMINI_API_KEY gesetzt) ─────────────────────
  let manualResults: ManualQueryResult[] = [];
  let manualStats: { total: number; meetsMinScore: number; avgTopScore: number } | null = null;

  if (fs.existsSync(MANUAL_PATH) && GEMINI_API_KEY) {
    const manualFile = JSON.parse(fs.readFileSync(MANUAL_PATH, "utf-8")) as { queries: ManualQuery[] };
    const queries = manualFile.queries ?? [];
    console.log(`[eval-rag] Manual-Mode: ${queries.length} Hand-Queries (mit Gemini-Embedding)`);
    const pool = buildPool(() => true);
    if (pool) {
      for (const q of queries) {
        const r = await evalManualQuery(q, pool);
        if (r) manualResults.push(r);
        await new Promise(r => setTimeout(r, 120));  // sanfte Rate-Limit-Drosselung
      }
      manualStats = {
        total: manualResults.length,
        meetsMinScore: manualResults.filter(r => r.meetsMinScore).length,
        avgTopScore: manualResults.length === 0 ? 0 :
          Number((manualResults.reduce((s, r) => s + r.topScore, 0) / manualResults.length).toFixed(3)),
      };
    }
  } else if (!GEMINI_API_KEY) {
    console.log("[eval-rag] Manual-Mode übersprungen — GEMINI_API_KEY nicht gesetzt");
  }

  // ─── Output ─────────────────────────────────────────────────────────────

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(OUT_DIR, `rag-results-${stamp}.json`);
  const latestFile = path.join(OUT_DIR, "rag-results-latest.json");
  const report = {
    generatedAt: new Date().toISOString(),
    config: {
      topK: TOP_K,
      embedModel: GEMINI_EMBED_MODEL,
      autoQueries: autoResults.length,
      manualQueries: manualResults.length,
    },
    autoStats,
    manualStats,
    autoResults: autoResults.slice(0, 20),  // nur die ersten 20 voll speichern
    manualResults,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  fs.writeFileSync(latestFile, JSON.stringify(report, null, 2));

  // Console-Tabelle
  console.log("\n═══ RAG-EVAL-REPORT ════════════════════════════════════════════════");
  console.log(`Top-K: ${TOP_K} · Embed-Model: ${GEMINI_EMBED_MODEL}`);
  if (autoStats) {
    console.log("\n📊 AUTO-MODE (self-Query aus published Resonanzen):");
    console.log(`   Total Queries:          ${autoStats.total}`);
    console.log(`   Sibling-Recall Ø:       ${(autoStats.siblingRecallAvg * 100).toFixed(1)}%  (über ${autoStats.withSiblingsCount} Einträge mit ≥1 erwartetem Geschwister)`);
    console.log(`   Node-Overlap Ø in top5: ${autoStats.nodeOverlapAvg} gemeinsame nodeIds`);
  }
  if (manualStats) {
    console.log("\n🎯 MANUAL-MODE (eval/manual-queries.json mit Live-Embedding):");
    console.log(`   Total Queries:          ${manualStats.total}`);
    console.log(`   meetsMinScore:          ${manualStats.meetsMinScore}/${manualStats.total}`);
    console.log(`   Top-Score Ø:            ${manualStats.avgTopScore}`);
    console.log("\n   Per Query:");
    for (const r of manualResults) {
      const indicator = r.meetsMinScore ? "✓" : "✕";
      console.log(`   ${indicator} "${r.query.slice(0, 50)}…" topScore=${r.topScore.toFixed(2)}`);
    }
  }
  console.log(`\n📁 Voller Report: ${path.relative(ROOT, outFile)}`);
  console.log(`📁 Latest-Symlink: ${path.relative(ROOT, latestFile)}`);
}

main().catch(err => {
  console.error(`[eval-rag] FAILED: ${err instanceof Error ? err.stack : err}`);
  process.exit(1);
});
