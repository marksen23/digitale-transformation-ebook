import { describe, expect, it } from "vitest";
import { applyPrinzipGroupDensity, canonicalDensityStats, groupLegendCount, type DensityCell } from "../../shared/prinzipDensity.js";

const groups = [
  { id: "schattenlicht", memberIds: ["schatten", "licht"] },
  { id: "raumfaltung", memberIds: ["weltfaltung", "raumfaltung"] },
  { id: "wirklichkeit-moeglichkeit", memberIds: ["wirklichkeit", "moeglichkeit"] },
];

function cell(count: number, endpoints: Record<string, number> = { analyse: count }): DensityCell {
  return { count, endpoints };
}

describe("Prinzip-Gruppen-Dichte", () => {
  it("leitet Gruppen ohne Knoten aus den Mitgliedern ab und lässt Knoten stehen", () => {
    const raw: Record<string, DensityCell> = {
      schatten: cell(13, { analyse: 6, dialog: 6, "path-analyse": 1 }),
      licht: cell(12, { dialog: 6, "path-analyse": 1, analyse: 5 }),
      schattenlicht: cell(2, { analyse: 2 }),
      weltfaltung: cell(13),
      raumfaltung: cell(12),
      wirklichkeit: cell(12),
      moeglichkeit: cell(10),
      "wirklichkeit-moeglichkeit": cell(0, {}),
    };
    const canonical = new Set(["schatten", "licht", "weltfaltung", "raumfaltung", "wirklichkeit", "moeglichkeit"]);
    const derived = applyPrinzipGroupDensity(raw, groups, canonical);

    expect(derived.schatten.count).toBe(13);
    expect(derived.licht.count).toBe(12);
    expect(derived.raumfaltung.count).toBe(12);
    expect(derived.raumfaltung.derived).toBeUndefined();
    expect(derived.schattenlicht).toEqual({
      count: 27,
      endpoints: { analyse: 13, dialog: 12, "path-analyse": 2 },
      derived: true,
    });
    expect(derived["wirklichkeit-moeglichkeit"].count).toBe(22);
    expect(derived["wirklichkeit-moeglichkeit"].derived).toBe(true);

    const again = applyPrinzipGroupDensity(derived, groups, canonical);
    expect(again.schattenlicht.count).toBe(27);
    expect(again["wirklichkeit-moeglichkeit"].count).toBe(22);

    const stats = canonicalDensityStats(derived, [...canonical]);
    expect(stats.zeroResonanceNodes).toEqual([]);
    expect(stats.totalNodes).toBe(6);
    expect(stats.maxCount).toBe(13);
    expect(stats.minCount).toBe(10);
    expect(groupLegendCount(groups[0], derived, canonical)).toBe(27);
    expect(groupLegendCount(groups[1], derived, canonical)).toBe(25);
  });
});