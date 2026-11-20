/**
 * Erkenntnis des Tages: eine veröffentlichte Erkenntnis, deterministisch
 * nach UTC-Datum. Zurückgenommene Antworten (answerId) bleiben draußen.
 */

export interface DailyErkenntnis {
  id: string;
  kernsatz: string;
  answerId: string;
  conceptAnchor: string | null;
  createdAt: string;
}

export function utcDayIndex(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
}

export function utcDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

/** Stabile Reihenfolge, dann Tag-Index modulo Länge. Leer → null. */
export function pickDailyErkenntnis<T extends { id: string; answerId: string; kernsatz: string }>(
  items: T[],
  date: Date,
  withdrawnAnswerIds: Iterable<string> = [],
): T | null {
  const blocked = new Set(withdrawnAnswerIds);
  const pool = items
    .filter(e => e.kernsatz.trim() && e.answerId && !blocked.has(e.answerId))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (pool.length === 0) return null;
  return pool[utcDayIndex(date) % pool.length];
}

export function recentDailyErkenntnisse<T extends { id: string; answerId: string; kernsatz: string }>(
  items: T[],
  from: Date,
  days: number,
  withdrawnAnswerIds: Iterable<string> = [],
): Array<{ date: string; item: T }> {
  const out: Array<{ date: string; item: T }> = [];
  for (let i = 0; i < days; i++) {
    const day = addUtcDays(from, -i);
    const item = pickDailyErkenntnis(items, day, withdrawnAnswerIds);
    if (item) out.push({ date: utcDateString(day), item });
  }
  return out;
}
