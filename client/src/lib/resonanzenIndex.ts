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
