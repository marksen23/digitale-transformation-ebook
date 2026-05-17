import { describe, expect, it } from "vitest";
import { analyzeCorpusCoherence } from "../corpusCoherence";
import type { ResonanzEntry } from "../resonanzenIndex";

const makeEntry = (
  id: string,
  opts: {
    nearDuplicates?: string[];
    werkVoiceScore?: number;
    corpusVoiceScore?: number;
    endpoint?: ResonanzEntry["endpoint"];
  } = {},
): ResonanzEntry => ({
  id,
  ts: "2024-01-01T00:00:00Z",
  endpoint: opts.endpoint ?? "chapter",
  anchor: "chapter:test",
  nodeIds: [],
  status: "approved",
  prompt: "",
  response: "",
  contextMeta: {},
  nearDuplicates: opts.nearDuplicates,
  werkVoiceScore: opts.werkVoiceScore,
  corpusVoiceScore: opts.corpusVoiceScore,
});

// ─── analyzeCorpusCoherence ──────────────────────────────────────────────────

describe("analyzeCorpusCoherence", () => {
  it("returns zero metrics for empty corpus", () => {
    const r = analyzeCorpusCoherence([]);
    expect(r.entriesWithEchoes).toBe(0);
    expect(r.clusters).toEqual([]);
    expect(r.driftCandidates).toBe(0);
    expect(r.voiceStats).toBeNull();
    expect(r.corpusVoiceStats).toBeNull();
  });

  it("counts entries that have at least one nearDuplicate", () => {
    const entries = [
      makeEntry("a", { nearDuplicates: ["b"] }),
      makeEntry("b", { nearDuplicates: ["a"] }),
      makeEntry("c"),
    ];
    expect(analyzeCorpusCoherence(entries).entriesWithEchoes).toBe(2);
  });

  it("builds transitive cluster: A↔B, B↔C → one cluster of three", () => {
    const entries = [
      makeEntry("a", { nearDuplicates: ["b"] }),
      makeEntry("b", { nearDuplicates: ["c"] }),
      makeEntry("c", { nearDuplicates: ["b"] }),
    ];
    const r = analyzeCorpusCoherence(entries);
    expect(r.clusters).toHaveLength(1);
    expect(new Set(r.clusters[0].ids)).toEqual(new Set(["a", "b", "c"]));
  });

  it("keeps independent duplicate pairs as separate clusters", () => {
    const entries = [
      makeEntry("a", { nearDuplicates: ["b"] }),
      makeEntry("b", { nearDuplicates: ["a"] }),
      makeEntry("c", { nearDuplicates: ["d"] }),
      makeEntry("d", { nearDuplicates: ["c"] }),
    ];
    expect(analyzeCorpusCoherence(entries).clusters).toHaveLength(2);
  });

  it("entries with no nearDuplicates do not appear in any cluster", () => {
    const entries = [
      makeEntry("a", { nearDuplicates: ["b"] }),
      makeEntry("b", { nearDuplicates: ["a"] }),
      makeEntry("alone"),
    ];
    const { clusters } = analyzeCorpusCoherence(entries);
    const allIds = clusters.flatMap(c => c.ids);
    expect(allIds).not.toContain("alone");
  });

  it("drift candidates include entries with werkVoiceScore < 0.55", () => {
    const entries = [
      makeEntry("low", { werkVoiceScore: 0.3 }),
      makeEntry("border", { werkVoiceScore: 0.55 }), // exactly at threshold — NOT drift
      makeEntry("high", { werkVoiceScore: 0.6 }),
    ];
    const r = analyzeCorpusCoherence(entries);
    expect(r.driftCandidates).toBe(1);
    expect(r.topDrift[0].id).toBe("low");
  });

  it("topDrift is sorted by werkVoiceScore ascending", () => {
    const entries = [
      makeEntry("x", { werkVoiceScore: 0.4 }),
      makeEntry("y", { werkVoiceScore: 0.1 }),
      makeEntry("z", { werkVoiceScore: 0.3 }),
    ];
    const r = analyzeCorpusCoherence(entries);
    expect(r.topDrift.map(e => e.id)).toEqual(["y", "z", "x"]);
  });

  it("voiceStats is null when no entries have werkVoiceScore", () => {
    const entries = [makeEntry("a"), makeEntry("b")];
    expect(analyzeCorpusCoherence(entries).voiceStats).toBeNull();
  });

  it("voiceStats computes correct min, max, mean, median", () => {
    const entries = [
      makeEntry("a", { werkVoiceScore: 0.2 }),
      makeEntry("b", { werkVoiceScore: 0.4 }),
      makeEntry("c", { werkVoiceScore: 0.6 }),
      makeEntry("d", { werkVoiceScore: 0.8 }),
    ];
    const { voiceStats } = analyzeCorpusCoherence(entries);
    expect(voiceStats).not.toBeNull();
    expect(voiceStats!.min).toBeCloseTo(0.2);
    expect(voiceStats!.max).toBeCloseTo(0.8);
    expect(voiceStats!.mean).toBeCloseTo(0.5);
    // scores sorted: [0.2, 0.4, 0.6, 0.8] → Math.floor(4/2)=2 → median = scores[2] = 0.6
    expect(voiceStats!.median).toBeCloseTo(0.6);
  });

  it("voiceStats median for odd-length array is the middle element", () => {
    const entries = [
      makeEntry("a", { werkVoiceScore: 0.1 }),
      makeEntry("b", { werkVoiceScore: 0.5 }),
      makeEntry("c", { werkVoiceScore: 0.9 }),
    ];
    const { voiceStats } = analyzeCorpusCoherence(entries);
    expect(voiceStats!.median).toBeCloseTo(0.5);
  });

  it("corpusVoiceStats is null when no entries have corpusVoiceScore", () => {
    const entries = [makeEntry("a", { werkVoiceScore: 0.5 })];
    expect(analyzeCorpusCoherence(entries).corpusVoiceStats).toBeNull();
  });

  it("corpusVoiceStats computed independently from voiceStats", () => {
    const entries = [
      makeEntry("a", { werkVoiceScore: 0.3, corpusVoiceScore: 0.7 }),
      makeEntry("b", { werkVoiceScore: 0.7, corpusVoiceScore: 0.3 }),
    ];
    const r = analyzeCorpusCoherence(entries);
    expect(r.voiceStats!.mean).toBeCloseTo(0.5);
    expect(r.corpusVoiceStats!.mean).toBeCloseTo(0.5);
  });
});
