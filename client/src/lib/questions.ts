import { fetchCorpus } from "./corpusFetch";
/**
 * questions.ts — lädt die build-präkomputierte Fragenansicht
 * (client/public/resonanzen-questions.json, Erkenntnisse-Phase 1).
 *
 * Jeder Korpus-Eintrag endet mit einer offenen Schlussfrage; der Build
 * extrahiert sie und matcht sie gegen SPÄTERE Einträge (Cosine ≥ ANSWER_SIM) —
 * so wird sichtbar, welche Fragen das Werk sich selbst schon beantwortet hat
 * (`answered`) und welche offen bleiben. Schlussfragen redaktioneller
 * Antworten sind Anschlussfragen (`followUp`): gelistet, aber nicht „offen“.
 * Kuratierte Kanten
 * (`manual`, aus question-answer-overrides.json) ergänzen das Cosine-Top.
 * Fail-soft: fehlt/kaputt → leer.
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
  /** Spätere Einträge, die die Frage beantworten (Cosine-Top, plus kuratierte Pins). */
  answeredBy: Array<{ id: string; score: number | null; manual?: boolean }>;
  answered: boolean;
  /**
   * Anschlussfrage: Schlussfrage einer redaktionellen Antwort-Resonanz
   * (context_meta.origin: editorial). Bleibt gelistet und beantwortbar, zählt
   * aber nicht als „offen“. Fehlt in älteren JSONs → false.
   */
  followUp?: boolean;
}

export type QuestionStatus = "answered" | "open" | "followUp";
export type QuestionFilter = "all" | QuestionStatus;

export const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = {
  answered: "beantwortet",
  open: "offen",
  followUp: "Anschlussfrage",
};

/** Beantwortet hat Vorrang; unbeantwortet ist entweder offen oder Anschlussfrage. */
export function questionStatus(q: Pick<QuestionEntry, "answered" | "followUp">): QuestionStatus {
  if (q.answered) return "answered";
  return q.followUp ? "followUp" : "open";
}

export function matchesQuestionFilter(q: Pick<QuestionEntry, "answered" | "followUp">, f: QuestionFilter): boolean {
  return f === "all" || questionStatus(q) === f;
}

/** Zählung aus den Fragen selbst (robust gegen ältere stats). total = answered + open + followUp. */
export function questionCounts(qs: Array<Pick<QuestionEntry, "answered" | "followUp">>): {
  total: number; answered: number; open: number; followUp: number;
} {
  const c = { total: qs.length, answered: 0, open: 0, followUp: 0 };
  for (const q of qs) c[questionStatus(q)]++;
  return c;
}

/** Anzeige der Ähnlichkeit. Kuratierte Kanten heißen „kuratiert"; die Cosine
 *  steht daneben, sobald ein Vektorpaar vorlag (auch unter der Schwelle). */
export function formatAnswerScore(a: { score: number | null; manual?: boolean }): string {
  const sim = typeof a.score === "number" ? a.score.toFixed(2) : "";
  if (a.manual) return sim ? `kuratiert · ${sim}` : "kuratiert";
  return sim;
}

export interface QuestionsFile {
  generatedAt: string;
  count: number;
  thresholds: Record<string, number>;
  /** open = echte offene Fragen; followUp/followUpOpen = Anschlussfragen (seit 2026-11-20). */
  stats: { total: number; answered: number; open: number; followUp?: number; followUpOpen?: number; embedded: number };
  questions: QuestionEntry[];
}

let _cache: QuestionsFile | null = null;
let _promise: Promise<QuestionsFile | null> | null = null;

export function loadQuestions(): Promise<QuestionsFile | null> {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;
  _promise = fetchCorpus("/resonanzen-questions.json")
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
