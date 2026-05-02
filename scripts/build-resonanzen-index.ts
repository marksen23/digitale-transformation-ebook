/**
 * build-resonanzen-index.ts — generiert client/public/resonanzen-index.json
 * aus dem content/resonanzen/-Korpus für die FAQ-Ansicht.
 *
 * Holt die Files über GitHub-Tree-API + Raw-URLs (kein Filesystem-Lookup),
 * damit der Build in jedem Container-Layout funktioniert. Local + Netlify
 * + GitHub-Action arbeiten alle gleich.
 *
 * Konfiguration via env vars (alle optional, mit sinnvollen Defaults):
 *   GITHUB_REPO_OWNER  (default: marksen23)
 *   GITHUB_REPO_NAME   (default: digitale-transformation-ebook)
 *   GITHUB_REPO_BRANCH (default: main)
 *   GITHUB_TOKEN       (optional — anonyme API hat 60 calls/h Rate-Limit
 *                       für Tree-Call, raw URLs sind ungelimitiert)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "client/public/resonanzen-index.json");
const EMBEDDINGS_OUTPUT = path.join(ROOT, "client/public/resonanzen-embeddings.json");

const REPO_OWNER  = process.env.GITHUB_REPO_OWNER  ?? "marksen23";
const REPO_NAME   = process.env.GITHUB_REPO_NAME   ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // optional
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // optional — falls nicht gesetzt, Embeddings werden geskippt

interface ResonanzEntry {
  id: string;
  ts: string;
  endpoint: string;
  anchor: string;
  nodeIds: string[];
  status: string;
  prompt: string;
  response: string;
  contextMeta: Record<string, unknown>;
  // Top-5 semantisch verwandte Einträge — wird im Build berechnet, falls
  // Embeddings verfügbar sind. Sortiert nach Cosine-Similarity absteigend.
  related?: string[];
}

interface TreeEntry { path: string; type: "blob" | "tree"; }

function parseFrontmatter(md: string): { fm: Record<string, unknown>; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: md };
  const fmRaw = m[1];
  const body = m[2];
  const fm: Record<string, unknown> = {};
  const lines = fmRaw.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.startsWith("#") || line.match(/^\s+/)) { i++; continue; }
    const colon = line.indexOf(":");
    if (colon < 0) { i++; continue; }
    const key = line.slice(0, colon).trim();
    const valueRaw = line.slice(colon + 1).trim();
    if (valueRaw === "") {
      const children: Record<string, string> = {};
      i++;
      while (i < lines.length && lines[i].match(/^\s+/) && !lines[i].match(/^\s+-/)) {
        const childLine = lines[i].trim();
        const cIdx = childLine.indexOf(":");
        if (cIdx > 0) {
          children[childLine.slice(0, cIdx).trim()] = stripQuotes(childLine.slice(cIdx + 1).trim());
        }
        i++;
      }
      fm[key] = children;
      continue;
    }
    if (valueRaw.startsWith("[") && valueRaw.endsWith("]")) {
      const inner = valueRaw.slice(1, -1).trim();
      fm[key] = inner === "" ? [] : inner.split(",").map(s => stripQuotes(s.trim()));
    } else {
      fm[key] = stripQuotes(valueRaw);
    }
    i++;
  }
  return { fm, body };
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function extractFrageAntwort(body: string): { prompt: string; response: string } {
  const sections = body.split(/^##\s+/m);
  let prompt = "", response = "";
  for (const section of sections) {
    if (/^Frage\s*\n/.test(section)) {
      prompt = section.replace(/^Frage\s*\n+/, "").trim();
    } else if (/^Antwort\s*\n/.test(section)) {
      response = section.replace(/^Antwort\s*\n+/, "").trim();
    }
  }
  return { prompt, response };
}

async function fetchTree(): Promise<TreeEntry[]> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${REPO_BRANCH}?recursive=1`;
  const headers: Record<string, string> = { "Accept": "application/vnd.github+json", "User-Agent": "dt-resonanzen-index" };
  if (GITHUB_TOKEN) headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Tree API ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return data.tree ?? [];
}

async function fetchRaw(filePath: string): Promise<string> {
  // raw.githubusercontent.com — kein Rate-Limit, schnell
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Raw fetch ${res.status} ${res.statusText} for ${filePath}`);
  }
  return res.text();
}

async function main() {
  console.log(`[build-resonanzen-index] Source: ${REPO_OWNER}/${REPO_NAME}@${REPO_BRANCH}`);
  console.log(`[build-resonanzen-index] OUTPUT: ${OUTPUT}`);

  let tree: TreeEntry[];
  try {
    tree = await fetchTree();
    console.log(`[build-resonanzen-index] Tree: ${tree.length} entries total`);
  } catch (err) {
    console.error(`[build-resonanzen-index] Tree fetch failed: ${err instanceof Error ? err.message : err}`);
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: 0, entries: [], error: String(err) }, null, 2));
    return;
  }

  // Filter auf Resonanz-MD-Files
  const mdPaths = tree
    .filter(e => e.type === "blob")
    .map(e => e.path)
    .filter(p => p.startsWith("content/resonanzen/") && p.endsWith(".md") && !p.endsWith("README.md"));

  console.log(`[build-resonanzen-index] Found ${mdPaths.length} resonance markdown files`);

  // Parallel fetch (Batch von 10, um Server nicht zu hämmern)
  const entries: ResonanzEntry[] = [];
  const BATCH = 10;
  for (let i = 0; i < mdPaths.length; i += BATCH) {
    const batch = mdPaths.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(async p => {
      const md = await fetchRaw(p);
      return { path: p, md };
    }));
    for (const result of results) {
      if (result.status !== "fulfilled") {
        console.warn(`[build-resonanzen-index] skip: ${result.reason}`);
        continue;
      }
      const { md } = result.value;
      const { fm, body } = parseFrontmatter(md);
      const { prompt, response } = extractFrageAntwort(body);
      if (!fm.id || !fm.ts || !fm.endpoint) continue;
      entries.push({
        id: String(fm.id),
        ts: String(fm.ts),
        endpoint: String(fm.endpoint),
        anchor: String(fm.anchor ?? ""),
        nodeIds: Array.isArray(fm.nodeIds) ? fm.nodeIds.map(String) : [],
        status: String(fm.status ?? "raw"),
        prompt,
        response,
        contextMeta: (fm.context_meta as Record<string, unknown>) ?? {},
      });
    }
  }

  entries.sort((a, b) => b.ts.localeCompare(a.ts));

  // ─── Embeddings (optional, nur wenn GEMINI_API_KEY gesetzt) ─────────
  // Embeddings werden vor dem Index-Schreiben berechnet, damit Cross-Links
  // direkt mitgeschrieben werden können (vermeidet 2-Pass-Schreiben).
  let embeddings: Record<string, number[]> | null = null;
  if (GEMINI_API_KEY && entries.length > 0) {
    embeddings = await buildEmbeddings(entries);
  } else {
    console.log("[build-resonanzen-index] GEMINI_API_KEY nicht gesetzt — Embedding-Suche wird nicht verfügbar sein.");
  }

  // ─── Cross-Links: top-5 semantisch verwandte pro Eintrag ────────────
  if (embeddings) {
    computeCrossLinks(entries, embeddings);
    const linkCount = entries.reduce((s, e) => s + (e.related?.length ?? 0), 0);
    console.log(`[build-resonanzen-index] computed ${linkCount} cross-links`);
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(
    OUTPUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: entries.length, entries }, null, 2)
  );
  console.log(`[build-resonanzen-index] wrote ${entries.length} entries to ${OUTPUT}`);
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** Berechnet pro Eintrag die 5 ähnlichsten anderen Einträge.
 *  Mutiert entries — schreibt `related: string[]` ins jeweilige Element. */
function computeCrossLinks(entries: ResonanzEntry[], embeddings: Record<string, number[]>) {
  const TOP_K = 5;
  // Min-Score-Schwelle — verhindert, dass wir bei sehr disparatem Korpus
  // willkürliche Verlinkungen generieren. 0.5 ist ein konservativer Wert.
  const MIN_SCORE = 0.5;
  for (const entry of entries) {
    const v = embeddings[entry.id];
    if (!v) continue;
    const scored: Array<{ id: string; score: number }> = [];
    for (const other of entries) {
      if (other.id === entry.id) continue;
      const ov = embeddings[other.id];
      if (!ov) continue;
      const score = cosineSim(v, ov);
      if (score >= MIN_SCORE) scored.push({ id: other.id, score });
    }
    scored.sort((a, b) => b.score - a.score);
    entry.related = scored.slice(0, TOP_K).map(s => s.id);
  }
}

async function fetchEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { parts: [{ text: text.slice(0, 8000) }] } }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.embedding?.values) ? data.embedding.values : null;
  } catch {
    return null;
  }
}

async function buildEmbeddings(entries: ResonanzEntry[]): Promise<Record<string, number[]>> {
  // Inkrementell: bestehende Embeddings laden, nur fehlende neu berechnen
  let existing: Record<string, number[]> = {};
  if (fs.existsSync(EMBEDDINGS_OUTPUT)) {
    try {
      const data = JSON.parse(fs.readFileSync(EMBEDDINGS_OUTPUT, "utf-8"));
      existing = data.embeddings ?? {};
      console.log(`[build-resonanzen-index] reusing ${Object.keys(existing).length} existing embeddings`);
    } catch {
      // korruptes File — neu starten
    }
  }

  const toCompute = entries.filter(e => !(e.id in existing));
  if (toCompute.length === 0) {
    console.log("[build-resonanzen-index] all embeddings up to date");
    fs.writeFileSync(EMBEDDINGS_OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), embeddings: existing }, null, 2));
    return existing;
  }

  console.log(`[build-resonanzen-index] computing ${toCompute.length} new embeddings (Gemini text-embedding-004)`);
  const BATCH = 5;
  let success = 0, failed = 0;
  for (let i = 0; i < toCompute.length; i += BATCH) {
    const batch = toCompute.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async e => {
      // Embed prompt + response zusammen — semantischer Inhalt
      const text = `${e.prompt}\n\n${e.response}`;
      const vec = await fetchEmbedding(text);
      return { id: e.id, vec };
    }));
    for (const { id, vec } of results) {
      if (vec) {
        existing[id] = vec;
        success++;
      } else {
        failed++;
      }
    }
    // Progress alle 25
    if ((i + BATCH) % 25 < BATCH) console.log(`[build-resonanzen-index]   embeddings: ${success}/${toCompute.length}`);
  }

  fs.writeFileSync(EMBEDDINGS_OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), embeddings: existing }, null, 2));
  console.log(`[build-resonanzen-index] wrote ${success} new embeddings (${failed} failed) to ${EMBEDDINGS_OUTPUT}`);
  return existing;
}

main().catch(err => {
  console.error(`[build-resonanzen-index] FAILED: ${err instanceof Error ? err.stack : err}`);
  // Trotzdem leeren Index schreiben, damit Vite-Build nicht bricht
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: 0, entries: [], error: String(err) }, null, 2));
  process.exit(0);
});
