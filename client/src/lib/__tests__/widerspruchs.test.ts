import { describe, expect, it } from "vitest";
import { detectAnchorTensions } from "../widerspruchs";
import type { ResonanzEntry } from "../resonanzenIndex";

const makeEntry = (
  id: string,
  anchor: string,
  status: ResonanzEntry["status"] = "approved",
): ResonanzEntry => ({
  id, ts: "2024-01-01T00:00:00Z", endpoint: "chapter", anchor,
  nodeIds: [], status, prompt: "", response: "", contextMeta: {},
});

// Orthogonal unit vectors → cosine = 0.0
const V0 = [1, 0, 0];
const V1 = [0, 1, 0];
const V2 = [0, 0, 1];
// Very similar vectors → cosine ≈ 0.9998
const VSIM_A = [0.999, 0.001, 0];
const VSIM_B = [0.998, 0.002, 0];

// ─── detectAnchorTensions ────────────────────────────────────────────────────

describe("detectAnchorTensions", () => {
  it("returns no-embeddings status when embeddings object is empty", () => {
    const r = detectAnchorTensions([], {});
    expect(r.status).toBe("no-embeddings");
    expect(r.tensionsFound).toBe(0);
    expect(r.anchorsChecked).toBe(0);
  });

  it("returns no-multi-anchors when every anchor has only one entry", () => {
    const entries = [makeEntry("a", "chapter:a"), makeEntry("b", "chapter:b")];
    const r = detectAnchorTensions(entries, { a: V0, b: V1 });
    expect(r.status).toBe("no-multi-anchors");
    expect(r.tensionsFound).toBe(0);
  });

  it("detects a tension when cosine < threshold", () => {
    const entries = [makeEntry("a", "chapter:same"), makeEntry("b", "chapter:same")];
    const r = detectAnchorTensions(entries, { a: V0, b: V1 }, 0.55);
    expect(r.status).toBe("ok");
    expect(r.tensionsFound).toBe(1);
    expect(r.tensions[0].anchor).toBe("chapter:same");
    expect(r.tensions[0].similarity).toBeCloseTo(0, 4);
  });

  it("does not flag as tension when cosine >= threshold", () => {
    const entries = [makeEntry("a", "chapter:same"), makeEntry("b", "chapter:same")];
    const r = detectAnchorTensions(entries, { a: VSIM_A, b: VSIM_B }, 0.55);
    expect(r.tensionsFound).toBe(0);
  });

  it("tensions are sorted by similarity ascending (most divergent first)", () => {
    const entries = [
      makeEntry("a", "chapter:x"),
      makeEntry("b", "chapter:x"),
      makeEntry("c", "chapter:x"),
    ];
    // a↔b: cosine≈0, a↔c: cosine≈0.707, b↔c: cosine≈0.707
    const embeddings = {
      a: [1, 0, 0],
      b: [0, 1, 0],
      c: [0.7071, 0.7071, 0],
    };
    const r = detectAnchorTensions(entries, embeddings, 0.9);
    for (let i = 1; i < r.tensions.length; i++) {
      expect(r.tensions[i - 1].similarity).toBeLessThanOrEqual(r.tensions[i].similarity);
    }
  });

  it("skips pairs where either entry has no embedding", () => {
    const entries = [makeEntry("a", "chapter:same"), makeEntry("b", "chapter:same")];
    // b has no embedding
    const r = detectAnchorTensions(entries, { a: V0 }, 0.55);
    // Can't form any pair → no tensions detected (b skipped)
    expect(r.tensionsFound).toBe(0);
  });

  it("filters to approved/published when corpus has more than 200 entries", () => {
    const entries: ResonanzEntry[] = [];
    // 201 entries total: 2 approved at same anchor, rest scattered
    entries.push(makeEntry("ap1", "chapter:dense", "approved"));
    entries.push(makeEntry("ap2", "chapter:dense", "approved"));
    for (let i = 0; i < 199; i++) {
      entries.push(makeEntry(`raw${i}`, `chapter:unique${i}`, "raw"));
    }
    const embeddings: Record<string, number[]> = {};
    for (const e of entries) {
      embeddings[e.id] = e.id === "ap1" ? V0 : V1; // ap1 ↔ ap2 are orthogonal → tension
    }
    const r = detectAnchorTensions(entries, embeddings, 0.55);
    expect(r.status).toBe("ok");
    // The raw entries are excluded, so only the approved pair at chapter:dense is checked
    expect(r.anchorsChecked).toBe(1);
    expect(r.tensionsFound).toBe(1);
  });

  it("medianAnchorCosine is null when no comparisons were made", () => {
    const entries = [makeEntry("a", "chapter:only")];
    const r = detectAnchorTensions(entries, { a: V0 });
    expect(r.medianAnchorCosine).toBeNull();
  });

  it("medianAnchorCosine is the median of all pairwise cosines", () => {
    // 3 entries at same anchor → 3 pairs:
    //   a↔b: cos≈0.0,  a↔c: cos≈0.707,  b↔c: cos≈0.707
    // sorted: [0, 0.707, 0.707] → median = 0.707
    const entries = [
      makeEntry("a", "chapter:x"),
      makeEntry("b", "chapter:x"),
      makeEntry("c", "chapter:x"),
    ];
    const embeddings = { a: [1, 0, 0], b: [0, 1, 0], c: [0.7071, 0.7071, 0] };
    const r = detectAnchorTensions(entries, embeddings, 0.01);
    expect(r.medianAnchorCosine).toBeCloseTo(0.707, 2);
  });
});
