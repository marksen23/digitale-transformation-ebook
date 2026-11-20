import { describe, expect, it } from "vitest";
import { NODES } from "@/data/conceptGraph";
import { READING_PATHS } from "@/data/readingPaths";

const ids = new Set(NODES.map(n => n.id));

describe("Lesepfade", () => {
  it("bietet drei Wege mit vier bis sechs Stationen auf echten Begriffen", () => {
    expect(READING_PATHS).toHaveLength(3);
    const slugs = new Set(READING_PATHS.map(p => p.slug));
    expect(slugs.size).toBe(3);
    for (const path of READING_PATHS) {
      expect(path.stations.length).toBeGreaterThanOrEqual(4);
      expect(path.stations.length).toBeLessThanOrEqual(6);
      expect(path.title.length).toBeGreaterThan(3);
      for (const station of path.stations) {
        expect(ids.has(station.conceptId), station.conceptId).toBe(true);
        expect(station.passage.endsWith(".") || station.passage.endsWith("?")).toBe(true);
        expect(station.question.endsWith("?")).toBe(true);
      }
    }
  });
});
