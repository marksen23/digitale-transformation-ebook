/**
 * Lädt + tokenisiert den vom Build-Step erzeugten resonanzen-index.json
 * für die FAQ-Ansicht (/resonanzen).
 */
import { STOPWORDS_DE } from "./stopwords-de";

export interface ResonanzEntry {
  id: string;
  ts: string;
  endpoint: "chapter" | "enkidu" | "analyse" | "graph-chat" | "translate" | "path-analyse" | "passage" | "dialog";
  anchor: string;
  nodeIds: string[];
  status: "raw" | "pending" | "approved" | "published" | "rejected";
  prompt: string;
  response: string;
  contextMeta: Record<string, unknown>;
  /** Top-5 verwandte Einträge — vom Build-Step berechnet via Cosine-Similarity. */
  related?: string[];
  /**
   * Near-Duplikate (Cosine ≥0.88): Einträge, die diese Aussage im Kern
   * wiederholen. Wenn nicht leer, ist die Begegnung ein Echo einer
   * existierenden — Curator entscheidet: behalten / merge / "Variation von".
   */
  nearDuplicates?: string[];
  /**
   * Novelty-Flag: true wenn die maximale Cosine zu allen anderen Einträgen
   * < NOVELTY_THRESHOLD (Default 0.70) liegt — semantisch peripherer Eintrag.
   * Komplementär zu nearDuplicates:
   *   Echo:    nearDuplicates.length > 0  (≥0.88)
   *   Mitte:   keines der beiden Flags    (0.70–0.87)
   *   Novelty: novelty === true           (<0.70)
   * Wird im Build-Step gesetzt (scripts/build-resonanzen-index.ts).
   */
  novelty?: boolean;
  /**
   * Master-Marker: true wenn dieser Eintrag eine SYNTHESE mehrerer
   * Varianten ist (vom /api/admin/synthesize-master generiert).
   * In dem Fall sind master_of + variant_count zusätzlich gesetzt.
   * Frontend filtert die Varianten dieses Ankers aus dem Default-View
   * raus und zeigt nur den Master + "N Varianten anzeigen"-Link.
   */
  is_master?: boolean;
  /** IDs der Varianten die zur Synthese beigetragen haben. */
  master_of?: string[];
  /** Anzahl der Varianten zum Synthese-Zeitpunkt. */
  variant_count?: number;
  /**
   * Werkstreue-Score: Cosine-Similarity zum Centroid der approved/published
   * Einträge. 0–1. < 0.55 = Drift-Verdacht (off-voice / themenfremd).
   * Undefined wenn zu wenig kuratierte Einträge als Referenz vorhanden.
   */
  werkVoiceScore?: number;
  /**
   * Buchstreue-Score: max Cosine zu allen Kapitel-Embeddings des Buchtexts.
   * Statische Referenz (Buchtext ändert sich kaum), komplementär zu
   * werkVoiceScore (Centroid der kuratierten Einträge, bewegt). Ein
   * Eintrag kann hohen werkVoiceScore + niedrigen corpusVoiceScore haben:
   * stilistisch konform aber thematisch fern vom Buch.
   */
  corpusVoiceScore?: number;
  /**
   * Begriffsstreue-Score: max Cosine zu den Begriffs-Embeddings des
   * Begriffsnetzes. Dritter Anker des triangulierten Schutzwalls (Phase 5):
   * greift der Eintrag die BEGRIFFSSTRUKTUR (nicht nur den Wortlaut)?
   * conceptAnchor = nächstliegender Begriff (Anschlussstelle im Netz).
   */
  conceptVoiceScore?: number;
  conceptAnchor?: string;
  /**
   * AI-Pre-Score (Tier-1-3-Roadmap, Feature E): 1-5-Bewertung der
   * Werktreue durch Claude. Wird via /api/admin/pre-score gesetzt.
   * - 5: stilistisch indistinguishable
   * - 4: werktreu, leicht generisch
   * - 3: Form korrekt, KI-Duktus dominiert
   * - 2: themenpassend, stilfremd
   * - 1: off-topic / stilfremd
   * Erlaubt Bulk-Approve mit Schwellwert in /admin/curation.
   */
  ai_score?: 1 | 2 | 3 | 4 | 5;
  ai_score_reason?: string;
  ai_score_at?: string;
  ai_score_model?: string;
}

export interface ResonanzIndex {
  generatedAt: string;
  count: number;
  entries: ResonanzEntry[];
}

/** Lädt den Index als statisches Asset von Netlify/lokalem Dev-Server.
 *  S1: cache-bust via Timestamp-Query, damit Browser/CDN-Caches keine
 *  stale-Versionen liefern nach Admin-Mutationen. */
export async function loadResonanzenIndex(): Promise<ResonanzIndex> {
  const url = `/resonanzen-index.json?_=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Index nicht gefunden (${res.status})`);
  }
  return res.json();
}

/**
 * Lazy + cached Loader — für Komponenten, die den Index ggf. nicht brauchen.
 * Schluckt Fehler still (returnt null), damit das Begriffsnetz auch ohne
 * verfügbaren FAQ-Index funktioniert.
 *
 * S1: invalidateResonanzenIndexCache() für nach Admin-Mutationen. Plus
 * automatisches Refresh wenn das Window-Event "resonanzen-index-stale"
 * gefeuert wird.
 */
let _indexCache: ResonanzIndex | null = null;
let _indexPromise: Promise<ResonanzIndex | null> | null = null;

export function loadResonanzenIndexLazy(): Promise<ResonanzIndex | null> {
  if (_indexCache) return Promise.resolve(_indexCache);
  if (_indexPromise) return _indexPromise;
  _indexPromise = loadResonanzenIndex()
    .then(idx => {
      _indexCache = idx;
      // groupResonanzenByNode/Anchor invalidieren sich automatisch via
      // src === entries-Check beim nächsten Call (anderes Array-Identity).
      return idx;
    })
    .catch(() => null);
  return _indexPromise;
}

/** Erzwingt einen Re-Fetch beim nächsten loadResonanzenIndexLazy.
 *  Wird von Admin-Actions + dem Stale-Event aufgerufen. */
export function invalidateResonanzenIndexCache(): void {
  _indexCache = null;
  _indexPromise = null;
  // Embedding-Cache bleibt — embeddings sind invariant, ein gelöschter
  // Eintrag verschwindet einfach aus der ranking-Liste durch Index-Filter.
}

// Auto-listen auf Window-Event: jede Komponente, die einen Index-Refresh
// braucht, dispatched window.dispatchEvent(new Event("resonanzen-index-stale")).
//
// S1: zusätzlich CROSS-TAB-Sync via BroadcastChannel + storage-event-Fallback.
// Wenn der User /admin in einem Tab und /resonanzen in einem anderen offen
// hat, propagiert die Admin-Action automatisch ins andere Tab.
const STALE_EVENT = "resonanzen-index-stale";
const STALE_CHANNEL = "resonanzen-sync";
const STALE_STORAGE_KEY = "resonanzen-index-stale-at";

let _broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined") {
  window.addEventListener(STALE_EVENT, () => {
    invalidateResonanzenIndexCache();
  });

  // Cross-Tab via BroadcastChannel (modern Browsers)
  try {
    _broadcastChannel = new BroadcastChannel(STALE_CHANNEL);
    _broadcastChannel.addEventListener("message", e => {
      if (e.data?.type === "stale") {
        invalidateResonanzenIndexCache();
        // Wieder als Window-Event weiterreichen, damit Page-Listener
        // (ResonanzenPage, WerkPage, ConceptGraphPage) re-fetchen.
        window.dispatchEvent(new Event(STALE_EVENT));
      }
    });
  } catch {
    // BroadcastChannel nicht verfügbar → Fallback via storage-event unten
  }

  // Fallback für Browsers ohne BroadcastChannel: storage-event triggert
  // wenn andere Tabs in den localStorage schreiben.
  window.addEventListener("storage", e => {
    if (e.key === STALE_STORAGE_KEY) {
      invalidateResonanzenIndexCache();
      window.dispatchEvent(new Event(STALE_EVENT));
    }
  });
}

/** Sendet den Stale-Pulse intra-Tab + cross-Tab. Wird von Admin-Actions
 *  + dem PassageResonanzModal auf Erfolg aufgerufen. */
export function broadcastIndexStale(): void {
  if (typeof window === "undefined") return;
  // Lokal: Window-Event triggern (Listener im selben Tab)
  window.dispatchEvent(new Event(STALE_EVENT));
  // Cross-Tab: BroadcastChannel + storage-event-Bump
  try {
    _broadcastChannel?.postMessage({ type: "stale", ts: Date.now() });
  } catch { /* ignore */ }
  try {
    localStorage.setItem(STALE_STORAGE_KEY, String(Date.now()));
  } catch { /* ignore (private mode etc.) */ }
}

/**
 * Gruppiert Einträge nach Konzept-IDs (`nodeIds`-Feld). Map: nodeId → entries[].
 * Sortiert pro Konzept neueste zuerst. Cached intern für O(1) Lookups.
 */
let _byNodeCache: { src: ResonanzEntry[]; map: Map<string, ResonanzEntry[]> } | null = null;
export function groupResonanzenByNode(entries: ResonanzEntry[]): Map<string, ResonanzEntry[]> {
  if (_byNodeCache && _byNodeCache.src === entries) return _byNodeCache.map;
  const map = new Map<string, ResonanzEntry[]>();
  for (const e of entries) {
    for (const id of e.nodeIds) {
      const arr = map.get(id);
      if (arr) arr.push(e);
      else map.set(id, [e]);
    }
  }
  map.forEach(arr => arr.sort((a: ResonanzEntry, b: ResonanzEntry) => b.ts.localeCompare(a.ts)));
  _byNodeCache = { src: entries, map };
  return map;
}

/**
 * Gruppiert Einträge nach `anchor`-Feld (z.B. "chapter:teil7"). Map: anchor → entries[].
 * Pattern wie groupResonanzenByNode, mit eigenem Cache. Sortiert pro Anker
 * neueste zuerst.
 */
let _byAnchorCache: { src: ResonanzEntry[]; map: Map<string, ResonanzEntry[]> } | null = null;
export function groupResonanzenByAnchor(entries: ResonanzEntry[]): Map<string, ResonanzEntry[]> {
  if (_byAnchorCache && _byAnchorCache.src === entries) return _byAnchorCache.map;
  const map = new Map<string, ResonanzEntry[]>();
  for (const e of entries) {
    if (!e.anchor) continue;
    const arr = map.get(e.anchor);
    if (arr) arr.push(e);
    else map.set(e.anchor, [e]);
  }
  map.forEach(arr => arr.sort((a: ResonanzEntry, b: ResonanzEntry) => b.ts.localeCompare(a.ts)));
  _byAnchorCache = { src: entries, map };
  return map;
}

/** Lädt das Embeddings-Mapping (id → 768-dim Vektor). Lazy, einmal-Cache. */
export interface EmbeddingsIndex {
  generatedAt: string;
  embeddings: Record<string, number[]>;
}

let _embeddingsCache: EmbeddingsIndex | null = null;
let _embeddingsPromise: Promise<EmbeddingsIndex | null> | null = null;

export function loadEmbeddings(): Promise<EmbeddingsIndex | null> {
  if (_embeddingsCache) return Promise.resolve(_embeddingsCache);
  if (_embeddingsPromise) return _embeddingsPromise;
  _embeddingsPromise = fetch("/resonanzen-embeddings.json", { cache: "no-cache" })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      _embeddingsCache = data;
      return data;
    })
    .catch(() => null);
  return _embeddingsPromise;
}

/** Holt das Query-Embedding via Server-Endpoint. */
export async function fetchQueryEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.embedding) ? data.embedding : null;
  } catch {
    return null;
  }
}

/** Cosine-Similarity zwischen zwei gleichlangen Vektoren. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Top-K ähnlichste Einträge für ein Query-Embedding. */
export function rankBySimilarity(
  queryVec: number[],
  entries: ResonanzEntry[],
  embeddings: Record<string, number[]>,
  topK = 10,
): Array<{ entry: ResonanzEntry; score: number }> {
  const scored: Array<{ entry: ResonanzEntry; score: number }> = [];
  for (const e of entries) {
    const v = embeddings[e.id];
    if (!v) continue;
    scored.push({ entry: e, score: cosineSimilarity(queryVec, v) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/** Endpoint-Kategorie → menschenlesbares Label */
export const ENDPOINT_LABEL: Record<ResonanzEntry["endpoint"], string> = {
  "chapter":      "Kapitel-Frage",
  "enkidu":       "Begegnung",
  "analyse":      "Spannungs-/Cluster-Analyse",
  "graph-chat":   "Begriffsnetz-Dialog",
  "translate":    "Übersetzung",
  "path-analyse": "Pfad-Analyse",
  "passage":      "Passagen-Resonanz",
  "dialog":       "Dialog-Festhaltung",
};

/**
 * Endpoint-Farbcodierung (Design-Tightening D1).
 *
 * Vorher: 8 distinkte Hues — visuelles Konfetti, Endpoint-Unterscheidung
 * war keine echte Information sondern Stilrauschen.
 *
 * Jetzt: kollabiert auf 2 SEMANTIC-Klassen.
 *   - WERK (amber): chapter, passage — alles am Werktext verankert
 *   - ARBEIT (cyan): alle KI-Endpoints — analyse, path-analyse,
 *     graph-chat, dialog, enkidu, translate
 *
 * Endpoint-Unterscheidung wandert in die Typografie (ENDPOINT_LABEL).
 */
export const ENDPOINT_COLOR: Record<ResonanzEntry["endpoint"], string> = {
  "chapter":      "#f59e0b",  // WERK
  "passage":      "#f59e0b",  // WERK
  "enkidu":       "#5aacb8",  // ARBEIT
  "analyse":      "#5aacb8",  // ARBEIT
  "graph-chat":   "#5aacb8",  // ARBEIT
  "translate":    "#5aacb8",  // ARBEIT
  "path-analyse": "#5aacb8",  // ARBEIT
  "dialog":       "#5aacb8",  // ARBEIT
};

// ─── Wortwolken-Aggregation ─────────────────────────────────────────────────
// Erzeugt eine kollektive Wortwolke aus allen User-Anfragen (`prompt`-Feld)
// im Korpus. Heißt: was die Leserschaft *fragt*, nicht was die KI antwortet.

export interface KeywordEntry {
  word: string;
  count: number;
  score: number;
}

const DOMAIN_BOOSTS: Record<string, number> = {
  resonanz: 2.0, resonanzvernunft: 3.5, vernunft: 1.8, zwischen: 2.5, dasein: 2.5,
  begegnung: 2.0, antwort: 1.6, frage: 1.5, denken: 1.5, sprache: 1.8,
  schweigen: 2.0, stille: 2.0, mensch: 1.4, maschine: 1.6, digital: 1.5,
  algorithmus: 1.8, mythos: 2.0, aufklärung: 1.8, kant: 1.5, gilgamesch: 1.8,
  enkidu: 1.8, kairos: 2.2, geviert: 2.0, antlitz: 2.2, anders: 1.5,
  ich: 1.0, du: 1.0, selbst: 1.5, welt: 1.5, freiheit: 1.7, sinn: 1.7,
  wahrheit: 1.6, paradox: 2.0, widerspruch: 1.7, spannung: 1.7,
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zäöüß\s-]/g, " ")
    .split(/\s+/)
    .map(w => w.replace(/^-+|-+$/g, ""))
    .filter(w => w.length >= 4)
    .filter(w => !STOPWORDS_DE.has(w));
}

/**
 * Aggregiert die User-Anfragen aller Einträge zu einer Wortwolke.
 * Default: nimmt nur Einträge, die nicht status='raw' sind (= geprüft) —
 * wenn der Korpus noch nicht kuratiert ist, fall-back auf alle.
 */
export function extractCorpusKeywords(
  entries: ResonanzEntry[],
  topN = 60,
): KeywordEntry[] {
  if (entries.length === 0) return [];
  const freq: Record<string, number> = {};
  for (const e of entries) {
    const tokens = tokenize(e.prompt);
    for (const tok of tokens) {
      freq[tok] = (freq[tok] ?? 0) + 1;
    }
  }
  const result: KeywordEntry[] = Object.entries(freq)
    .filter(([, count]) => count >= 2)
    .map(([word, count]) => ({
      word,
      count,
      score: count * (DOMAIN_BOOSTS[word] ?? 1.0),
    }));
  result.sort((a, b) => b.score - a.score);
  return result.slice(0, topN);
}
