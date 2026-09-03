/**
 * adminConfig.ts — Git-persistierte Overrides für Kuratierungs-Schwellenwerte
 * und KI-Backend-Wahl, editierbar über /admin/settings.
 *
 * Bisher waren AUTO_CURATE_*, CONCEPT_NEW_*, PRESCORE_*, SYNTHESIS_* reine
 * Env-Vars — ohne UI-Sichtbarkeit oder Editierbarkeit, ein Render-Redeploy
 * nötig, um sie zu ändern. Diese Datei liefert Overrides aus
 * content/admin-config.json (GitHub, gleiche IO-Semantik wie conceptEdges.ts)
 * additiv über den Env-Defaults — nichts überschreiben, nur überlagern.
 *
 * Lesen: TTL-Cache (60s) aus raw.githubusercontent.com (kein Token nötig,
 * analog rawAssets.ts). Schreiben: GitHub Contents API mit Retry-on-409
 * (analog conceptEdges.ts), danach sofortiger In-Memory-Fast-Path — eine
 * Speicherung wirkt sofort, ohne auf den TTL-Ablauf zu warten (raw.git kann
 * Sekunden bis Minuten hinterherhinken).
 *
 * Bewusst NICHT im Umfang: CONCEPT_CAND_*, QUESTIONS_ANSWER_SIM,
 * ERKENNTNIS_CAND_DISTINCT_MIN — die werden ausschließlich von
 * scripts/build-resonanzen-index.ts zur CI-Zeit gelesen, nicht vom
 * Express-Server. Eine Override-Datei hier hätte keine Wirkung, ohne auch
 * den CI-Skript anzufassen — bewusst für einen späteren Pass verschoben.
 */

const GITHUB_API = "https://api.github.com";
const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? "marksen23";
const REPO_NAME = process.env.GITHUB_REPO_NAME ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";
const CONFIG_PATH = "content/admin-config.json";
const RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${CONFIG_PATH}`;
const TTL_MS = 60_000;

export type ConfigValue = number | string;

interface AdminConfigFile {
  v: 1;
  updatedAt: string;
  updatedBy: string;
  values: Record<string, ConfigValue>;
}

export interface ConfigFieldDef {
  key: string;
  label: string;
  group: string;
  type: "number" | "enum";
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  default: ConfigValue;
}

// Allow-Liste — nur diese Keys dürfen über POST /api/admin/config gesetzt
// werden. `key` ist zugleich der Env-Var-Name (AUTO_CURATE_AI_MIN etc.),
// damit Override und Env-Default exakt dasselbe Feld meinen.
export const CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: "AUTO_CURATE_AI_MIN", label: "AI-Score min. (Freigabe)", group: "Auto-Kuratierung", type: "number", min: 1, max: 5, step: 0.5, default: 4 },
  { key: "AUTO_CURATE_CORPUS_MIN", label: "Korpus-Stimme min. (Freigabe)", group: "Auto-Kuratierung", type: "number", min: 0, max: 1, step: 0.01, default: 0.55 },
  { key: "AUTO_CURATE_AI_REJECT", label: "AI-Score max. (Ablehnung)", group: "Auto-Kuratierung", type: "number", min: 1, max: 5, step: 0.5, default: 2 },
  { key: "AUTO_CURATE_CORPUS_REJECT", label: "Korpus-Stimme max. (Ablehnung)", group: "Auto-Kuratierung", type: "number", min: 0, max: 1, step: 0.01, default: 0.30 },
  { key: "AUTO_CURATE_WERK_MIN", label: "Werk-Stimme min. (Freigabe)", group: "Auto-Kuratierung", type: "number", min: 0, max: 1, step: 0.01, default: 0.55 },
  { key: "AUTO_CURATE_CONCEPT_MIN", label: "Begriffs-Stimme min. (Freigabe)", group: "Auto-Kuratierung", type: "number", min: 0, max: 1, step: 0.01, default: 0.65 },
  { key: "AUTO_CURATE_CONCEPT_REJECT", label: "Begriffs-Stimme max. (Ablehnung)", group: "Auto-Kuratierung", type: "number", min: 0, max: 1, step: 0.01, default: 0.62 },
  { key: "CONCEPT_NEW_DISTINCT_MIN", label: "Distinktheit min.", group: "Neue Begriffe", type: "number", min: 0, max: 1, step: 0.01, default: 0.10 },
  { key: "CONCEPT_NEW_EVIDENCE_SIM", label: "Evidenz-Ähnlichkeit min.", group: "Neue Begriffe", type: "number", min: 0, max: 1, step: 0.01, default: 0.70 },
  { key: "CONCEPT_NEW_EVIDENCE_MIN", label: "Evidenz-Belege min.", group: "Neue Begriffe", type: "number", min: 0, max: 10, step: 1, default: 1 },
  { key: "PRESCORE_BACKEND", label: "Pre-Score-Backend", group: "KI-Backends", type: "enum", options: ["gemini", "claude"], default: "gemini" },
  { key: "PRESCORE_MODEL", label: "Pre-Score-Modell (Gemini)", group: "KI-Backends", type: "enum", options: ["gemini-2.5-pro", "gemini-2.5-flash"], default: "gemini-2.5-pro" },
  { key: "SYNTHESIS_BACKEND", label: "Synthese-Backend", group: "KI-Backends", type: "enum", options: ["gemini", "claude"], default: "gemini" },
  { key: "SYNTHESIS_MODEL", label: "Synthese-Modell (Gemini)", group: "KI-Backends", type: "enum", options: ["gemini-2.5-pro", "gemini-2.5-flash"], default: "gemini-2.5-pro" },
];
const FIELD_BY_KEY = new Map(CONFIG_FIELDS.map(f => [f.key, f]));

function authHeaders(token: string) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "dt-admin-config",
  };
}

let _cache: { file: AdminConfigFile; fetchedAt: number } | null = null;

async function fetchRaw(): Promise<AdminConfigFile | null> {
  try {
    const res = await fetch(RAW_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return await res.json() as AdminConfigFile;
  } catch { return null; }
}

/** Liefert die aktuellen Overrides (nur gesetzte Keys, additiv über Env-Defaults). */
export async function getConfigOverrides(): Promise<Record<string, ConfigValue>> {
  const now = Date.now();
  if (_cache && now - _cache.fetchedAt < TTL_MS) return _cache.file.values;
  const file = await fetchRaw();
  if (file) {
    _cache = { file, fetchedAt: now };
    return file.values;
  }
  return _cache?.file.values ?? {};
}

function numOverride(overrides: Record<string, ConfigValue>, key: string, def: number): number {
  const ov = overrides[key];
  if (typeof ov === "number" && Number.isFinite(ov)) return ov;
  const envVal = process.env[key];
  return envVal !== undefined ? parseFloat(envVal) : def;
}

function strOverride(overrides: Record<string, ConfigValue>, key: string, def: string): string {
  const ov = overrides[key];
  if (typeof ov === "string" && ov.trim()) return ov;
  return process.env[key] ?? def;
}

export interface AutoCurateThresholds {
  aiMin: number; corpusMin: number; aiReject: number; corpusReject: number;
  werkMin: number; conceptMin: number; conceptReject: number;
}
export async function resolveAutoCurateConfig(): Promise<AutoCurateThresholds> {
  const o = await getConfigOverrides();
  return {
    aiMin: numOverride(o, "AUTO_CURATE_AI_MIN", 4),
    corpusMin: numOverride(o, "AUTO_CURATE_CORPUS_MIN", 0.55),
    aiReject: numOverride(o, "AUTO_CURATE_AI_REJECT", 2),
    corpusReject: numOverride(o, "AUTO_CURATE_CORPUS_REJECT", 0.30),
    werkMin: numOverride(o, "AUTO_CURATE_WERK_MIN", 0.55),
    conceptMin: numOverride(o, "AUTO_CURATE_CONCEPT_MIN", 0.65),
    conceptReject: numOverride(o, "AUTO_CURATE_CONCEPT_REJECT", 0.62),
  };
}

export interface ConceptNewThresholds { distinctMin: number; evidenceSim: number; evidenceMin: number }
export async function resolveConceptNewConfig(): Promise<ConceptNewThresholds> {
  const o = await getConfigOverrides();
  return {
    distinctMin: numOverride(o, "CONCEPT_NEW_DISTINCT_MIN", 0.10),
    evidenceSim: numOverride(o, "CONCEPT_NEW_EVIDENCE_SIM", 0.70),
    evidenceMin: numOverride(o, "CONCEPT_NEW_EVIDENCE_MIN", 1),
  };
}

export interface LlmBackendConfig { backend: string; model: string }
export async function resolvePrescoreConfig(): Promise<LlmBackendConfig> {
  const o = await getConfigOverrides();
  return { backend: strOverride(o, "PRESCORE_BACKEND", "gemini"), model: strOverride(o, "PRESCORE_MODEL", "gemini-2.5-pro") };
}
export async function resolveSynthesisConfig(): Promise<LlmBackendConfig> {
  const o = await getConfigOverrides();
  return { backend: strOverride(o, "SYNTHESIS_BACKEND", "gemini"), model: strOverride(o, "SYNTHESIS_MODEL", "gemini-2.5-pro") };
}

export interface ConfigFieldResponse extends ConfigFieldDef {
  value: ConfigValue;
  source: "override" | "default";
  envDefault: ConfigValue;
}

/** Baut die vollständige Feldliste für GET /api/admin/config. */
export async function buildConfigFields(): Promise<{ fields: ConfigFieldResponse[]; updatedAt: string | null }> {
  const o = await getConfigOverrides();
  const fields: ConfigFieldResponse[] = CONFIG_FIELDS.map(def => {
    const envDefault: ConfigValue = def.type === "number"
      ? (process.env[def.key] !== undefined ? parseFloat(process.env[def.key]!) : def.default)
      : (process.env[def.key] ?? def.default);
    const hasOverride = Object.prototype.hasOwnProperty.call(o, def.key);
    return {
      ...def,
      value: hasOverride ? o[def.key] : envDefault,
      source: hasOverride ? "override" : "default",
      envDefault,
    };
  });
  return { fields, updatedAt: _cache?.file.updatedAt ?? null };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchViaApi(token: string): Promise<{ file: AdminConfigFile; sha: string | null }> {
  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONFIG_PATH}?ref=${REPO_BRANCH}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 404) {
    return { file: { v: 1, updatedAt: new Date().toISOString(), updatedBy: "", values: {} }, sha: null };
  }
  if (!res.ok) throw new Error(`GET admin-config: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { file: JSON.parse(content), sha: data.sha };
}

/** Validiert + persistiert ein Patch von Config-Werten. Nur Allow-Listed
 *  Keys, mit Typ-/Wertebereichsprüfung. Retry-on-409 analog conceptEdges.ts. */
export async function setConfigValues(
  patch: Record<string, unknown>,
  actor: string,
): Promise<{ ok: true; updatedKeys: string[]; values: Record<string, ConfigValue> } | { ok: false; error: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: "GITHUB_TOKEN fehlt — Einstellungen nicht persistierbar" };

  const clean: Record<string, ConfigValue> = {};
  for (const [key, raw] of Object.entries(patch)) {
    const def = FIELD_BY_KEY.get(key);
    if (!def) return { ok: false, error: `Unbekannter Schlüssel: ${key}` };
    if (def.type === "number") {
      const n = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (!Number.isFinite(n)) return { ok: false, error: `${key}: keine gültige Zahl` };
      if (def.min !== undefined && n < def.min) return { ok: false, error: `${key}: muss ≥ ${def.min} sein` };
      if (def.max !== undefined && n > def.max) return { ok: false, error: `${key}: muss ≤ ${def.max} sein` };
      clean[key] = n;
    } else {
      const s = String(raw);
      if (!def.options?.includes(s)) return { ok: false, error: `${key}: muss eines von ${def.options?.join("|")} sein` };
      clean[key] = s;
    }
  }
  if (Object.keys(clean).length === 0) return { ok: false, error: "keine Werte übergeben" };

  const MAX_ATTEMPTS = 8;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const { file, sha } = await fetchViaApi(token);
      const updated: AdminConfigFile = {
        v: 1, updatedAt: new Date().toISOString(), updatedBy: actor,
        values: { ...file.values, ...clean },
      };
      const putRes = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONFIG_PATH}`, {
        method: "PUT",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `admin-config: update ${Object.keys(clean).join(", ")} [${actor}]`,
          content: Buffer.from(JSON.stringify(updated, null, 2), "utf-8").toString("base64"),
          branch: REPO_BRANCH,
          ...(sha ? { sha } : {}),
        }),
      });
      if (putRes.ok) {
        // Fast-Path: sofort sichtbar, ohne auf TTL/raw-Propagation zu warten.
        _cache = { file: updated, fetchedAt: Date.now() };
        return { ok: true, updatedKeys: Object.keys(clean), values: updated.values };
      }
      if (putRes.status === 409) {
        await sleep(150 * (attempt + 1) + Math.floor(Math.random() * 150));
        continue;
      }
      const txt = await putRes.text().catch(() => "");
      return { ok: false, error: `PUT admin-config: ${putRes.status} — ${txt.slice(0, 120)}` };
    } catch (err) {
      if (attempt === MAX_ATTEMPTS - 1) return { ok: false, error: err instanceof Error ? err.message : String(err) };
      await sleep(150 * (attempt + 1));
    }
  }
  return { ok: false, error: `Schreibkonflikt nach ${MAX_ATTEMPTS} Versuchen — bitte erneut versuchen` };
}
