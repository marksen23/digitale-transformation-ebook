/**
 * clusterAnalysis.ts — K-Means-Clusterung über die 768-dim
 * Resonanz-Embeddings, deterministisch (seeded RNG) und browser-side.
 *
 * Verwendet:
 *   - Cosine-Distance via cosineSimilarity (1 - cos)
 *   - k-means++ Init für stabile Centroid-Wahl
 *   - Elbow-Heuristik (Second-Derivative-Knick) zur k-Auswahl
 *
 * Ziel: dem Korpus-Kurator zeigen, wo sich Wissen ballt vs. wo
 * dünne Cluster auf Lücken hinweisen.
 */
import { cosineSimilarity, type ResonanzEntry } from "./resonanzenIndex";

// ─── Deterministisches RNG (mulberry32) ────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Vector-Helpers ────────────────────────────────────────────────────────

function zeroVec(d: number): number[] {
  return new Array(d).fill(0);
}

function addInto(target: number[], src: number[]): void {
  for (let i = 0; i < target.length; i++) target[i] += src[i];
}

function scaleInto(v: number[], factor: number): void {
  for (let i = 0; i < v.length; i++) v[i] *= factor;
}

/** Cosine-Distance ∈ [0, 2]. Zwei identische Vektoren: 0; orthogonal: 1. */
function cosineDistance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
}

// ─── k-means++ Init ────────────────────────────────────────────────────────

function kmeansPlusPlusInit(vectors: number[][], k: number, rng: () => number): number[][] {
  const n = vectors.length;
  const centroids: number[][] = [];
  // Erstes Centroid: zufällig
  centroids.push(vectors[Math.floor(rng() * n)].slice());
  while (centroids.length < k) {
    const dists = vectors.map(v => {
      let min = Infinity;
      for (const c of centroids) {
        const d = cosineDistance(v, c);
        if (d < min) min = d;
      }
      return min * min;  // D² für Wahrscheinlichkeits-Gewichtung
    });
    const sum = dists.reduce((s, d) => s + d, 0);
    if (sum === 0) {
      // alle Punkte identisch zu existierenden Centroids → zufällig auswählen
      centroids.push(vectors[Math.floor(rng() * n)].slice());
      continue;
    }
    let r = rng() * sum;
    let idx = 0;
    for (; idx < n; idx++) {
      r -= dists[idx];
      if (r <= 0) break;
    }
    centroids.push(vectors[Math.min(idx, n - 1)].slice());
  }
  return centroids;
}

// ─── K-Means ───────────────────────────────────────────────────────────────

export interface KMeansResult {
  centroids: number[][];
  assignments: number[];   // assignments[i] = Cluster-Index für vectors[i]
  sse: number;             // Sum of Squared cosine-distances
  iterations: number;
}

export function kmeans(
  vectors: number[][],
  k: number,
  maxIter = 50,
  seed = 42,
): KMeansResult {
  if (vectors.length === 0 || k <= 0) {
    return { centroids: [], assignments: [], sse: 0, iterations: 0 };
  }
  if (vectors.length < k) {
    // weniger Punkte als gewünschte Cluster → jeder Punkt ist sein eigener Cluster
    return {
      centroids: vectors.map(v => v.slice()),
      assignments: vectors.map((_, i) => i),
      sse: 0,
      iterations: 0,
    };
  }

  const dim = vectors[0].length;
  const rng = mulberry32(seed);
  let centroids = kmeansPlusPlusInit(vectors, k, rng);
  const assignments = new Array(vectors.length).fill(0);

  let iter = 0;
  for (; iter < maxIter; iter++) {
    let changed = false;
    // Assignment-Schritt
    for (let i = 0; i < vectors.length; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const d = cosineDistance(vectors[i], centroids[c]);
        if (d < bestDist) { bestDist = d; best = c; }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed = true;
      }
    }
    if (!changed && iter > 0) break;

    // Update-Schritt: arithmetic mean (für Cosine-Space ≈ Spherical-Mittel
    // nach Re-Normalisierung — Cosine ist skaleninvariant)
    const newCentroids: number[][] = Array.from({ length: k }, () => zeroVec(dim));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < vectors.length; i++) {
      addInto(newCentroids[assignments[i]], vectors[i]);
      counts[assignments[i]]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        scaleInto(newCentroids[c], 1 / counts[c]);
      } else {
        // leerer Cluster → reseed mit zufälligem Punkt
        newCentroids[c] = vectors[Math.floor(rng() * vectors.length)].slice();
      }
    }
    centroids = newCentroids;
  }

  // SSE als Cosine-Distance² Summe
  let sse = 0;
  for (let i = 0; i < vectors.length; i++) {
    const d = cosineDistance(vectors[i], centroids[assignments[i]]);
    sse += d * d;
  }

  return { centroids, assignments, sse, iterations: iter };
}

// ─── Elbow-Heuristik ───────────────────────────────────────────────────────

export interface ElbowResult {
  bestK: number;
  results: Array<{ k: number; sse: number }>;
}

/**
 * Wählt das k mit dem stärksten Knick im SSE-Verlauf (zweite Differenz max).
 * Default-Range 3..8 — robust für Korpus-Größen 30..500.
 */
export function findOptimalK(
  vectors: number[][],
  kRange: number[] = [3, 4, 5, 6, 7, 8],
  seed = 42,
): ElbowResult {
  const results = kRange.map(k => {
    const r = kmeans(vectors, k, 50, seed);
    return { k, sse: r.sse };
  });
  if (results.length < 3) {
    return { bestK: results[0]?.k ?? 3, results };
  }
  // Zweite Differenz: SSE[k-1] - 2*SSE[k] + SSE[k+1]; max → stärkster Knick
  let bestIdx = 1;
  let bestKnee = -Infinity;
  for (let i = 1; i < results.length - 1; i++) {
    const knee = results[i - 1].sse - 2 * results[i].sse + results[i + 1].sse;
    if (knee > bestKnee) {
      bestKnee = knee;
      bestIdx = i;
    }
  }
  return { bestK: results[bestIdx].k, results };
}

// ─── Cluster-Summary ───────────────────────────────────────────────────────

export interface ClusterSummary {
  index: number;
  size: number;
  topNodeIds: Array<{ id: string; count: number }>;
  closestEntries: ResonanzEntry[];        // top-3 nach Cosine-Sim zum Centroid
  dominantEndpoint: ResonanzEntry["endpoint"];
  endpointDistribution: Record<string, number>;
}

/**
 * Erzeugt pro Cluster eine Zusammenfassung: Größe, häufigste nodeIds,
 * drei zentrumsnächste Einträge, dominanter Endpoint.
 */
export function summarizeClusters(
  entries: ResonanzEntry[],
  embeddings: Record<string, number[]>,
  centroids: number[][],
  assignments: number[],
  ids: string[],   // ids[i] korrespondiert zu vectors[i] aus dem k-means-Lauf
): ClusterSummary[] {
  const k = centroids.length;
  const byId = new Map(entries.map(e => [e.id, e]));

  return Array.from({ length: k }, (_, c) => {
    const memberIds = ids.filter((_, i) => assignments[i] === c);
    const memberEntries = memberIds
      .map(id => byId.get(id))
      .filter((e): e is ResonanzEntry => !!e);

    // Top-NodeIds (Häufigkeit)
    const nodeFreq: Record<string, number> = {};
    for (const e of memberEntries) {
      for (const n of e.nodeIds) nodeFreq[n] = (nodeFreq[n] ?? 0) + 1;
    }
    const topNodeIds = Object.entries(nodeFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ id, count }));

    // Endpoint-Verteilung
    const epDist: Record<string, number> = {};
    for (const e of memberEntries) {
      epDist[e.endpoint] = (epDist[e.endpoint] ?? 0) + 1;
    }
    const dominantEndpoint = (Object.entries(epDist)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "chapter") as ResonanzEntry["endpoint"];

    // Top-3 zentrumsnächste
    const scored = memberEntries
      .map(e => ({ e, score: cosineSimilarity(embeddings[e.id], centroids[c]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(x => x.e);

    return {
      index: c,
      size: memberEntries.length,
      topNodeIds,
      closestEntries: scored,
      dominantEndpoint,
      endpointDistribution: epDist,
    };
  }).sort((a, b) => b.size - a.size);  // größte Cluster zuerst
}

// ─── Convenience-Wrapper ───────────────────────────────────────────────────

export interface ClusterAnalysis {
  k: number;
  clusters: ClusterSummary[];
  elbowResults: Array<{ k: number; sse: number }>;
}

/**
 * Komplettes Cluster-Pipeline: filtert Einträge mit Embedding,
 * findet optimales k via Elbow, lauft k-means, summarisiert.
 * Returnt null bei zu wenig Daten (<10 Embeddings).
 */
export function analyzeClusters(
  entries: ResonanzEntry[],
  embeddings: Record<string, number[]>,
): ClusterAnalysis | null {
  const withEmb = entries.filter(e => embeddings[e.id]);
  if (withEmb.length < 10) return null;

  const vectors = withEmb.map(e => embeddings[e.id]);
  const ids = withEmb.map(e => e.id);

  const elbow = findOptimalK(vectors);
  const result = kmeans(vectors, elbow.bestK);
  const clusters = summarizeClusters(entries, embeddings, result.centroids, result.assignments, ids);

  return { k: elbow.bestK, clusters, elbowResults: elbow.results };
}
