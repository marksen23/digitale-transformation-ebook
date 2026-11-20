/**
 * questionAnswers.ts — kuratierte Frage→Antwort-Kanten.
 *
 * `writeQuestions` in build-resonanzen-index.ts matcht Schlussfragen gegen
 * spätere Einträge per Cosine (QUESTIONS_ANSWER_SIM, Default 0.72) und
 * behält die Top 3. Manche Antworten liegen darunter oder würden von einem
 * thematisch nahen, aber falschen Cluster verdrängt. Diese Datei mischt die
 * Override-Datei content/resonanzen/question-answer-overrides.json ein:
 *
 *   - pin: immer aufnehmen, auch unter der Schwelle; belegt die sichtbaren
 *     Plätze vor den Cosine-Treffern
 *   - exclude / excludePrefixes: Cosine-Treffer (und gleichlautende Pins)
 *     verwerfen — z. B. den September-Logos-Cluster (MTNB…) nicht als
 *     Antwort auf Stimme oder Judikative buchen
 *
 * Die generierte resonanzen-questions.json wird nicht von Hand gepflegt.
 */
import fs from "node:fs";

export interface AnswerRef {
  id: string;
  /** Cosine, wenn ein Vektorpaar vorlag (auch unter der Schwelle). Sonst null. */
  score: number | null;
  /** true = aus der Override-Datei, nicht allein aus dem Cosine-Top. */
  manual?: boolean;
}

export interface AnswerOverrideRule {
  sourceId: string;
  pin?: string[];
  exclude?: string[];
  excludePrefixes?: string[];
}

export interface AnswerOverrideEntry {
  id: string;
  status: string;
}

const DEFAULT_CAP = 3;

export function loadAnswerOverrides(filePath: string): Map<string, AnswerOverrideRule> {
  const map = new Map<string, AnswerOverrideRule>();
  if (!fs.existsSync(filePath)) return map;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { rules?: AnswerOverrideRule[] };
    for (const rule of raw.rules ?? []) {
      if (!rule || typeof rule.sourceId !== "string" || !rule.sourceId.trim()) continue;
      map.set(rule.sourceId, {
        sourceId: rule.sourceId,
        pin: Array.isArray(rule.pin) ? rule.pin.map(String) : [],
        exclude: Array.isArray(rule.exclude) ? rule.exclude.map(String) : [],
        excludePrefixes: Array.isArray(rule.excludePrefixes) ? rule.excludePrefixes.map(String).filter(Boolean) : [],
      });
    }
  } catch (err) {
    console.warn(
      `[question-answers] Override-Datei nicht lesbar (${filePath}): ${err instanceof Error ? err.message : err}`,
    );
  }
  return map;
}

function isExcluded(id: string, rule: AnswerOverrideRule | undefined): boolean {
  if (!rule) return false;
  if ((rule.exclude ?? []).includes(id)) return true;
  return (rule.excludePrefixes ?? []).some(prefix => id.startsWith(prefix));
}

/**
 * Mischt Cosine-Treffer und eine optionale Kuratierungsregel.
 * Ohne Regel: Top `cap` der Cosine-Liste (bereits absteigend sortiert erwartet).
 * Mit Regel: Pins zuerst, dann Cosine-Füller bis max(cap, Anzahl gültiger Pins),
 * damit ein Pin nicht aus der sichtbaren Liste fällt.
 */
export function applyAnswerOverrides(opts: {
  sourceId: string;
  cosine: Array<{ id: string; score: number }>;
  rule: AnswerOverrideRule | undefined;
  entriesById: Map<string, AnswerOverrideEntry>;
  scoreOf?: (id: string) => number | null;
  /** Eintrag trägt die Frage selbst (Quelle, Dublette, eigener Master) → nie Antwort. */
  isSelf?: (id: string) => boolean;
  cap?: number;
}): { answeredBy: AnswerRef[]; warnings: string[] } {
  const cap = opts.cap ?? DEFAULT_CAP;
  const warnings: string[] = [];
  const rule = opts.rule;
  const isSelf = opts.isSelf ?? (() => false);
  const cosineKept = opts.cosine.filter(a => !isExcluded(a.id, rule) && !isSelf(a.id));

  if (!rule) {
    return {
      answeredBy: cosineKept.slice(0, cap).map(a => ({ id: a.id, score: a.score })),
      warnings,
    };
  }

  const cosineById = new Map(opts.cosine.map(a => [a.id, a.score]));
  const pins: AnswerRef[] = [];
  const seen = new Set<string>();
  for (const id of rule.pin ?? []) {
    if (!id || seen.has(id) || id === opts.sourceId) continue;
    if (isSelf(id)) {
      warnings.push(`pin ${id} für ${opts.sourceId} trägt dieselbe Frage (Dublette oder eigener Master)`);
      continue;
    }
    if (isExcluded(id, rule)) {
      warnings.push(`pin ${id} für ${opts.sourceId} ist ausgeschlossen`);
      continue;
    }
    const entry = opts.entriesById.get(id);
    if (!entry) {
      warnings.push(`pin ${id} für ${opts.sourceId} nicht im Korpus`);
      continue;
    }
    if (entry.status === "rejected") {
      warnings.push(`pin ${id} für ${opts.sourceId} ist rejected`);
      continue;
    }
    seen.add(id);
    const fromCosine = cosineById.get(id);
    const lookedUp = opts.scoreOf?.(id);
    const score = typeof fromCosine === "number"
      ? fromCosine
      : (typeof lookedUp === "number" ? lookedUp : null);
    pins.push({ id, score, manual: true });
  }

  const rest: AnswerRef[] = cosineKept
    .filter(a => !seen.has(a.id))
    .map(a => ({ id: a.id, score: a.score }));
  const limit = Math.max(cap, pins.length);
  return { answeredBy: [...pins, ...rest].slice(0, limit), warnings };
}

// ─── Fragen-Extraktion: Scheinfragen vermeiden ────────────────────────────
//
// Zwei Quellen erzeugten offene Fragen, die keine eigenständigen Fragen sind:
//   1. Schlussfragen aus `rejected`-Einträgen. Der Eintrag ist kuratorisch
//      verworfen, seine Frage gehört nicht in die Fragenansicht.
//   2. Master-Synthesen (`is_master`, `master_of`), die die Schlussfrage einer
//      ihrer Varianten (fast) wortgleich übernehmen. Die Frage erschien dann
//      doppelt (Variante beantwortet, Master offen), und der Cosine-Abgleich
//      buchte den Master als „Antwort“ auf die eigene Variante.
// Die Logik liegt hier (ohne IO), damit sie ohne Build testbar ist.

export interface QuestionSourceEntry {
  id: string;
  ts: string;
  status?: string;
  endpoint: string;
  anchor?: string;
  nodeIds?: string[];
  is_master?: boolean;
  master_of?: string[];
}

export interface CollectedQuestion {
  sourceId: string;
  question: string;
  endpoint: string;
  anchor: string;
  nodeIds: string[];
  ts: string;
  /** Weitere Einträge mit derselben Frage (normalisiert gleich oder gefaltete Master). */
  dupIds: string[];
}

export const normalizeQuestion = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Extrahiert die Schlussfragen. Überspringt `rejected`-Quellen und faltet
 * normalisiert identische Fragen auf die älteste Quelle.
 */
export function collectQuestions<E extends QuestionSourceEntry>(
  entries: E[],
  extract: (e: E) => string,
  minLength = 12,
): { questions: CollectedQuestion[]; skippedRejected: number } {
  const byNorm = new Map<string, CollectedQuestion>();
  let skippedRejected = 0;
  for (const e of [...entries].sort((a, b) => a.ts.localeCompare(b.ts))) {
    const q = extract(e);
    if (q.length < minLength) continue;
    if (e.status === "rejected") { skippedRejected++; continue; }
    const k = normalizeQuestion(q);
    const ex = byNorm.get(k);
    if (ex) ex.dupIds.push(e.id);
    else byNorm.set(k, {
      sourceId: e.id, question: q, endpoint: e.endpoint, anchor: e.anchor ?? "",
      nodeIds: e.nodeIds ?? [], ts: e.ts, dupIds: [],
    });
  }
  return { questions: [...byNorm.values()], skippedRejected };
}

/** Wort-Dice (Tokens ≥ 3 Buchstaben, kleingeschrieben) zwischen zwei Fragen, 0–1. */
export function questionTextSimilarity(a: string, b: string): number {
  const tok = (s: string) => new Set(s.toLowerCase().match(/[a-zäöüß]{3,}/g) ?? []);
  const A = tok(a), B = tok(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  A.forEach(t => { if (B.has(t)) inter++; });
  return (2 * inter) / (A.size + B.size);
}

export const MASTER_QUESTION_TEXT_SIM = 0.6;
export const MASTER_QUESTION_COSINE_SIM = 0.92;

/**
 * Faltet die Frage eines Masters auf die Frage einer seiner Varianten, wenn
 * sie dieselbe Frage ist: Wort-Dice ≥ textSim ODER Cosine ≥ cosineSim
 * (Cosine nur, wenn beide Vektoren vorliegen). Die Variante bleibt Quelle
 * (älter, trägt die Kuratierung), der Master wandert in ihre dupIds.
 * Mehrere passende Varianten: die ähnlichste gewinnt.
 */
export function foldMasterQuestions(
  questions: CollectedQuestion[],
  entriesById: Map<string, QuestionSourceEntry>,
  opts: { cosine?: (a: string, b: string) => number | null; textSim?: number; cosineSim?: number } = {},
): { questions: CollectedQuestion[]; folded: Array<{ masterId: string; intoId: string }> } {
  const textSim = opts.textSim ?? MASTER_QUESTION_TEXT_SIM;
  const cosineSim = opts.cosineSim ?? MASTER_QUESTION_COSINE_SIM;
  // Jede Eintrags-ID → die Frage, unter der sie geführt wird.
  const byMember = new Map<string, CollectedQuestion>();
  for (const q of questions) {
    byMember.set(q.sourceId, q);
    for (const d of q.dupIds) byMember.set(d, q);
  }
  const removed = new Set<CollectedQuestion>();
  const folded: Array<{ masterId: string; intoId: string }> = [];
  for (const q of questions) {
    const master = entriesById.get(q.sourceId);
    if (!master?.is_master || !master.master_of?.length) continue;
    let best: { target: CollectedQuestion; score: number } | null = null;
    for (const vid of master.master_of) {
      const target = byMember.get(vid);
      if (!target || target === q || removed.has(target)) continue;
      const t = questionTextSimilarity(q.question, target.question);
      const c = opts.cosine?.(q.question, target.question) ?? null;
      const same = t >= textSim || (typeof c === "number" && c >= cosineSim);
      if (!same) continue;
      const score = Math.max(t, c ?? 0);
      if (!best || score > best.score) best = { target, score };
    }
    if (!best) continue;
    best.target.dupIds.push(q.sourceId, ...q.dupIds);
    removed.add(q);
    folded.push({ masterId: q.sourceId, intoId: best.target.sourceId });
  }
  return { questions: questions.filter(q => !removed.has(q)), folded };
}

/**
 * true, wenn `candidate` die Frage `q` nicht beantworten darf: der Eintrag
 * trägt die Frage selbst (Quelle oder Dublette), oder er ist ein Master, der
 * die Quelle oder eine Dublette der Frage als Variante synthetisiert.
 */
export function isSelfAnswer(
  q: { sourceId: string; dupIds: string[] },
  candidate: { id: string; is_master?: boolean; master_of?: string[] } | undefined,
): boolean {
  if (!candidate) return false;
  if (candidate.id === q.sourceId || q.dupIds.includes(candidate.id)) return true;
  if (candidate.is_master && candidate.master_of?.length) {
    const own = new Set([q.sourceId, ...q.dupIds]);
    return candidate.master_of.some(v => own.has(v));
  }
  return false;
}

// ─── Anschlussfragen: eigene Kategorie statt „offen“ ──────────────────────
//
// Redaktionelle Antwort-Resonanzen (#33, #73, #76, #79, #82 …) enden bewusst
// mit einer „Offenen Anschlussfrage“. Jede beantwortete Frage erzeugte so eine
// neue offene Frage, und die Zahl „offen“ sank kaum. Seit 2026-11-20
// (Entscheidung Markus) zählen diese Fragen als eigene Kategorie
// „Anschlussfragen“: weiter gelistet und beantwortbar, aber nicht „offen“.
//
// Regel (aus den Daten, keine ID-Listen): Die Quelle ist eine redaktionelle
// Resonanz, erkennbar am Frontmatter-Marker `context_meta.origin: editorial`,
// den die redaktionelle Pipeline schreibt (der Validator prüft den Wert).
// Hat dieselbe Frage (normalisiert) auch eine nicht-redaktionelle Quelle, ist
// sie eine echte Frage. Gefaltete Master zählen dabei nicht: sie übernehmen
// die Frage nur.

export const EDITORIAL_ORIGIN = "editorial";
export const KNOWN_CONTEXT_ORIGINS: ReadonlySet<string> = new Set([EDITORIAL_ORIGIN]);

export interface FollowUpSourceEntry {
  contextMeta?: Record<string, unknown> | null;
  is_master?: boolean;
}

/** true, wenn der Eintrag eine redaktionelle Resonanz ist (Quelle von Anschlussfragen). */
export function isEditorialEntry(e: FollowUpSourceEntry | undefined): boolean {
  return e?.contextMeta?.origin === EDITORIAL_ORIGIN;
}

/**
 * true, wenn die Frage eine Anschlussfrage ist: Quelle redaktionell und keine
 * nicht-redaktionelle Dublette (Master in den dupIds werden übergangen).
 */
export function isFollowUpQuestion(
  q: { sourceId: string; dupIds: string[] },
  entriesById: Map<string, FollowUpSourceEntry>,
): boolean {
  if (!isEditorialEntry(entriesById.get(q.sourceId))) return false;
  return q.dupIds.every(id => {
    const e = entriesById.get(id);
    return !e || e.is_master === true || isEditorialEntry(e);
  });
}

export interface QuestionStats {
  /** Alle Fragen, Anschlussfragen eingeschlossen. */
  total: number;
  /** Alle beantworteten Fragen, beantwortete Anschlussfragen eingeschlossen. */
  answered: number;
  /** Echte offene Fragen: unbeantwortet und keine Anschlussfrage. */
  open: number;
  /** Alle Anschlussfragen (beantwortet oder nicht). */
  followUp: number;
  /** Unbeantwortete Anschlussfragen. */
  followUpOpen: number;
}

/** Invariante: total = answered + open + followUpOpen. */
export function summarizeQuestions(qs: Array<{ answered: boolean; followUp?: boolean }>): QuestionStats {
  let answered = 0, open = 0, followUp = 0, followUpOpen = 0;
  for (const q of qs) {
    if (q.followUp) followUp++;
    if (q.answered) answered++;
    else if (q.followUp) followUpOpen++;
    else open++;
  }
  return { total: qs.length, answered, open, followUp, followUpOpen };
}
