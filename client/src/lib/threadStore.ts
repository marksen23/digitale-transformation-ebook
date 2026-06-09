/**
 * threadStore.ts — Persistenz für Weiterdenken-Fäden (Roadmap „Das wachsende
 * Werk", Phase 1).
 *
 * Rein clientseitig (localStorage), gleiche Philosophie wie trajectory.ts:
 * kein Konto, kein Server-Tracking, kein Cookie, jederzeit lösch-/exportierbar.
 *
 * Zweck: Weiterdenken-Fäden sind heute flüchtig — beim Seitenwechsel verpufft
 * der rekursive Gedankengang. Dieser Store bewahrt sie, damit der Leser sie in
 * „Mein Werk" wiederfindet und fortsetzen kann. Außerdem sammeln wir die
 * „offenen Fragen": Schlussfragen, die nie weitergetragen wurden — eine
 * Einladung, zum Gedanken zurückzukehren.
 */

export type ThreadStepKind = "frage" | "leser" | "ki";

/** Werk-Anschlussstelle eines KI-Schritts (Phase 2; in Phase 1 optional
 *  mitgeschrieben, sobald die Endpunkte sie liefern). */
export interface ThreadAnchor {
  chunkId: string;
  score?: number;
  partTitle?: string;
  chapterTitle?: string;
}

export interface ThreadStep {
  kind: ThreadStepKind;
  text: string;
  werkAnchors?: ThreadAnchor[];
}

export interface SavedThread {
  id: string;
  /** Die ursprüngliche Schlussfrage, aus der der Faden entsprang. */
  rootQuestion: string;
  steps: ThreadStep[];
  /** RAG-/Korpus-Fokus (z.B. nodeIds joined mit "+") — für Fortsetzung. */
  focus?: string;
  focusedNodeIds?: string[];
  savedAt: string;
  updatedAt: string;
}

const KEY = "resonanzvernunft.threads";
const VERSION = 1;

interface ThreadStoreFile {
  v: number;
  threads: SavedThread[];
}

let _cache: ThreadStoreFile | null = null;

function read(): ThreadStoreFile {
  if (_cache) return _cache;
  if (typeof localStorage === "undefined") { _cache = { v: VERSION, threads: [] }; return _cache; }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) { _cache = { v: VERSION, threads: [] }; return _cache; }
    const parsed = JSON.parse(raw) as ThreadStoreFile;
    if (parsed.v !== VERSION || !Array.isArray(parsed.threads)) {
      _cache = { v: VERSION, threads: [] };
      return _cache;
    }
    _cache = parsed;
    return parsed;
  } catch {
    _cache = { v: VERSION, threads: [] };
    return _cache;
  }
}

function write(file: ThreadStoreFile): void {
  _cache = file;
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(file)); } catch { /* quota / private mode */ }
}

function genId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Alle gespeicherten Fäden, neueste zuerst. */
export function listThreads(): SavedThread[] {
  return [...read().threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getThread(id: string): SavedThread | null {
  return read().threads.find(t => t.id === id) ?? null;
}

/**
 * Upsert: ohne id wird ein neuer Faden angelegt (id zurückgegeben), mit id der
 * bestehende überschrieben. Gibt den gespeicherten Faden zurück.
 */
export function saveThread(input: {
  id?: string;
  rootQuestion: string;
  steps: ThreadStep[];
  focus?: string;
  focusedNodeIds?: string[];
}): SavedThread {
  const file = read();
  const now = new Date().toISOString();
  const existing = input.id ? file.threads.find(t => t.id === input.id) : undefined;
  const thread: SavedThread = {
    id: existing?.id ?? input.id ?? genId(),
    rootQuestion: input.rootQuestion.trim(),
    steps: input.steps,
    focus: input.focus,
    focusedNodeIds: input.focusedNodeIds,
    savedAt: existing?.savedAt ?? now,
    updatedAt: now,
  };
  const threads = existing
    ? file.threads.map(t => (t.id === thread.id ? thread : t))
    : [...file.threads, thread];
  write({ v: VERSION, threads });
  return thread;
}

export function deleteThread(id: string): void {
  const file = read();
  write({ v: VERSION, threads: file.threads.filter(t => t.id !== id) });
}

/**
 * „Offene Fragen": Fäden, deren letzter Schritt eine (nie weitergetragene)
 * Frage ist — die Einladung zurückzukehren. Liefert Frage + Faden-id.
 */
export function openQuestions(): Array<{ threadId: string; question: string; updatedAt: string }> {
  return read().threads
    .filter(t => t.steps.length > 0 && t.steps[t.steps.length - 1].kind === "frage")
    .map(t => ({ threadId: t.id, question: t.steps[t.steps.length - 1].text, updatedAt: t.updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function threadCount(): number {
  return read().threads.length;
}
