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
const HOLDOUT_BASELINE_OUTPUT = path.join(ROOT, "client/public/resonanzen-holdout-baseline.json");
const HOLDOUT_REPORT_OUTPUT = path.join(ROOT, "client/public/resonanzen-holdout-report.json");
const HOLDOUT_MIN_CORPUS_SIZE = 30;
const HOLDOUT_MODULO = 10;          // ≈10% Stichprobe
const HOLDOUT_TOP_NEIGHBORS = 3;

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
  /**
   * Near-Duplikate: andere Einträge mit Cosine ≥ NEAR_DUP_THRESHOLD (0.88).
   * Wenn nicht leer, "wiederholt diese Begegnung im Kern eine bestehende".
   * Asymmetrisch: A in B.nearDuplicates ⇒ B in A.nearDuplicates (Cosine ist
   * symmetrisch). Sortiert nach Score absteigend.
   */
  nearDuplicates?: string[];
  /**
   * Werkstreue-Score: 0–1, wie nah dieser Eintrag am semantischen Zentrum
   * der approved/published Einträge liegt. Werte < 0.55 deuten auf Drift
   * (off-voice, generisch, themenfremd). Berechnet nur wenn ≥10 kuratierte
   * Einträge als Referenz verfügbar.
   */
  werkVoiceScore?: number;
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

  // ─── Hold-out-Konsistenz: Anti-Drift-Mechanismus ─────────────────────
  // Bei jedem Build: ~10% des Korpus deterministisch als Stichprobe wählen,
  // ihre Top-3-Nachbarn baseline-en (sticky), und prüfen ob diese Nachbarn
  // bei späteren Builds stabil bleiben. Drift in Nachbarschaft = Signal.
  if (embeddings && entries.length >= HOLDOUT_MIN_CORPUS_SIZE) {
    runHoldoutCheck(entries, embeddings);
  } else if (embeddings) {
    console.log(`[build-resonanzen-index] holdout: korpus zu klein (${entries.length} < ${HOLDOUT_MIN_CORPUS_SIZE}) — skip`);
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

/** Berechnet pro Eintrag die 5 ähnlichsten anderen Einträge,
 *  Near-Duplikate (Cosine ≥ 0.88), und werkVoiceScore (Distanz zum
 *  Zentrum der kuratierten Einträge).
 *  Mutiert entries direkt. */
function computeCrossLinks(entries: ResonanzEntry[], embeddings: Record<string, number[]>) {
  const TOP_K = 5;
  // Min-Score für "related" — konservativ, verhindert willkürliche Links
  // bei sehr disparatem Korpus.
  const MIN_SCORE = 0.5;
  // Schwelle für "echtes Echo": die Aussagen wiederholen sich im Kern.
  // 0.88 ist empirisch aus dem Korpus kalibriert — bei 0.85 mehren sich
  // false-positives, bei 0.92 verpasst man oft Paraphrasen.
  const NEAR_DUP_THRESHOLD = 0.88;

  // Zuerst Werk-Stimme berechnen: Centroid der kuratierten Einträge
  // (approved/published) als Referenz für die werkVoiceScore. Wir brauchen
  // mindestens 10 als Referenz, sonst ist das Signal zu wackelig.
  const curated = entries.filter(e =>
    (e.status === "approved" || e.status === "published") && embeddings[e.id]
  );
  let centroid: number[] | null = null;
  if (curated.length >= 10) {
    const v0 = embeddings[curated[0].id];
    centroid = new Array(v0.length).fill(0);
    for (const e of curated) {
      const v = embeddings[e.id];
      for (let i = 0; i < v.length; i++) centroid[i] += v[i];
    }
    // Normalisiere zum Mittelwert (Centroid). Cosine ist invariant zur
    // Länge, also Normierung optional — aber explizit ist klarer.
    for (let i = 0; i < centroid.length; i++) centroid[i] /= curated.length;
    console.log(`[build-resonanzen-index] werkVoiceScore: ${curated.length} kuratierte Einträge als Referenz`);
  } else {
    console.log(`[build-resonanzen-index] werkVoiceScore übersprungen — nur ${curated.length} kuratierte Einträge (<10)`);
  }

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
    // Near-Duplikate separat extrahieren (alle, die über die Schwelle sind,
    // nicht limitiert auf top-5 — ein Eintrag kann viele Echos haben).
    const dups = scored.filter(s => s.score >= NEAR_DUP_THRESHOLD);
    if (dups.length > 0) {
      entry.nearDuplicates = dups.map(s => s.id);
    }
    // werkVoiceScore — Cosine zum Centroid
    if (centroid) {
      entry.werkVoiceScore = Math.max(0, Math.min(1, cosineSim(v, centroid)));
    }
  }

  // Diagnostik: wie viele Einträge mit Near-Duplikaten?
  const withDups = entries.filter(e => e.nearDuplicates && e.nearDuplicates.length > 0).length;
  if (withDups > 0) {
    console.log(`[build-resonanzen-index] ${withDups} Einträge mit Near-Duplikaten (Cosine ≥${NEAR_DUP_THRESHOLD})`);
  }
}

// ─── Hold-out-Konsistenz ──────────────────────────────────────────────────

interface HoldoutBaseline {
  generatedAt: string;
  baseline: Record<string, { neighbors: string[]; computedAt: string }>;
}
interface HoldoutReportDetail {
  id: string;
  baseline: string[];
  current: string[];
  overlap: number;
}
interface HoldoutReport {
  generatedAt: string;
  checked: number;
  stable: number;
  shifted: number;
  drifted: number;
  details: HoldoutReportDetail[];
}

/** Stable hash: einfacher String-Hash (FNV-1a-Variante), genug für Modulo. */
function stableHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function selectHoldout(entries: ResonanzEntry[]): ResonanzEntry[] {
  return entries.filter(e => stableHash(e.id) % HOLDOUT_MODULO === 0);
}

function findTopNeighbors(target: ResonanzEntry, entries: ResonanzEntry[], embeddings: Record<string, number[]>, k: number): string[] {
  const v = embeddings[target.id];
  if (!v) return [];
  const scored: Array<{ id: string; score: number }> = [];
  for (const other of entries) {
    if (other.id === target.id) continue;
    const ov = embeddings[other.id];
    if (!ov) continue;
    scored.push({ id: other.id, score: cosineSim(v, ov) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(s => s.id);
}

function runHoldoutCheck(entries: ResonanzEntry[], embeddings: Record<string, number[]>): void {
  const holdout = selectHoldout(entries).filter(e => embeddings[e.id]);
  if (holdout.length === 0) {
    console.log("[build-resonanzen-index] holdout: keine Stichprobe mit Embedding — skip");
    return;
  }

  // Baseline laden (oder leer initialisieren)
  let baseline: HoldoutBaseline = { generatedAt: new Date().toISOString(), baseline: {} };
  if (fs.existsSync(HOLDOUT_BASELINE_OUTPUT)) {
    try {
      const data = JSON.parse(fs.readFileSync(HOLDOUT_BASELINE_OUTPUT, "utf-8"));
      if (data && typeof data === "object" && data.baseline) {
        baseline = data as HoldoutBaseline;
      }
    } catch {
      console.warn("[build-resonanzen-index] holdout-baseline corrupt — fresh start");
    }
  }

  // Für jeden Hold-out-Entry: aktuelle Nachbarn berechnen
  const details: HoldoutReportDetail[] = [];
  let stable = 0, shifted = 0, drifted = 0;
  let baselineExtended = false;

  for (const e of holdout) {
    const current = findTopNeighbors(e, entries, embeddings, HOLDOUT_TOP_NEIGHBORS);
    const existing = baseline.baseline[e.id];

    if (!existing) {
      // Erst-Eintrag in der Baseline — als Wahrheit fixieren
      baseline.baseline[e.id] = { neighbors: current, computedAt: new Date().toISOString() };
      baselineExtended = true;
      // Erster Lauf gilt als "stable" (baseline === current per Definition)
      stable++;
      details.push({ id: e.id, baseline: current, current, overlap: current.length });
      continue;
    }

    const baselineSet = new Set(existing.neighbors);
    const overlap = current.filter(id => baselineSet.has(id)).length;
    if (overlap === HOLDOUT_TOP_NEIGHBORS) stable++;
    else if (overlap >= 2) shifted++;
    else drifted++;
    details.push({ id: e.id, baseline: existing.neighbors, current, overlap });
  }

  if (baselineExtended) {
    baseline.generatedAt = new Date().toISOString();
    fs.writeFileSync(HOLDOUT_BASELINE_OUTPUT, JSON.stringify(baseline, null, 2));
    console.log(`[build-resonanzen-index] holdout-baseline: ${Object.keys(baseline.baseline).length} ids (extended)`);
  }

  const report: HoldoutReport = {
    generatedAt: new Date().toISOString(),
    checked: holdout.length,
    stable, shifted, drifted,
    details,
  };
  fs.writeFileSync(HOLDOUT_REPORT_OUTPUT, JSON.stringify(report, null, 2));
  console.log(`[build-resonanzen-index] holdout-report: checked=${holdout.length} stable=${stable} shifted=${shifted} drifted=${drifted}`);
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
