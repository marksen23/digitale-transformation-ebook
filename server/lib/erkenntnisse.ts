/**
 * erkenntnisse.ts — server-persistierte „Erkenntnisse" (Erkenntnisse-Vision,
 * Phase 2). Eine Erkenntnis ist eine menschlich bestätigte Antwort auf eine
 * offene Schlussfrage, die einen neuen denkerischen Schritt vollzieht.
 *
 * Muster wie conceptNodes.ts: additive Schicht in
 * client/public/resonanzen-erkenntnisse.json, server-appendbar via GitHub-API,
 * von Netlify ausgeliefert. Kandidaten kommen aus dem Build
 * (resonanzen-erkenntnis-candidates.json); den Status „Erkenntnis" verleiht der
 * Mensch im Admin (confirm-erkenntnis). Der Build filtert bestätigte heraus.
 */
const GITHUB_API = "https://api.github.com";
const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? "marksen23";
const REPO_NAME = process.env.GITHUB_REPO_NAME ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";
const PATH = "client/public/resonanzen-erkenntnisse.json";
const WITHDRAWN_PATH = "client/public/resonanzen-erkenntnis-withdrawn.json";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/client/public`;

export interface ErkenntnisRecord {
  id: string;
  /** Der destillierte Kernsatz (KI-Entwurf, vom Menschen finalisiert). */
  kernsatz: string;
  /** Eintrag, dessen Schlussfrage die Erkenntnis beantwortet. */
  questionSourceId: string;
  /** Eintrag, der die Antwort/Erkenntnis trägt. */
  answerId: string;
  conceptAnchor: string | null;
  /** Optional: an welches Masterdokument anschlussfähig (Phase 4). */
  masterAnchor?: string | null;
  distinctness: number;
  createdAt: string;
  actor: string;
}

interface ErkenntnisseFile { generatedAt: string; erkenntnisse: ErkenntnisRecord[]; }

export interface WithdrawnFile {
  generatedAt: string;
  answerIds: string[];
  masterIds: string[];
  /** Vollständige Sätze, damit „Wiederherstellen“ sie zurücklegen kann. */
  kernsaetze: ErkenntnisRecord[];
}

function authHeaders(token: string) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "dt-erkenntnisse",
  };
}

async function fetchFile(token: string): Promise<{ file: ErkenntnisseFile; sha: string | null }> {
  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${PATH}?ref=${REPO_BRANCH}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 404) return { file: { generatedAt: new Date().toISOString(), erkenntnisse: [] }, sha: null };
  if (!res.ok) throw new Error(`GET erkenntnisse: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { file: JSON.parse(content), sha: data.sha };
}

/** IDs (answerId) der bereits bestätigten Erkenntnisse — read-only via Raw, kein Token. */
export async function loadErkenntnisAnswerIds(): Promise<Set<string>> {
  try {
    const r = await fetch(`${RAW_BASE}/resonanzen-erkenntnisse.json`);
    if (!r.ok) return new Set();
    const data = await r.json() as ErkenntnisseFile;
    return new Set((data.erkenntnisse ?? []).map(e => e.answerId));
  } catch { return new Set(); }
}

/** Persistiert eine bestätigte Erkenntnis (dedup per id) nach GitHub. */
export async function acceptErkenntnis(
  record: ErkenntnisRecord,
): Promise<{ ok: true; already?: boolean } | { ok: false; error: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: "GITHUB_TOKEN fehlt — Erkenntnis nicht persistierbar" };
  try {
    const { file, sha } = await fetchFile(token);
    if (file.erkenntnisse.some(e => e.id === record.id)) return { ok: true, already: true };
    const updated: ErkenntnisseFile = { generatedAt: new Date().toISOString(), erkenntnisse: [...file.erkenntnisse, record] };
    const putRes = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${PATH}`, {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `erkenntnisse: accept ${record.id} [${record.actor}]`,
        content: Buffer.from(JSON.stringify(updated, null, 2), "utf-8").toString("base64"),
        branch: REPO_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!putRes.ok) {
      const txt = await putRes.text().catch(() => "");
      if (putRes.status === 409) return { ok: false, error: "Schreibkonflikt (gleichzeitige Änderung) — erneut versuchen" };
      return { ok: false, error: `PUT erkenntnisse: ${putRes.status} — ${txt.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function emptyWithdrawn(): WithdrawnFile {
  return { generatedAt: new Date().toISOString(), answerIds: [], masterIds: [], kernsaetze: [] };
}

async function fetchWithdrawn(token: string): Promise<{ file: WithdrawnFile; sha: string | null }> {
  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${WITHDRAWN_PATH}?ref=${REPO_BRANCH}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 404) return { file: emptyWithdrawn(), sha: null };
  if (!res.ok) throw new Error(`GET withdrawn: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  const parsed = JSON.parse(content) as Partial<WithdrawnFile>;
  return {
    sha: data.sha,
    file: {
      generatedAt: parsed.generatedAt ?? new Date().toISOString(),
      answerIds: Array.isArray(parsed.answerIds) ? parsed.answerIds : [],
      masterIds: Array.isArray(parsed.masterIds) ? parsed.masterIds : [],
      kernsaetze: Array.isArray(parsed.kernsaetze) ? parsed.kernsaetze : [],
    },
  };
}

async function putJson(
  token: string, path: string, sha: string | null, body: unknown, message: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const putRes = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(JSON.stringify(body, null, 2) + "\n", "utf-8").toString("base64"),
      branch: REPO_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (putRes.ok) return { ok: true };
  const txt = await putRes.text().catch(() => "");
  if (putRes.status === 409) return { ok: false, error: "Schreibkonflikt (gleichzeitige Änderung) — erneut versuchen" };
  return { ok: false, error: `PUT ${path}: ${putRes.status} — ${txt.slice(0, 120)}` };
}

/** Nimmt eine automatisch veröffentlichte Erkenntnis von der Seite und sperrt die Antwort. */
export async function withdrawAutoKernsatz(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: "GITHUB_TOKEN fehlt" };
  try {
    const { file, sha } = await fetchFile(token);
    const rec = file.erkenntnisse.find(e => e.id === id);
    if (!rec) return { ok: false, error: `Erkenntnis ${id} nicht gefunden` };
    if (rec.actor !== "auto") return { ok: false, error: "Nur automatisch Veröffentlichte können hier zurückgenommen werden" };
    const next: ErkenntnisseFile = {
      generatedAt: new Date().toISOString(),
      erkenntnisse: file.erkenntnisse.filter(e => e.id !== id),
    };
    const written = await putJson(token, PATH, sha, next, `erkenntnisse: withdraw ${id}`);
    if (!written.ok) return written;
    const held = await fetchWithdrawn(token);
    if (!held.file.answerIds.includes(rec.answerId)) held.file.answerIds.push(rec.answerId);
    held.file.kernsaetze = [...held.file.kernsaetze.filter(e => e.id !== rec.id), rec];
    held.file.generatedAt = new Date().toISOString();
    return putJson(token, WITHDRAWN_PATH, held.sha, held.file, `erkenntnisse: sperre ${rec.answerId}`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Legt eine zurückgenommene Erkenntnis wieder auf die Seite und hebt die Sperre auf. */
export async function restoreAutoKernsatz(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: "GITHUB_TOKEN fehlt" };
  try {
    const held = await fetchWithdrawn(token);
    const rec = held.file.kernsaetze.find(e => e.id === id);
    if (!rec) return { ok: false, error: `Zurückgenommene Erkenntnis ${id} nicht gefunden` };
    const { file, sha } = await fetchFile(token);
    if (!file.erkenntnisse.some(e => e.id === rec.id || e.answerId === rec.answerId)) {
      const next: ErkenntnisseFile = {
        generatedAt: new Date().toISOString(),
        erkenntnisse: [...file.erkenntnisse, rec],
      };
      const written = await putJson(token, PATH, sha, next, `erkenntnisse: restore ${id}`);
      if (!written.ok) return written;
    }
    held.file.answerIds = held.file.answerIds.filter(a => a !== rec.answerId);
    held.file.kernsaetze = held.file.kernsaetze.filter(e => e.id !== rec.id);
    held.file.generatedAt = new Date().toISOString();
    return putJson(token, WITHDRAWN_PATH, held.sha, held.file, `erkenntnisse: sperre aufgehoben ${rec.answerId}`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Sperrt einen Master gegen erneutes automatisches Veröffentlichen, oder hebt die Sperre auf. */
export async function setMasterWithdrawn(
  id: string, withdrawn: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: "GITHUB_TOKEN fehlt" };
  try {
    const held = await fetchWithdrawn(token);
    const has = held.file.masterIds.includes(id);
    if (withdrawn && !has) held.file.masterIds.push(id);
    if (!withdrawn && has) held.file.masterIds = held.file.masterIds.filter(m => m !== id);
    if (withdrawn === has) return { ok: true };
    held.file.generatedAt = new Date().toISOString();
    return putJson(token, WITHDRAWN_PATH, held.sha, held.file, `erkenntnisse: master ${withdrawn ? "gesperrt" : "freigegeben"} ${id}`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
