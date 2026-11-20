/**
 * Zeitraffer der Landkarte.
 * Dichte je Begriff, kumuliert nur an Tagen, die im Korpus wirklich vorkommen.
 * Ungültige Zeitstempel und nicht kuratierte Einträge bleiben draußen.
 */

const CURATED = new Set(["approved", "published"]);

export interface TimelineEntry {
  ts: string;
  status: string;
  nodeIds?: string[] | null;
}

export interface DensityFrame {
  date: string;
  counts: Record<string, number>;
  total: number;
}

export function utcDay(ts: string): string | null {
  if (!ts || typeof ts !== "string") return null;
  const match = ts.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const [y, m, d] = match[1].split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return match[1];
}

/** Ein Rahmen pro echtem Korpus-Tag, aufsteigend, kumulierte kuratierte Dichte. */
export function buildDensityTimeline(entries: TimelineEntry[]): DensityFrame[] {
  const touches: Array<{ date: string; nodeIds: string[] }> = [];
  for (const entry of entries) {
    if (!CURATED.has(entry.status)) continue;
    const date = utcDay(entry.ts);
    if (!date) continue;
    const nodeIds = (entry.nodeIds ?? []).filter(id => typeof id === "string" && id.length > 0);
    touches.push({ date, nodeIds });
  }
  touches.sort((a, b) => a.date.localeCompare(b.date));

  const counts: Record<string, number> = {};
  const frames: DensityFrame[] = [];
  let total = 0;
  for (const touch of touches) {
    total += 1;
    for (const id of touch.nodeIds) counts[id] = (counts[id] ?? 0) + 1;
    const last = frames[frames.length - 1];
    const snapshot = { ...counts };
    if (last && last.date === touch.date) {
      last.counts = snapshot;
      last.total = total;
    } else {
      frames.push({ date: touch.date, counts: snapshot, total });
    }
  }
  return frames;
}

export function onOrBefore(createdAt: string, day: string): boolean {
  const created = utcDay(createdAt);
  return created !== null && created <= day;
}
