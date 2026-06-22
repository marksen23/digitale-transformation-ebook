/**
 * questions.ts — lädt die build-präkomputierte Fragenansicht
 * (client/public/resonanzen-questions.json, Erkenntnisse-Phase 1).
 *
 * Jeder Korpus-Eintrag endet mit einer offenen Schlussfrage; der Build
 * extrahiert sie und matcht sie gegen SPÄTERE Einträge (Cosine ≥ ANSWER_SIM) —
 * so wird sichtbar, welche Fragen das Werk sich selbst schon beantwortet hat
 * (`answered`) und welche offen bleiben. Fail-soft: fehlt/kaputt → leer.
 */
export interface QuestionEntry {
  /** Eintrag, dessen Schlussfrage das ist. */
  sourceId: string;
  question: string;
  endpoint: string;
  anchor: string;
  nodeIds: string[];
  ts: string;
  /** Wie oft dieselbe Frage (normalisiert) sonst noch auftauchte. */
  dupCount: number;
  /** Spätere Einträge, die die Frage faktisch beantworten (Top-3, Cosine-Score). */
  answeredBy: Array<{ id: string; score: number }>;
  answered: boolean;
}

export interface QuestionsFile {
  generatedAt: string;
  count: number;
  thresholds: Record<string, number>;
  stats: { total: number; answered: number; open: number; embedded: number };
  questions: QuestionEntry[];
}

let _cache: QuestionsFile | null = null;
let _promise: Promise<QuestionsFile | null> | null = null;

export function loadQuestions(): Promise<QuestionsFile | null> {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;
  _promise = fetch(`/resonanzen-questions.json?_=${Date.now()}`, { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then((data: QuestionsFile | null) => {
      if (data && Array.isArray(data.questions)) { _cache = data; return data; }
      return null;
    })
    .catch(() => null);
  return _promise;
}

export function invalidateQuestions(): void {
  _cache = null;
  _promise = null;
}
