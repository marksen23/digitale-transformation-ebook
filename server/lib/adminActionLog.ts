/**
 * adminActionLog.ts — server-seitiges Audit-Log für Admin-Mutationen.
 *
 * Das bisherige Audit-Log (client/src/lib/adminActionLog.ts) lebt nur im
 * localStorage des jeweiligen Geräts — Aktionen von einem Telefon aus sind
 * auf dem Desktop-Browser eines anderen Geräts unsichtbar. Dieses Modul
 * spiegelt jede mutierende Admin-Route zusätzlich in einen geräteunabhängigen
 * Ring-Puffer, abrufbar über GET /api/admin/action-log.
 *
 * Persistenz: in-memory, wie citationTracker.ts — Render redeployt →
 * Puffer resetten. Bewusst kein Git-Commit pro Klick (Commit-Spam).
 */

export interface ServerAdminActionEntry {
  id: string;
  ts: string;
  type: string;
  actor: string;
  targetId?: string;
  targetCount?: number;
  ok: boolean;
  reason?: string;
  payload?: Record<string, unknown>;
}

const MAX_ENTRIES = 300;
const _log: ServerAdminActionEntry[] = [];
let _seq = 0;

function nextId(): string {
  _seq++;
  return `${Date.now().toString(36)}-${_seq.toString(36)}`;
}

export function recordAdminAction(entry: Omit<ServerAdminActionEntry, "id" | "ts">): void {
  _log.unshift({ id: nextId(), ts: new Date().toISOString(), ...entry });
  if (_log.length > MAX_ENTRIES) _log.length = MAX_ENTRIES;
}

export function getAdminActionLog(limit?: number): ServerAdminActionEntry[] {
  const n = Math.min(Math.max(1, limit ?? 100), MAX_ENTRIES);
  return _log.slice(0, n);
}

export function getAdminActionLogStats(): { total: number; ok: number; failed: number } {
  const ok = _log.filter(e => e.ok).length;
  return { total: _log.length, ok, failed: _log.length - ok };
}
