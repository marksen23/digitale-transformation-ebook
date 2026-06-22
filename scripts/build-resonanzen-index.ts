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
import crypto from "node:crypto";
import { fetchEmbedding, getKeys } from "../server/lib/embeddingClient.js";
import { parseFrontmatter, extractFrageAntwort } from "./lib/frontmatter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "client/public/resonanzen-index.json");
const EMBEDDINGS_OUTPUT = path.join(ROOT, "client/public/resonanzen-embeddings.json");
const CONCEPTS_EMB = path.join(ROOT, "client/public/concepts-embeddings.json");
const HOLDOUT_BASELINE_OUTPUT = path.join(ROOT, "client/public/resonanzen-holdout-baseline.json");
const HOLDOUT_REPORT_OUTPUT = path.join(ROOT, "client/public/resonanzen-holdout-report.json");
const NODE_DENSITY_OUTPUT = path.join(ROOT, "client/public/resonanzen-node-density.json");
const LINK_PREDICTIONS_OUTPUT = path.join(ROOT, "client/public/resonanzen-link-predictions.json");
const CONCEPT_CANDIDATES_OUTPUT = path.join(ROOT, "client/public/resonanzen-concept-candidates.json");
const ANCHOR_CLUSTERS_OUTPUT = path.join(ROOT, "client/public/resonanzen-anchor-clusters.json");
const CORPUS_MAP_OUTPUT = path.join(ROOT, "client/public/resonanzen-corpus-map.json");
const QUESTIONS_OUTPUT = path.join(ROOT, "client/public/resonanzen-questions.json");
const QUESTION_EMB_OUTPUT = path.join(ROOT, "client/public/resonanzen-question-embeddings.json");
// Korpus-Politik: Endpoints, die NICHT in den Resonanz-Korpus gehören.
// `translate` ist ein Übersetzungs-Service für Leser, kein denkerischer
// Beitrag — er verwässert RAG/Embeddings/Voice-Scores/Kandidaten. Die
// MD-Dateien bleiben als Archiv auf GitHub; nur aus Index + Embeddings raus.
// ENV-überschreibbar (muss in CI + Server gleich gesetzt sein; Default reicht).
const CORPUS_EXCLUDED_ENDPOINTS = new Set(
  (process.env.CORPUS_EXCLUDED_ENDPOINTS ?? "translate").split(",").map(s => s.trim()).filter(Boolean),
);
const HOLDOUT_MIN_CORPUS_SIZE = 30;
const HOLDOUT_MODULO = 10;          // ≈10% Stichprobe
const HOLDOUT_TOP_NEIGHBORS = 3;

const REPO_OWNER  = process.env.GITHUB_REPO_OWNER  ?? "marksen23";
const REPO_NAME   = process.env.GITHUB_REPO_NAME   ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // optional
// M2: Key-Handling lebt jetzt zentral in embeddingClient.getKeys()
// (Multi-Key-Failover). Gates hier nutzen getKeys().length statt einer
// lokalen GEMINI_API_KEY-Const.

// Embedding-Modell — wenn Google den Endpoint umbenennt/entfernt, hier
// updaten. Historie:
//   - "text-embedding-004"     ← bis ~04/2026 verwendet, dann 404 v1beta
//   - "gemini-embedding-001"   ← aktuelles Standard-Modell (seit 2026)
// Aktueller Status: https://ai.google.dev/gemini-api/docs/embeddings
const GEMINI_EMBED_MODEL = process.env.GEMINI_EMBED_MODEL?.trim() || "gemini-embedding-001";

// Novelty-Schwelle: Einträge deren maximale Cosine zu anderen unter diesem
// Wert liegt gelten als "peripheral / neue Erkenntnis". Empirisch kalibriert
// auf gemini-embedding-001 + deutscher Philosophie-Korpus: Median max-Cosine
// ist ~0.78, 0.70 isoliert die ~10-15% peripherst-gelegenen Einträge.
// User's Vorschlag 0.65 zu aggressiv (würde fast nie greifen).
const NOVELTY_THRESHOLD = parseFloat(
  process.env.NOVELTY_THRESHOLD ?? "0.70"
);

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
   * Novelty-Flag: true wenn die maximale Cosine zu allen anderen Einträgen
   * < NOVELTY_THRESHOLD (Default 0.70) liegt. Solche Einträge sind semantisch
   * peripher — neue Themen / unverbundene Regionen / blinde-Flecken-
   * Kandidaten. Komplementär zu nearDuplicates (Echo-Markierung):
   *   - Echo:    nearDuplicates.length > 0  (≥0.88)
   *   - Mitte:   ohne flag                  (0.70–0.87)
   *   - Novelty: novelty === true           (<0.70)
   */
  novelty?: boolean;
  /** Master-Marker für synthetisierte Einträge (Phase 4). */
  is_master?: boolean;
  master_of?: string[];
  variant_count?: number;
  /**
   * Werkstreue-Score: 0–1, wie nah dieser Eintrag am semantischen Zentrum
   * der approved/published Einträge liegt. Werte < 0.55 deuten auf Drift
   * (off-voice, generisch, themenfremd). Berechnet nur wenn ≥10 kuratierte
   * Einträge als Referenz verfügbar.
   */
  werkVoiceScore?: number;
  /**
   * Buchstreue-Score: 0–1, max Cosine zu allen Kapitel-Embeddings des
   * Buchtexts. Statische Referenz (Buchtext ändert sich kaum) — komplementär
   * zu werkVoiceScore (Centroid der kuratierten Einträge, bewegt). Eintrag
   * kann werkVoiceScore hoch + corpusVoiceScore niedrig haben: stilistisch
   * konform aber thematisch fern vom Buch.
   */
  corpusVoiceScore?: number;
  /**
   * Begriffsstreue-Score: 0–1, max Cosine zu allen Begriffs-Embeddings des
   * Begriffsnetzes (concepts-embeddings.json). Dritter, menschlich-autorisierter
   * Anker des triangulierten Schutzwalls neben corpusVoiceScore (Prosa). Fragt:
   * greift der Eintrag die BEGRIFFSSTRUKTUR des Werks (nicht nur den Wortlaut)?
   * conceptAnchor = id des nächstliegenden Begriffs (Anschlussstelle im Netz).
   */
  conceptVoiceScore?: number;
  conceptAnchor?: string;
  /**
   * AI-Pre-Score (Tier-1-3-Roadmap, Feature E): 1-5-Bewertung der
   * Werktreue durch Claude. Wird via /api/admin/pre-score gesetzt und
   * ins Frontmatter geschrieben. Hier nur durchgereicht.
   */
  ai_score?: number;
  ai_score_reason?: string;
  ai_score_at?: string;
  ai_score_model?: string;
}

interface TreeEntry { path: string; type: "blob" | "tree"; }

// parseFrontmatter/stripQuotes/extractFrageAntwort: siehe ./lib/frontmatter.ts
// (geteilt mit validate-resonanzen.ts, CRLF-robust).

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
  let entries: ResonanzEntry[] = [];
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
        // Master-Felder (Phase 4): wenn Frontmatter is_master: true setzt,
        // sind diese Felder vom Synthese-Endpunkt gesetzt.
        ...(fm.is_master === true || fm.is_master === "true"
          ? {
              is_master: true,
              master_of: Array.isArray(fm.master_of) ? fm.master_of.map(String) : [],
              variant_count: typeof fm.variant_count === "number" ? fm.variant_count :
                             typeof fm.variant_count === "string" ? parseInt(fm.variant_count, 10) || 0 :
                             (Array.isArray(fm.master_of) ? fm.master_of.length : 0),
            }
          : {}),
        // AI-Pre-Score (Feature E) — durchreichen falls vorhanden
        ...(fm.ai_score !== undefined ? (() => {
          const n = typeof fm.ai_score === "number" ? fm.ai_score : parseInt(String(fm.ai_score), 10);
          return Number.isFinite(n) && n >= 1 && n <= 5
            ? {
                ai_score: n,
                ai_score_reason: fm.ai_score_reason ? String(fm.ai_score_reason) : undefined,
                ai_score_at: fm.ai_score_at ? String(fm.ai_score_at) : undefined,
                ai_score_model: fm.ai_score_model ? String(fm.ai_score_model) : undefined,
              }
            : {};
        })() : {}),
      });
    }
  }

  // Korpus-Politik: Leser-Service-Endpoints (translate) ausschließen — bevor
  // irgendetwas embeddet/cross-verlinkt/geschrieben wird. Die MD-Dateien bleiben
  // als Archiv; ihre Vektoren entfernt der Embeddings-Prune beim nächsten Build.
  const beforeExcl = entries.length;
  entries = entries.filter(e => !CORPUS_EXCLUDED_ENDPOINTS.has(e.endpoint));
  if (entries.length < beforeExcl) {
    console.log(`[build-resonanzen-index] ${beforeExcl - entries.length} Einträge ausgeschlossen (Endpoints: ${[...CORPUS_EXCLUDED_ENDPOINTS].join(", ")}) — MDs bleiben als Archiv`);
  }

  entries.sort((a, b) => b.ts.localeCompare(a.ts));

  // ─── Preserve-Pass: semantische Felder aus bestehendem Index retten ─
  // Wenn der Build ohne GEMINI_API_KEY läuft (z.B. lokales Dev), würden
  // related[], nearDuplicates, werkVoiceScore, corpusVoiceScore beim Schreiben
  // verloren gehen. Verhindert: existierenden Index lesen, pro-id die Felder
  // übernehmen. Das Resultat: lokale Rebuilds zerstören die semantischen
  // Verlinkungen nicht — die bleiben bis CI mit Key sie aktualisiert.
  if (getKeys().length === 0 && fs.existsSync(OUTPUT)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT, "utf-8"));
      const byId = new Map<string, ResonanzEntry>(
        (existing.entries ?? []).map((e: ResonanzEntry) => [e.id, e])
      );
      let preserved = 0;
      for (const e of entries) {
        const old = byId.get(e.id);
        if (!old) continue;
        if (old.related?.length) { e.related = old.related; preserved++; }
        if (old.nearDuplicates?.length) e.nearDuplicates = old.nearDuplicates;
        if (typeof old.werkVoiceScore === "number") e.werkVoiceScore = old.werkVoiceScore;
        if (typeof old.corpusVoiceScore === "number") e.corpusVoiceScore = old.corpusVoiceScore;
        if (typeof old.conceptVoiceScore === "number") e.conceptVoiceScore = old.conceptVoiceScore;
        if (typeof old.conceptAnchor === "string") e.conceptAnchor = old.conceptAnchor;
      }
      if (preserved > 0) {
        console.log(`[build-resonanzen-index] preserved semantic fields for ${preserved} entries from existing index`);
      }
    } catch {
      // Kein parsbarer existierender Index — egal, Build geht ohne Preserve durch
    }
  }

  // ─── Embeddings (optional, nur wenn GEMINI_API_KEY gesetzt) ─────────
  // Embeddings werden vor dem Index-Schreiben berechnet, damit Cross-Links
  // direkt mitgeschrieben werden können (vermeidet 2-Pass-Schreiben).
  let embeddings: Record<string, number[]> | null = null;
  const _keys = getKeys();
  if (_keys.length > 0 && entries.length > 0) {
    // Diagnose-Zeile: wie viele Keys, primärer maskiert? NIE vollständig loggen.
    const primary = _keys[0];
    const masked = `${primary.slice(0, 3)}...${primary.slice(-3)}`;
    console.log(`[build-resonanzen-index] ${_keys.length} Embedding-Key(s) verfügbar (primär len=${primary.length}, masked=${masked})`);
    embeddings = await buildEmbeddings(entries);
    // Buchtext-Kapitel als zweite Werkstreue-Referenz embedden. Schreibt
    // chapter:*-IDs in dieselbe Map; computeCrossLinks unten extrahiert
    // sie für corpusVoiceScore.
    const chRes = await buildChapterEmbeddings(embeddings);
    if (chRes.added > 0 || chRes.failed > 0 || chRes.reused > 0) {
      console.log(`[build-resonanzen-index] chapter-embeddings: ${chRes.added} neu, ${chRes.reused} reused, ${chRes.failed} fehlgeschlagen`);
      // Embeddings-File mit chapter:* updated zurückschreiben
      fs.writeFileSync(EMBEDDINGS_OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), embeddings }, null, 2));
    }
  } else {
    console.log("[build-resonanzen-index] GEMINI_API_KEY nicht gesetzt — Embedding-Suche wird nicht verfügbar sein.");
  }

  // ─── Cross-Links: top-5 semantisch verwandte pro Eintrag ────────────
  if (embeddings) {
    computeCrossLinks(entries, embeddings);
    const linkCount = entries.reduce((s, e) => s + (e.related?.length ?? 0), 0);
    console.log(`[build-resonanzen-index] computed ${linkCount} cross-links`);
  }

  // ─── Korpus-Landkarte (UMAP 2D-Projektion der Embeddings) ───────────
  // Reduziert den 3072-dim Embedding-Raum auf 2D-Koordinaten pro Eintrag,
  // damit man auf /admin/health die thematischen Cluster + Außenseiter
  // visuell erkennt. Nur sinnvoll wenn ≥10 Embeddings vorliegen.
  // Embeddings können auch aus EMBEDDINGS_OUTPUT-File geladen werden wenn
  // GEMINI_API_KEY fehlt — UMAP braucht keinen API-Call, nur die Vektoren.
  let mapEmbeddings = embeddings;
  if (!mapEmbeddings && fs.existsSync(EMBEDDINGS_OUTPUT)) {
    try {
      const data = JSON.parse(fs.readFileSync(EMBEDDINGS_OUTPUT, "utf-8"));
      mapEmbeddings = data.embeddings ?? null;
      if (mapEmbeddings) {
        console.log(`[build-resonanzen-index] corpus-map: ${Object.keys(mapEmbeddings).length} existierende Embeddings geladen (für UMAP)`);
      }
    } catch {
      // ignore
    }
  }
  if (mapEmbeddings) {
    await writeCorpusMap(entries, mapEmbeddings);
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

  // ─── Node-Density: Aggregat für Blind-Spot-Heatmap im Begriffsnetz ──
  // Pro Knoten zählen wir wie oft er als nodeId-Anker in Resonanzen auftaucht.
  // Knoten mit count=0 sind "blinde Flecken" — strukturelle Lücken im
  // Werk, die das Frontend in der Heatmap-View sichtbar machen kann.
  writeNodeDensity(entries);
  writeLinkPredictions(entries);
  // Begriffs-Kandidaten brauchen die Vektoren (mit Gemini-Path: `embeddings`,
  // sonst der von-Platte-geladene `mapEmbeddings`-Fallback wie die corpus-map).
  writeConceptCandidates(entries, embeddings ?? mapEmbeddings);
  await writeQuestions(entries, embeddings ?? mapEmbeddings);
  writeAnchorClusters(entries);

  // ─── Final-Telemetrie: was steht effektiv im Index? ──────────────────
  // Wenn dieser Block "0 / 0 / 0" zeigt obwohl GEMINI_API_KEY OK gemeldet
  // wurde, ist irgendwo zwischen fetch und JSON-Write etwas verloren
  // gegangen — z.B. Response-Shape unerwartet, oder Embedding-File
  // existiert lokal aber computeCrossLinks fand keine Matches.
  const withEmbedding = embeddings ? entries.filter(e => embeddings![e.id]).length : 0;
  const withRelated = entries.filter(e => Array.isArray(e.related) && e.related.length > 0).length;
  const withWerkVoice = entries.filter(e => typeof e.werkVoiceScore === "number").length;
  const withCorpusVoice = entries.filter(e => typeof e.corpusVoiceScore === "number").length;
  const withConceptVoice = entries.filter(e => typeof e.conceptVoiceScore === "number").length;
  const withNovelty = entries.filter(e => e.novelty === true).length;
  const withEchoes = entries.filter(e => Array.isArray(e.nearDuplicates) && e.nearDuplicates.length > 0).length;
  console.log(
    `[build-resonanzen-index] FINAL: ${withEmbedding}/${entries.length} mit Embedding · ` +
    `${withRelated} mit related[] · ${withWerkVoice} mit werkVoiceScore · ` +
    `${withCorpusVoice} mit corpusVoiceScore · ${withConceptVoice} mit conceptVoiceScore · ` +
    `${withNovelty} novelty · ${withEchoes} Echoes`,
  );

  // Datei-Stats für Debug, falls der CI-Commit-Step "no changes" meldet
  const indexStat = fs.statSync(OUTPUT);
  console.log(`[build-resonanzen-index] OUTPUT size: ${indexStat.size} bytes`);
  if (fs.existsSync(EMBEDDINGS_OUTPUT)) {
    const embStat = fs.statSync(EMBEDDINGS_OUTPUT);
    console.log(`[build-resonanzen-index] EMBEDDINGS_OUTPUT size: ${embStat.size} bytes`);
  } else {
    console.log(`[build-resonanzen-index] EMBEDDINGS_OUTPUT does not exist`);
  }
}

/** Extrahiert alle node-ids aus client/src/data/conceptGraph.ts per Regex.
 *  Selbes Pattern wie scripts/validate-resonanzen.ts:loadValidNodeIds.
 *  Robuster wäre Import, aber tsx ohne TS-Loader-Setup macht das mühsam. */
function loadAllNodeIds(): string[] {
  const cgPath = path.join(ROOT, "client/src/data/conceptGraph.ts");
  if (!fs.existsSync(cgPath)) return [];
  const txt = fs.readFileSync(cgPath, "utf-8");
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = /\bid\s*:\s*["']([a-z0-9äöüß_+-]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); ids.push(m[1]); }
  }
  return ids;
}

/** Schreibt resonanzen-node-density.json — Resonanz-Dichte pro Konzeptgraph-
 *  Knoten plus globaler Stats. Wird vom Frontend in der Heatmap-View des
 *  Begriffsnetzes als Opacity-Skala gelesen. */
function writeNodeDensity(entries: ResonanzEntry[]): void {
  const allNodeIds = loadAllNodeIds();
  if (allNodeIds.length === 0) {
    console.warn("[build-resonanzen-index] writeNodeDensity: no node-ids gefunden, skip");
    return;
  }

  // Zähler initialisieren — JEDER Knoten muss im Output sein, auch mit 0.
  const perNode: Record<string, { count: number; endpoints: Record<string, number> }> = {};
  for (const id of allNodeIds) perNode[id] = { count: 0, endpoints: {} };

  for (const e of entries) {
    for (const id of e.nodeIds ?? []) {
      if (!perNode[id]) continue;  // unknown id (sollte validator vorher fangen)
      perNode[id].count++;
      perNode[id].endpoints[e.endpoint] = (perNode[id].endpoints[e.endpoint] ?? 0) + 1;
    }
  }

  const counts = allNodeIds.map(id => perNode[id].count);
  const sorted = [...counts].sort((a, b) => a - b);
  const median = sorted.length === 0 ? 0
    : sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2]
    : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  const minCount = sorted[0] ?? 0;
  const maxCount = sorted[sorted.length - 1] ?? 0;
  const zeroResonanceNodes = allNodeIds.filter(id => perNode[id].count === 0);

  const out = {
    generatedAt: new Date().toISOString(),
    perNode,
    stats: {
      minCount, maxCount, median,
      totalNodes: allNodeIds.length,
      zeroResonanceNodes,
    },
  };
  fs.writeFileSync(NODE_DENSITY_OUTPUT, JSON.stringify(out, null, 2));
  console.log(
    `[build-resonanzen-index] node-density: ${allNodeIds.length} Knoten, ` +
    `min=${minCount} max=${maxCount} median=${median}, ` +
    `${zeroResonanceNodes.length} blinde Flecken`
  );
}

/** Extrahiert alle existierenden Kanten aus conceptGraph.ts: EDGES,
 *  LEITMOTIV_EDGES und PRINZIP_PAIRS. Selbes Regex-Pattern wie
 *  loadAllNodeIds. Returnt Set<"a|b"> mit kanonisch sortiertem Key,
 *  damit Pair-Lookups symmetrisch sind. */
function loadExistingEdges(): Set<string> {
  const cgPath = path.join(ROOT, "client/src/data/conceptGraph.ts");
  if (!fs.existsSync(cgPath)) return new Set();
  const txt = fs.readFileSync(cgPath, "utf-8");
  const edges = new Set<string>();
  // Pattern matched { source: "x", target: "y" } in EDGES + LEITMOTIV_EDGES.
  const reEdge = /source:\s*["']([a-z0-9äöüß_+-]+)["']\s*,\s*target:\s*["']([a-z0-9äöüß_+-]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = reEdge.exec(txt)) !== null) {
    const [a, b] = [m[1], m[2]].sort();
    edges.add(`${a}|${b}`);
  }
  // Pattern matched PRINZIP_PAIRS: { a: "x", b: "y" } oder ähnlich.
  // Wir nutzen das memberIds-Array aus PRINZIP_GROUPS:
  //   memberIds: ["weltfaltung", "raumfaltung"]
  // Alle Paare innerhalb einer Gruppe gelten als verbunden.
  const reMembers = /memberIds:\s*\[\s*((?:["'][a-z0-9äöüß_+-]+["']\s*,?\s*)+)\]/g;
  while ((m = reMembers.exec(txt)) !== null) {
    const ids = m[1].match(/["']([a-z0-9äöüß_+-]+)["']/g)
      ?.map(s => s.replace(/["']/g, "")) ?? [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]].sort();
        edges.add(`${a}|${b}`);
      }
    }
  }
  return edges;
}

/** Berechnet Edge-Vorschläge: Begriffspaare die oft GEMEINSAM in einer
 *  Resonanz auftauchen, aber im Concept-Graph KEINE direkte Kante haben.
 *  Hohe Co-Occurrence + fehlende Kante = struktureller blinder Fleck im
 *  Graph, den die KI-Resonanzen empirisch füllen. */
function writeLinkPredictions(entries: ResonanzEntry[]): void {
  const MIN_COOCCURRENCE = parseInt(process.env.LINK_PRED_MIN_COOC ?? "2", 10);
  const existingEdges = loadExistingEdges();

  // Co-Occurrence-Counter: Map<"a|b", { count, endpoints }>
  type Cell = { count: number; endpoints: Record<string, number>; entryIds: string[] };
  const co: Map<string, Cell> = new Map();
  for (const e of entries) {
    const ids = (e.nodeIds ?? []).slice().sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}|${ids[j]}`;
        let cell = co.get(key);
        if (!cell) {
          cell = { count: 0, endpoints: {}, entryIds: [] };
          co.set(key, cell);
        }
        cell.count++;
        cell.endpoints[e.endpoint] = (cell.endpoints[e.endpoint] ?? 0) + 1;
        if (cell.entryIds.length < 5) cell.entryIds.push(e.id);
      }
    }
  }

  // Kandidaten: oft co-occurrent + keine existierende Kante
  const candidates = Array.from(co.entries())
    .filter(([key, cell]) => cell.count >= MIN_COOCCURRENCE && !existingEdges.has(key))
    .map(([key, cell]) => {
      const [source, target] = key.split("|");
      return {
        source, target,
        cooccurrence: cell.count,
        endpoints: cell.endpoints,
        sampleEntryIds: cell.entryIds,
      };
    })
    .sort((a, b) => b.cooccurrence - a.cooccurrence);

  const out = {
    generatedAt: new Date().toISOString(),
    minCooccurrence: MIN_COOCCURRENCE,
    candidates,
    stats: {
      totalPairs: co.size,
      candidatesCount: candidates.length,
      existingEdges: existingEdges.size,
      maxCooccurrence: candidates[0]?.cooccurrence ?? 0,
    },
  };
  fs.writeFileSync(LINK_PREDICTIONS_OUTPUT, JSON.stringify(out, null, 2));
  console.log(
    `[build-resonanzen-index] link-predictions: ${candidates.length} Kandidaten ` +
    `(MIN_COOC=${MIN_COOCCURRENCE}, max=${out.stats.maxCooccurrence}, ` +
    `existingEdges=${existingEdges.size}, totalPairs=${co.size})`
  );
}

/** Deutsche Stoppwörter für die Keyword-/Label-Extraktion der Kandidaten.
 *  Bewusst klein gehalten — der Mensch finalisiert das Label ohnehin. */
const CAND_STOPWORDS = new Set(
  ("der die das und oder aber wie was wenn dann ist sind war ware ein eine einen einem einer " +
   "den dem des im in an auf zu zur zum fur von mit nach bei aus uber unter durch gegen ohne um " +
   "als auch nur noch schon sich es er sie wir ihr ich du man dass weil dieser diese dieses welche " +
   "welcher mehr sehr kann konnte wurde sein seine ihre unser nicht kein keine doch dabei damit " +
   "zwischen werden wird haben hat sondern beim ihrem ihren etwas mehr immer schon hier dort").split(/\s+/),
);

/** Häufigste inhaltstragende Tokens über eine Menge von Prompts.
 *  Inline statt Import aus client/, damit der Node-Build keine Browser-Module zieht. */
function candidateKeywords(texts: string[], topN: number): Array<{ word: string; count: number }> {
  const freq: Record<string, number> = {};
  for (const t of texts) {
    const toks = (t ?? "").toLowerCase().match(/[a-zäöüß]{4,}/g) ?? [];
    for (const tok of toks) {
      if (CAND_STOPWORDS.has(tok)) continue;
      freq[tok] = (freq[tok] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

/** Begriffs-Kandidaten (Knoten-Analog zu writeLinkPredictions/Kanten):
 *  Cluster kuratierter Resonanzen, die DISTINKT zu allen bestehenden Begriffen
 *  sind (1−maxCosine zu concepts-embeddings ≥ DISTINCT_MIN) UND genug Evidenz
 *  tragen (Clustergröße ≥ EVIDENCE_MIN) — also emergente Themen, die der
 *  kuratierte Korpus stützt, aber das Begriffsnetz noch nicht abbildet.
 *  Spiegelt den Schutzwall aus conceptNodes.ts:evaluateConcept (Distinktheit +
 *  Korpus-Evidenz). Output dient als Vorbefüllung für /api/admin/propose-concept
 *  — die Annahme/Autorisierung bleibt menschlich. → resonanzen-concept-candidates.json */
function writeConceptCandidates(entries: ResonanzEntry[], embeddings: Record<string, number[]> | null): void {
  const DISTINCT_MIN = parseFloat(process.env.CONCEPT_CAND_DISTINCT_MIN ?? "0.10");
  const EVIDENCE_MIN = parseInt(process.env.CONCEPT_CAND_EVIDENCE_MIN ?? "3", 10);
  const CLUSTER_SIM = parseFloat(process.env.CONCEPT_CAND_CLUSTER_SIM ?? "0.78");
  // Obergrenze: ein EMERGENTER (niche) Begriff spannt nicht einen großen Teil
  // des Korpus. Riesencluster sind Prompt-Template-Artefakte (z. B. die
  // analyse/path-Endpoints erzeugen strukturgleiche Prompts „Spannungsfeld:
  // A ↔ B"), kein neuer Begriff. Gemessen als Bruchteil der kuratierten Menge.
  const MAX_FRACTION = parseFloat(process.env.CONCEPT_CAND_MAX_FRACTION ?? "0.20");
  const thresholds = { DISTINCT_MIN, EVIDENCE_MIN, CLUSTER_SIM, MAX_FRACTION };

  const writeOut = (candidates: unknown[], stats: Record<string, unknown>) => {
    fs.writeFileSync(CONCEPT_CANDIDATES_OUTPUT, JSON.stringify(
      { generatedAt: new Date().toISOString(), thresholds, candidates, stats }, null, 2,
    ));
  };

  if (!embeddings) {
    writeOut([], { reason: "keine Embeddings verfügbar" });
    console.log("[build-resonanzen-index] concept-candidates: keine Embeddings — leer geschrieben");
    return;
  }

  // Begriffs-Embeddings laden (fail-soft, identisch zu computeCrossLinks).
  let conceptIds: string[] = [];
  let conceptVecs: number[][] = [];
  try {
    if (fs.existsSync(CONCEPTS_EMB)) {
      const cf = JSON.parse(fs.readFileSync(CONCEPTS_EMB, "utf-8")) as { embeddings?: Record<string, number[]> };
      conceptIds = Object.keys(cf.embeddings ?? {});
      conceptVecs = conceptIds.map(id => cf.embeddings![id]);
    }
  } catch { /* fail-soft */ }
  if (conceptVecs.length === 0) {
    writeOut([], { reason: "keine concepts-embeddings.json (build-search-index zuerst laufen lassen)" });
    console.log("[build-resonanzen-index] concept-candidates: keine Begriffs-Embeddings — leer geschrieben");
    return;
  }

  const nearestConcept = (v: number[]): { id: string | null; sim: number } => {
    let maxSim = 0; let id: string | null = null;
    for (let i = 0; i < conceptVecs.length; i++) {
      const s = cosineSim(v, conceptVecs[i]);
      if (s > maxSim) { maxSim = s; id = conceptIds[i]; }
    }
    return { id, sim: maxSim };
  };

  // Nur kuratierte Einträge mit Embedding; „unabgedeckt" = distinkt zu ALLEN Begriffen.
  const curated = entries.filter(e =>
    (e.status === "approved" || e.status === "published") && embeddings[e.id]
  );
  const uncovered = curated.filter(e => (1 - nearestConcept(embeddings[e.id]).sim) >= DISTINCT_MIN);
  const maxClusterSize = Math.max(EVIDENCE_MIN, Math.floor(curated.length * MAX_FRACTION));

  // Greedy-Clustering der unabgedeckten Einträge (Cosine ≥ CLUSTER_SIM).
  const used = new Set<string>();
  const candidates = uncovered
    .map(seed => {
      if (used.has(seed.id)) return null;
      const v = embeddings[seed.id];
      const memberIds: string[] = [seed.id];
      used.add(seed.id);
      for (const o of uncovered) {
        if (used.has(o.id)) continue;
        if (cosineSim(v, embeddings[o.id]) >= CLUSTER_SIM) { memberIds.push(o.id); used.add(o.id); }
      }
      if (memberIds.length < EVIDENCE_MIN) return null;
      if (memberIds.length > maxClusterSize) return null;  // zu breit = Template-Mode, kein Begriff
      // Centroid des Clusters.
      const dim = v.length;
      const centroid = new Array<number>(dim).fill(0);
      for (const id of memberIds) {
        const mv = embeddings[id];
        for (let i = 0; i < dim; i++) centroid[i] += mv[i];
      }
      for (let i = 0; i < dim; i++) centroid[i] /= memberIds.length;
      const near = nearestConcept(centroid);
      const distinctness = Math.max(0, Math.min(1, 1 - near.sim));
      if (distinctness < DISTINCT_MIN) return null;  // Centroid muss ebenfalls distinkt sein
      const prompts = memberIds
        .map(id => entries.find(e => e.id === id)?.prompt ?? "")
        .filter(Boolean);
      const keywords = candidateKeywords(prompts, 6);
      return {
        suggestedLabel: keywords[0]?.word ?? "",
        keywords,
        evidence: memberIds.length,
        distinctness: Number(distinctness.toFixed(3)),
        nearestConcept: near.id,
        nearestSim: Number(near.sim.toFixed(3)),
        sampleEntryIds: memberIds.slice(0, 5),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    // Distinktheit zuerst (am ehesten ein echter neuer Begriff), dann Evidenz.
    .sort((a, b) => (b.distinctness - a.distinctness) || (b.evidence - a.evidence));

  writeOut(candidates, {
    curated: curated.length,
    uncovered: uncovered.length,
    candidatesCount: candidates.length,
    concepts: conceptIds.length,
    maxEvidence: candidates.reduce((m, c) => Math.max(m, c.evidence), 0),
  });
  console.log(
    `[build-resonanzen-index] concept-candidates: ${candidates.length} Kandidaten ` +
    `(kuratiert=${curated.length}, unabgedeckt=${uncovered.length}, ` +
    `DISTINCT_MIN=${DISTINCT_MIN}, EVIDENCE_MIN=${EVIDENCE_MIN}, CLUSTER_SIM=${CLUSTER_SIM})`,
  );
}

/** Schlussfrage einer KI-Antwort extrahieren (repliziert
 *  client/src/lib/closingQuestion.ts:extractClosingQuestion — bewusst dupliziert,
 *  damit der Node-Build kein client-Modul zieht). Letzter Absatz/Satz mit „?". */
function extractClosingQuestion(text: string): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  const paras = t.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  for (let i = paras.length - 1; i >= 0; i--) {
    if (paras[i].endsWith("?")) return paras[i].replace(/^##\s*Offene Frage\s*/i, "").trim();
  }
  const m = t.match(/([^.!?\n]*\?)\s*$/);
  return m ? m[1].trim() : "";
}

/** Fragenansicht (Erkenntnisse-Phase 1): extrahiert die offene Schlussfrage jedes
 *  Korpus-Eintrags, embeddet sie (Reuse-Cache) und matcht jede Frage gegen SPÄTERE
 *  Einträge (Cosine ≥ ANSWER_SIM) → „das Werk hat sich das selbst beantwortet".
 *  Output resonanzen-questions.json. Fail-soft ohne Gemini-Key: Fragen werden
 *  gelistet, answeredBy bleibt leer (Matching erst im CI). */
async function writeQuestions(entries: ResonanzEntry[], embeddings: Record<string, number[]> | null): Promise<void> {
  const ANSWER_SIM = parseFloat(process.env.QUESTIONS_ANSWER_SIM ?? "0.72");
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

  // 1. Extrahieren (translate ist via CORPUS_EXCLUDED_ENDPOINTS bereits raus).
  type Q = { sourceId: string; question: string; endpoint: string; anchor: string; nodeIds: string[]; ts: string; dupIds: string[] };
  const byNorm = new Map<string, Q>();
  for (const e of [...entries].sort((a, b) => a.ts.localeCompare(b.ts))) {
    const q = extractClosingQuestion(e.response ?? "");
    if (q.length < 12) continue;
    const k = norm(q);
    const ex = byNorm.get(k);
    if (ex) ex.dupIds.push(e.id);  // exakt-normalisierte Dublette → Quelle bleibt die älteste
    else byNorm.set(k, { sourceId: e.id, question: q, endpoint: e.endpoint, anchor: e.anchor ?? "", nodeIds: e.nodeIds ?? [], ts: e.ts, dupIds: [] });
  }
  const questions = [...byNorm.values()];

  // 2. Frage-Embeddings mit Reuse-Cache (keyed by normalisiertem Fragetext).
  let qEmb: Record<string, number[]> = {};
  if (fs.existsSync(QUESTION_EMB_OUTPUT)) {
    try { qEmb = JSON.parse(fs.readFileSync(QUESTION_EMB_OUTPUT, "utf-8")).embeddings ?? {}; } catch { /* neu */ }
  }
  let embedded = 0;
  if (getKeys().length > 0) {
    const todo = questions.filter(q => !qEmb[norm(q.question)]);
    for (let i = 0; i < todo.length; i++) {
      const v = await embedWithRetry(todo[i].question);
      if (v) { qEmb[norm(todo[i].question)] = v; embedded++; }
      if (i % 5 === 4) await new Promise(r => setTimeout(r, 1200));  // sanfte Drosselung (Free-Tier)
    }
    // Prune: nur Embeddings aktueller Fragen behalten.
    const live = new Set(questions.map(q => norm(q.question)));
    for (const k of Object.keys(qEmb)) if (!live.has(k)) delete qEmb[k];
    fs.writeFileSync(QUESTION_EMB_OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), embeddings: qEmb }, null, 2));
  }

  // 3. Matching: jede Frage gegen spätere, nicht-rejected Einträge.
  const out = questions.map(q => {
    const qv = qEmb[norm(q.question)];
    let answeredBy: Array<{ id: string; score: number }> = [];
    if (qv && embeddings) {
      const scored: Array<{ id: string; score: number }> = [];
      for (const e of entries) {
        if (e.id === q.sourceId || e.status === "rejected" || e.ts <= q.ts) continue;
        const ev = embeddings[e.id];
        if (!ev) continue;
        const s = cosineSim(qv, ev);
        if (s >= ANSWER_SIM) scored.push({ id: e.id, score: Number(s.toFixed(3)) });
      }
      scored.sort((a, b) => b.score - a.score);
      answeredBy = scored.slice(0, 3);
    }
    return {
      sourceId: q.sourceId, question: q.question, endpoint: q.endpoint,
      anchor: q.anchor, nodeIds: q.nodeIds, ts: q.ts, dupCount: q.dupIds.length,
      answeredBy, answered: answeredBy.length > 0,
    };
  }).sort((a, b) => b.ts.localeCompare(a.ts));

  const answered = out.filter(q => q.answered).length;
  fs.writeFileSync(QUESTIONS_OUTPUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    count: out.length,
    thresholds: { ANSWER_SIM },
    stats: { total: out.length, answered, open: out.length - answered, embedded },
    questions: out,
  }, null, 2));
  console.log(`[build-resonanzen-index] questions: ${out.length} (${answered} beantwortet, ${out.length - answered} offen, ${embedded} neu embeddet)`);
}

/** Aggregiert pro Anker (analyse:a+b+c, path-analyse:x+y) wie viele
 *  Varianten existieren und ob/wann ein Master synthetisiert wurde.
 *  → resonanzen-anchor-clusters.json
 *
 *  Wird im /admin von der Anker-Cluster-Sektion gelesen: zeigt User
 *  alle Anker mit ≥2 Varianten + ob Master existiert + ob Master stale
 *  (= neuere Variante als der Master). */
function writeAnchorClusters(entries: ResonanzEntry[]): void {
  // Map<anchor, { endpoint, variants[], master? }>
  type Cluster = {
    anchor: string;
    endpoint: string;
    variantIds: string[];
    lastVariantTs: string;
    masterId: string | null;
    masterTs: string | null;
    masterStale: boolean;
  };
  const byAnchor: Map<string, Cluster> = new Map();

  for (const e of entries) {
    if (!e.anchor) continue;
    // Skip generic anchors die nicht durch nodeIds verfeinert sind
    // (z.B. "graph" vom graph-chat — der ist nicht versioniert sinnvoll).
    if (e.anchor === "graph" || !e.anchor.includes(":")) continue;

    let cluster = byAnchor.get(e.anchor);
    if (!cluster) {
      cluster = {
        anchor: e.anchor,
        endpoint: e.endpoint,
        variantIds: [],
        lastVariantTs: "",
        masterId: null,
        masterTs: null,
        masterStale: false,
      };
      byAnchor.set(e.anchor, cluster);
    }

    if (e.is_master) {
      cluster.masterId = e.id;
      cluster.masterTs = e.ts;
    } else {
      cluster.variantIds.push(e.id);
      if (e.ts > cluster.lastVariantTs) cluster.lastVariantTs = e.ts;
    }
  }

  // Master-stale-Berechnung: Master ist veraltet wenn eine Variante
  // NACH der Master-Generierung dazukam.
  for (const c of byAnchor.values()) {
    if (c.masterTs && c.lastVariantTs && c.lastVariantTs > c.masterTs) {
      c.masterStale = true;
    }
  }

  // Nur Anker mit ≥2 Varianten ODER mit Master sind interessant
  // (Single-Variant-Anker brauchen keine Synthese-Aktion).
  const clusters = Array.from(byAnchor.values())
    .filter(c => c.variantIds.length >= 2 || c.masterId !== null)
    .sort((a, b) => {
      // Sortierung: stale-master zuerst (need action),
      // dann nach variantCount desc, dann nach lastVariantTs desc.
      if (a.masterStale !== b.masterStale) return a.masterStale ? -1 : 1;
      if (b.variantIds.length !== a.variantIds.length) return b.variantIds.length - a.variantIds.length;
      return (b.lastVariantTs ?? "").localeCompare(a.lastVariantTs ?? "");
    });

  const out = {
    generatedAt: new Date().toISOString(),
    clusters,
    stats: {
      totalAnchors: byAnchor.size,
      withMultipleVariants: clusters.filter(c => c.variantIds.length >= 2).length,
      withMaster: clusters.filter(c => c.masterId !== null).length,
      staleMasters: clusters.filter(c => c.masterStale).length,
    },
  };
  fs.writeFileSync(ANCHOR_CLUSTERS_OUTPUT, JSON.stringify(out, null, 2));
  console.log(
    `[build-resonanzen-index] anchor-clusters: ${out.stats.totalAnchors} total, ` +
    `${out.stats.withMultipleVariants} mit ≥2 Varianten, ` +
    `${out.stats.withMaster} mit Master (${out.stats.staleMasters} stale)`
  );
}

/** UMAP-2D-Projektion der Embeddings → Korpus-Landkarte für /admin/health.
 *  Mini-Library (umap-js), deterministischer Seed für stabile Builds.
 *  Skaliert auf [0..1000] x [0..1000] Koordinatensystem (SVG-friendly).
 *  Außenseiter-Marker: distance to centroid > 2σ (z-score basiert). */
async function writeCorpusMap(
  entries: ResonanzEntry[],
  embeddings: Record<string, number[]>,
): Promise<void> {
  // Nur Einträge mit Embedding nehmen (Chapter-Embeddings raus,
  // die haben chapter:-prefix und keine entry-Repräsentation)
  const eligible = entries.filter(e => embeddings[e.id]);
  if (eligible.length < 10) {
    console.log(`[build-resonanzen-index] corpus-map: zu wenig Embeddings (${eligible.length} < 10) — skip`);
    return;
  }

  const { UMAP } = await import("umap-js");
  const vectors = eligible.map(e => embeddings[e.id]);

  // UMAP-Parameter konservativ: nNeighbors=15 ist Standard, minDist=0.1
  // hält Cluster sichtbar, nComponents=2 für 2D-Scatter.
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: Math.min(15, eligible.length - 1),
    minDist: 0.1,
    spread: 1.0,
    random: seededRandom(42),
  });
  const projected = umap.fit(vectors);

  // Auf [0..1000] skalieren (SVG-friendly Koordinaten)
  const xs = projected.map(p => p[0]);
  const ys = projected.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);

  // Centroid + σ für Außenseiter-Erkennung (z-score-basiert)
  const cx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const cy = ys.reduce((s, y) => s + y, 0) / ys.length;
  const dists = projected.map(p => Math.hypot(p[0] - cx, p[1] - cy));
  const meanDist = dists.reduce((s, d) => s + d, 0) / dists.length;
  const sigmaDist = Math.sqrt(
    dists.reduce((s, d) => s + (d - meanDist) ** 2, 0) / dists.length
  );
  const outlierThreshold = meanDist + 2 * sigmaDist;

  const points = eligible.map((e, i) => ({
    id: e.id,
    endpoint: e.endpoint,
    x: Math.round(((projected[i][0] - minX) / spanX) * 1000),
    y: Math.round(((projected[i][1] - minY) / spanY) * 1000),
    isOutlier: dists[i] > outlierThreshold,
    isMaster: !!e.is_master,
    promptPreview: e.prompt.slice(0, 80),
  }));

  const out = {
    generatedAt: new Date().toISOString(),
    method: "umap-js",
    params: { nComponents: 2, nNeighbors: Math.min(15, eligible.length - 1), minDist: 0.1, seed: 42 },
    points,
    stats: {
      total: points.length,
      outliers: points.filter(p => p.isOutlier).length,
      byEndpoint: points.reduce((acc: Record<string, number>, p) => {
        acc[p.endpoint] = (acc[p.endpoint] ?? 0) + 1;
        return acc;
      }, {}),
    },
  };
  fs.writeFileSync(CORPUS_MAP_OUTPUT, JSON.stringify(out, null, 2));
  console.log(
    `[build-resonanzen-index] corpus-map: ${points.length} Punkte projiziert, ` +
    `${out.stats.outliers} Außenseiter (>2σ vom Centroid)`
  );
}

/** Seeded RNG für UMAP-Determinismus — sonst springen die Koordinaten
 *  bei jedem Build und Diff-Visualisierung wird unmöglich. */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 0x100000000;
    return s / 0x100000000;
  };
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

  // Buchtext-Embeddings für corpusVoiceScore extrahieren. Statische
  // Werkstreue-Referenz: max Cosine zu allen Kapitel-Embeddings sagt
  // "wie nah ist dieser Eintrag am thematischen Schwerpunkt des Buchs".
  const chapterIds = Object.keys(embeddings).filter(k => k.startsWith("chapter:"));
  const chapterVecs = chapterIds.map(id => embeddings[id]);
  if (chapterVecs.length > 0) {
    console.log(`[build-resonanzen-index] corpusVoiceScore: ${chapterVecs.length} Kapitel-Embeddings als Referenz`);
  }

  // Begriffs-Embeddings für conceptVoiceScore — dritter Anker des
  // triangulierten Schutzwalls (Begriffsstruktur statt Prosa). Separate Datei
  // (concepts-embeddings.json, vom build-search-index erzeugt). Fail-soft:
  // fehlt sie, bleibt conceptVoiceScore einfach undefined.
  let conceptIds: string[] = [];
  let conceptVecs: number[][] = [];
  try {
    if (fs.existsSync(CONCEPTS_EMB)) {
      const cf = JSON.parse(fs.readFileSync(CONCEPTS_EMB, "utf-8")) as { embeddings?: Record<string, number[]> };
      conceptIds = Object.keys(cf.embeddings ?? {});
      conceptVecs = conceptIds.map(id => cf.embeddings![id]);
      if (conceptVecs.length > 0) {
        console.log(`[build-resonanzen-index] conceptVoiceScore: ${conceptVecs.length} Begriffs-Embeddings als Referenz`);
      }
    }
  } catch (err) {
    console.warn(`[build-resonanzen-index] concepts-embeddings nicht ladbar — conceptVoiceScore übersprungen: ${err instanceof Error ? err.message : err}`);
  }

  for (const entry of entries) {
    const v = embeddings[entry.id];
    if (!v) continue;
    const scored: Array<{ id: string; score: number }> = [];
    for (const other of entries) {
      if (other.id === entry.id) continue;
      // Nicht auf rejected Einträge verlinken — sie verschwinden aus der
      // sichtbaren Sicht, ein related/Echo-Link dorthin liefe ins Leere
      // (die UI müsste ihn still droppen). Lieber gar nicht erzeugen.
      if (other.status === "rejected") continue;
      // Master + Variante des gleichen Ankers sind PER DEFINITION
      // semantisch verwandt (Master ist Synthese der Varianten) —
      // sie als nearDuplicates oder related zu flaggen wäre Rauschen.
      if (entry.anchor && other.anchor === entry.anchor &&
          (entry.is_master || other.is_master)) continue;
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
    // Novelty-Flag: kein Nachbar über NOVELTY_THRESHOLD → semantisch peripher.
    // `scored` enthält nur Items ≥ MIN_SCORE (0.5); wenn dort kein Top-Wert
    // ≥ NOVELTY_THRESHOLD ist, gibt es per Definition KEINEN Eintrag im Korpus
    // mit hoher Ähnlichkeit zu diesem hier → neue Erkenntnis.
    const topScore = scored.length > 0 ? scored[0].score : 0;
    if (topScore < NOVELTY_THRESHOLD) {
      entry.novelty = true;
    }
    // werkVoiceScore — Cosine zum Centroid der kuratierten Einträge
    if (centroid) {
      entry.werkVoiceScore = Math.max(0, Math.min(1, cosineSim(v, centroid)));
    }
    // corpusVoiceScore — max Cosine zu allen Kapitel-Embeddings (Buchstreue)
    if (chapterVecs.length > 0) {
      let maxCos = 0;
      for (const cv of chapterVecs) {
        const c = cosineSim(v, cv);
        if (c > maxCos) maxCos = c;
      }
      entry.corpusVoiceScore = Math.max(0, Math.min(1, maxCos));
    }
    // conceptVoiceScore — max Cosine zu allen Begriffs-Embeddings
    // (Begriffsstreue) + conceptAnchor = nächstliegender Begriff.
    if (conceptVecs.length > 0) {
      let maxCos = 0; let bestId: string | undefined;
      for (let i = 0; i < conceptVecs.length; i++) {
        const c = cosineSim(v, conceptVecs[i]);
        if (c > maxCos) { maxCos = c; bestId = conceptIds[i]; }
      }
      entry.conceptVoiceScore = Math.max(0, Math.min(1, maxCos));
      if (bestId) entry.conceptAnchor = bestId;
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

// M2: fetchEmbedding lebt jetzt zentral in server/lib/embeddingClient.ts
// (Multi-Key-Failover + Retry). Hier nur noch importiert. Build-Scripts
// setzen höhere Retry-Toleranz als der Server, da Build-Zeit unkritisch.
const embedWithRetry = (text: string) => fetchEmbedding(text, { maxRetries: 3 });

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

  // Prune verwaister Vektoren: Einträge, die nicht mehr im Korpus sind
  // (gelöscht / dedupliziert), würden sonst für immer im Embeddings-File
  // bleiben — der Echo-Detektor iteriert über ALLE Keys und würde sie als
  // near-duplicates mit dangling-id melden. `chapter:`-Keys sind der
  // Werk-Anker für computeCrossLinks und bleiben erhalten.
  const liveIds = new Set(entries.map(e => e.id));
  let pruned = 0;
  for (const id of Object.keys(existing)) {
    if (!liveIds.has(id) && !id.startsWith("chapter:")) {
      delete existing[id];
      pruned++;
    }
  }
  if (pruned > 0) console.log(`[build-resonanzen-index] pruned ${pruned} orphaned embeddings (entries no longer in corpus)`);

  const toCompute = entries.filter(e => !(e.id in existing));
  if (toCompute.length === 0) {
    console.log("[build-resonanzen-index] all embeddings up to date");
    fs.writeFileSync(EMBEDDINGS_OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), embeddings: existing }, null, 2));
    return existing;
  }

  // Free tier: 100 RPM. At BATCH=5 parallel calls, wait 3.5s between batches
  // → ~86 RPM, safely under the limit. Paid tier needs no throttling, but
  // the extra ~70s for 124 entries is acceptable in a build step.
  const BATCH = 5;
  const BATCH_DELAY_MS = 3500;
  console.log(`[build-resonanzen-index] computing ${toCompute.length} new embeddings (Gemini ${GEMINI_EMBED_MODEL}, ${BATCH_DELAY_MS}ms between batches)`);
  let success = 0, failed = 0;
  for (let i = 0; i < toCompute.length; i += BATCH) {
    if (i > 0) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    const batch = toCompute.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async e => {
      // Embed prompt + response zusammen — semantischer Inhalt
      const text = `${e.prompt}\n\n${e.response}`;
      const vec = await embedWithRetry(text);
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

  // Loud-Fail wenn KEY gesetzt war aber NICHTS funktioniert hat — aber NUR
  // wenn explizit angefordert (EMBEDDINGS_REQUIRED=1). Der CI-Workflow
  // validate-corpus.yml setzt das Flag, damit ein stilles "0 Embeddings"
  // dort rot wird. Netlify-Builds setzen es nicht — der committete Index
  // reicht für den statischen Site-Build, ein Embedding-Fehler darf den
  // Frontend-Deploy nicht blockieren.
  if (success === 0 && failed > 0) {
    const required = (process.env.EMBEDDINGS_REQUIRED ?? "").trim() === "1";
    const msg =
      `0 erfolgreiche Embedding-Calls bei ${failed} Versuchen. ` +
      `Wahrscheinliche Ursachen: ungültiger GEMINI_API_KEY, abgelaufene Free-Tier-Quota, ` +
      `oder Gemini hat den ${GEMINI_EMBED_MODEL}-Endpoint entfernt (siehe https://ai.google.dev/gemini-api/docs/embeddings). ` +
      `Siehe die ersten Fetch-Fehler oben für Details.`;
    if (required) {
      console.error(`[build-resonanzen-index] FATAL: ${msg}`);
      process.exit(2);
    } else {
      console.warn(
        `[build-resonanzen-index] WARN: ${msg} (EMBEDDINGS_REQUIRED nicht gesetzt — Build läuft weiter)`,
      );
    }
  }
  return existing;
}

/**
 * Buchtext-Kapitel als zweite Werkstreue-Referenz embedden.
 *
 * Liest client/public/ebook_structured.json, embeddet pro Kapitel mit
 * SHA-256-basiertem Re-Embed (bei Buchtext-Änderung). Schreibt direkt in
 * den existing-Map mit chapter:${part}:${id} als ID (part-Prefix
 * dedupliziert chapter-ids die in mehreren Bänden gleich heißen).
 *
 * Chunking: bei content > 6000 chars wird in Chunks gesplittet, jeder
 * embeddet, dann gewichtet (nach Chunk-Länge) gemittelt. Cosine ist
 * invariant zu Länge, also kein Normalisierungs-Schritt nötig.
 *
 * Mutates `existing` direkt — schreibt es NICHT zurück nach disk; das
 * macht der Caller im selben Step wie die Korpus-Embeddings, damit
 * beide in einer JSON liegen.
 */
async function buildChapterEmbeddings(existing: Record<string, number[]>): Promise<{ added: number; reused: number; failed: number }> {
  const ebookPath = path.join(ROOT, "client/public/ebook_structured.json");
  if (!fs.existsSync(ebookPath)) {
    console.log("[build-resonanzen-index] ebook_structured.json nicht vorhanden — chapter-embeddings übersprungen");
    return { added: 0, reused: 0, failed: 0 };
  }

  // Hash-Manifest für inkrementelles Re-Embedding. Separates File neben
  // den Embeddings — wenn der Buchtext-Hash sich ändert, neu berechnen.
  const HASH_FILE = path.join(ROOT, "client/public/resonanzen-chapter-hashes.json");
  let hashes: Record<string, string> = {};
  if (fs.existsSync(HASH_FILE)) {
    try { hashes = JSON.parse(fs.readFileSync(HASH_FILE, "utf-8")); } catch {}
  }

  let ebook: { chapters?: Array<{ id: string; part: string; content: string }> };
  try {
    ebook = JSON.parse(fs.readFileSync(ebookPath, "utf-8"));
  } catch (err) {
    console.warn("[build-resonanzen-index] ebook_structured.json korrupt — chapter-embeddings übersprungen");
    return { added: 0, reused: 0, failed: 0 };
  }

  const chapters = (ebook.chapters ?? []).filter(c =>
    c.id && c.part && c.content && c.content.length >= 500
  );

  if (chapters.length === 0) {
    console.log("[build-resonanzen-index] keine substantiellen Kapitel (≥500 chars) — chapter-embeddings übersprungen");
    return { added: 0, reused: 0, failed: 0 };
  }

  // Dedup gleiche (part, id) — letztes Vorkommen gewinnt
  const unique = new Map<string, { id: string; part: string; content: string }>();
  for (const c of chapters) {
    unique.set(`${c.part}:${c.id}`, c);
  }

  const CHUNK_SIZE = 6000;
  let added = 0, reused = 0, failed = 0;

  for (const [key, ch] of Array.from(unique.entries())) {
    const embId = `chapter:${key}`;
    const contentHash = crypto.createHash("sha256").update(ch.content).digest("hex").slice(0, 16);

    // Skip wenn ID + Hash unverändert
    if (existing[embId] && hashes[embId] === contentHash) {
      reused++;
      continue;
    }

    let vec: number[] | null = null;
    if (ch.content.length <= CHUNK_SIZE) {
      vec = await embedWithRetry(ch.content);
    } else {
      // Chunks: gewichteter Mittelwert
      const chunks: string[] = [];
      for (let i = 0; i < ch.content.length; i += CHUNK_SIZE) {
        chunks.push(ch.content.slice(i, i + CHUNK_SIZE));
      }
      const chunkVecs = await Promise.all(chunks.map(c => embedWithRetry(c)));
      const validVecs = chunkVecs.map((v, i) => ({ v, w: chunks[i].length }))
        .filter((x): x is { v: number[]; w: number } => x.v !== null);
      if (validVecs.length === 0) {
        vec = null;
      } else {
        const dim = validVecs[0].v.length;
        const totalW = validVecs.reduce((s, x) => s + x.w, 0);
        vec = new Array(dim).fill(0);
        for (const { v, w } of validVecs) {
          for (let i = 0; i < dim; i++) vec[i] += v[i] * (w / totalW);
        }
      }
    }

    if (vec) {
      existing[embId] = vec;
      hashes[embId] = contentHash;
      added++;
      console.log(`[build-resonanzen-index]   chapter ${embId} (${ch.content.length} chars, ${ch.content.length > CHUNK_SIZE ? Math.ceil(ch.content.length / CHUNK_SIZE) + " chunks" : "1 chunk"})`);
    } else {
      failed++;
    }
  }

  fs.writeFileSync(HASH_FILE, JSON.stringify(hashes, null, 2));
  return { added, reused, failed };
}

main().catch(err => {
  console.error(`[build-resonanzen-index] FAILED: ${err instanceof Error ? err.stack : err}`);
  // Trotzdem leeren Index schreiben, damit Vite-Build nicht bricht
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: 0, entries: [], error: String(err) }, null, 2));
  process.exit(0);
});
