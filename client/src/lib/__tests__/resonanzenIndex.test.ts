import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  groupResonanzenByAnchor,
  groupResonanzenByNode,
  type ResonanzEntry,
} from "../resonanzenIndex";

const makeEntry = (
  id: string,
  anchor: string,
  nodeIds: string[],
  ts = "2024-01-01T00:00:00Z",
): ResonanzEntry => ({
  id, ts, endpoint: "chapter", anchor,
  nodeIds, status: "approved", prompt: "", response: "", contextMeta: {},
});

// ─── cosineSimilarity ────────────────────────────────────────────────────────

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
  });

  it("returns -1.0 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it("returns 0.0 for zero vector", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("returns 0.0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("is symmetric: sim(a, b) === sim(b, a)", () => {
    const a = [0.3, 0.7, 0.1];
    const b = [0.9, 0.1, 0.5];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a));
  });

  it("returns value between -1 and 1 for arbitrary vectors", () => {
    const a = [0.1, 0.5, 0.3, 0.9];
    const b = [0.8, 0.2, 0.6, 0.1];
    const s = cosineSimilarity(a, b);
    expect(s).toBeGreaterThanOrEqual(-1);
    expect(s).toBeLessThanOrEqual(1);
  });
});

// ─── groupResonanzenByAnchor ─────────────────────────────────────────────────

describe("groupResonanzenByAnchor", () => {
  it("groups entries by anchor key", () => {
    const entries = [
      makeEntry("a", "chapter:1", []),
      makeEntry("b", "chapter:1", []),
      makeEntry("c", "chapter:2", []),
    ];
    const map = groupResonanzenByAnchor(entries);
    expect(map.get("chapter:1")).toHaveLength(2);
    expect(map.get("chapter:2")).toHaveLength(1);
  });

  it("sorts each anchor group by ts descending (newest first)", () => {
    const entries = [
      makeEntry("a", "chapter:1", [], "2024-01-01T00:00:00Z"),
      makeEntry("b", "chapter:1", [], "2024-06-01T00:00:00Z"),
    ];
    const map = groupResonanzenByAnchor(entries);
    const group = map.get("chapter:1")!;
    expect(group[0].id).toBe("b");
    expect(group[1].id).toBe("a");
  });

  it("skips entries with empty anchor", () => {
    const entries = [makeEntry("a", "", [])];
    const map = groupResonanzenByAnchor(entries);
    expect(map.size).toBe(0);
  });

  it("returns empty map for empty input", () => {
    expect(groupResonanzenByAnchor([])).toEqual(new Map());
  });
});

// ─── groupResonanzenByNode ───────────────────────────────────────────────────

describe("groupResonanzenByNode", () => {
  it("groups entries by nodeId", () => {
    const entries = [
      makeEntry("a", "chapter:1", ["n1", "n2"]),
      makeEntry("b", "chapter:1", ["n1"]),
      makeEntry("c", "chapter:2", ["n3"]),
    ];
    const map = groupResonanzenByNode(entries);
    expect(map.get("n1")).toHaveLength(2);
    expect(map.get("n2")).toHaveLength(1);
    expect(map.get("n3")).toHaveLength(1);
  });

  it("an entry with multiple nodeIds appears in each node's group", () => {
    const entry = makeEntry("x", "chapter:1", ["alpha", "beta", "gamma"]);
    const map = groupResonanzenByNode([entry]);
    expect(map.get("alpha")![0].id).toBe("x");
    expect(map.get("beta")![0].id).toBe("x");
    expect(map.get("gamma")![0].id).toBe("x");
  });

  it("returns empty map for entries with no nodeIds", () => {
    const entries = [makeEntry("a", "chapter:1", [])];
    const map = groupResonanzenByNode(entries);
    expect(map.size).toBe(0);
  });
});
