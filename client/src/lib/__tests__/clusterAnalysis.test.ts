import { describe, it, expect } from "vitest";
import { kmeans, findOptimalK, summarizeClusters } from "../clusterAnalysis.js";

function randomVec(dim: number, seed: number): number[] {
  let s = seed;
  return Array.from({ length: dim }, () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff - 0.5;
  });
}

describe("kmeans", () => {
  it("returns empty result for empty input", () => {
    const r = kmeans([], 3);
    expect(r.centroids).toHaveLength(0);
    expect(r.assignments).toHaveLength(0);
  });

  it("returns empty result for k=0", () => {
    const r = kmeans([[1, 0]], 0);
    expect(r.centroids).toHaveLength(0);
  });

  it("handles k > n (each point its own cluster)", () => {
    const vecs = [[1, 0, 0], [0, 1, 0]];
    const r = kmeans(vecs, 5);
    expect(r.centroids).toHaveLength(2);
    expect(r.assignments).toHaveLength(2);
    expect(r.sse).toBe(0);
  });

  it("assigns n vectors to exactly k clusters", () => {
    const vecs = Array.from({ length: 20 }, (_, i) => randomVec(8, i));
    const r = kmeans(vecs, 3);
    expect(new Set(r.assignments).size).toBeLessThanOrEqual(3);
    expect(r.assignments).toHaveLength(20);
  });

  it("produces deterministic results with same seed", () => {
    const vecs = Array.from({ length: 15 }, (_, i) => randomVec(4, i * 7));
    const r1 = kmeans(vecs, 3, 50, 42);
    const r2 = kmeans(vecs, 3, 50, 42);
    expect(r1.assignments).toEqual(r2.assignments);
  });

  it("produces different results with different seeds", () => {
    const vecs = Array.from({ length: 30 }, (_, i) => randomVec(4, i));
    const r1 = kmeans(vecs, 4, 50, 1);
    const r2 = kmeans(vecs, 4, 50, 999);
    const same = r1.assignments.every((a, i) => a === r2.assignments[i]);
    expect(same).toBe(false);
  });

  it("clusters clearly separated groups correctly", () => {
    const clusterA = Array.from({ length: 10 }, () => [1, 0, 0, 0]);
    const clusterB = Array.from({ length: 10 }, () => [0, 1, 0, 0]);
    const vecs = [...clusterA, ...clusterB];
    const r = kmeans(vecs, 2, 50, 42);
    const assignA = new Set(r.assignments.slice(0, 10));
    const assignB = new Set(r.assignments.slice(10, 20));
    expect(assignA.size).toBe(1);
    expect(assignB.size).toBe(1);
    expect(assignA).not.toEqual(assignB);
  });
});

describe("findOptimalK", () => {
  it("returns a k within the given range", () => {
    const vecs = Array.from({ length: 30 }, (_, i) => randomVec(4, i));
    const result = findOptimalK(vecs, [2, 3, 4, 5]);
    expect([2, 3, 4, 5]).toContain(result.bestK);
  });

  it("includes results for all k values", () => {
    const vecs = Array.from({ length: 20 }, (_, i) => randomVec(4, i));
    const result = findOptimalK(vecs, [2, 3, 4]);
    expect(result.results).toHaveLength(3);
    expect(result.results.map(r => r.k)).toEqual([2, 3, 4]);
  });

  it("SSE is non-negative", () => {
    const vecs = Array.from({ length: 20 }, (_, i) => randomVec(4, i));
    const result = findOptimalK(vecs);
    for (const r of result.results) {
      expect(r.sse).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("summarizeClusters", () => {
  it("returns one summary per cluster", () => {
    const entries = [
      { id: "e1", endpoint: "analyse", nodeIds: ["a"], anchor: "analyse:a", ts: "2026-01-01T00:00:00Z", status: "raw", prompt: "p", responseLength: 10 },
      { id: "e2", endpoint: "analyse", nodeIds: ["a"], anchor: "analyse:a", ts: "2026-01-02T00:00:00Z", status: "raw", prompt: "p", responseLength: 10 },
      { id: "e3", endpoint: "chapter", nodeIds: [], anchor: "chapter:k1", ts: "2026-01-03T00:00:00Z", status: "raw", prompt: "p", responseLength: 10 },
    ] as Parameters<typeof summarizeClusters>[0];
    const embeddings: Record<string, number[]> = {
      e1: [1, 0], e2: [0.9, 0.1], e3: [0, 1],
    };
    const centroids = [[0.95, 0.05], [0, 1]];
    const assignments = [0, 0, 1];
    const ids = ["e1", "e2", "e3"];
    const result = summarizeClusters(entries, embeddings, centroids, assignments, ids);
    expect(result).toHaveLength(2);
    expect(result[0].size).toBe(2);
    expect(result[1].size).toBe(1);
  });
});
