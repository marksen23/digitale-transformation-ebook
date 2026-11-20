/**
 * Öffentliche Leser-Dialoge aus dem bereits veröffentlichten Korpus.
 * Nur approved/published, nur dialog und graph-chat. Kein Schreiben.
 */
import { splitClosing } from "@/lib/closingQuestion";

const CURATED = new Set(["approved", "published"]);
const ENDPOINTS = new Set(["dialog", "graph-chat"]);

export interface PublicDialogEntry {
  id: string;
  ts: string;
  endpoint: string;
  status: string;
  prompt: string;
  response: string;
  nodeIds?: string[] | null;
  contextMeta?: Record<string, unknown> | null;
}

export type ThreadKind = "weiterdenken" | "dialog" | "graph-chat";

export interface ThreadStep {
  id: string;
  ts: string;
  kind: ThreadKind;
  question: string;
  reader: string;
  answer: string;
  nextQuestion: string;
}

export interface DialogThread {
  id: string;
  steps: ThreadStep[];
}

export function normalizeQuestion(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function splitReader(prompt: string): { question: string; reader: string } {
  const parts = prompt.split(/\[Leser-Antwort\]/i);
  if (parts.length < 2) return { question: prompt.trim(), reader: "" };
  return { question: parts[0].replace(/\s+/g, " ").trim(), reader: parts.slice(1).join(" ").replace(/\s+/g, " ").trim() };
}

function kindOf(entry: PublicDialogEntry): ThreadKind {
  if (entry.contextMeta?.kind === "weiterdenken") return "weiterdenken";
  if (entry.endpoint === "graph-chat") return "graph-chat";
  return "dialog";
}

function toStep(entry: PublicDialogEntry): ThreadStep | null {
  if (!CURATED.has(entry.status) || !ENDPOINTS.has(entry.endpoint)) return null;
  const { question, reader } = splitReader(entry.prompt ?? "");
  const { reflection, nextQuestion } = splitClosing(entry.response ?? "");
  if (!question || !reflection.trim()) return null;
  return {
    id: entry.id,
    ts: entry.ts || "",
    kind: kindOf(entry),
    question,
    reader,
    answer: reflection.trim(),
    nextQuestion: nextQuestion.trim(),
  };
}

/** Fäden eines Begriffs. Eine Folge hängt nur, wenn die Frage wörtlich die Schlussfrage des vorigen Schritts ist. */
export function buildDialogThreads(entries: PublicDialogEntry[], conceptId: string): DialogThread[] {
  const steps = entries
    .filter(e => (e.nodeIds ?? []).includes(conceptId))
    .map(toStep)
    .filter((s): s is ThreadStep => s !== null)
    .sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id));

  const child = new Map<string, ThreadStep>();
  const isChild = new Set<string>();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const question = normalizeQuestion(step.question);
    if (!question) continue;
    for (let j = i - 1; j >= 0; j--) {
      const parent = steps[j];
      if (child.has(parent.id)) continue;
      if (normalizeQuestion(parent.nextQuestion) !== question) continue;
      child.set(parent.id, step);
      isChild.add(step.id);
      break;
    }
  }

  const threads: DialogThread[] = [];
  for (const step of steps) {
    if (isChild.has(step.id)) continue;
    const chain = [step];
    const seen = new Set([step.id]);
    let cursor = step;
    while (child.has(cursor.id)) {
      const next = child.get(cursor.id)!;
      if (seen.has(next.id)) break;
      seen.add(next.id);
      chain.push(next);
      cursor = next;
    }
    threads.push({ id: step.id, steps: chain });
  }
  threads.sort((a, b) => {
    const ta = a.steps[a.steps.length - 1]?.ts ?? "";
    const tb = b.steps[b.steps.length - 1]?.ts ?? "";
    return tb.localeCompare(ta);
  });
  return threads;
}

export function conceptsWithDialogs(entries: PublicDialogEntry[]): Array<{ id: string; steps: number; threads: number }> {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!toStep(entry)) continue;
    for (const id of entry.nodeIds ?? []) ids.add(id);
  }
  return [...ids].map(id => {
    const threads = buildDialogThreads(entries, id);
    return { id, threads: threads.length, steps: threads.reduce((n, t) => n + t.steps.length, 0) };
  }).filter(row => row.steps > 0).sort((a, b) => b.steps - a.steps || a.id.localeCompare(b.id));
}
