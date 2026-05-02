/**
 * Lädt + tokenisiert den vom Build-Step erzeugten resonanzen-index.json
 * für die FAQ-Ansicht (/resonanzen).
 */
import { STOPWORDS_DE } from "./stopwords-de";

export interface ResonanzEntry {
  id: string;
  ts: string;
  endpoint: "chapter" | "enkidu" | "analyse" | "graph-chat" | "translate" | "path-analyse";
  anchor: string;
  nodeIds: string[];
  status: "raw" | "pending" | "approved" | "published";
  prompt: string;
  response: string;
  contextMeta: Record<string, unknown>;
  /** Top-5 verwandte Einträge — vom Build-Step berechnet via Cosine-Similarity. */
  related?: string[];
}

export interface ResonanzIndex {
  generatedAt: string;
  count: number;
  entries: ResonanzEntry[];
}

/** Lädt den Index als statisches Asset von Netlify/lokalem Dev-Server. */
export async function loadResonanzenIndex(): Promise<ResonanzIndex> {
  const res = await fetch("/resonanzen-index.json", { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`Index nicht gefunden (${res.status})`);
  }
  return res.json();
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
  _embeddingsPromise = fetch("/resonanzen-embeddings.json", { cache: "force-cache" })
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
};

export const ENDPOINT_COLOR: Record<ResonanzEntry["endpoint"], string> = {
  "chapter":      "#c4a882",  // accent
  "enkidu":       "#9a7e5a",
  "analyse":      "#5aacb8",
  "graph-chat":   "#7ab898",
  "translate":    "#c89870",
  "path-analyse": "#7eb8c8",
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
