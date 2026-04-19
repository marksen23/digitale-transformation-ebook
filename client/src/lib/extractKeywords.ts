import { STOPWORDS_DE } from "./stopwords-de";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  date: string;
  preview: string;
  messages: { role: "user" | "assistant"; content: string; error?: boolean }[];
  feedback?: { q1: string; q2: string; q3: string; freetext: string };
}

export interface KeywordEntry {
  word: string;
  count: number;  // raw frequency
  score: number;  // TF × boost
}

export interface ResonanzPunkt {
  label: string;   // shortened date + conversation index
  date: string;    // ISO
  q1: number;      // 0, 0.5, or 1
  q2: number;
  q3: number;
  avg: number;     // (q1+q2+q3)/3
}

export interface ThemenEntry {
  term: string;
  displayLabel: string;
  count: number;
}

// ─── Domain boost terms (Resonanzvernunft vocabulary) ────────────────────────
// Higher boost = more likely to surface in word cloud.
const DOMAIN_BOOSTS: Record<string, number> = {
  // Core concepts
  resonanz: 2.0,
  resonanzvernunft: 3.5,
  vernunft: 1.8,
  zwischen: 2.5,
  dasein: 2.5,
  begegnung: 2.0,
  antwort: 1.6,
  frage: 1.5,
  denken: 1.5,
  gedanke: 1.5,
  sprache: 1.8,
  schweigen: 2.0,
  stille: 2.0,
  moment: 1.6,
  innehalten: 2.2,
  verstehen: 1.6,
  erkenntnis: 1.8,
  wahrheit: 1.8,
  wirklichkeit: 1.7,
  welt: 1.4,
  bewusstsein: 1.9,
  geist: 1.7,
  seele: 1.7,
  körper: 1.4,
  zeit: 1.5,
  raum: 1.5,
  grenze: 1.8,
  transformation: 1.9,
  wandel: 1.7,
  wachstum: 1.5,
  veränderung: 1.5,
  öffnen: 1.6,
  öffnung: 1.7,
  verbindung: 1.8,
  beziehung: 1.7,
  dialog: 1.8,
  gespräch: 1.5,
  enkidu: 1.5,
  manifest: 1.5,
  klang: 2.0,
  ton: 1.5,
  stimme: 1.8,
  echo: 2.0,
  // Philosophical terms
  sein: 1.4,
  werden: 1.3,
  existenz: 1.9,
  freiheit: 1.8,
  bedeutung: 1.7,
  sinn: 1.8,
  unsicherheit: 1.7,
  zweifel: 1.8,
  vertrauen: 1.7,
  angst: 1.6,
  mut: 1.6,
  kraft: 1.4,
  energie: 1.4,
  licht: 1.5,
  dunkelheit: 1.6,
  spannung: 1.8,
  paradox: 2.0,
  widerspruch: 1.8,
  gleichgewicht: 1.7,
  harmonie: 1.6,
  chaos: 1.6,
  ordnung: 1.5,
};

// ─── Topic clusters for ThemenBalance ────────────────────────────────────────
const THEMEN_CLUSTERS: { term: string; displayLabel: string; aliases: string[] }[] = [
  { term: "resonanz",     displayLabel: "Resonanz",       aliases: ["resonanz","resonanzvernunft","klang","echo","ton","schwingung"] },
  { term: "zwischen",     displayLabel: "Das Zwischen",   aliases: ["zwischen","begegnung","verbindung","beziehung","kontakt","nähe"] },
  { term: "dasein",       displayLabel: "Dasein & Sein",  aliases: ["dasein","existenz","sein","wesen","da","präsenz","anwesenheit"] },
  { term: "sprache",      displayLabel: "Sprache",        aliases: ["sprache","wort","worte","schweigen","stille","stimme","sprechen","rede"] },
  { term: "denken",       displayLabel: "Denken",         aliases: ["denken","gedanke","gedanken","verstand","vernunft","erkenntnis","bewusstsein"] },
  { term: "wandel",       displayLabel: "Wandel",         aliases: ["wandel","transformation","veränderung","wachstum","entwicklung","prozess"] },
  { term: "wahrheit",     displayLabel: "Wahrheit",       aliases: ["wahrheit","wirklichkeit","realität","wissen","erkenntnis","klarheit"] },
  { term: "freiheit",     displayLabel: "Freiheit",       aliases: ["freiheit","offenheit","möglichkeit","raum","grenze","öffnung","weite"] },
];

// ─── Tokenizer ────────────────────────────────────────────────────────────────
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Remove punctuation but keep umlauts and ß
    .replace(/[^a-zäöüß\s-]/g, " ")
    .split(/\s+/)
    .map(w => w.replace(/^-+|-+$/g, ""))
    .filter(w => w.length >= 4)
    .filter(w => !STOPWORDS_DE.has(w));
}

// Get all user-authored text from conversations
function getUserText(conversations: Conversation[]): string[] {
  const texts: string[] = [];
  for (const conv of conversations) {
    for (const msg of conv.messages) {
      if (msg.role === "user" && !msg.error) {
        texts.push(msg.content);
      }
    }
    // Also include freetext feedback
    if (conv.feedback?.freetext) {
      texts.push(conv.feedback.freetext);
    }
  }
  return texts;
}

// ─── Main extraction functions ────────────────────────────────────────────────

/**
 * Extract top keywords from all user messages across all conversations.
 * Returns up to `topN` entries sorted by score descending.
 */
export function extractKeywords(
  conversations: Conversation[],
  topN = 60
): KeywordEntry[] {
  if (conversations.length === 0) return [];

  const texts = getUserText(conversations);
  const freq: Record<string, number> = {};

  for (const text of texts) {
    const tokens = tokenize(text);
    for (const token of tokens) {
      freq[token] = (freq[token] ?? 0) + 1;
    }
  }

  const entries: KeywordEntry[] = Object.entries(freq)
    .filter(([, count]) => count >= 1)
    .map(([word, count]) => {
      const boost = DOMAIN_BOOSTS[word] ?? 1.0;
      return { word, count, score: count * boost };
    });

  // Sort by score descending
  entries.sort((a, b) => b.score - a.score);

  return entries.slice(0, topN);
}

/**
 * Build a resonance path data series from feedback answers.
 * Each conversation with feedback becomes one data point.
 */
export function buildResonanzpfad(conversations: Conversation[]): ResonanzPunkt[] {
  const withFeedback = conversations
    .filter(c => c.feedback && (c.feedback.q1 || c.feedback.q2 || c.feedback.q3))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return withFeedback.map((conv, i) => {
    const fb = conv.feedback!;
    const q1 = mapFeedbackScore(fb.q1);
    const q2 = mapFeedbackScore(fb.q2);
    const q3 = mapFeedbackScore(fb.q3);
    const avg = (q1 + q2 + q3) / 3;

    const d = new Date(conv.date);
    const label = `${d.getDate()}.${d.getMonth() + 1}` + (withFeedback.length > 8 ? "" : `\n#${i + 1}`);

    return { label, date: conv.date, q1, q2, q3, avg };
  });
}

function mapFeedbackScore(answer: string): number {
  if (!answer) return 0;
  const a = answer.toLowerCase();
  // q1: "Ja — etwas hat mich..." = 1.0, "Ich weiß es noch nicht" = 0.5, "Eher nicht" = 0.0
  // q2: "Ja — es gab einen Moment..." = 1.0, "Kurz, aber..." = 0.5, "Nicht wirklich" = 0.0
  // q3: "Ja — eine Frage, ein Bild..." = 1.0, "Vielleicht" = 0.5, "Nein" = 0.0
  if (a.startsWith("ja")) return 1.0;
  if (a.startsWith("vielleicht") || a.startsWith("kurz") || a.startsWith("ich weiß")) return 0.5;
  return 0.0;
}

/**
 * Count how often words from each topic cluster appear across all conversations.
 * Returns clusters sorted by count descending.
 */
export function buildThemenBalance(conversations: Conversation[]): ThemenEntry[] {
  if (conversations.length === 0) return [];

  const texts = getUserText(conversations);
  const allText = texts.join(" ").toLowerCase();

  return THEMEN_CLUSTERS
    .map(cluster => {
      let count = 0;
      for (const alias of cluster.aliases) {
        // Count occurrences with word boundaries
        const regex = new RegExp(`\\b${alias}\\w*`, "gi");
        const matches = allText.match(regex);
        count += matches ? matches.length : 0;
      }
      return { term: cluster.term, displayLabel: cluster.displayLabel, count };
    })
    .filter(e => e.count > 0)
    .sort((a, b) => b.count - a.count);
}
