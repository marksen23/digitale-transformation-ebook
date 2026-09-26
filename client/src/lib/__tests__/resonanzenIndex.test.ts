import { describe, it, expect } from "vitest";
import { cosineSimilarity, groupResonanzenByNode, groupResonanzenByAnchor } from "../resonanzenIndex.js";
import type { ResonanzEntry } from "../resonanzenIndex.js";

function makeEntry(overrides: Partial<ResonanzEntry> & { id: string }): ResonanzEntry {
  return {
    id: overrides.id,
    ts: overrides.ts ?? "2026-01-01T00:00:00Z",
    endpoint: overrides.endpoint ?? "analyse",
    anchor: overrides.anchor ?? "analyse:test",
    nodeIds: overrides.nodeIds ?? [],
    prompt: overrides.prompt ?? "Frage?",
    status: overrides.status ?? "raw",
    responseLength: overrides.responseLength ?? 100,
    ...overrides,
  } as ResonanzEntry;
}

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
  });
  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });
  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });
  it("returns 0 for zero vector", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
  it("is symmetric", () => {
    const a = [0.3, 0.7, 0.1];
    const b = [0.5, 0.2, 0.9];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 8);
  });
});

describe("groupResonanzenByNode", () => {
  it("groups entries by nodeId", () => {
    const entries = [
      makeEntry({ id: "e1", nodeIds: ["begriffA", "begriffB"] }),
      makeEntry({ id: "e2", nodeIds: ["begriffA"] }),
      makeEntry({ id: "e3", nodeIds: ["begriffC"] }),
    ];
    const map = groupResonanzenByNode(entries);
    expect(map.get("begriffA")?.map(e => e.id)).toContain("e1");
    expect(map.get("begriffA")?.map(e => e.id)).toContain("e2");
    expect(map.get("begriffB")?.map(e => e.id)).toContain("e1");
    expect(map.get("begriffC")?.map(e => e.id)).toContain("e3");
  });

  it("sorts entries newest first per node", () => {
    const entries = [
      makeEntry({ id: "older", nodeIds: ["begriffA"], ts: "2026-01-01T00:00:00Z" }),
      makeEntry({ id: "newer", nodeIds: ["begriffA"], ts: "2026-06-01T00:00:00Z" }),
    ];
    const map = groupResonanzenByNode(entries);
    const group = map.get("begriffA")!;
    expect(group[0].id).toBe("newer");
    expect(group[1].id).toBe("older");
  });

  it("returns empty map for empty input", () => {
    expect(groupResonanzenByNode([])).toEqual(new Map());
  });

  it("ignores entries with no nodeIds", () => {
    const entries = [makeEntry({ id: "e1", nodeIds: [] })];
    expect(groupResonanzenByNode(entries).size).toBe(0);
  });
});

describe("groupResonanzenByAnchor", () => {
  it("groups entries by anchor", () => {
    const entries = [
      makeEntry({ id: "e1", anchor: "analyse:begriffA+begriffB" }),
      makeEntry({ id: "e2", anchor: "analyse:begriffA+begriffB" }),
      makeEntry({ id: "e3", anchor: "chapter:kap1" }),
    ];
    const map = groupResonanzenByAnchor(entries);
    expect(map.get("analyse:begriffA+begriffB")?.length).toBe(2);
    expect(map.get("chapter:kap1")?.length).toBe(1);
  });

  it("sorts entries newest first per anchor", () => {
    const entries = [
      makeEntry({ id: "old", anchor: "chapter:kap1", ts: "2026-01-01T00:00:00Z" }),
      makeEntry({ id: "new", anchor: "chapter:kap1", ts: "2026-09-01T00:00:00Z" }),
    ];
    const map = groupResonanzenByAnchor(entries);
    expect(map.get("chapter:kap1")![0].id).toBe("new");
  });

  it("ignores entries with no anchor", () => {
    const e = makeEntry({ id: "e1" });
    (e as { anchor?: string }).anchor = undefined;
    const map = groupResonanzenByAnchor([e]);
    expect(map.size).toBe(0);
  });

  it("returns empty map for empty input", () => {
    expect(groupResonanzenByAnchor([])).toEqual(new Map());
  });
});
