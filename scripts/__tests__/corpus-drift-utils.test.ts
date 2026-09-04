import { describe, it, expect } from "vitest";
import { compareCounts, detectDrift } from "../lib/corpus-drift-utils.js";

const makeSnapshot = (filesChecked: number, byEndpoint: Record<string, number>, byStatus: Record<string, number>) => ({
  filesChecked,
  aggregates: { byEndpoint, byStatus },
});

describe("compareCounts", () => {
  it("returns empty when counts grow", () => {
    const issues = compareCounts("endpoint", { analyse: 10 }, { analyse: 15 });
    expect(issues).toHaveLength(0);
  });
  it("returns empty for small shrink (<= 30%)", () => {
    const issues = compareCounts("endpoint", { analyse: 10 }, { analyse: 8 });
    expect(issues).toHaveLength(0);
  });
  it("returns warning for 40% shrink", () => {
    const issues = compareCounts("endpoint", { analyse: 10 }, { analyse: 6 });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("warning");
  });
  it("returns alarm for >50% shrink", () => {
    const issues = compareCounts("endpoint", { analyse: 10 }, { analyse: 4 });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("alarm");
  });
  it("returns empty when key disappears but base was 0", () => {
    const issues = compareCounts("endpoint", { analyse: 0 }, { analyse: 0 });
    expect(issues).toHaveLength(0);
  });
  it("uses provided label in rule name", () => {
    const issues = compareCounts("myLabel", { x: 10 }, { x: 1 });
    expect(issues[0].rule).toContain("myLabel");
  });
});

describe("detectDrift", () => {
  it("returns empty for identical snapshots", () => {
    const s = makeSnapshot(100, { analyse: 20 }, { raw: 50, published: 50 });
    expect(detectDrift(s, s)).toHaveLength(0);
  });
  it("returns empty when corpus grows", () => {
    const prev = makeSnapshot(100, { analyse: 20 }, { published: 10 });
    const curr = makeSnapshot(120, { analyse: 25 }, { published: 15 });
    expect(detectDrift(prev, curr)).toHaveLength(0);
  });
  it("detects published-shrink alarm", () => {
    const prev = makeSnapshot(100, { analyse: 20 }, { published: 10 });
    const curr = makeSnapshot(100, { analyse: 20 }, { published: 8 });
    const issues = detectDrift(prev, curr);
    expect(issues.some(i => i.rule === "published-shrink")).toBe(true);
    expect(issues.find(i => i.rule === "published-shrink")?.level).toBe("alarm");
  });
  it("detects files-shrink warning for small decrease", () => {
    const prev = makeSnapshot(100, {}, { published: 10 });
    const curr = makeSnapshot(95, {}, { published: 10 });
    const issues = detectDrift(prev, curr);
    expect(issues.some(i => i.rule === "files-shrink")).toBe(true);
  });
  it("detects files-shrink alarm for large decrease", () => {
    const prev = makeSnapshot(200, {}, { published: 10 });
    const curr = makeSnapshot(180, {}, { published: 10 });
    const issues = detectDrift(prev, curr);
    const shrink = issues.find(i => i.rule === "files-shrink");
    expect(shrink).toBeDefined();
    expect(shrink?.level).toBe("alarm");
  });
  it("no alarm when files decrease by only 2", () => {
    const prev = makeSnapshot(100, {}, { published: 10 });
    const curr = makeSnapshot(98, {}, { published: 10 });
    expect(detectDrift(prev, curr).some(i => i.rule === "files-shrink")).toBe(false);
  });
});
