/**
 * embeddingClient.ts — gemeinsamer Gemini-Embedding-Client mit Multi-Key-Failover.
 *
 * EINE Quelle der Wahrheit für Embeddings: build-resonanzen-index.ts,
 * build-werk-chunks.ts, build-search-index.ts, echoDetector.ts, werkRetrieval.ts
 * und /api/embed importieren alle von hier.
 *
 * Verwendet Gemini gemini-embedding-001 (3072-dim Matryoshka) — gleiche
 * Modell-Wahl wie der Korpus-Index, sonst wären die Cosine-Werte nicht
 * vergleichbar. Modell-Name aus ENV überschreibbar (GEMINI_EMBED_MODEL).
 *
 * RESILIENZ (Multi-Key-Failover, vektorkompatibel):
 *   Mehrere API-Keys (selbes Modell → selber Vektorraum) werden der Reihe
 *   nach versucht. Bei Billing-Block (403 dunning/PERMISSION_DENIED) oder
 *   Auth-Fehler (401) wird sofort der nächste Key probiert — kein Retry,
 *   weil derselbe Key dasselbe Resultat liefert. Bei transienten Fehlern
 *   (5xx, Netzwerk) und Quota (429) wird mit exponential backoff am selben
 *   Key wiederholt, bevor rotiert wird.
 *
 *   Keys aus (in dieser Reihenfolge dedupliziert):
 *     GEMINI_API_KEYS  (Komma-Liste)
 *     GEMINI_API_KEY   (primär)
 *     GEMINI_API_KEY_FALLBACK
 *
 *   Ohne Fallback-Vars ist das Verhalten identisch zu vorher (Single-Key).
 *
 * Historie: bis ~04/2026 text-embedding-004 (768-dim), von Google entfernt
 * (404). Umstellung auf gemini-embedding-001 (3072-dim).
 */

const GEMINI_EMBED_MODEL = (process.env.GEMINI_EMBED_MODEL ?? "").trim() || "gemini-embedding-001";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:embedContent`;

export type EmbedErrorClass = "billing" | "quota" | "auth" | "transient" | "ok";

/**
 * Liest alle verfügbaren API-Keys in Versuchsreihenfolge:
 *   GEMINI_API_KEYS (Komma-Liste) → GEMINI_API_KEY → GEMINI_API_KEY_FALLBACK
 * Trimmt, dedupliziert, entfernt leere. Reihenfolge bleibt stabil.
 */
export function getKeys(): string[] {
  const raw: string[] = [];
  const list = (process.env.GEMINI_API_KEYS ?? "").split(",");
  for (const k of list) raw.push(k);
  raw.push(process.env.GEMINI_API_KEY ?? "");
  raw.push(process.env.GEMINI_API_KEY_FALLBACK ?? "");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    const t = k.trim();
    if (t && !seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out;
}

/**
 * Klassifiziert einen Gemini-Fehler. "billing" = GCP-Projekt zahlungsgesperrt
 * (403 + dunning/PERMISSION_DENIED) → Key wechseln, nicht retryen. "auth" =
 * Key ungültig (401/403 ohne billing-Marker) → ebenfalls Key wechseln.
 * "quota" (429) + "transient" (5xx/Netzwerk) → am selben Key retryen.
 */
export function classifyError(status: number, body: string): EmbedErrorClass {
  if (status === 0) return "transient";  // Netzwerk-Throw
  if (status === 429) return "quota";
  if (status >= 500) return "transient";
  if (status === 403) {
    return /dunning|PERMISSION_DENIED|billing/i.test(body) ? "billing" : "auth";
  }
  if (status === 401) return "auth";
  // 400 ist normalerweise transient (Bad Request), ABER Gemini gibt für einen
  // ungültigen Key ebenfalls 400 mit API_KEY_INVALID/INVALID_ARGUMENT zurück —
  // das ist ein Auth-Fehler (Key tot → rotieren, nicht retryen).
  if (status === 400 && /API_KEY_INVALID|api key not valid/i.test(body)) return "auth";
  return "transient";
}

// Diagnose-Counter: erste N Fehler ausführlich loggen, danach silent.
let _embedFailLogged = 0;
const EMBED_FAIL_LOG_LIMIT = 6;

// Start-Offset über Calls hinweg: hat ein Key zuletzt funktioniert, beginnen
// wir dort, statt jeden Call am toten primären Key zu verschwenden.
let _lastGoodKeyIndex = 0;

interface FetchResult {
  values: number[] | null;
  cls: EmbedErrorClass;
}

/** Ein einzelner embedContent-Call mit einem konkreten Key. */
async function callOnce(apiKey: string, text: string): Promise<FetchResult> {
  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // gemini-embedding-001 verlangt das model-Feld zusätzlich zur URL.
        model: `models/${GEMINI_EMBED_MODEL}`,
        content: { parts: [{ text: text.slice(0, 8000) }] },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "(no body)");
      const cls = classifyError(res.status, body);
      if (_embedFailLogged < EMBED_FAIL_LOG_LIMIT) {
        _embedFailLogged++;
        console.error(`[fetchEmbedding] ${res.status} ${res.statusText} [${cls}]: ${body.slice(0, 300)}`);
      }
      return { values: null, cls };
    }
    const data = await res.json();
    if (!Array.isArray(data.embedding?.values)) {
      if (_embedFailLogged < EMBED_FAIL_LOG_LIMIT) {
        _embedFailLogged++;
        console.error(`[fetchEmbedding] unexpected response shape: ${JSON.stringify(data).slice(0, 300)}`);
      }
      return { values: null, cls: "transient" };
    }
    return { values: data.embedding.values, cls: "ok" };
  } catch (err) {
    if (_embedFailLogged < EMBED_FAIL_LOG_LIMIT) {
      _embedFailLogged++;
      console.error(`[fetchEmbedding] network: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { values: null, cls: "transient" };
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Erzeugt ein Embedding für `text` via Gemini, mit Multi-Key-Failover.
 *
 * Strategie pro Key:
 *   - transient/quota → exponential backoff (250ms·2^n) bis maxRetries, dann nächster Key
 *   - billing/auth    → kein Retry, sofort nächster Key
 *   - ok              → Vektor zurück, _lastGoodKeyIndex merken
 *
 * Returnt null bei Totalausfall aller Keys. Wirft nie.
 *
 * @param opts.maxRetries Wiederholungen pro Key bei transient/quota (Default 2).
 *   Scripts setzen höher (3), der Server knapper (2, wegen Request-Timeout).
 */
export async function fetchEmbedding(
  text: string,
  opts: { maxRetries?: number } = {},
): Promise<number[] | null> {
  const keys = getKeys();
  if (keys.length === 0) return null;
  const maxRetries = opts.maxRetries ?? 2;

  // Rotiere die Key-Reihenfolge so, dass der zuletzt funktionierende zuerst kommt.
  const start = _lastGoodKeyIndex % keys.length;
  const order = keys.map((_, i) => keys[(start + i) % keys.length]);

  for (let ki = 0; ki < order.length; ki++) {
    const apiKey = order[ki];
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const { values, cls } = await callOnce(apiKey, text);
      if (cls === "ok" && values) {
        _lastGoodKeyIndex = (start + ki) % keys.length;
        return values;
      }
      if (cls === "billing" || cls === "auth") break;  // Key tot — nicht retryen
      // transient/quota: backoff und nochmal, solange Retries übrig
      if (attempt < maxRetries) await sleep(250 * Math.pow(2, attempt));
    }
    // nächster Key
    if (ki < order.length - 1 && _embedFailLogged <= EMBED_FAIL_LOG_LIMIT) {
      console.error(`[fetchEmbedding] Key #${(start + ki) % keys.length} erschöpft — rotiere zu nächstem`);
    }
  }
  return null;
}

export interface EmbedProbe {
  /** true wenn mindestens ein Key ein Embedding liefert. */
  ok: boolean;
  /** Anzahl konfigurierter Keys (getKeys().length). */
  keysAvailable: number;
  /** Index des funktionierenden Keys, oder -1. */
  workingKeyIndex: number;
  /** Klassifikation des ERSTEN Keys (für Diagnose, auch bei Erfolg eines späteren). */
  primaryClass: EmbedErrorClass;
  /** Dimension des gelieferten Vektors (zur Modell-Konsistenzprüfung), oder 0. */
  dim: number;
}

/**
 * Diagnose-Probe für /api/health: versucht ein Mini-Embedding pro Key (ohne
 * Retry, ohne Backoff — schnell). Exponiert die Fehler-Klassifikation, die
 * fetchEmbedding intern verschluckt, sodass das Health-Dashboard zwischen
 * Billing-Block / Auth / Quota / transient unterscheiden kann.
 */
export async function probeEmbedding(): Promise<EmbedProbe> {
  const keys = getKeys();
  const probe: EmbedProbe = {
    ok: false, keysAvailable: keys.length, workingKeyIndex: -1,
    primaryClass: "ok", dim: 0,
  };
  if (keys.length === 0) return probe;
  for (let i = 0; i < keys.length; i++) {
    const { values, cls } = await callOnce(keys[i], "probe");
    if (i === 0) probe.primaryClass = cls;
    if (cls === "ok" && values) {
      probe.ok = true;
      probe.workingKeyIndex = i;
      probe.dim = values.length;
      return probe;
    }
  }
  return probe;
}

/**
 * Cosine-Ähnlichkeit zweier gleich-dimensionierter Vektoren. 0 bei
 * Null-Norm (vermeidet NaN).
 */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
