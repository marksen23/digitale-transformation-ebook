import { describe, expect, it } from "vitest";
import { buildDensityTimeline, onOrBefore, utcDay } from "@/lib/mapTimeline";

describe("Zeitraffer", () => {
  it("nimmt nur echte Tage und kuratierte Einträge, kumuliert je Begriff", () => {
    const frames = buildDensityTimeline([
      { ts: "2026-06-01T00:00:00Z", status: "published", nodeIds: ["echo"] },
      { ts: "2026-05-03T18:00:00Z", status: "approved", nodeIds: ["freiheit", "resonanz"] },
      { ts: "2026-05-03T10:00:00Z", status: "published", nodeIds: ["freiheit"] },
      { ts: "kein-datum", status: "published", nodeIds: ["schatten"] },
      { ts: "2026-02-31T00:00:00Z", status: "published", nodeIds: ["welt"] },
      { ts: "2026-06-01T12:00:00Z", status: "raw", nodeIds: ["echo"] },
    ]);
    expect(frames.map(f => f.date)).toEqual(["2026-05-03", "2026-06-01"]);
    expect(frames[0].counts).toEqual({ freiheit: 2, resonanz: 1 });
    expect(frames[0].total).toBe(2);
    expect(frames[1].counts.echo).toBe(1);
    expect(frames[1].counts.freiheit).toBe(2);
    expect(frames[1].total).toBe(3);
    expect(utcDay("")).toBeNull();
    expect(onOrBefore("2026-05-20T08:00:00Z", "2026-05-03")).toBe(false);
    expect(onOrBefore("2026-05-03", "2026-05-03")).toBe(true);
    expect(onOrBefore("gestern", "2026-05-03")).toBe(false);
  });

  it("bleibt leer, wenn nichts Datierbares kuratiert ist", () => {
    expect(buildDensityTimeline([])).toEqual([]);
    expect(buildDensityTimeline([{ ts: "2026-01-01", status: "rejected", nodeIds: ["a"] }])).toEqual([]);
  });
});
