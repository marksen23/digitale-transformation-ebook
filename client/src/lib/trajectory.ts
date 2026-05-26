/**
 * trajectory.ts — Lese-Trajektorie für Reader (Tier-1-3-Roadmap, Feature C).
 *
 * Rein clientseitig, opt-out-default-on. Speichert in LocalStorage:
 *   - welche Begriffsknoten besucht wurden + Häufigkeit
 *   - welche Resonanzen expanded wurden
 *   - welche Buchpassagen markiert wurden
 *   - Anzahl beendeter Dialog-Sessions
 *
 * Kein Server-Tracking, kein Cookie, kein Network-Call. Nutzer kann
 * jederzeit zurücksetzen oder herunterladen.
 *
 * Throttle: setzt sich auf 1 Event/sec — verhindert dass Scroll/Hover-
 * Heavy-Events das Storage hämmern.
 */

const KEY = "resonanzvernunft.trajectory";
const VERSION = 1;

export interface Trajectory {
  v: number;
  startedAt: string;
  lastActiveAt: string;
  visitedNodes: Record<string, { count: number; lastTs: string }>;
  expandedResonanzen: Record<string, string>;  // resonanzId → ts
  selectedPassages: Record<string, { selectionText: string; ts: string }>;
  dialogSessions: number;
  optOut: boolean;
}

export type TrackEvent =
  | { type: "node-visit"; nodeId: string }
  | { type: "resonanz-expand"; entryId: string }
  | { type: "passage-select"; chunkId: string; text: string }
  | { type: "dialog-end" };

let _cache: Trajectory | null = null;
let _lastWriteAt = 0;

function emptyTrajectory(): Trajectory {
  const now = new Date().toISOString();
  return {
    v: VERSION, startedAt: now, lastActiveAt: now,
    visitedNodes: {}, expandedResonanzen: {}, selectedPassages: {},
    dialogSessions: 0, optOut: false,
  };
}

export function getTrajectory(): Trajectory {
  if (_cache) return _cache;
  if (typeof localStorage === "undefined") return emptyTrajectory();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) { _cache = emptyTrajectory(); return _cache; }
    const parsed = JSON.parse(raw) as Trajectory;
    if (parsed.v !== VERSION) { _cache = emptyTrajectory(); return _cache; }
    _cache = parsed;
    return parsed;
  } catch {
    _cache = emptyTrajectory();
    return _cache;
  }
}

function writeTrajectory(t: Trajectory) {
  _cache = t;
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch {}
}

function throttle(): boolean {
  const now = Date.now();
  if (now - _lastWriteAt < 800) return false;
  _lastWriteAt = now;
  return true;
}

/** Hauptmethode: zähle ein Event. No-op bei opt-out oder kurzem Throttle. */
export function track(event: TrackEvent): void {
  const t = getTrajectory();
  if (t.optOut) return;
  if (!throttle() && event.type !== "passage-select" && event.type !== "dialog-end") return;
  const now = new Date().toISOString();
  switch (event.type) {
    case "node-visit": {
      const cur = t.visitedNodes[event.nodeId] ?? { count: 0, lastTs: now };
      t.visitedNodes[event.nodeId] = { count: cur.count + 1, lastTs: now };
      break;
    }
    case "resonanz-expand": {
      t.expandedResonanzen[event.entryId] = now;
      break;
    }
    case "passage-select": {
      t.selectedPassages[event.chunkId] = { selectionText: event.text.slice(0, 300), ts: now };
      break;
    }
    case "dialog-end": {
      t.dialogSessions++;
      break;
    }
  }
  t.lastActiveAt = now;
  writeTrajectory(t);
}

export function resetTrajectory(): void {
  _cache = emptyTrajectory();
  if (typeof localStorage !== "undefined") {
    try { localStorage.removeItem(KEY); } catch {}
  }
}

export function setOptOut(v: boolean): void {
  const t = getTrajectory();
  t.optOut = v;
  writeTrajectory(t);
}

/** Top-N Knoten nach Visits absteigend. */
export function topNodes(limit = 10): Array<{ nodeId: string; count: number }> {
  const t = getTrajectory();
  return Object.entries(t.visitedNodes)
    .map(([nodeId, v]) => ({ nodeId, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Knoten die der User noch NICHT besucht hat (aus einer gegebenen Liste). */
export function unvisitedFrom(allNodeIds: string[]): string[] {
  const t = getTrajectory();
  return allNodeIds.filter(id => !t.visitedNodes[id]);
}

/** Anzahl der Stats. */
export function getStats(): {
  visitedCount: number;
  totalVisits: number;
  passageCount: number;
  expandedCount: number;
  dialogSessions: number;
  daysActive: number;
} {
  const t = getTrajectory();
  const visited = Object.values(t.visitedNodes);
  const totalVisits = visited.reduce((s, v) => s + v.count, 0);
  const startMs = new Date(t.startedAt).getTime();
  const daysActive = Math.max(1, Math.ceil((Date.now() - startMs) / 86400000));
  return {
    visitedCount: visited.length,
    totalVisits,
    passageCount: Object.keys(t.selectedPassages).length,
    expandedCount: Object.keys(t.expandedResonanzen).length,
    dialogSessions: t.dialogSessions,
    daysActive,
  };
}
