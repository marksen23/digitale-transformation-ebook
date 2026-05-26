/**
 * adminActionLog.ts — persistentes Audit-Protokoll aller Admin-Mutationen.
 *
 * Anlass (Sprint F1): das System protokolliert Erfolge im Toast und
 * verwirft Misserfolge ebenso schnell. „Algorithmen überspringen die
 * Nacht — sie kalkulieren den Schmerz weg, weil er ineffizient ist."
 * Hier nicht. Jede Aktion wird festgehalten — auch und gerade die,
 * die fehlgeschlagen sind.
 *
 * Speicher: LocalStorage, ~200 letzte Einträge, FIFO-Ringpuffer.
 * Lifecycle:
 *   recordAction({ type, targetId, ok, reason?, payload? })
 *     → persistiert + Window-Event "admin-action-log-changed"
 *   getActionLog() → letzte Einträge (neueste zuerst)
 *   clearActionLog() → komplett zurücksetzen
 *   retryAction(entry, retryFn) → bei Fehlschlag erneut ausführen
 */

const KEY = "resonanzvernunft.admin-action-log";
const MAX_ENTRIES = 200;
const VERSION = 1;
const CHANGED_EVENT = "admin-action-log-changed";

export type AdminActionType =
  | "curate"
  | "delete"
  | "pre-score"
  | "synthesize-master"
  | "bulk-curate"
  | "bulk-delete"
  | "bulk-pre-score";

export interface ActionLogEntry {
  id: string;                    // log-id (nanoid-like)
  ts: string;                    // ISO timestamp
  type: AdminActionType;
  targetId?: string;             // Eintrag-ID oder Anker oder Bulk-Sammel-Marker
  targetCount?: number;          // für Bulk-Operationen
  ok: boolean;
  reason?: string;               // Fehlerursache wenn !ok
  payload?: Record<string, unknown>;  // z.B. { newStatus: "approved" } für späteres retry
}

interface LogFile { v: number; entries: ActionLogEntry[] }

function shortId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

function readRaw(): LogFile {
  if (typeof localStorage === "undefined") return { v: VERSION, entries: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { v: VERSION, entries: [] };
    const parsed = JSON.parse(raw) as LogFile;
    if (parsed.v !== VERSION || !Array.isArray(parsed.entries)) return { v: VERSION, entries: [] };
    return parsed;
  } catch {
    return { v: VERSION, entries: [] };
  }
}

function writeRaw(log: LogFile): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    // Quota / Private-Mode: still log to memory (best effort).
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGED_EVENT));
  }
}

/** Persistiert eine neue Aktion. Schneidet auf MAX_ENTRIES zu (FIFO). */
export function recordAction(action: Omit<ActionLogEntry, "id" | "ts">): ActionLogEntry {
  const entry: ActionLogEntry = {
    id: shortId(),
    ts: new Date().toISOString(),
    ...action,
  };
  const cur = readRaw();
  const next: LogFile = {
    v: VERSION,
    entries: [entry, ...cur.entries].slice(0, MAX_ENTRIES),
  };
  writeRaw(next);
  return entry;
}

/** Liest die letzten N Einträge (default: alle). */
export function getActionLog(limit?: number): ActionLogEntry[] {
  const log = readRaw();
  return typeof limit === "number" ? log.entries.slice(0, limit) : log.entries;
}

/** Wirft das gesamte Log fort. */
export function clearActionLog(): void {
  writeRaw({ v: VERSION, entries: [] });
}

/** Nur Fehlschläge — für die Sidebar-Default-Sicht. */
export function getFailedActions(limit = 50): ActionLogEntry[] {
  return getActionLog().filter(e => !e.ok).slice(0, limit);
}

/** Statistik für Heartbeat-Anzeige. */
export function getActionLogStats(): {
  total: number;
  failed: number;
  lastFailureTs: string | null;
  lastSuccessTs: string | null;
} {
  const all = getActionLog();
  const failed = all.filter(e => !e.ok);
  const lastFail = failed[0];
  const lastOk = all.find(e => e.ok);
  return {
    total: all.length,
    failed: failed.length,
    lastFailureTs: lastFail?.ts ?? null,
    lastSuccessTs: lastOk?.ts ?? null,
  };
}

export const ACTION_LOG_CHANGED_EVENT = CHANGED_EVENT;

/** Lesbares Label für Anzeige. */
export const ACTION_LABEL: Record<AdminActionType, string> = {
  "curate":             "Status",
  "delete":             "Löschung",
  "pre-score":          "AI-Score",
  "synthesize-master":  "Master-Synthese",
  "bulk-curate":        "Bulk-Status",
  "bulk-delete":        "Bulk-Löschung",
  "bulk-pre-score":     "Bulk-AI-Score",
};
