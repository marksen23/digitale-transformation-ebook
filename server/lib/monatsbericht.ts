/**
 * Monatsbericht aus echten Korpus-Daten. Keine Personen, nur Zählungen.
 */

export interface GrowthEntry {
  ts: string;
  status: string;
  nodeIds?: string[] | null;
}

export interface OpenQuestion {
  sourceId: string;
  question: string;
  ts: string;
  followUp?: boolean;
  answered?: boolean;
}

const CURATED = new Set(["approved", "published"]);

export function utcMonth(iso: string): string | null {
  const match = iso.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}`;
}

export function conceptGrowth(entries: GrowthEntry[], month: string): Array<{ id: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (!CURATED.has(entry.status)) continue;
    if (utcMonth(entry.ts) !== month) continue;
    for (const id of entry.nodeIds ?? []) {
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

export function openFollowUps(questions: OpenQuestion[], limit = 12): OpenQuestion[] {
  return questions
    .filter(item => item.answered === false && item.question.trim())
    .sort((a, b) => Number(b.followUp) - Number(a.followUp) || b.ts.localeCompare(a.ts))
    .slice(0, limit);
}

export function mostRead(
  counts: Record<string, number>,
  labels: Map<string, string>,
  limit = 10,
): Array<{ id: string; count: number; text: string }> {
  return Object.entries(counts)
    .filter(([id, count]) => count > 0 && labels.has(id))
    .map(([id, count]) => ({ id, count, text: labels.get(id) ?? "" }))
    .filter(item => item.text)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, limit);
}
