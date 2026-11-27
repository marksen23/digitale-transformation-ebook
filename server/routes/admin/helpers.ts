/**
 * Gemeinsame Helfer der Admin-Routen. Verhalten unverändert,
 * nur aus dem einen Router herausgelöst.
 */
import type express from "express";
import { isAdminRequest } from "../../lib/adminToken.js";
import { type AutoCurateThresholds } from "../../lib/adminConfig.js";
import { removeManyFromIndex, updateInIndex } from "../../lib/indexUpdater.js";
import { invalidateResonanzRetrievalCache } from "../../lib/werkRetrieval.js";
import { OUTPUT_VOICE_RULE } from "../../lib/promptSafety.js";
export function checkAdminToken(req: express.Request): boolean {
  return isAdminRequest(req);
}

export const VALID_STATUS_VALUES = new Set(["raw", "pending", "approved", "published", "rejected"]);

/** Findet ein Resonanz-File anhand der ID via GitHub Tree-API + raw download. */
export async function findEntryFile(id: string): Promise<{ path: string; content: string; sha: string } | null> {
  const token = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_REPO_OWNER  ?? "marksen23";
  const repo   = process.env.GITHUB_REPO_NAME   ?? "digitale-transformation-ebook";
  const branch = process.env.GITHUB_REPO_BRANCH ?? "main";
  if (!token) return null;
  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", Accept: "application/vnd.github+json" },
  });
  if (!treeRes.ok) return null;
  const treeData = await treeRes.json();
  interface TreeBlobEntry { type: string; path: string }
  const blobs = (treeData.tree ?? []) as TreeBlobEntry[];
  const candidates = blobs.filter((e: TreeBlobEntry) =>
    e.type === "blob" && e.path.startsWith("content/resonanzen/") && e.path.endsWith(".md") && e.path.includes(id)
  );
  for (const c of candidates) {
    const contentsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${c.path}?ref=${branch}`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", Accept: "application/vnd.github+json" },
    });
    if (!contentsRes.ok) continue;
    const data = await contentsRes.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    // Verifiziere dass Frontmatter wirklich diese ID hat (Path-Match alleine reicht nicht)
    if (new RegExp(`^id:\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(content)) {
      return { path: c.path, content, sha: data.sha };
    }
  }
  return null;
}

/**
 * Wie findEntryFile, aber für VIELE IDs in einem Rutsch: holt den Git-Tree
 * GENAU EINMAL (statt pro ID einen rekursiven Tree-Fetch) und löst dann die
 * Contents (sha + content) je ID auf — begrenzt parallel. Vermeidet das
 * N-fache Tree-Fetchen + Rate-Limit-Risiko bei Bulk-Operationen.
 */
export async function findEntryFiles(
  ids: string[],
): Promise<Map<string, { path: string; content: string; sha: string }>> {
  const out = new Map<string, { path: string; content: string; sha: string }>();
  const token = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_REPO_OWNER  ?? "marksen23";
  const repo   = process.env.GITHUB_REPO_NAME   ?? "digitale-transformation-ebook";
  const branch = process.env.GITHUB_REPO_BRANCH ?? "main";
  if (!token || ids.length === 0) return out;
  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", Accept: "application/vnd.github+json" },
  });
  if (!treeRes.ok) return out;
  const treeData = await treeRes.json();
  interface TreeBlobEntry { type: string; path: string }
  const blobs = ((treeData.tree ?? []) as TreeBlobEntry[]).filter(
    e => e.type === "blob" && e.path.startsWith("content/resonanzen/") && e.path.endsWith(".md")
  );
  const resolveOne = async (id: string): Promise<void> => {
    const candidates = blobs.filter(e => e.path.includes(id));
    for (const c of candidates) {
      const contentsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${c.path}?ref=${branch}`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", Accept: "application/vnd.github+json" },
      });
      if (!contentsRes.ok) continue;
      const data = await contentsRes.json();
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      if (new RegExp(`^id:\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(content)) {
        out.set(id, { path: c.path, content, sha: data.sha });
        return;
      }
    }
  };
  // Contents begrenzt parallel auflösen (lesend, kein Schreib-Konflikt)
  const queue = [...ids];
  const worker = async (): Promise<void> => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) await resolveOne(id);
  };
  await Promise.all(Array.from({ length: Math.min(6, ids.length) }, () => worker()));
  return out;
}

/** Holt sha + content eines Files per Pfad (für Retry-Reload nach 409). */
export async function getContentsByPath(path: string): Promise<{ sha: string; content: string } | null> {
  const token = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_REPO_OWNER  ?? "marksen23";
  const repo   = process.env.GITHUB_REPO_NAME   ?? "digitale-transformation-ebook";
  const branch = process.env.GITHUB_REPO_BRANCH ?? "main";
  if (!token) return null;
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", Accept: "application/vnd.github+json" },
  });
  if (!r.ok) return null;
  const data = await r.json();
  return { sha: data.sha, content: Buffer.from(data.content, "base64").toString("utf-8") };
}

/** Schreibt File-Content zurück (PUT) oder löscht (DELETE) via Contents-API. */
export async function writeOrDeleteFile(
  op: "update" | "delete", path: string, sha: string, newContent: string | null, message: string,
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const token = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_REPO_OWNER  ?? "marksen23";
  const repo   = process.env.GITHUB_REPO_NAME   ?? "digitale-transformation-ebook";
  const branch = process.env.GITHUB_REPO_BRANCH ?? "main";
  if (!token) return { ok: false, error: "GITHUB_TOKEN fehlt" };
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  // Bei leerem sha: GitHub interpretiert als CREATE. Bei vorhandenem sha:
  // UPDATE/DELETE. Damit kann derselbe Helper auch neue Master-Files
  // erzeugen (Phase 4) ohne separate "create"-Branch.
  const body: Record<string, unknown> = { message, branch };
  if (sha) body.sha = sha;
  if (op === "update" && newContent !== null) {
    body.content = Buffer.from(newContent, "utf-8").toString("base64");
  }
  const res = await fetch(url, {
    method: op === "update" ? "PUT" : "DELETE",
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", "Content-Type": "application/json", Accept: "application/vnd.github+json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, error: `${res.status}: ${txt.slice(0, 200)}`, status: res.status };
  }
  return { ok: true };
}

/**
 * writeOrDeleteFile mit Retry bei transienten Fehlern (409 SHA-Konflikt,
 * 5xx, 403 secondary-rate-limit). Bei 409 wird der aktuelle SHA neu geholt
 * und die Mutation neu auf den frischen Content angewandt (via reload).
 * `reload` liefert {sha, content} neu — für MD-Writes, wo der Content vom
 * SHA abhängt. Garantiert, dass auch unter Last jeder Write landet.
 */
export async function writeOrDeleteFileRetry(
  op: "update" | "delete",
  initial: { path: string; sha: string; content: string | null },
  message: string,
  reload: () => Promise<{ sha: string; content: string | null } | null>,
  maxAttempts = 6,
): Promise<{ ok: boolean; error?: string }> {
  let { sha, content } = initial;
  let lastErr = "unbekannt";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await writeOrDeleteFile(op, initial.path, sha, content, message);
    if (res.ok) return { ok: true };
    lastErr = res.error ?? "Schreibfehler";
    const transient = res.status === 409 || res.status === 403 || (res.status ?? 0) >= 500;
    if (!transient || attempt === maxAttempts - 1) return { ok: false, error: lastErr };
    await new Promise(r => setTimeout(r, 200 * (attempt + 1) + Math.floor(Math.random() * 200)));
    // SHA (und ggf. Content) frisch holen und Mutation neu anwenden
    const fresh = await reload();
    if (!fresh) return { ok: false, error: `${lastErr} (reload fehlgeschlagen)` };
    sha = fresh.sha;
    content = fresh.content;
  }
  return { ok: false, error: lastErr };
}

/** Modifiziert Frontmatter mit YAML-Library (Reihenfolge bleibt erhalten). */
export async function mutateFrontmatter(content: string, mutator: (doc: import("yaml").Document.Parsed) => void): Promise<string> {
  const yaml = await import("yaml");
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("Kein Frontmatter im File");
  const doc = yaml.parseDocument(m[1]);
  mutator(doc);
  const newFm = doc.toString().trimEnd();
  return `---\n${newFm}\n---\n${m[2]}`;
}

// Gemeinsame Status-Mutationskette — von /api/admin/curate (actor "admin")
// und /api/admin/auto-curate (actor "auto-curate") genutzt. Schreibt status
// ins MD-Frontmatter + audit_trail, synct live-Index, invalidiert RAG-Cache.
export async function curateEntryStatus(
  id: string, status: string, actor: string,
): Promise<{ ok: true; oldStatus: string; path: string } | { ok: false; code: number; error: string }> {
  const file = await findEntryFile(id);
  if (!file) return { ok: false, code: 404, error: `Eintrag ${id} nicht gefunden` };
  let oldStatus = "raw";
  let newContent: string;
  try {
    newContent = await mutateFrontmatter(file.content, doc => {
      oldStatus = String(doc.get("status") ?? "raw");
      doc.set("status", status);
      const trail = doc.get("audit_trail") as { add?: (item: unknown) => void } | undefined;
      const newEvent = { event: "status-changed", ts: new Date().toISOString(), actor, from: oldStatus, to: status };
      if (trail && typeof trail.add === "function") trail.add(newEvent);
      else doc.set("audit_trail", [newEvent]);
    });
  } catch (err) {
    return { ok: false, code: 500, error: `Frontmatter-Update fehlgeschlagen: ${err instanceof Error ? err.message : err}` };
  }
  const writeRes = await writeOrDeleteFile(
    "update", file.path, file.sha, newContent,
    `curate(${id}): ${oldStatus} → ${status}${actor === "admin" ? "" : ` [${actor}]`}`
  );
  if (!writeRes.ok) return { ok: false, code: 502, error: writeRes.error ?? "Schreibfehler" };
  // S1: live-Index synchron — AWAIT (nicht fire-and-forget), damit der
  // Schreibvorgang abgeschlossen ist, bevor wir antworten. updateInIndex
  // hat jetzt Retry-on-conflict, verwirft also keine Updates mehr still.
  await updateInIndex(id, { status });
  invalidateResonanzRetrievalCache();         // R1: Retrieval-Pool invalidieren
  return { ok: true, oldStatus, path: file.path };
}

export const PRE_SCORE_SYSTEM = `Du bist ein STRENGER Lektor und schützt das Niveau des deutschen Philosophiewerks „Resonanzvernunft — Digitale Transformation". Du beurteilst, ob eine KI-generierte Resonanz dem Werk wirklich ebenbürtig ist. Nenne in SCHWÄCHE und BEGRÜNDUNG keinen Autorennamen.

Werk-Profil: dichter philosophischer Duktus, mediale Anthropologie, Heidegger/Resonanz/Aufklärung-Bezüge, prosaisch (keine Listen), präzise ohne Akademismus. Zentrale Begriffe: Resonanz, Dasein, Werden, Zwischen, Leerstelle, Antlitz, Geviert, Kairos, Antwort, Begegnung.

KALIBRIERUNG (entscheidend — bewerte streng, im Zweifel runde AB):
Die MEISTE KI-Prosa verdient eine 3. Eine 5 vergibst du höchstens bei jedem zwanzigsten Text — nur wenn du den Absatz WORTWÖRTLICH ins gedruckte Buch übernehmen würdest, ohne ein Wort zu ändern. Großzügigkeit zerstört den Sinn dieser Bewertung; ein „schön klingender" Text ist noch lange keine 5.

KI-MARKER, die den Score auf HÖCHSTENS 3 deckeln (auch bei schöner Sprache):
rhetorische Dreierfiguren; „es ist wichtig zu betonen/verstehen"; aufzählende oder gliedernde Struktur; Meta-Kommentar über die eigene Antwort; generische Schlusswendungen („letztlich zeigt sich", „in diesem Sinne", „eine Einladung, …"); zentrale Begriffe bloß benannt statt wirklich gedacht.

LEITFRAGE (zuerst beantworten, sie entscheidet über 3 vs. 4):
Bringt der Text einen GEDANKEN, den das Werk noch nicht hat, und TRÄGT er ihn — also leitet er ihn her, statt ihn bloß zu behaupten?
• NEIN — er referiert, paraphrasiert oder behauptet kompetent und werknah, aber ohne neuen, hergeleiteten Schritt → HÖCHSTENS 3, egal wie schön die Sprache klingt.
• JA — nur dann kommen 4 und 5 überhaupt in Frage.

SKALA:
5 — Ununterscheidbar von der eigenen Hand des Werks UND ein eigener denkerischer Schritt, der die Frage weiterführt. Du würdest kein Wort ändern. (Sehr selten.)
4 — Ein echter eigener Gedanke, hergeleitet und werktreu — mit nur EINEM stilistischen Makel (eine generische Wendung, ein schwächerer Schlusssatz). KEINE 4, wenn der Kern Behauptung, Paraphrase oder Referat ist.
3 — STANDARD (hier landen die meisten): thematisch passend, formal korrekt, werknah — aber der zentrale Zug ist Behauptung/Paraphrase statt eines hergeleiteten neuen Gedankens, ODER der KI-Duktus ist erkennbar.
2 — stilistisch fremd (Schulbuch-Ton, Aufzählungen) oder inhaltlich beliebig.
1 — off-topic, generisch, oder bricht in Listen/Bullets aus.

Nenne ZUERST die größte Schwäche des Textes, DANN erst den Score — das diszipliniert dein Urteil und verhindert Gefälligkeit.

OUTPUT-FORMAT (STRIKT — exakt drei Zeilen, sonst nichts):
SCHWÄCHE: <die größte Schwäche, ein Satz>
SCORE: <1-5>
BEGRÜNDUNG: <ein Satz, max 25 Wörter, konkret>

${OUTPUT_VOICE_RULE}`;

export function parsePreScore(text: string): { score: number; reason: string } | null {
  const scoreMatch = text.match(/SCORE:\s*([1-5])/i);
  const reasonMatch = text.match(/BEGR(?:Ü|UE|U)NDUNG:\s*([\s\S]+?)(?:\n|$)/i);
  if (!scoreMatch) return null;
  return {
    score: parseInt(scoreMatch[1], 10),
    reason: (reasonMatch?.[1] ?? "").trim().slice(0, 240) || "(keine Begründung)",
  };
}

/**
 * Provider-agnostischer Text-LLM-Dispatcher. Default Gemini (gemini-2.5-pro
 * als unabhängiger Richter — die Resonanzen erzeugt gemini-2.5-flash, also
 * kein Selbst-Bewertungs-Bias). Claude per *_BACKEND=claude als Fallback.
 * Reicht das genutzte Modell + den echten Fehler durch (Observability).
 */
export async function callTextLLM(
  opts: { system: string; user: string; maxTokens?: number; temperature?: number; thinkingBudget?: number },
  cfg: { backend: string; geminiModel: string },
): Promise<{ text: string | null; model: string; error: string | null }> {
  if (cfg.backend === "claude") {
    const { callClaude, isClaudeAvailable, getClaudeModel, getLastClaudeError } = await import("../../lib/claudeClient.js");
    if (!isClaudeAvailable()) return { text: null, model: getClaudeModel(), error: "ANTHROPIC_API_KEY fehlt" };
    const text = await callClaude(opts);  // thinkingBudget ist Gemini-spezifisch, Claude ignoriert es
    return { text, model: getClaudeModel(), error: text ? null : (getLastClaudeError() ?? "Claude-Call fehlgeschlagen") };
  }
  const { callGemini, isGeminiAvailable, getLastGeminiError } = await import("../../lib/geminiText.js");
  if (!isGeminiAvailable()) return { text: null, model: cfg.geminiModel, error: "Kein GEMINI_API_KEY[S]/FALLBACK gesetzt" };
  const text = await callGemini({ ...opts, model: cfg.geminiModel });
  return { text, model: cfg.geminiModel, error: text ? null : (getLastGeminiError() ?? "Gemini-Call fehlgeschlagen") };
}

export interface ScoredEntry {
  id: string; status: string; prompt: string;
  ai_score?: number; ai_score_model?: string;
  corpusVoiceScore?: number; werkVoiceScore?: number;
  conceptVoiceScore?: number;
  novelty?: boolean; nearDuplicates?: string[];
}

export function classifyForAutoCurate(e: ScoredEntry, AUTO_CURATE: AutoCurateThresholds): { decision: "approve" | "reject" | "review"; reason: string } {
  const ai = e.ai_score, cv = e.corpusVoiceScore, wv = e.werkVoiceScore, cn = e.conceptVoiceScore;
  const echoCount = e.nearDuplicates?.length ?? 0;
  // Harte Ablehnung zuerst (Sicherheit: nichts klar Schlechtes durchlassen)
  if (ai !== undefined && ai <= AUTO_CURATE.aiReject) return { decision: "reject", reason: `ai_score ${ai} ≤ ${AUTO_CURATE.aiReject}` };
  if (cv !== undefined && cv < AUTO_CURATE.corpusReject) return { decision: "reject", reason: `corpusVoice ${cv.toFixed(2)} < ${AUTO_CURATE.corpusReject} (buch-fern)` };
  if (cn !== undefined && cn < AUTO_CURATE.conceptReject) return { decision: "reject", reason: `conceptVoice ${cn.toFixed(2)} < ${AUTO_CURATE.conceptReject} (begriffs-fern)` };
  // Freigabe verlangt ALLE positiven Signale vorhanden
  if (ai === undefined) return { decision: "review", reason: "noch nicht bewertet (Pre-Score nötig)" };
  if (cv === undefined) return { decision: "review", reason: "kein corpusVoiceScore (kein Drift-Anker)" };
  if (echoCount > 0) return { decision: "review", reason: `Echo (${echoCount} Near-Duplikate)` };
  if (e.novelty === true) return { decision: "review", reason: "novelty/peripher — Mensch entscheidet" };
  // Triangulierter Anker: ai + Prosa-Nähe + (Begriffs-Nähe, wenn vorhanden) +
  // (Werk-Stimme, wenn vorhanden). conceptVoice härtet, blockt aber nicht bei
  // Abwesenheit (vor dem nächsten CI-Rebuild noch nicht berechnet).
  if (ai >= AUTO_CURATE.aiMin && cv >= AUTO_CURATE.corpusMin
      && (cn === undefined || cn >= AUTO_CURATE.conceptMin)
      && (wv === undefined || wv >= AUTO_CURATE.werkMin)) {
    return { decision: "approve", reason: `ai ${ai} · corpusVoice ${cv.toFixed(2)}${cn !== undefined ? ` · conceptVoice ${cn.toFixed(2)}` : ""}${wv !== undefined ? ` · werkVoice ${wv.toFixed(2)}` : ""}` };
  }
  return { decision: "review", reason: `unter Schwelle (ai ${ai} / corpusVoice ${cv.toFixed(2)}${cn !== undefined ? ` / conceptVoice ${cn.toFixed(2)}` : ""})` };
}

/** Slug-Variante des Anchors für Dateinamen (analyse:a+b → analyse_a-b).
 *  Doppelpunkte sind in Windows-Pfaden nicht erlaubt, deshalb der Swap. */
export function slugifyAnchor(anchor: string): string {
  return anchor.replace(/:/g, "_").replace(/\+/g, "-");
}

/** Lädt alle Varianten eines Ankers über die GitHub Tree-API.
 *  Returnt parsed entries (frontmatter + body), sortiert nach ts asc. */
export async function loadAnchorVariants(endpoint: string, anchor: string): Promise<Array<{
  id: string; ts: string; prompt: string; response: string; path: string;
}>> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER ?? "marksen23";
  const repo = process.env.GITHUB_REPO_NAME ?? "digitale-transformation-ebook";
  const branch = process.env.GITHUB_REPO_BRANCH ?? "main";
  if (!token) return [];

  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", Accept: "application/vnd.github+json" },
  });
  if (!treeRes.ok) return [];
  const treeData = await treeRes.json();
  interface TreeBlobEntry { type: string; path: string }
  const blobs = (treeData.tree ?? []) as TreeBlobEntry[];

  // Anker-Pfad enthält den slug (analyse:a+b+c → analyse/a+b+c/<ts>-<id>.md)
  // Wir suchen alle raw/-Files unter dem entsprechenden Anker-Ordner.
  const anchorBody = anchor.split(":")[1] ?? anchor;
  const prefix = `content/resonanzen/raw/${endpoint}/${anchorBody}/`;
  const candidatePaths = blobs.filter(b =>
    b.type === "blob" && b.path.startsWith(prefix) && b.path.endsWith(".md")
  ).map(b => b.path);

  // Raw fetchen + parsen
  const variants: Array<{ id: string; ts: string; prompt: string; response: string; path: string }> = [];
  for (const p of candidatePaths) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p}`;
    const rawRes = await fetch(rawUrl);
    if (!rawRes.ok) continue;
    const md = await rawRes.text();
    // Frontmatter + Body parsen (gleiches Pattern wie scripts/build-resonanzen-index.ts)
    const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) continue;
    const fm = m[1];
    const body = m[2];
    const idMatch = fm.match(/^id:\s*["']?([^"'\n]+)["']?\s*$/m);
    const tsMatch = fm.match(/^ts:\s*["']?([^"'\n]+)["']?\s*$/m);
    const isMasterMatch = fm.match(/^is_master:\s*true\s*$/m);
    if (!idMatch || !tsMatch) continue;
    if (isMasterMatch) continue;  // master nicht als Variante!
    // ## Frage und ## Antwort extrahieren
    const sections = body.split(/^##\s+/m);
    let prompt = "", response = "";
    for (const s of sections) {
      if (/^Frage\s*\n/.test(s)) prompt = s.replace(/^Frage\s*\n+/, "").trim();
      else if (/^Antwort\s*\n/.test(s)) response = s.replace(/^Antwort\s*\n+/, "").trim();
    }
    variants.push({ id: idMatch[1], ts: tsMatch[1], prompt, response, path: p });
  }
  variants.sort((a, b) => a.ts.localeCompare(b.ts));
  return variants;
}

/** Lädt existierenden Master (falls vorhanden) für inkrementelle Synthese.
 *  Returnt { content, sha, bodyText } oder null. */
export async function loadMaster(endpoint: string, anchor: string): Promise<{ content: string; sha: string; bodyText: string } | null> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER ?? "marksen23";
  const repo = process.env.GITHUB_REPO_NAME ?? "digitale-transformation-ebook";
  const branch = process.env.GITHUB_REPO_BRANCH ?? "main";
  if (!token) return null;

  const masterPath = `content/resonanzen/master/${endpoint}/${slugifyAnchor(anchor)}.md`;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${masterPath}?ref=${branch}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return { content, sha: data.sha, bodyText: bodyMatch ? bodyMatch[1] : "" };
}

// Bulk-Delete: löscht VIELE Einträge — Tree einmal geholt, MD-Deletes mit
// Retry, EIN Index-Schreibvorgang (statt N parallele, die zu ~50% verloren
// gingen).
// Gemeinsamer Bulk-Delete-Kern — Tree einmal geholt (via findEntryFiles),
// MD-Deletes mit Retry, EIN Index-Schreibvorgang. Von delete-bulk UND
// dedup-corpus(apply) genutzt, statt den Worker-Pool zweimal zu pflegen.
export async function bulkDeleteEntries(ids: string[]): Promise<{
  results: Array<{ id: string; ok: boolean; error?: string }>;
  okIds: string[]; indexOk: boolean;
}> {
  const uniqueIds = Array.from(new Set(ids));
  const fileMap = await findEntryFiles(uniqueIds);

  const deleteOne = async (id: string): Promise<{ id: string; ok: boolean; error?: string }> => {
    const file = fileMap.get(id);
    if (!file) return { id, ok: false, error: "Eintrag nicht gefunden" };
    const w = await writeOrDeleteFileRetry(
      "delete",
      { path: file.path, sha: file.sha, content: null },
      `admin-delete: ${id} (${file.path.split("/").slice(-2, -1)[0] ?? "unknown"})`,
      async () => {
        const fresh = await getContentsByPath(file.path);
        return fresh ? { sha: fresh.sha, content: null } : null;
      },
    );
    return w.ok ? { id, ok: true } : { id, ok: false, error: w.error };
  };

  const results: { id: string; ok: boolean; error?: string }[] = [];
  const queue = [...uniqueIds];
  const worker = async (): Promise<void> => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      results.push(await deleteOne(id));
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, uniqueIds.length) }, () => worker()));

  const okIds = results.filter(r => r.ok).map(r => r.id);
  const indexOk = await removeManyFromIndex(okIds);
  invalidateResonanzRetrievalCache();
  return { results, okIds, indexOk };
}
