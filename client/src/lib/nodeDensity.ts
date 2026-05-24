/**
 * nodeDensity.ts — Loader für die im CI generierte
 * /resonanzen-node-density.json (vom build-resonanzen-index.ts).
 *
 * Datenform: pro Concept-Graph-Knoten Anzahl der KI-Resonanzen, die ihn
 * als nodeId-Anker tragen. Globale Stats (min/max/median, Liste der
 * Knoten ohne Resonanzen = "blinde Flecken").
 *
 * Wird im Begriffsnetz-Heatmap-Modus verwendet: Opacity-Skala der Knoten
 * = Resonanz-Dichte. Knoten ohne Resonanzen sind sehr blass und werden
 * separat als „Blinde Flecken" in der LEFT-Sidebar gelistet.
 */

export interface NodeDensityEntry {
  count: number;
  endpoints: Record<string, number>;
}

export interface NodeDensityFile {
  generatedAt: string;
  perNode: Record<string, NodeDensityEntry>;
  stats: {
    minCount: number;
    maxCount: number;
    median: number;
    totalNodes: number;
    zeroResonanceNodes: string[];
  };
}

let _cached: NodeDensityFile | null = null;
let _inFlight: Promise<NodeDensityFile | null> | null = null;

/**
 * Lädt resonanzen-node-density.json einmal und cached. Bei Fehler/404
 * (z.B. ältere Deploys vor Feature-Rollout) wird null zurückgegeben —
 * Caller MUSS damit umgehen können (Heatmap-Modus dann graceful aus).
 */
export async function loadNodeDensity(): Promise<NodeDensityFile | null> {
  if (_cached) return _cached;
  if (_inFlight) return _inFlight;
  _inFlight = (async () => {
    try {
      const res = await fetch("/resonanzen-node-density.json", { cache: "no-cache" });
      if (!res.ok) {
        console.warn("[nodeDensity] not available:", res.status);
        return null;
      }
      const data = (await res.json()) as NodeDensityFile;
      _cached = data;
      return data;
    } catch (err) {
      console.warn("[nodeDensity] load failed:", err);
      return null;
    } finally {
      _inFlight = null;
    }
  })();
  return _inFlight;
}

/**
 * Density-Ratio für einen einzelnen Knoten (0..1). 0 = unangetastet
 * (blinder Fleck), 1 = höchste Aktivität im Korpus. Wird für die
 * Opacity-Skala der Heatmap verwendet.
 */
export function densityRatio(density: NodeDensityFile | null, nodeId: string): number {
  if (!density) return 1;  // ohne density-Daten zeigen wir alle Knoten voll
  const entry = density.perNode[nodeId];
  if (!entry || density.stats.maxCount === 0) return 0;
  return entry.count / density.stats.maxCount;
}
