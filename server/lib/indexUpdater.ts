/**
 * indexUpdater.ts — inkrementelles Append des neuen Eintrags in den
 * gepublishten resonanzen-index.json, direkt vom Server.
 *
 * Hintergrund: der CI-Workflow validate-corpus.yml SOLLTE nach jedem
 * AI-Log den Index neu bauen. Tut er aus unbekannten Gründen
 * unzuverlässig. Statt darauf zu warten, schreiben wir hier server-seitig
 * direkt ein minimales Update: neuen Eintrag an entries[] anhängen,
 * commit zurück nach client/public/resonanzen-index.json.
 *
 * Bewusst minimal:
 *   - Keine Embedding-Berechnung (passiert beim nächsten Full-Build)
 *   - Keine related/nearDuplicates (build-time)
 *   - Nur die Pflichtfelder, damit der Eintrag in /resonanzen sichtbar wird
 *
 * Fail-soft wie der Rest des Logging-Pipelines: jeder Fehler → console.warn,
 * keine Exception, User merkt nichts.
 */
import { redactSecrets } from "./geminiHttp.js";
import { isNonFastForwardConflict } from "./resonanz-log-utils.js";

/** Fehlertext für Logs und Status-Felder, ohne Tokens/Keys. */
function errorReason(err: unknown): string {
  return redactSecrets(err instanceof Error ? err.message : String(err));
}

const GITHUB_API = "https://api.github.com";
const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? "marksen23";
const REPO_NAME  = process.env.GITHUB_REPO_NAME  ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";

const INDEX_PATH = "client/public/resonanzen-index.json";

// Korpus-Politik (Spiegel von build-resonanzen-index.ts): Endpoints, die NICHT
// in den Korpus-Index gehören. `translate` ist ein Leser-Übersetzungs-Service,
// kein denkerischer Beitrag — die MD bleibt als Archiv erhalten, landet aber
// nicht im Index/Embeddings/RAG. Default reicht; ENV muss in CI + Server gleich.
const CORPUS_EXCLUDED_ENDPOINTS = new Set(
  (process.env.CORPUS_EXCLUDED_ENDPOINTS ?? "translate").split(",").map(s => s.trim()).filter(Boolean),
);

export interface IndexEntry {
  id: string;
  ts: string;
  endpoint: string;
  anchor: string;
  nodeIds: string[];
  status: string;
  prompt: string;
  response: string;
  contextMeta: Record<string, unknown>;
  // Optional Felder, die at-ingest auch schon kennen
  echoes_of?: string[];
}

interface IndexFile {
  generatedAt: string;
  count: number;
  entries: IndexEntry[];
}

let _appendSuccessCount = 0;
let _appendFailureCount = 0;
let _lastAppend: { id: string; ts: string } | null = null;
let _lastAppendError: { ts: string; reason: string } | null = null;
// S1: separate Counter für remove + update — Live-Sync-Operations
let _mutateSuccessCount = 0;
let _mutateFailureCount = 0;
let _lastMutate: { op: "remove" | "update"; id: string; ts: string } | null = null;
let _lastMutateError: { ts: string; reason: string; op: string } | null = null;

export function getIndexUpdaterHealth() {
  return {
    appendSuccessCount: _appendSuccessCount,
    appendFailureCount: _appendFailureCount,
    lastAppend: _lastAppend,
    lastAppendError: _lastAppendError,
    mutateSuccessCount: _mutateSuccessCount,
    mutateFailureCount: _mutateFailureCount,
    lastMutate: _lastMutate,
    lastMutateError: _lastMutateError,
  };
}

// ─── Shared GitHub-IO-Helpers (S1) ───────────────────────────────────────
// Vorher: append-Logik inline. Jetzt: gemeinsame Lese/Schreib-Pfade,
// damit remove + update dieselbe SHA-Behandlung + Retry-Semantik haben.

async function fetchIndex(token: string): Promise<{ index: IndexFile; sha: string | null }> {
  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${INDEX_PATH}?ref=${REPO_BRANCH}`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "dt-index-updater",
    },
  });
  if (res.status === 404) {
    return { index: { generatedAt: new Date().toISOString(), count: 0, entries: [] }, sha: null };
  }
  if (!res.ok) {
    throw new Error(`GET index: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { index: JSON.parse(content), sha: data.sha };
}

async function putIndex(token: string, index: IndexFile, sha: string | null, message: string): Promise<"ok" | "conflict" | "error"> {
  const newContent = JSON.stringify(index, null, 2);
  const putRes = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${INDEX_PATH}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "dt-index-updater",
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(newContent, "utf-8").toString("base64"),
      branch: REPO_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (putRes.ok) return "ok";
  if (putRes.status === 409) return "conflict";
  const txt = await putRes.text().catch(() => "");
  throw new Error(`PUT index: ${putRes.status} ${putRes.statusText} — ${txt.slice(0, 150)}`);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Generischer Read-Modify-Write mit Retry-on-conflict für den live-Index.
 *
 * Holt den Index FRISCH (inkl. SHA), wendet `apply` an, schreibt zurück. Bei
 * 409 (SHA-Konflikt — ein paralleler Schreiber wie CI, Live-Append oder ein
 * anderer Bulk-Call kam zuvor) wird mit frischem SHA + neu angewandter Mutation
 * erneut versucht (mit jitter-Backoff). Das GARANTIERT, dass die Mutation
 * landet, statt sie wie vorher bei 409 still zu verwerfen — die Ursache der
 * ~50%-Ausfälle bei Bulk-Operationen (mehrere parallele PUTs holten denselben
 * SHA, nur einer gewann).
 *
 * `apply` gibt `null` zurück, wenn es nichts zu tun gibt (no-op) — dann wird
 * nicht geschrieben.
 */
async function mutateIndexWithRetry(
  token: string,
  message: string,
  apply: (index: IndexFile) => IndexFile | null,
  maxAttempts = 10,
): Promise<"ok" | "noop" | "failed"> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { index, sha } = await fetchIndex(token);
    const updated = apply(index);
    if (updated === null) return "noop";
    const result = await putIndex(token, updated, sha, message);
    if (result === "ok") return "ok";
    // conflict → frischen SHA holen + Mutation neu anwenden, nach Backoff
    await sleep(150 * (attempt + 1) + Math.floor(Math.random() * 150));
  }
  return "failed";
}

/**
 * Entfernt einen Eintrag aus dem live-Index. Wird von /api/admin/delete
 * aufgerufen, damit gelöschte Einträge SOFORT vom Frontend verschwinden
 * (nicht erst nach dem nächsten CI-Build).
 */
export async function removeFromIndex(id: string): Promise<boolean> {
  return removeManyFromIndex([id]);
}

/**
 * Entfernt mehrere Einträge in EINEM Index-Schreibvorgang (statt N parallele
 * PUTs, die um den SHA rennen). Für Bulk-Delete. Retry-on-conflict garantiert,
 * dass der Schreibvorgang landet, auch wenn parallel CI/Live-Append schreibt.
 */
export async function removeManyFromIndex(ids: string[]): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return false;
  if (ids.length === 0) return true;
  const idSet = new Set(ids);
  try {
    const res = await mutateIndexWithRetry(
      token,
      ids.length === 1 ? `index: remove ${ids[0]}` : `index: bulk remove ${ids.length} entries`,
      (index) => {
        const filtered = index.entries.filter(e => !idSet.has(e.id));
        if (filtered.length === index.entries.length) return null; // keiner drin — no-op
        return { ...index, entries: filtered, count: filtered.length };
      },
    );
    if (res === "failed") {
      _mutateFailureCount++;
      _lastMutateError = { ts: new Date().toISOString(), reason: `remove ${ids.length}: Konflikt nach Retries`, op: "remove" };
      console.error(`[indexUpdater] removeManyFromIndex EXHAUSTED retries for ${ids.length} ids`);
      return false;
    }
    _mutateSuccessCount++;
    _lastMutate = { op: "remove", id: ids.length === 1 ? ids[0] : `bulk(${ids.length})`, ts: new Date().toISOString() };
    return true;
  } catch (err) {
    _mutateFailureCount++;
    const reason = errorReason(err);
    _lastMutateError = { ts: new Date().toISOString(), reason, op: "remove" };
    console.error(`[indexUpdater] removeManyFromIndex FAILED: ${reason}`);
    return false;
  }
}

/**
 * Lädt den live-Index von GitHub (read-only). Für Auto-Kuratierung & Co.,
 * die die vom Build berechneten Scores (corpusVoiceScore, werkVoiceScore,
 * nearDuplicates, novelty, ai_score) pro Eintrag brauchen. Die Felder sind
 * im IndexEntry-Typ nicht deklariert (build-time), aber im JSON vorhanden —
 * der Aufrufer liest sie über eine eigene, reichere Sicht.
 */
export async function loadIndex(): Promise<IndexEntry[] | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  try {
    const { index } = await fetchIndex(token);
    return index.entries;
  } catch (err) {
    console.error(`[indexUpdater] loadIndex FAILED: ${errorReason(err)}`);
    return null;
  }
}

/**
 * Aktualisiert einen Eintrag im live-Index mit partial-Patch. Wird von
 * /api/admin/curate (status-Wechsel) + /api/admin/pre-score (ai_score)
 * aufgerufen.
 */
export async function updateInIndex(id: string, patch: Partial<IndexEntry> & Record<string, unknown>): Promise<boolean> {
  return updateManyInIndex([{ id, patch }]);
}

/**
 * Wendet mehrere Patches in EINEM Index-Schreibvorgang an (statt N parallele
 * PUTs, die um den SHA rennen → vorher gingen ~50% verloren). Für Bulk-Curate.
 * Retry-on-conflict garantiert, dass der Schreibvorgang landet.
 *
 * IDs, die (noch) nicht im Index stehen, werden still übersprungen (z.B.
 * brandneue Einträge vor dem Append) — kein Fehler.
 */
export async function updateManyInIndex(
  updates: { id: string; patch: Partial<IndexEntry> & Record<string, unknown> }[],
): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return false;
  if (updates.length === 0) return true;
  const patchById = new Map(updates.map(u => [u.id, u.patch]));
  try {
    let applied = 0;
    const res = await mutateIndexWithRetry(
      token,
      updates.length === 1 ? `index: update ${updates[0].id}` : `index: bulk update ${updates.length} entries`,
      (index) => {
        applied = 0;
        const newEntries = index.entries.map(e => {
          const patch = patchById.get(e.id);
          if (!patch) return e;
          applied++;
          return { ...e, ...patch } as IndexEntry;
        });
        if (applied === 0) return null; // keine ID im Index — no-op
        return { ...index, entries: newEntries };
      },
    );
    if (res === "failed") {
      _mutateFailureCount++;
      _lastMutateError = { ts: new Date().toISOString(), reason: `update ${updates.length}: Konflikt nach Retries`, op: "update" };
      console.error(`[indexUpdater] updateManyInIndex EXHAUSTED retries for ${updates.length} ids`);
      return false;
    }
    _mutateSuccessCount++;
    _lastMutate = { op: "update", id: updates.length === 1 ? updates[0].id : `bulk(${applied})`, ts: new Date().toISOString() };
    return true;
  } catch (err) {
    _mutateFailureCount++;
    const reason = errorReason(err);
    _lastMutateError = { ts: new Date().toISOString(), reason, op: "update" };
    console.error(`[indexUpdater] updateManyInIndex FAILED: ${reason}`);
    return false;
  }
}

/**
 * Hängt einen neuen Eintrag an den live resonanzen-index.json an.
 * Holt das aktuelle File (inkl. SHA für conditional PUT), parsed, fügt
 * den neuen Eintrag VORNE an (entries sind nach ts absteigend sortiert),
 * schreibt zurück.
 *
 * Returnt nichts — Erfolg/Fehler werden in den Health-Stats getrackt.
 */
export async function appendToIndex(entry: IndexEntry): Promise<void> {
  // Korpus-Politik: Leser-Service-Endpoints (translate) NICHT in den Index.
  // Das MD wurde von resonanzLog bereits geschrieben (Archiv) — wir hängen es
  // nur nicht an den live-Index an, damit es nicht in Korpus/Embeddings/RAG geht.
  if (CORPUS_EXCLUDED_ENDPOINTS.has(entry.endpoint)) return;

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    // Lokale Dev-Umgebung: nichts zu tun
    return;
  }

  const APPEND_ATTEMPTS = 5;
  try {
    for (let attempt = 0; attempt < APPEND_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(200 * attempt);
      const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${INDEX_PATH}?ref=${REPO_BRANCH}`;
      const getRes = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "dt-index-updater",
        },
      });

      let currentIndex: IndexFile = { generatedAt: new Date().toISOString(), count: 0, entries: [] };
      let sha: string | undefined;

      if (getRes.ok) {
        const data = await getRes.json();
        sha = data.sha;
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        try {
          currentIndex = JSON.parse(content);
        } catch {
          // Korrupter Index — Bail out, statt zu überschreiben.
          console.warn("[indexUpdater] current index corrupt, skipping append");
          _appendFailureCount++;
          _lastAppendError = { ts: new Date().toISOString(), reason: "current index corrupt" };
          return;
        }
      } else if (getRes.status === 404) {
        // Keinen 1-Eintrag-Index anlegen — CI baut den vollen Index.
        console.warn("[indexUpdater] no index on GitHub yet — skipping append (waiting for CI to seed)");
        _appendFailureCount++;
        _lastAppendError = { ts: new Date().toISOString(), reason: "no index on GitHub yet (gitignore fix pending?)" };
        return;
      } else {
        throw new Error(`GET index: ${getRes.status} ${getRes.statusText}`);
      }

      // Dedup: wenn der Eintrag schon im Index ist (etwa weil der CI-Workflow
      // gleichzeitig läuft), skip — kein Duplikat erzeugen.
      if (currentIndex.entries.some(e => e.id === entry.id)) {
        _appendSuccessCount++;
        _lastAppend = { id: entry.id, ts: new Date().toISOString() };
        return;
      }

      const updated: IndexFile = {
        ...currentIndex,
        count: currentIndex.entries.length + 1,
        entries: [entry, ...currentIndex.entries],
      };

      const newContent = JSON.stringify(updated, null, 2);
      const putRes = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${INDEX_PATH}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "dt-index-updater",
        },
        body: JSON.stringify({
          message: `index: append ${entry.id} (${entry.endpoint})`,
          content: Buffer.from(newContent, "utf-8").toString("base64"),
          branch: REPO_BRANCH,
          ...(sha ? { sha } : {}),
        }),
      });

      if (putRes.ok) {
        _appendSuccessCount++;
        _lastAppend = { id: entry.id, ts: new Date().toISOString() };
        if (_appendSuccessCount % 25 === 0) {
          console.info(`[indexUpdater] ${_appendSuccessCount} entries appended total`);
        }
        return;
      }

      const txt = await putRes.text().catch(() => "");
      // 409 / non-fast-forward: paralleler Snapshot hat den Branch bewegt.
      // Frischen SHA holen und denselben Eintrag erneut anwenden — nicht verwerfen.
      if (isNonFastForwardConflict(putRes.status, txt) && attempt < APPEND_ATTEMPTS - 1) {
        console.info(`[indexUpdater] non-fast-forward for ${entry.id} — retry ${attempt + 1}/${APPEND_ATTEMPTS}`);
        continue;
      }
      throw new Error(`PUT index: ${putRes.status} ${putRes.statusText} — ${txt.slice(0, 150)}`);
    }
  } catch (err) {
    _appendFailureCount++;
    const reason = errorReason(err);
    _lastAppendError = { ts: new Date().toISOString(), reason };
    console.error(`[indexUpdater] FAILED for ${entry.id}: ${reason}`);
  }
}

