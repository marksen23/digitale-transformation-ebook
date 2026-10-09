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
  cap?: number;
}): { answeredBy: AnswerRef[]; warnings: string[] } {
  const cap = opts.cap ?? DEFAULT_CAP;
  const warnings: string[] = [];
  const rule = opts.rule;
  const cosineKept = opts.cosine.filter(a => !isExcluded(a.id, rule));

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
