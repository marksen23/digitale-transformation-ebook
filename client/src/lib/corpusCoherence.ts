/**
 * corpusCoherence.ts — Echos, Werk-Drift, Kohärenz-Statistik.
 *
 * Liest die nearDuplicates + werkVoiceScore Felder aus dem Index und
 * leitet daraus zwei Sichten ab:
 *
 *   1. Echo-Cluster — transitive Gruppen von Einträgen, die einander
 *      semantisch wiederholen (Cosine ≥0.88). "Diese drei sagen im
 *      Kern dasselbe." Curator entscheidet, ob das beabsichtigt war.
 *
 *   2. Werk-Drift — Einträge mit niedrigem werkVoiceScore. Distanz zum
 *      Zentrum der approved/published-Einträge. Hilft die Stimme des
 *      Werks rein zu halten, ohne erzwungen homogen zu werden.
 *
 * Beide Operationen sind rein client-seitig — die Berechnung der
 * Embeddings selbst passierte schon im Build-Step.
 */
import type { ResonanzEntry } from "./resonanzenIndex";

export interface EchoCluster {
  /** Transitive Gruppe von Einträgen, die einander als Near-Duplicates referenzieren. */
  ids: string[];
  /** Endpoint der mehrheitlich vertreten ist (z.B. "analyse" wenn 2/3 analyse sind). */
  dominantEndpoint: string;
  /** Anker, falls alle Mitglieder den gleichen haben — sonst null. */
  sharedAnchor: string | null;
}

export interface CoherenceReport {
  /** Wie viele Einträge mindestens ein nearDuplicate haben. */
  entriesWithEchoes: number;
  /** Transitive Cluster — jede Gruppe ist eine "Aussage, die mehrfach gesagt wird". */
  clusters: EchoCluster[];
  /** Anzahl Einträge mit niedrigem werkVoiceScore (<0.55 default). */
  driftCandidates: number;
  /** Top-N Drift-Kandidaten, sortiert nach werkVoiceScore aufsteigend. */
  topDrift: ResonanzEntry[];
  /** Statistik über werkVoiceScore (min, max, median) — gibt der UI Kontext. */
  voiceStats: { min: number; median: number; max: number; mean: number } | null;
}

const DRIFT_THRESHOLD = 0.55;

/**
 * Findet transitive Cluster über nearDuplicates.
 * Union-Find-Algorithmus: jeder Eintrag startet als eigene Gruppe,
 * dann werden Gruppen gemerged, wenn ein Near-Duplicate-Link existiert.
 */
function buildClusters(entries: ResonanzEntry[]): string[][] {
  const byId = new Map<string, ResonanzEntry>(entries.map(e => [e.id, e]));
  const parent = new Map<string, string>();

  function find(id: string): string {
    let p = parent.get(id) ?? id;
    if (p !== id) {
      p = find(p);
      parent.set(id, p);
    }
    return p;
  }
  function union(a: string, b: string) {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent.set(pa, pb);
  }

  for (const e of entries) {
    parent.set(e.id, e.id);
  }
  for (const e of entries) {
    for (const dup of e.nearDuplicates ?? []) {
      if (byId.has(dup)) union(e.id, dup);
    }
  }

  const groups = new Map<string, string[]>();
  for (const e of entries) {
    if (!e.nearDuplicates || e.nearDuplicates.length === 0) continue;
    const root = find(e.id);
    const arr = groups.get(root) ?? [];
    arr.push(e.id);
    groups.set(root, arr);
  }
  return Array.from(groups.values()).filter(g => g.length >= 2);
}

function mode<T>(arr: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const x of arr) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: T | undefined; let bestN = 0;
  counts.forEach((n, x) => { if (n > bestN) { bestN = n; best = x; } });
  return best;
}

export function analyzeCorpusCoherence(entries: ResonanzEntry[]): CoherenceReport {
  const byId = new Map<string, ResonanzEntry>(entries.map(e => [e.id, e]));
  const entriesWithEchoes = entries.filter(e => (e.nearDuplicates?.length ?? 0) > 0).length;

  // Cluster bauen
  const rawClusters = buildClusters(entries);
  const clusters: EchoCluster[] = rawClusters
    .map(ids => {
      const members = ids.map(id => byId.get(id)!).filter(Boolean);
      const endpoints = members.map(m => m.endpoint);
      const anchors = new Set(members.map(m => m.anchor));
      return {
        ids,
        dominantEndpoint: mode(endpoints) ?? endpoints[0] ?? "?",
        sharedAnchor: anchors.size === 1 ? Array.from(anchors)[0] : null,
      };
    })
    // Größte Cluster zuerst, dann nach geteiltem Anker priorisieren
    .sort((a, b) => {
      if (b.ids.length !== a.ids.length) return b.ids.length - a.ids.length;
      return (a.sharedAnchor ? 0 : 1) - (b.sharedAnchor ? 0 : 1);
    });

  // Drift-Kandidaten
  const withScore = entries.filter((e): e is ResonanzEntry & { werkVoiceScore: number } =>
    typeof e.werkVoiceScore === "number"
  );
  const drift = withScore
    .filter(e => e.werkVoiceScore < DRIFT_THRESHOLD)
    .sort((a, b) => a.werkVoiceScore - b.werkVoiceScore);

  // Statistik
  let voiceStats: CoherenceReport["voiceStats"] = null;
  if (withScore.length > 0) {
    const scores = withScore.map(e => e.werkVoiceScore).sort((a, b) => a - b);
    voiceStats = {
      min: scores[0],
      max: scores[scores.length - 1],
      median: scores[Math.floor(scores.length / 2)],
      mean: scores.reduce((s, x) => s + x, 0) / scores.length,
    };
  }

  return {
    entriesWithEchoes,
    clusters,
    driftCandidates: drift.length,
    topDrift: drift.slice(0, 8),
    voiceStats,
  };
}
