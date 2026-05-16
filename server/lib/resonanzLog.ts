/**
 * Resonanz-Logging — schreibt jede AI-Antwort als Markdown-File in
 * content/resonanzen/raw/ ins GitHub-Repo (Phase 2).
 *
 * Architektur:
 *   - Fire-and-forget: blockiert NIE den User-Response. Logging läuft async
 *     im Hintergrund nach dem res.json().
 *   - Single Source of Truth: GitHub-Repo. Keine separate DB, keine Render-Disk.
 *   - Audit-Trail: jeder Eintrag enthält Frontmatter mit content_hash + Audit-Events;
 *     parallel ist jeder Schreibvorgang ein Git-Commit (Hash-Chain durch Git selbst).
 *   - Fail-soft: wenn GITHUB_TOKEN fehlt oder API fehlschlägt → console.warn,
 *     keine Exception, User sieht nichts.
 */
import crypto from "crypto";
import { NODES } from "../../client/src/data/conceptGraph.js";
import { detectEchoes, getEchoDetectorHealth } from "./echoDetector.js";
import { appendToIndex, getIndexUpdaterHealth } from "./indexUpdater.js";

// Bei Server-Start: Set aller validen Konzept-IDs aus dem Begriffsnetz.
// Verwendet, um Tippfehler oder veraltete IDs in nodeIds beim Logging
// herauszufiltern (Vorbeugung gegen Korpus-Drift).
const VALID_NODE_IDS = new Set(NODES.map(n => n.id));

export type ResonanzEndpoint = "chapter" | "analyse" | "graph-chat" | "enkidu" | "translate" | "path-analyse";

export interface ResonanzEntry {
  endpoint: ResonanzEndpoint;
  anchor: string;            // z.B. "chapter:band2-kap3" oder "analyse:resonanzvernunft+zwischen"
  nodeIds?: string[];        // für analyse + graph-chat: betroffene Konzept-IDs
  prompt: string;            // User-Anfrage (bei chat: letzte Nachricht)
  response: string;          // KI-Antwort
  model: string;             // z.B. "gemini-2.5-flash"
  contextMeta?: Record<string, unknown>;  // z.B. { chapterTitle, chapterId }
}

const GITHUB_API = "https://api.github.com";
const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? "marksen23";
const REPO_NAME  = process.env.GITHUB_REPO_NAME  ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";

// Lizenz- und Copyright-Konstanten — entsprechen LICENSE im Repo-Root.
const COPYRIGHT_NOTICE = "© 2026 Markus Oehring. Alle Rechte vorbehalten.";
const LICENSE_ID = "personal-use-only";
const LICENSE_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/blob/main/LICENSE`;

/** Spam-Filter: minimale Mindestanforderungen, damit Müll/Fehler nicht
 *  ins Korpus gelangen. Bewusst niedrig gesetzt — Approval-Flow filtert
 *  später inhaltlich. Hier nur „nicht-leerer Tausch" sicherstellen. */
function passesSpamFilter(entry: ResonanzEntry): boolean {
  if (!entry.prompt || entry.prompt.trim().length < 2)   return false;
  if (!entry.response || entry.response.trim().length < 10) return false;
  if (entry.response.toLowerCase().includes("keine antwort erhalten")) return false;
  return true;
}

/** Erzeugt eine Crockford-ähnliche kurze ID: <ts-base36>-<rand-hex>. */
function generateId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${ts}-${rand}`;
}

/** SHA-256-Hash über Prompt+Response (für Audit-Trail). */
function contentHash(prompt: string, response: string): string {
  const h = crypto.createHash("sha256");
  h.update(prompt);
  h.update("\n---\n");
  h.update(response);
  return h.digest("hex").slice(0, 16);
}

/** YAML-sicheres Quoten — nur einfache Strings. */
function yamlString(s: string): string {
  // Wenn keine kritischen Zeichen, kein Quote nötig
  if (/^[a-zA-Z0-9_:.+/-]+$/.test(s)) return s;
  // Sonst doppelte Quotes mit Escape
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildMarkdown(entry: ResonanzEntry, id: string, ts: string, hash: string, echoIds: string[] = []): string {
  const frontmatter: string[] = [
    "---",
    `id: ${id}`,
    `ts: ${ts}`,
    `created_at: ${ts}`,
    `endpoint: ${entry.endpoint}`,
    `model: ${yamlString(entry.model)}`,
    `anchor: ${yamlString(entry.anchor)}`,
    `nodeIds: [${(entry.nodeIds ?? []).map(yamlString).join(", ")}]`,
    "status: raw",
    `content_hash: ${hash}`,
  ];
  // echoes_of: nur wenn at-ingest-Detektion Echos gefunden hat.
  // Build-Step setzt parallel nearDuplicates im Index — beide repräsentieren
  // denselben Zustand zu unterschiedlichen Zeitpunkten.
  if (echoIds.length > 0) {
    frontmatter.push(`echoes_of: [${echoIds.map(yamlString).join(", ")}]`);
  }
  frontmatter.push(
    `copyright: ${yamlString(COPYRIGHT_NOTICE)}`,
    `license: ${LICENSE_ID}`,
    `license_url: ${LICENSE_URL}`,
    "audit_trail:",
    "  - event: created",
    `    ts: ${ts}`,
    "    actor: system",
    `    content_hash: ${hash}`,
  );
  if (entry.contextMeta && Object.keys(entry.contextMeta).length > 0) {
    frontmatter.push("context_meta:");
    for (const [k, v] of Object.entries(entry.contextMeta)) {
      if (v === undefined || v === null) continue;
      const value = typeof v === "string" ? yamlString(v) : JSON.stringify(v);
      frontmatter.push(`  ${k}: ${value}`);
    }
  }
  frontmatter.push("---");
  frontmatter.push("");
  frontmatter.push("## Frage");
  frontmatter.push("");
  frontmatter.push(entry.prompt.trim());
  frontmatter.push("");
  frontmatter.push("## Antwort");
  frontmatter.push("");
  frontmatter.push(entry.response.trim());
  frontmatter.push("");
  return frontmatter.join("\n");
}

/**
 * Pfadkonvention — kategorisiert + breadcrumb-fähig:
 *   chapter:<chapterId>           → raw/chapter/<chapterId>/<date>-<id>.md
 *   analyse:<idA>+<idB>           → raw/analyse/<idA>+<idB>/<date>-<id>.md
 *   path-analyse:<from>+<to>      → raw/path-analyse/<from>+<to>/<date>-<id>.md
 *   translate:<chapterId>+<lang>  → raw/translate/<chapterId>+<lang>/<date>-<id>.md
 *   graph                         → raw/graph-chat/<date>-<id>.md
 *   enkidu                        → raw/enkidu/<date>-<id>.md
 */
function buildPath(id: string, endpoint: ResonanzEndpoint, anchor: string, ts: string): string {
  const date = ts.slice(0, 10); // YYYY-MM-DD
  const colonIdx = anchor.indexOf(":");
  const subdir = colonIdx > 0 ? anchor.slice(colonIdx + 1) : "";
  // Defensive: nur erlaubte Zeichen im Subdir-Namen
  const safeSubdir = subdir.replace(/[^a-zA-Z0-9+_-]/g, "_");
  const dirPath = safeSubdir
    ? `content/resonanzen/raw/${endpoint}/${safeSubdir}`
    : `content/resonanzen/raw/${endpoint}`;
  return `${dirPath}/${date}-${id}.md`;
}

// Heartbeat-Counter: alle 100 erfolgreichen Logs einmal info-Output,
// damit man im Render-Log das System "leben sieht" ohne Spam.
let _resonanzLogSuccessCount = 0;
let _resonanzLogFailureCount = 0;
let _resonanzLogSkippedNoToken = 0;
let _resonanzLogSkippedSpam = 0;
let _lastSuccess: { id: string; ts: string; endpoint: string; anchor: string } | null = null;
let _lastFailure: { ts: string; endpoint: string; reason: string } | null = null;

/**
 * Health-Snapshot — exposed über /api/admin/resonanz-health.
 * Erlaubt zu prüfen, ob der Auto-Ingest tatsächlich läuft.
 */
export function getResonanzLogHealth() {
  return {
    githubTokenPresent: !!process.env.GITHUB_TOKEN,
    repoOwner: REPO_OWNER,
    repoName: REPO_NAME,
    repoBranch: REPO_BRANCH,
    successCount: _resonanzLogSuccessCount,
    failureCount: _resonanzLogFailureCount,
    skippedNoToken: _resonanzLogSkippedNoToken,
    skippedSpamFilter: _resonanzLogSkippedSpam,
    lastSuccess: _lastSuccess,
    lastFailure: _lastFailure,
    echoDetector: getEchoDetectorHealth(),
    indexUpdater: getIndexUpdaterHealth(),
  };
}

/** Single attempt — innere PUT-Logik. Returns true=success | false=fail. */
async function _putToGithub(
  token: string, url: string, body: unknown,
): Promise<{ ok: true } | { ok: false; status: number; reason: string; transient: boolean }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "dt-resonanz-log",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, reason: `network: ${msg}`, transient: true };
  }
  if (res.ok) return { ok: true };
  const txt = await res.text().catch(() => "");
  // 429 + 5xx sind transient (Retry sinnvoll); 4xx sonst dauerhaft.
  const transient = res.status === 429 || (res.status >= 500 && res.status <= 599);
  return {
    ok: false, status: res.status, transient,
    reason: `${res.status} ${res.statusText}: ${txt.slice(0, 200)}`,
  };
}

const RETRY_DELAYS_MS = [0, 1000, 5000]; // 3 Versuche: sofort, 1s, 5s

/**
 * Schreibt einen Resonanz-Eintrag ins Repo.
 * Wirft NIE — Fehler werden geloggt, aber nicht propagiert (fire-and-forget).
 *
 * Retry-Verhalten:
 *   - Transiente Fehler (429, 5xx, network): bis zu 3 Versuche mit Backoff
 *   - Dauerhafte Fehler (401, 403, 422, andere 4xx): sofort aufgeben
 */
export async function logResonanz(entry: ResonanzEntry): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    // Lokale Dev-Umgebung ohne Token: stiller Skip, kein Spam.
    _resonanzLogSkippedNoToken++;
    return;
  }
  if (!passesSpamFilter(entry)) {
    _resonanzLogSkippedSpam++;
    return;
  }

  // Defensive: nur valide nodeIds aus dem Begriffsnetz weiterreichen.
  // Verhindert, dass falsche IDs (Tippfehler, veraltete Schemata) im
  // Korpus landen — der Konsistenz-Wächter würde sie sonst als orphan flaggen.
  if (entry.nodeIds && entry.nodeIds.length > 0) {
    const validIds = entry.nodeIds.filter(id => VALID_NODE_IDS.has(id));
    const dropped = entry.nodeIds.filter(id => !VALID_NODE_IDS.has(id));
    if (dropped.length > 0) {
      console.warn(`[resonanzLog] dropped invalid nodeIds: ${dropped.join(", ")} (endpoint=${entry.endpoint}, anchor=${entry.anchor})`);
    }
    entry = { ...entry, nodeIds: validIds };
  }

  const id = generateId();
  const ts = new Date().toISOString();
  const hash = contentHash(entry.prompt, entry.response);

  // At-Ingest-Echo-Detection: synchron mit Logging, aber fail-soft.
  // Findet bestehende Einträge mit Cosine ≥0.88 zu prompt+response.
  // Bei jedem Fehler (kein GitHub-Token, kein Index, Netzwerk) → [].
  const echoes = await detectEchoes(entry.prompt, entry.response).catch(() => []);
  const echoIds = echoes.map(e => e.id);
  if (echoIds.length > 0) {
    console.info(`[resonanzLog] ${id} echoes ${echoIds.length}: ${echoIds.slice(0, 3).join(", ")}${echoIds.length > 3 ? "…" : ""}`);
  }

  const md = buildMarkdown(entry, id, ts, hash, echoIds);
  const repoPath = buildPath(id, entry.endpoint, entry.anchor, ts);

  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${repoPath}`;
  const body = {
    message: `log(resonanz): ${entry.endpoint} ${entry.anchor} ${id}`,
    content: Buffer.from(md, "utf-8").toString("base64"),
    branch: REPO_BRANCH,
  };

  let lastReason = "no attempt";
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (RETRY_DELAYS_MS[attempt] > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
    const result = await _putToGithub(token, url, body);
    if (result.ok) {
      _resonanzLogSuccessCount++;
      _lastSuccess = { id, ts, endpoint: entry.endpoint, anchor: entry.anchor };
      if (_resonanzLogSuccessCount % 100 === 0) {
        console.info(`[resonanzLog] ${_resonanzLogSuccessCount} entries logged total`);
      }
      // Inkrementelles Index-Update: damit der neue Eintrag sofort in
      // /resonanzen sichtbar ist, ohne auf den CI-Workflow zu warten.
      // Fire-and-forget — Fehler werden in indexUpdater intern getrackt.
      void appendToIndex({
        id, ts,
        endpoint: entry.endpoint,
        anchor: entry.anchor,
        nodeIds: entry.nodeIds ?? [],
        status: "raw",
        prompt: entry.prompt,
        response: entry.response,
        contextMeta: entry.contextMeta ?? {},
        ...(echoIds.length > 0 ? { echoes_of: echoIds } : {}),
      });
      return;
    }
    lastReason = result.reason;
    if (!result.transient) break; // dauerhafter Fehler — nicht retry-sinnvoll
  }
  // Alle Versuche fehlgeschlagen oder dauerhafter Fehler — als error sichtbar machen
  _resonanzLogFailureCount++;
  _lastFailure = { ts: new Date().toISOString(), endpoint: entry.endpoint, reason: lastReason };
  console.error(`[resonanzLog] FAILED ${repoPath}: ${lastReason}`);
}

/** Helfer: kanonischer alphabetisch-sortierter Anker für analyse-pair. */
export function analyseAnchor(idA: string, idB: string): string {
  const sorted = [idA, idB].sort();
  return `analyse:${sorted[0]}+${sorted[1]}`;
}
