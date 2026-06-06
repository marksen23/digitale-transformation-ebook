/**
 * build-search-index.ts — generiert Embeddings für Concepts + Philosophers.
 *
 * Schreibt:
 *   client/public/concepts-embeddings.json     (NODES aus conceptGraph.ts)
 *   client/public/philosophers-embeddings.json (PHILOSOPHERS aus philosophyMap.ts)
 *
 * Format pro Datei:
 *   { generatedAt, model, embeddings: { [id: string]: number[] } }
 *
 * Voraussetzung: GEMINI_API_KEY in env. Run via:
 *   pnpm tsx scripts/build-search-index.ts
 *
 * Wird in der CI (validate-corpus.yml) nach build-resonanzen-index aufgerufen.
 * Skip wenn kein Key — fail-soft, damit lokale Builds ohne Key durchlaufen.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NODES } from "../client/src/data/conceptGraph.js";
import { philosophersByBirth, getTradition } from "../client/src/data/philosophyMap.js";
import { fetchEmbedding as sharedFetchEmbedding, getKeys } from "../server/lib/embeddingClient.js";

// M2: Build-Zeit unkritisch → höhere Retry-Toleranz als der Server.
const fetchEmbedding = (text: string) => sharedFetchEmbedding(text, { maxRetries: 3 });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CONCEPTS_OUT = path.join(ROOT, "client/public/concepts-embeddings.json");
const PHILOSOPHERS_OUT = path.join(ROOT, "client/public/philosophers-embeddings.json");
const MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";

async function embedAll(
  items: Array<{ id: string; text: string }>,
  label: string,
): Promise<Record<string, number[]>> {
  const out: Record<string, number[]> = {};
  let okCount = 0;
  let failCount = 0;
  for (const item of items) {
    const vec = await fetchEmbedding(item.text);
    if (vec) {
      out[item.id] = vec;
      okCount++;
    } else {
      failCount++;
    }
    // sanfte Drossel — Gemini Free-Tier hat ~60 RPM
    await new Promise(r => setTimeout(r, 150));
  }
  console.log(`[build-search-index] ${label}: ${okCount} ok · ${failCount} failed`);
  // Fail-fast wie build-resonanzen-index: 0 Erfolge bei nicht-leerem Input
  // bedeutet API down (Key tot, Quota erschöpft, Billing-Block). Wir werfen,
  // damit der Workflow rot wird und KEINE leere Datei eine gute überschreibt.
  if (items.length > 0 && okCount === 0) {
    throw new Error(
      `[build-search-index] FATAL: 0 erfolgreiche Embedding-Calls bei ${items.length} Versuchen (${label}). ` +
      `Wahrscheinliche Ursachen: ungültiger/zahlungsgesperrter GEMINI_API_KEY (403 PERMISSION_DENIED / dunning), ` +
      `erschöpfte Quota, oder Modell-Endpoint entfernt. Siehe Fetch-Fehler oben.`
    );
  }
  return out;
}

async function main(): Promise<void> {
  // M2: getKeys() statt GEMINI_API_KEY direkt — läuft auch bei Fallback-only-Config.
  if (getKeys().length === 0) {
    console.warn("[build-search-index] kein Embedding-Key (GEMINI_API_KEY[S]/FALLBACK) — Skip.");
    process.exit(0);
  }

  // Concepts: fullLabel + description als Embed-Text. fullLabel kommt zuerst,
  // damit es im Vektor stärker gewichtet ist als die längere Beschreibung.
  const conceptItems = NODES
    .filter(n => n.description?.trim())
    .map(n => ({
      id: n.id,
      text: `${n.fullLabel ?? n.label}: ${n.description}`,
    }));
  console.log(`[build-search-index] concepts: ${conceptItems.length} zu embedden`);
  const conceptEmbeddings = await embedAll(conceptItems, "concepts");
  fs.writeFileSync(CONCEPTS_OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    model: MODEL,
    embeddings: conceptEmbeddings,
  }, null, 2));
  console.log(`[build-search-index] wrote ${CONCEPTS_OUT}`);

  // Philosophers: Name + Tradition + Werke + resonanzNote als Embed-Text.
  const philosophers = philosophersByBirth();
  const philItems = philosophers.map(p => {
    const tradLabel = getTradition(p.tradition)?.name ?? "";
    const works = (p.keyWorks ?? []).map(w => w.title).join(", ");
    const text = `${p.name} (${tradLabel}). ${p.resonanzNote ?? ""} Werke: ${works}.`;
    return { id: p.id, text };
  });
  console.log(`[build-search-index] philosophers: ${philItems.length} zu embedden`);
  const philEmbeddings = await embedAll(philItems, "philosophers");
  fs.writeFileSync(PHILOSOPHERS_OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    model: MODEL,
    embeddings: philEmbeddings,
  }, null, 2));
  console.log(`[build-search-index] wrote ${PHILOSOPHERS_OUT}`);

  console.log("[build-search-index] DONE");
}

main().catch(err => {
  console.error("[build-search-index] FATAL:", err);
  process.exit(1);
});
