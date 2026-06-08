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
const GITHUB_API = "https://api.github.com";
const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? "marksen23";
const REPO_NAME  = process.env.GITHUB_REPO_NAME  ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";

const INDEX_PATH = "client/public/resonanzen-index.json";

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

/**
 * Entfernt einen Eintrag aus dem live-Index. Wird von /api/admin/delete
 * aufgerufen, damit gelöschte Einträge SOFORT vom Frontend verschwinden
 * (nicht erst nach dem nächsten CI-Build).
 */
export async function removeFromIndex(id: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;
  try {
    const { index, sha } = await fetchIndex(token);
    const before = index.entries.length;
    const filtered = index.entries.filter(e => e.id !== id);
    if (filtered.length === before) {
      // ID nicht im Index — no-op, kein Fehler (z.B. wenn CI schon weg)
      _mutateSuccessCount++;
      _lastMutate = { op: "remove", id, ts: new Date().toISOString() };
      return;
    }
    const updated: IndexFile = { ...index, entries: filtered, count: filtered.length };
    const result = await putIndex(token, updated, sha, `index: remove ${id}`);
    if (result === "conflict") {
      console.info(`[indexUpdater] remove SHA-conflict ${id} — CI may have raced, skipping`);
    }
    _mutateSuccessCount++;
    _lastMutate = { op: "remove", id, ts: new Date().toISOString() };
  } catch (err) {
    _mutateFailureCount++;
    const reason = err instanceof Error ? err.message : String(err);
    _lastMutateError = { ts: new Date().toISOString(), reason, op: "remove" };
    console.error(`[indexUpdater] removeFromIndex FAILED for ${id}: ${reason}`);
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
    console.error(`[indexUpdater] loadIndex FAILED: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * Aktualisiert einen Eintrag im live-Index mit partial-Patch. Wird von
 * /api/admin/curate (status-Wechsel) + /api/admin/pre-score (ai_score)
 * aufgerufen.
 */
export async function updateInIndex(id: string, patch: Partial<IndexEntry> & Record<string, unknown>): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;
  try {
    const { index, sha } = await fetchIndex(token);
    const i = index.entries.findIndex(e => e.id === id);
    if (i === -1) {
      // ID nicht im Index — z.B. brandneuer Eintrag, der noch nicht
      // appended wurde. No-op, kein Fehler.
      _mutateSuccessCount++;
      _lastMutate = { op: "update", id, ts: new Date().toISOString() };
      return;
    }
    const newEntries = [...index.entries];
    newEntries[i] = { ...newEntries[i], ...patch } as IndexEntry;
    const updated: IndexFile = { ...index, entries: newEntries };
    const result = await putIndex(token, updated, sha, `index: update ${id}`);
    if (result === "conflict") {
      console.info(`[indexUpdater] update SHA-conflict ${id} — CI may have raced, skipping`);
    }
    _mutateSuccessCount++;
    _lastMutate = { op: "update", id, ts: new Date().toISOString() };
  } catch (err) {
    _mutateFailureCount++;
    const reason = err instanceof Error ? err.message : String(err);
    _lastMutateError = { ts: new Date().toISOString(), reason, op: "update" };
    console.error(`[indexUpdater] updateInIndex FAILED for ${id}: ${reason}`);
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
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    // Lokale Dev-Umgebung: nichts zu tun
    return;
  }

  try {
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
        // Mit fehlerhaftem Inhalt fortzufahren würde den ganzen Korpus
        // mit einem 1-Entry-File ersetzen — passiert in der Praxis nicht
        // ohne Eingriff. Wenn doch: lieber CI das vollständig neu bauen
        // lassen als hier zu raten.
        console.warn("[indexUpdater] current index corrupt, skipping append");
        _appendFailureCount++;
        _lastAppendError = { ts: new Date().toISOString(), reason: "current index corrupt" };
        return;
      }
    } else if (getRes.status === 404) {
      // Index existiert NICHT auf GitHub. Das ist normalerweise so, weil
      // client/public/resonanzen-index.json historisch in .gitignore stand
      // (lokales Build-Artefakt). Mit dem .gitignore-Fix wird ein commited
      // Index erwartet. Wenn er trotzdem fehlt: KEINEN Fresh-1-Entry-Index
      // anlegen — das würde den Live-Index auf der Site nicht ersetzen
      // (die Site liest aus dem Netlify-Build), aber bei späteren Builds
      // sähe es aus, als ob 118 Einträge plötzlich auf 1 geschrumpft sind.
      // Stattdessen: skip mit Fehler-Log. CI baut den vollen Index neu.
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

    // Neuer Eintrag vorne anfügen (ts-absteigend Sortierung beibehalten),
    // count aktualisieren, generatedAt nochnicht ändern (das markiert
    // vollständige Builds).
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

    if (!putRes.ok) {
      const txt = await putRes.text().catch(() => "");
      // 409 = SHA conflict → jemand anders hat zwischendurch geschrieben
      // (z.B. CI-Workflow). Das ist OK — der nächste Append wird den
      // aktuellen Stand sehen.
      if (putRes.status === 409) {
        console.info(`[indexUpdater] SHA conflict for ${entry.id} — likely concurrent CI write, skipping`);
        _appendSuccessCount++;
        _lastAppend = { id: entry.id, ts: new Date().toISOString() };
        return;
      }
      throw new Error(`PUT index: ${putRes.status} ${putRes.statusText} — ${txt.slice(0, 150)}`);
    }

    _appendSuccessCount++;
    _lastAppend = { id: entry.id, ts: new Date().toISOString() };
    if (_appendSuccessCount % 25 === 0) {
      console.info(`[indexUpdater] ${_appendSuccessCount} entries appended total`);
    }
  } catch (err) {
    _appendFailureCount++;
    const reason = err instanceof Error ? err.message : String(err);
    _lastAppendError = { ts: new Date().toISOString(), reason };
    console.error(`[indexUpdater] FAILED for ${entry.id}: ${reason}`);
  }
}

