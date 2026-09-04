import { describe, it, expect } from "vitest";
import { analyzeCorpusCoherence } from "../corpusCoherence.js";
import type { ResonanzEntry } from "../resonanzenIndex.js";

function makeEntry(id: string, overrides: Partial<ResonanzEntry> = {}): ResonanzEntry {
  return {
    id,
    ts: "2026-01-01T00:00:00Z",
    endpoint: "analyse",
    anchor: `analyse:${id}`,
    nodeIds: [],
    prompt: `Frage ${id}`,
    status: "raw",
    responseLength: 100,
    nearDuplicates: [],
    ...overrides,
  } as ResonanzEntry;
}

describe("analyzeCorpusCoherence", () => {
  it("returns zero echoes for entries with no nearDuplicates", () => {
    const entries = [makeEntry("e1"), makeEntry("e2"), makeEntry("e3")];
    const report = analyzeCorpusCoherence(entries);
    expect(report.entriesWithEchoes).toBe(0);
    expect(report.clusters).toHaveLength(0);
  });

  it("groups entries into echo clusters via Union-Find", () => {
    const entries = [
      makeEntry("e1", { nearDuplicates: ["e2"] }),
      makeEntry("e2", { nearDuplicates: ["e1"] }),
      makeEntry("e3"),
    ];
    const report = analyzeCorpusCoherence(entries);
    expect(report.clusters).toHaveLength(1);
    expect(report.clusters[0].ids).toContain("e1");
    expect(report.clusters[0].ids).toContain("e2");
  });

  it("creates transitive cluster when A→B and B→C", () => {
    const entries = [
      makeEntry("e1", { nearDuplicates: ["e2"] }),
      makeEntry("e2", { nearDuplicates: ["e1", "e3"] }),
      makeEntry("e3", { nearDuplicates: ["e2"] }),
    ];
    const report = analyzeCorpusCoherence(entries);
    expect(report.clusters).toHaveLength(1);
    const cluster = report.clusters[0];
    expect(cluster.ids).toHaveLength(3);
  });

  it("reports sharedAnchor when all cluster members share an anchor", () => {
    const entries = [
      makeEntry("e1", { anchor: "analyse:test", nearDuplicates: ["e2"] }),
      makeEntry("e2", { anchor: "analyse:test", nearDuplicates: ["e1"] }),
    ];
    const report = analyzeCorpusCoherence(entries);
    expect(report.clusters[0].sharedAnchor).toBe("analyse:test");
  });

  it("reports null sharedAnchor when cluster members have different anchors", () => {
    const entries = [
      makeEntry("e1", { anchor: "analyse:a", nearDuplicates: ["e2"] }),
      makeEntry("e2", { anchor: "analyse:b", nearDuplicates: ["e1"] }),
    ];
    const report = analyzeCorpusCoherence(entries);
    expect(report.clusters[0].sharedAnchor).toBeNull();
  });

  it("identifies drift candidates below threshold (0.55)", () => {
    const entries = [
      makeEntry("e1", { werkVoiceScore: 0.3 } as Partial<ResonanzEntry>),
      makeEntry("e2", { werkVoiceScore: 0.8 } as Partial<ResonanzEntry>),
      makeEntry("e3", { werkVoiceScore: 0.45 } as Partial<ResonanzEntry>),
    ];
    const report = analyzeCorpusCoherence(entries);
    expect(report.driftCandidates).toBe(2);
  });

  it("computes voiceStats correctly", () => {
    const entries = [
      makeEntry("e1", { werkVoiceScore: 0.2 } as Partial<ResonanzEntry>),
      makeEntry("e2", { werkVoiceScore: 0.6 } as Partial<ResonanzEntry>),
      makeEntry("e3", { werkVoiceScore: 1.0 } as Partial<ResonanzEntry>),
    ];
    const report = analyzeCorpusCoherence(entries);
    expect(report.voiceStats).not.toBeNull();
    expect(report.voiceStats!.min).toBeCloseTo(0.2, 5);
    expect(report.voiceStats!.max).toBeCloseTo(1.0, 5);
    expect(report.voiceStats!.median).toBeCloseTo(0.6, 5);
    expect(report.voiceStats!.mean).toBeCloseTo(0.6, 5);
  });

  it("returns null voiceStats when no entries have werkVoiceScore", () => {
    const entries = [makeEntry("e1"), makeEntry("e2")];
    const report = analyzeCorpusCoherence(entries);
    expect(report.voiceStats).toBeNull();
  });

  it("topDrift is sorted by werkVoiceScore ascending", () => {
    const entries = [
      makeEntry("e1", { werkVoiceScore: 0.4 } as Partial<ResonanzEntry>),
      makeEntry("e2", { werkVoiceScore: 0.2 } as Partial<ResonanzEntry>),
      makeEntry("e3", { werkVoiceScore: 0.3 } as Partial<ResonanzEntry>),
    ];
    const report = analyzeCorpusCoherence(entries);
    const scores = report.topDrift.map(e => (e as ResonanzEntry & { werkVoiceScore: number }).werkVoiceScore);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it("handles empty input gracefully", () => {
    const report = analyzeCorpusCoherence([]);
    expect(report.entriesWithEchoes).toBe(0);
    expect(report.clusters).toHaveLength(0);
    expect(report.driftCandidates).toBe(0);
    expect(report.voiceStats).toBeNull();
  });
});
