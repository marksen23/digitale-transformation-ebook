/**
 * Dichte von Prinzip-Gruppen, die keine eigenen Knoten sind.
 * `schattenlicht` und `wirklichkeit-moeglichkeit` werden im Graph nicht
 * angefragt; ihre Resonanzen hängen an den Mitgliedern. Die Summe ersetzt
 * die tote Null. Ein Knoten, der dieselbe id trägt (`raumfaltung`), bleibt.
 */

export interface DensityCell {
  count: number;
  endpoints: Record<string, number>;
  /** Die Zahl ist aus den Mitgliedern abgeleitet, nicht direkt gezählt. */
  derived?: boolean;
}

export interface PrinzipGroupRef {
  id: string;
  memberIds: readonly string[];
}

function cloneCell(cell: DensityCell): DensityCell {
  return {
    count: cell.count,
    endpoints: { ...cell.endpoints },
    ...(cell.derived ? { derived: true } : {}),
  };
}

function addCell(target: { count: number; endpoints: Record<string, number> }, cell: DensityCell | undefined): void {
  if (!cell || cell.derived) return;
  target.count += cell.count;
  for (const [endpoint, n] of Object.entries(cell.endpoints)) {
    target.endpoints[endpoint] = (target.endpoints[endpoint] ?? 0) + n;
  }
}

/** Gruppen ohne eigenen Knoten bekommen eigene Treffer plus die Summe der Mitglieder. */
export function applyPrinzipGroupDensity(
  perNode: Record<string, DensityCell>,
  groups: readonly PrinzipGroupRef[],
  canonicalNodeIds: ReadonlySet<string>,
): Record<string, DensityCell> {
  const next: Record<string, DensityCell> = {};
  for (const [id, cell] of Object.entries(perNode)) next[id] = cloneCell(cell);

  for (const group of groups) {
    if (canonicalNodeIds.has(group.id)) continue;
    if (perNode[group.id]?.derived) continue;
    const acc = { count: 0, endpoints: {} as Record<string, number> };
    addCell(acc, perNode[group.id]);
    for (const memberId of group.memberIds) {
      if (memberId === group.id) continue;
      addCell(acc, perNode[memberId]);
    }
    next[group.id] = { count: acc.count, endpoints: acc.endpoints, derived: true };
  }
  return next;
}

/** Zahl neben dem Gruppennamen: abgeleitete Summe, oder bei einem echten Knoten die Mitglieder. */
export function groupLegendCount(
  group: PrinzipGroupRef,
  perNode: Record<string, DensityCell> | null | undefined,
  canonicalNodeIds: ReadonlySet<string>,
): number | null {
  if (!perNode) return null;
  if (!canonicalNodeIds.has(group.id)) return perNode[group.id]?.count ?? 0;
  return group.memberIds.reduce((sum, id) => sum + (perNode[id]?.count ?? 0), 0);
}

/** Skala nur über echte Knoten. Gruppensummen verschieben Maximum und Median nicht. */
export function canonicalDensityStats(
  perNode: Record<string, DensityCell>,
  canonicalNodeIds: readonly string[],
): { minCount: number; maxCount: number; median: number; totalNodes: number; zeroResonanceNodes: string[] } {
  const ids = canonicalNodeIds.filter(id => perNode[id] && !perNode[id].derived);
  const counts = ids.map(id => perNode[id].count);
  const sorted = [...counts].sort((a, b) => a - b);
  const median = sorted.length === 0
    ? 0
    : sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  return {
    minCount: sorted[0] ?? 0,
    maxCount: sorted[sorted.length - 1] ?? 0,
    median,
    totalNodes: ids.length,
    zeroResonanceNodes: ids.filter(id => perNode[id].count === 0),
  };
}
