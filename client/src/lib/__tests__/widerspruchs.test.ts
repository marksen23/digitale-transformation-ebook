import { describe, it, expect } from "vitest";
import { detectAnchorTensions } from "../widerspruchs.js";
import type { ResonanzEntry } from "../resonanzenIndex.js";

function makeEntry(id: string, anchor: string, overrides: Partial<ResonanzEntry> = {}): ResonanzEntry {
  return {
    id,
    ts: "2026-01-01T00:00:00Z",
    endpoint: "analyse",
    anchor,
    nodeIds: [],
    prompt: `Frage ${id}`,
    status: "raw",
    responseLength: 100,
    ...overrides,
  } as ResonanzEntry;
}

describe("detectAnchorTensions", () => {
  it("returns no-embeddings status when embeddings is empty", () => {
    const entries = [makeEntry("e1", "analyse:a"), makeEntry("e2", "analyse:a")];
    const result = detectAnchorTensions(entries, {});
    expect(result.status).toBe("no-embeddings");
    expect(result.tensionsFound).toBe(0);
    expect(result.anchorsChecked).toBe(0);
  });

  it("returns no-multi-anchors status when no anchor has >= 2 entries", () => {
    const entries = [makeEntry("e1", "analyse:a"), makeEntry("e2", "chapter:kap1")];
    const embeddings = { e1: [1, 0], e2: [0, 1] };
    const result = detectAnchorTensions(entries, embeddings);
    expect(result.status).toBe("no-multi-anchors");
  });

  it("detects tension when two entries at same anchor have low cosine similarity", () => {
    const entries = [
      makeEntry("e1", "analyse:a+b"),
      makeEntry("e2", "analyse:a+b"),
    ];
    const embeddings = {
      e1: [1, 0, 0],
      e2: [0, 1, 0],
    };
    const result = detectAnchorTensions(entries, embeddings, 0.9);
    expect(result.tensionsFound).toBeGreaterThan(0);
    expect(result.tensions).toHaveLength(1);
    expect(result.tensions[0].anchor).toBe("analyse:a+b");
  });

  it("finds no tensions when entries are highly similar", () => {
    const entries = [
      makeEntry("e1", "analyse:a"),
      makeEntry("e2", "analyse:a"),
    ];
    const embeddings = {
      e1: [1, 0, 0],
      e2: [0.99, 0.01, 0],
    };
    const result = detectAnchorTensions(entries, embeddings, 0.5);
    expect(result.tensionsFound).toBe(0);
  });

  it("computes medianAnchorCosine", () => {
    const entries = [
      makeEntry("e1", "analyse:a"),
      makeEntry("e2", "analyse:a"),
    ];
    const embeddings = {
      e1: [1, 0],
      e2: [0, 1],
    };
    const result = detectAnchorTensions(entries, embeddings, 0.9);
    expect(result.medianAnchorCosine).not.toBeNull();
    expect(result.medianAnchorCosine).toBeCloseTo(0, 4);
  });

  it("skips entries without embeddings", () => {
    const entries = [
      makeEntry("e1", "analyse:a"),
      makeEntry("e2", "analyse:a"),
      makeEntry("e3", "analyse:a"),
    ];
    const embeddings = { e1: [1, 0] };
    const result = detectAnchorTensions(entries, embeddings, 0.9);
    expect(result.tensions).toHaveLength(0);
  });

  it("handles large corpus: filters to approved/published", () => {
    const entries: ResonanzEntry[] = [];
    for (let i = 0; i < 250; i++) {
      entries.push(makeEntry(`e${i}`, "analyse:a", { status: i < 2 ? "published" : "raw" }));
    }
    const embeddings: Record<string, number[]> = {
      e0: [1, 0],
      e1: [0, 1],
    };
    const result = detectAnchorTensions(entries, embeddings, 0.9);
    expect(result.anchorsChecked).toBeLessThanOrEqual(entries.filter(e => e.status === "published" || e.status === "approved").length);
  });
});
