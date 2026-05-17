import { describe, expect, it } from "vitest";
import { compareCounts, detectDrift, type Snapshot } from "../lib/corpus-drift-utils";

// ─── Fixture helpers ─────────────────────────────────────────────────────────

const makeSnapshot = (
  filesChecked: number,
  byEndpoint: Record<string, number> = {},
  byStatus: Record<string, number> = {},
  date = "2024-01-01",
): Snapshot => ({
  date,
  generatedAt: `${date}T00:00:00Z`,
  commit: "abc123",
  filesChecked,
  aggregates: { byEndpoint, byStatus, orphanNodeIds: [] },
  errors: 0,
  warnings: 0,
});

// ─── compareCounts ───────────────────────────────────────────────────────────

describe("compareCounts", () => {
  it("returns no issues when counts are equal", () => {
    expect(compareCounts("ep", { chapter: 10 }, { chapter: 10 })).toHaveLength(0);
  });

  it("returns no issues when counts grow", () => {
    expect(compareCounts("ep", { chapter: 10 }, { chapter: 20 })).toHaveLength(0);
  });

  it("returns no issues when shrink is exactly 30%", () => {
    // ratio = 3/10 = 0.30, rule is > 0.3, so exactly 0.3 is safe
    expect(compareCounts("ep", { chapter: 10 }, { chapter: 7 })).toHaveLength(0);
  });

  it("returns warning when shrink is between 30% and 50%", () => {
    // 10 → 6 = 40% shrink
    const issues = compareCounts("ep", { chapter: 10 }, { chapter: 6 });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("warning");
    expect(issues[0].rule).toBe("ep-shrink");
  });

  it("returns alarm when shrink exceeds 50%", () => {
    // 10 → 4 = 60% shrink
    const issues = compareCounts("ep", { chapter: 10 }, { chapter: 4 });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("alarm");
  });

  it("returns alarm when key drops to zero from non-zero", () => {
    // 10 → 0 = 100% shrink
    const issues = compareCounts("ep", { chapter: 10 }, { chapter: 0 });
    expect(issues[0].level).toBe("alarm");
  });

  it("returns alarm when key disappears from after (treated as 0)", () => {
    const issues = compareCounts("ep", { chapter: 10 }, {});
    expect(issues[0].level).toBe("alarm");
  });

  it("does not flag keys that only exist in after (new additions)", () => {
    const issues = compareCounts("ep", {}, { chapter: 10 });
    expect(issues).toHaveLength(0);
  });

  it("checks each key independently", () => {
    const before = { chapter: 10, enkidu: 10 };
    const after  = { chapter: 10, enkidu: 4 }; // enkidu down 60%
    const issues = compareCounts("ep", before, after);
    expect(issues).toHaveLength(1);
    expect(issues[0].detail).toContain("enkidu");
  });

  it("detail string contains from→to values", () => {
    const issues = compareCounts("ep", { chapter: 10 }, { chapter: 4 });
    expect(issues[0].detail).toContain("10");
    expect(issues[0].detail).toContain("4");
  });
});

// ─── detectDrift ─────────────────────────────────────────────────────────────

describe("detectDrift", () => {
  it("returns no issues for identical snapshots", () => {
    const s = makeSnapshot(100, { chapter: 20 }, { approved: 10, published: 5 });
    expect(detectDrift(s, s)).toHaveLength(0);
  });

  it("returns no issues when file count grows", () => {
    const prev = makeSnapshot(100);
    const curr = makeSnapshot(110);
    expect(detectDrift(prev, curr)).toHaveLength(0);
  });

  it("returns no issues when file count decreases by ≤2", () => {
    const prev = makeSnapshot(100);
    const curr = makeSnapshot(98); // delta = -2, not < -2
    expect(detectDrift(prev, curr)).toHaveLength(0);
  });

  it("returns warning when file count decreases by >2 but ≤5%", () => {
    // prev=100, curr=97 → delta=-3, ratio=3%
    const issues = detectDrift(makeSnapshot(100), makeSnapshot(97));
    const filesIssue = issues.find(i => i.rule === "files-shrink");
    expect(filesIssue).toBeDefined();
    expect(filesIssue!.level).toBe("warning");
  });

  it("returns alarm when file count decreases by >5%", () => {
    // prev=100, curr=90 → delta=-10, ratio=10%
    const issues = detectDrift(makeSnapshot(100), makeSnapshot(90));
    const filesIssue = issues.find(i => i.rule === "files-shrink");
    expect(filesIssue).toBeDefined();
    expect(filesIssue!.level).toBe("alarm");
  });

  it("returns alarm when published count decreases at all", () => {
    const prev = makeSnapshot(100, {}, { published: 5 });
    const curr = makeSnapshot(100, {}, { published: 4 }); // any shrink → alarm
    const issues = detectDrift(prev, curr);
    expect(issues.some(i => i.rule === "published-shrink" && i.level === "alarm")).toBe(true);
  });

  it("does not flag published when count stays the same", () => {
    const snap = makeSnapshot(100, {}, { published: 5 });
    const issues = detectDrift(snap, snap);
    expect(issues.some(i => i.rule === "published-shrink")).toBe(false);
  });

  it("does not flag published when count grows", () => {
    const prev = makeSnapshot(100, {}, { published: 5 });
    const curr = makeSnapshot(100, {}, { published: 6 });
    const issues = detectDrift(prev, curr);
    expect(issues.some(i => i.rule === "published-shrink")).toBe(false);
  });

  it("flags endpoint shrink via compareCounts", () => {
    const prev = makeSnapshot(100, { chapter: 20, enkidu: 10 });
    const curr = makeSnapshot(100, { chapter: 20, enkidu: 4 }); // enkidu -60%
    const issues = detectDrift(prev, curr);
    expect(issues.some(i => i.rule === "endpoint-shrink")).toBe(true);
  });

  it("accumulates multiple independent issues", () => {
    const prev = makeSnapshot(100, { chapter: 10, enkidu: 10 }, { published: 5 });
    const curr = makeSnapshot(90, { chapter: 4, enkidu: 4 }, { published: 4 });
    const issues = detectDrift(prev, curr);
    expect(issues.length).toBeGreaterThan(2);
  });
});
