/**
 * Druckfassung der veröffentlichten Erkenntnisse:
 * Quartal, darin der Begriff. Ungültige Daten fallen weg.
 */

export interface FortItem {
  id: string;
  text: string;
  createdAt: string;
  conceptId: string | null;
  kind: "kernsatz" | "master";
  answerId: string;
}

export interface FortConcept {
  id: string;
  items: FortItem[];
}

export interface FortQuarter {
  key: string;
  label: string;
  concepts: FortConcept[];
}

export function quarterOf(iso: string): { key: string; label: string } | null {
  const match = iso.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const quarter = Math.floor((month - 1) / 3) + 1;
  return { key: `${match[1]}-Q${quarter}`, label: `${quarter}. Quartal ${match[1]}` };
}

export function groupFortschreibung(
  items: FortItem[],
  withdrawnAnswerIds: Iterable<string> = [],
  withdrawnMasterIds: Iterable<string> = [],
): FortQuarter[] {
  const answers = new Set(withdrawnAnswerIds);
  const masters = new Set(withdrawnMasterIds);
  const byQuarter = new Map<string, { label: string; byConcept: Map<string, FortItem[]> }>();
  for (const item of items) {
    if (!item.text.trim()) continue;
    if (item.kind === "master" ? masters.has(item.id) : answers.has(item.answerId)) continue;
    const quarter = quarterOf(item.createdAt);
    if (!quarter) continue;
    let bucket = byQuarter.get(quarter.key);
    if (!bucket) {
      bucket = { label: quarter.label, byConcept: new Map() };
      byQuarter.set(quarter.key, bucket);
    }
    const conceptId = item.conceptId || "";
    const list = bucket.byConcept.get(conceptId) ?? [];
    list.push(item);
    bucket.byConcept.set(conceptId, list);
  }
  return [...byQuarter.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      concepts: [...bucket.byConcept.entries()]
        .sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : a[0].localeCompare(b[0])))
        .map(([id, list]) => ({
          id,
          items: [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        })),
    }));
}
