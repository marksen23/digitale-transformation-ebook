/**
 * build-search-index.ts — generiert Embeddings für Concepts + Philosophers.
 *
 * Schreibt:
 *   client/public/concepts-embeddings.json     (NODES aus conceptGraph.ts)
 *   client/public/philosophers-embeddings.json (PHILOSOPHERS aus philosophyMap.ts)
 *
 * Format pro Datei:
 *   { generatedAt, model, embeddings: { [id: string]: number[] }, hashes: { [id: string]: string } }
 *
 * Reuse (scripts/lib/embeddingReuse.ts): Ein Vektor wird übernommen, wenn
 * Modell und Hash(Text + Modell) passen. Nur neue/geänderte Texte kosten
 * Gemini-Calls; ohne Änderungen wird die Datei gar nicht geschrieben.
 * SEARCH_INDEX_FORCE=1 erzwingt eine komplette Neu-Einbettung.
 *
 * Voraussetzung: GEMINI_API_KEY in env. Run via:
 *   pnpm tsx scripts/build-search-index.ts
 *
 * Wird in der CI (validate-corpus.yml) nach build-resonanzen-index aufgerufen.
 * Ohne Key: reiner Reuse läuft durch; gibt es Neues einzubetten, wird die
 * Datei übersprungen (fail-soft, damit lokale Builds ohne Key durchlaufen).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NODES } from "../client/src/data/conceptGraph.js";
import { philosophersByBirth, getTradition } from "../client/src/data/philosophyMap.js";
import { fetchEmbedding as sharedFetchEmbedding, getKeys } from "../server/lib/embeddingClient.js";
import { buildEmbeddingSet, planReuse, type EmbedItem, type EmbeddingFile } from "./lib/embeddingReuse.js";

// M2: Build-Zeit unkritisch → höhere Retry-Toleranz als der Server.
const fetchEmbedding = (text: string) => sharedFetchEmbedding(text, { maxRetries: 3 });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CONCEPTS_OUT = path.join(ROOT, "client/public/concepts-embeddings.json");
const PHILOSOPHERS_OUT = path.join(ROOT, "client/public/philosophers-embeddings.json");
// Gleiche Normalisierung wie embeddingClient.ts (leerer String → Default).
const MODEL = (process.env.GEMINI_EMBED_MODEL ?? "").trim() || "gemini-embedding-001";

const FORCE = (process.env.SEARCH_INDEX_FORCE ?? "").trim() === "1";

function readExisting(file: string): EmbeddingFile | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as EmbeddingFile;
  } catch {
    console.warn(`[build-search-index] ${path.basename(file)} nicht lesbar — bette alles neu ein`);
    return null;
  }
}

/**
 * Bettet nur neue oder geänderte Texte ein (Hash über Text + Modell) und
 * schreibt die Datei nur, wenn sich ihr Inhalt ändert. Ohne Änderungen:
 * kein Gemini-Call, kein Schreiben.
 */
async function buildFile(label: string, items: EmbedItem[], outFile: string): Promise<void> {
  const existing = readExisting(outFile);
  const res = await buildEmbeddingSet({
    label,
    items,
    existing,
    model: MODEL,
    embed: fetchEmbedding,
    force: FORCE,
    // sanfte Drossel — Gemini Free-Tier hat ~60 RPM
    throttleMs: 150,
  });
  const why =
    res.reason === "forced" ? " (SEARCH_INDEX_FORCE=1)"
    : res.reason === "model-mismatch" ? ` (Modell gewechselt: ${existing?.model ?? "?"} → ${MODEL})`
    : res.reason === "no-file" ? " (keine bestehende Datei)"
    : res.legacy ? " (Altbestand ohne Hashes: einmalig per ID übernommen)"
    : "";
  console.log(
    `[build-search-index] ${label}: ${items.length} Einträge — ${res.reused} wiederverwendet, ` +
    `${res.added} neu, ${res.failed} fehlgeschlagen${why}`,
  );
  if (!res.file) {
    console.log(`[build-search-index] ${path.basename(outFile)} unverändert — nicht geschrieben`);
    return;
  }
  fs.writeFileSync(outFile, JSON.stringify(res.file, null, 2));
  console.log(`[build-search-index] wrote ${outFile}`);
}

async function main(): Promise<void> {
  // Concepts: fullLabel + description als Embed-Text. fullLabel kommt zuerst,
  // damit es im Vektor stärker gewichtet ist als die längere Beschreibung.
  const conceptItems = NODES
    .filter(n => n.description?.trim())
    .map(n => ({
      id: n.id,
      text: `${n.fullLabel ?? n.label}: ${n.description}`,
    }));
  // Phase 5c: in den Kanon erhobene neue Begriffe (concept-nodes.json) mit-
  // embedden → conceptVoiceScore (5a) bezieht sie automatisch ein.
  try {
    const dynPath = path.join(ROOT, "client/public/concept-nodes.json");
    if (fs.existsSync(dynPath)) {
      const dyn = JSON.parse(fs.readFileSync(dynPath, "utf-8")) as { nodes?: Array<{ id: string; fullLabel?: string; label?: string; description?: string }> };
      let added = 0;
      for (const n of dyn.nodes ?? []) {
        if (!n.description?.trim() || conceptItems.some(c => c.id === n.id)) continue;
        conceptItems.push({ id: n.id, text: `${n.fullLabel ?? n.label}: ${n.description}` });
        added++;
      }
      if (added > 0) console.log(`[build-search-index] + ${added} dynamische Begriffe (concept-nodes.json)`);
    }
  } catch (err) {
    console.warn(`[build-search-index] concept-nodes.json nicht ladbar: ${err instanceof Error ? err.message : err}`);
  }
  // M2: getKeys() statt GEMINI_API_KEY direkt — läuft auch bei Fallback-only-Config.
  // Ohne Key nur weitermachen, wenn nichts neu einzubetten ist (reiner Reuse).
  const hasKeys = getKeys().length > 0;
  const embedOrSkip = async (label: string, items: EmbedItem[], outFile: string) => {
    if (!hasKeys && planReuse(items, readExisting(outFile), MODEL, { force: FORCE }).toEmbed.length > 0) {
      console.warn(`[build-search-index] kein Embedding-Key (GEMINI_API_KEY[S]/FALLBACK) — ${label} übersprungen.`);
      return;
    }
    await buildFile(label, items, outFile);
  };

  await embedOrSkip("concepts", conceptItems, CONCEPTS_OUT);

  // Philosophers: Name + Tradition + Werke + resonanzNote als Embed-Text.
  const philosophers = philosophersByBirth();
  const philItems = philosophers.map(p => {
    const tradLabel = getTradition(p.tradition)?.name ?? "";
    const works = (p.keyWorks ?? []).map(w => w.title).join(", ");
    const text = `${p.name} (${tradLabel}). ${p.resonanzNote ?? ""} Werke: ${works}.`;
    return { id: p.id, text };
  });
  await embedOrSkip("philosophers", philItems, PHILOSOPHERS_OUT);

  console.log("[build-search-index] DONE");
}

main().catch(err => {
  console.error("[build-search-index] FATAL:", err);
  process.exit(1);
});
