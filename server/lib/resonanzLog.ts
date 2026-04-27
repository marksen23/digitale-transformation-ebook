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

export type ResonanzEndpoint = "chapter" | "analyse" | "graph-chat" | "enkidu";

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

/** Spam-Filter: Mindestanforderungen, damit ein Log überhaupt geschrieben wird. */
function passesSpamFilter(entry: ResonanzEntry): boolean {
  if (!entry.prompt || entry.prompt.trim().length < 3)   return false;
  if (!entry.response || entry.response.trim().length < 20) return false;
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

function buildMarkdown(entry: ResonanzEntry, id: string, ts: string, hash: string): string {
  const frontmatter: string[] = [
    "---",
    `id: ${id}`,
    `ts: ${ts}`,
    `endpoint: ${entry.endpoint}`,
    `model: ${yamlString(entry.model)}`,
    `anchor: ${yamlString(entry.anchor)}`,
    `nodeIds: [${(entry.nodeIds ?? []).map(yamlString).join(", ")}]`,
    "status: raw",
    `content_hash: ${hash}`,
    "audit_trail:",
    "  - event: created",
    `    ts: ${ts}`,
    "    actor: system",
    `    content_hash: ${hash}`,
  ];
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

function buildPath(id: string, endpoint: ResonanzEndpoint, ts: string): string {
  const date = ts.slice(0, 10); // YYYY-MM-DD
  return `content/resonanzen/raw/${date}-${endpoint}-${id}.md`;
}

/**
 * Schreibt einen Resonanz-Eintrag ins Repo.
 * Wirft NIE — Fehler werden geloggt, aber nicht propagiert (fire-and-forget).
 */
export async function logResonanz(entry: ResonanzEntry): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    // Lokale Dev-Umgebung ohne Token: stiller Skip, kein Spam.
    return;
  }
  if (!passesSpamFilter(entry)) {
    return;
  }

  const id = generateId();
  const ts = new Date().toISOString();
  const hash = contentHash(entry.prompt, entry.response);
  const md = buildMarkdown(entry, id, ts, hash);
  const repoPath = buildPath(id, entry.endpoint, ts);

  // GitHub Contents API — neue Datei anlegen (kein sha → erlaubt nur create)
  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${repoPath}`;
  const body = {
    message: `log(resonanz): ${entry.endpoint} ${entry.anchor} ${id}`,
    content: Buffer.from(md, "utf-8").toString("base64"),
    branch: REPO_BRANCH,
  };

  try {
    const res = await fetch(url, {
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
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(`[resonanzLog] ${res.status} ${res.statusText}: ${txt.slice(0, 200)}`);
      return;
    }
    // Erfolgreich — kein Output, sonst spammed der Server-Log
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[resonanzLog] network error: ${msg}`);
  }
}

/** Helfer: kanonischer alphabetisch-sortierter Anker für analyse-pair. */
export function analyseAnchor(idA: string, idB: string): string {
  const sorted = [idA, idB].sort();
  return `analyse:${sorted[0]}+${sorted[1]}`;
}
