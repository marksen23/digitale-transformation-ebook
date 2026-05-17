import { describe, expect, it } from "vitest";
import { kmeans, findOptimalK, summarizeClusters, type KMeansResult } from "../clusterAnalysis";
import type { ResonanzEntry } from "../resonanzenIndex";

const makeEntry = (
  id: string,
  endpoint: ResonanzEntry["endpoint"] = "chapter",
  nodeIds: string[] = [],
): ResonanzEntry => ({
  id, ts: "2024-01-01T00:00:00Z", endpoint, anchor: "chapter:test",
  nodeIds, status: "approved", prompt: "", response: "", contextMeta: {},
});

// ─── kmeans ──────────────────────────────────────────────────────────────────

describe("kmeans", () => {
  it("returns empty result for empty input", () => {
    const r = kmeans([], 3);
    expect(r.assignments).toEqual([]);
    expect(r.centroids).toEqual([]);
    expect(r.sse).toBe(0);
    expect(r.iterations).toBe(0);
  });

  it("returns empty result for k=0", () => {
    const r = kmeans([[1, 0]], 0);
    expect(r.assignments).toEqual([]);
    expect(r.centroids).toEqual([]);
  });

  it("assigns each point its own cluster when k > n", () => {
    const vectors = [[1, 0, 0], [0, 1, 0]];
    const r = kmeans(vectors, 5);
    expect(r.centroids).toHaveLength(2);
    expect(r.assignments).toHaveLength(2);
    expect(r.assignments[0]).not.toBe(r.assignments[1]);
  });

  it("k=1: all points go to cluster 0", () => {
    const vectors = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const r = kmeans(vectors, 1);
    expect(r.centroids).toHaveLength(1);
    expect(r.assignments).toEqual([0, 0, 0]);
  });

  it("separates clearly distinct clusters", () => {
    // 4 vectors near [1,0,0] and 4 near [0,1,0]
    const near100 = [[1, 0.01, 0], [1, -0.01, 0], [0.99, 0.02, 0], [0.99, -0.02, 0]];
    const near010 = [[0.01, 1, 0], [-0.01, 1, 0], [0.02, 0.99, 0], [-0.02, 0.99, 0]];
    const r = kmeans([...near100, ...near010], 2, 50, 42);
    const clusterOf = (i: number) => r.assignments[i];
    // first 4 should share a cluster, last 4 another
    expect(clusterOf(0)).toBe(clusterOf(1));
    expect(clusterOf(0)).toBe(clusterOf(2));
    expect(clusterOf(0)).toBe(clusterOf(3));
    expect(clusterOf(4)).toBe(clusterOf(5));
    expect(clusterOf(4)).toBe(clusterOf(6));
    expect(clusterOf(0)).not.toBe(clusterOf(4));
  });

  it("is deterministic: same seed produces identical assignments", () => {
    const vectors = Array.from({ length: 20 }, (_, i) => [
      Math.sin(i * 0.6),
      Math.cos(i * 1.1),
      Math.sin(i * 0.3),
    ]);
    const r1 = kmeans(vectors, 3, 50, 42);
    const r2 = kmeans(vectors, 3, 50, 42);
    expect(r1.assignments).toEqual(r2.assignments);
    expect(r1.sse).toBeCloseTo(r2.sse);
  });

  it("SSE is non-negative", () => {
    const vectors = Array.from({ length: 15 }, (_, i) => [Math.cos(i), Math.sin(i)]);
    const r = kmeans(vectors, 3, 50, 42);
    expect(r.sse).toBeGreaterThanOrEqual(0);
  });

  it("returns k centroids when k <= n", () => {
    const vectors = Array.from({ length: 10 }, (_, i) => [i / 10, 1 - i / 10]);
    const r = kmeans(vectors, 4, 50, 42);
    expect(r.centroids).toHaveLength(4);
  });
});

// ─── findOptimalK ─────────────────────────────────────────────────────────────

describe("findOptimalK", () => {
  it("returns bestK within the provided kRange", () => {
    const vectors = Array.from({ length: 30 }, (_, i) => [Math.sin(i), Math.cos(i)]);
    const r = findOptimalK(vectors, [3, 4, 5, 6, 7, 8]);
    expect(r.bestK).toBeGreaterThanOrEqual(3);
    expect(r.bestK).toBeLessThanOrEqual(8);
  });

  it("includes SSE results for every k in range", () => {
    const vectors = Array.from({ length: 20 }, (_, i) => [i / 20, (20 - i) / 20]);
    const kRange = [2, 3, 4, 5];
    const r = findOptimalK(vectors, kRange);
    expect(r.results.map(x => x.k)).toEqual(kRange);
  });

  it("all SSE values are non-negative", () => {
    const vectors = Array.from({ length: 20 }, (_, i) => [i / 20, Math.sin(i)]);
    const r = findOptimalK(vectors);
    for (const entry of r.results) {
      expect(entry.sse).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns first k when range has fewer than 3 entries (no elbow)", () => {
    const vectors = Array.from({ length: 10 }, (_, i) => [i, 0]);
    const r = findOptimalK(vectors, [3, 4]);
    expect(r.results).toHaveLength(2);
    expect(r.bestK).toBe(r.results[0].k);
  });

  it("uses default range [3..8] when not specified", () => {
    const vectors = Array.from({ length: 30 }, (_, i) => [Math.cos(i), Math.sin(i)]);
    const r = findOptimalK(vectors);
    expect(r.results).toHaveLength(6);
    expect(r.results[0].k).toBe(3);
    expect(r.results[5].k).toBe(8);
  });
});

// ─── summarizeClusters ───────────────────────────────────────────────────────

describe("summarizeClusters", () => {
  it("produces one summary per cluster", () => {
    const entries = [
      makeEntry("a", "chapter"),
      makeEntry("b", "chapter"),
      makeEntry("c", "enkidu"),
    ];
    const embeddings: Record<string, number[]> = {
      a: [1, 0, 0], b: [0.9, 0.1, 0], c: [0, 1, 0],
    };
    const centroids = [[1, 0, 0], [0, 1, 0]];
    const summaries = summarizeClusters(entries, embeddings, centroids, [0, 0, 1], ["a", "b", "c"]);
    expect(summaries).toHaveLength(2);
  });

  it("identifies dominant endpoint correctly", () => {
    const entries = [
      makeEntry("a", "chapter"),
      makeEntry("b", "chapter"),
      makeEntry("c", "enkidu"),
    ];
    const embeddings: Record<string, number[]> = {
      a: [1, 0], b: [0.9, 0.1], c: [0, 1],
    };
    const centroids = [[0.95, 0.05], [0, 1]];
    const summaries = summarizeClusters(entries, embeddings, centroids, [0, 0, 1], ["a", "b", "c"]);
    const bigCluster = summaries[0]; // sorted largest first
    expect(bigCluster.dominantEndpoint).toBe("chapter");
    expect(bigCluster.size).toBe(2);
  });

  it("sorts summaries by size descending", () => {
    // 3 in cluster 0, 1 in cluster 1
    const entries = [
      makeEntry("a"), makeEntry("b"), makeEntry("c"), makeEntry("d"),
    ];
    const embeddings: Record<string, number[]> = {
      a: [1, 0], b: [0.9, 0.1], c: [0.8, 0.2], d: [0, 1],
    };
    const centroids = [[0.9, 0.1], [0, 1]];
    const summaries = summarizeClusters(entries, embeddings, centroids, [0, 0, 0, 1], ["a", "b", "c", "d"]);
    expect(summaries[0].size).toBeGreaterThanOrEqual(summaries[1].size);
  });

  it("accumulates topNodeIds by frequency across members", () => {
    const entries = [
      makeEntry("a", "chapter", ["n1", "n2"]),
      makeEntry("b", "chapter", ["n1"]),
    ];
    const embeddings: Record<string, number[]> = { a: [1, 0], b: [0.9, 0.1] };
    const centroids = [[0.95, 0.05]];
    const summaries = summarizeClusters(entries, embeddings, centroids, [0, 0], ["a", "b"]);
    const top = summaries[0].topNodeIds;
    expect(top.find(x => x.id === "n1")!.count).toBe(2);
    expect(top.find(x => x.id === "n2")!.count).toBe(1);
  });
});
