/**
 * widerspruchs.ts — Detection semantisch divergenter Antworten zum
 * gleichen Anker. Wenn `chapter:teil7` mehrfach gefragt wurde und
 * zwei Antworten unter der Cosine-Schwelle liegen, ist das ein
 * kuratorisches Signal: echter Widerspruch, zu generischer Anker,
 * oder legitime aber unterschiedliche Aspekte.
 */
import {
  cosineSimilarity, groupResonanzenByAnchor,
  type ResonanzEntry,
} from "./resonanzenIndex";

export interface TensionPair {
  anchor: string;
  endpoint: ResonanzEntry["endpoint"];
  entryA: ResonanzEntry;
  entryB: ResonanzEntry;
  similarity: number;
}

export interface TensionResult {
  /** Anzahl Anker mit ≥2 Einträgen, die geprüft wurden. */
  anchorsChecked: number;
  /** Anzahl Paare unter Schwelle (Spannungen). */
  tensionsFound: number;
  /** Median Cosine über alle Paare zum gleichen Anker (Diagnostik). */
  medianAnchorCosine: number | null;
  /** Die gefundenen Spannungen, sortiert nach niedrigster Similarity zuerst. */
  tensions: TensionPair[];
  /** Status der Detection: ob genug Daten für Aussagekraft. */
  status: "ok" | "no-multi-anchors" | "no-embeddings";
}

/**
 * Erkennt Anker-Spannungen. Gibt einen kompletten Result-Block zurück
 * (statt nur einer Liste), damit die UI auch sagen kann "0 Spannungen
 * bei N Ankern geprüft" — das ist informativ.
 *
 * Constraints:
 *   - Anker muss ≥2 Entries haben
 *   - beide Entries müssen ein Embedding haben
 *   - bei großem Korpus (>200 Einträge): nur status ∈ approved|published
 *     (sonst rauschen raw-Drafts den Signal weg)
 */
export function detectAnchorTensions(
  entries: ResonanzEntry[],
  embeddings: Record<string, number[]>,
  threshold = 0.55,
): TensionResult {
  if (Object.keys(embeddings).length === 0) {
    return { anchorsChecked: 0, tensionsFound: 0, medianAnchorCosine: null, tensions: [], status: "no-embeddings" };
  }

  // Bei großem Korpus auf kuratierte Einträge filtern.
  const filterStatuses = entries.length > 200
    ? new Set<ResonanzEntry["status"]>(["approved", "published"])
    : null;
  const eligible = filterStatuses
    ? entries.filter(e => filterStatuses.has(e.status))
    : entries;

  const byAnchor = groupResonanzenByAnchor(eligible);
  const multiAnchors = Array.from(byAnchor.entries()).filter(([, arr]) => arr.length >= 2);

  if (multiAnchors.length === 0) {
    return { anchorsChecked: 0, tensionsFound: 0, medianAnchorCosine: null, tensions: [], status: "no-multi-anchors" };
  }

  const tensions: TensionPair[] = [];
  const allCosines: number[] = [];

  for (const [anchor, group] of multiAnchors) {
    // Paarweise Cosine über alle Einträge dieses Ankers
    for (let i = 0; i < group.length; i++) {
      const va = embeddings[group[i].id];
      if (!va) continue;
      for (let j = i + 1; j < group.length; j++) {
        const vb = embeddings[group[j].id];
        if (!vb) continue;
        const sim = cosineSimilarity(va, vb);
        allCosines.push(sim);
        if (sim < threshold) {
          tensions.push({
            anchor,
            endpoint: group[i].endpoint,
            entryA: group[i],
            entryB: group[j],
            similarity: sim,
          });
        }
      }
    }
  }

  // Median für die Diagnose-Anzeige
  let median: number | null = null;
  if (allCosines.length > 0) {
    const sorted = [...allCosines].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  tensions.sort((a, b) => a.similarity - b.similarity);

  return {
    anchorsChecked: multiAnchors.length,
    tensionsFound: tensions.length,
    medianAnchorCosine: median,
    tensions,
    status: "ok",
  };
}
