import { describe, expect, it } from "vitest";
import { groupFortschreibung, quarterOf, type FortItem } from "@/lib/fortschreibung";

function item(partial: Partial<FortItem> & Pick<FortItem, "id" | "createdAt">): FortItem {
  return {
    text: "Ein Satz.",
    conceptId: "resonanz",
    kind: "kernsatz",
    answerId: partial.id,
    ...partial,
  };
}

describe("Fortschreibung", () => {
  it("ordnet Quartale absteigend und Begriffe darin, und lässt Zurückgenommenes weg", () => {
    expect(quarterOf("2026-03-31T00:00:00Z")?.key).toBe("2026-Q1");
    expect(quarterOf("2026-04-01")?.label).toBe("2. Quartal 2026");
    expect(quarterOf("2026-13-01")).toBeNull();
    const groups = groupFortschreibung([
      item({ id: "a", createdAt: "2026-01-15", conceptId: "schatten", text: "Januar." }),
      item({ id: "b", createdAt: "2026-05-02", conceptId: "resonanz", text: "Mai." }),
      item({ id: "c", createdAt: "2026-04-20", conceptId: "resonanz", text: "April." }),
      item({ id: "d", createdAt: "2026-05-01", conceptId: null, text: "Ohne." }),
      item({ id: "weg", createdAt: "2026-05-03", text: "Gesperrt." }),
      item({ id: "master", createdAt: "2026-05-04", kind: "master", answerId: "master", text: "Synthese." }),
      item({ id: "x", createdAt: "kein-datum", text: "Undatiert." }),
    ], ["weg"], ["master"]);
    expect(groups.map(g => g.key)).toEqual(["2026-Q2", "2026-Q1"]);
    expect(groups[0].concepts.map(c => c.id)).toEqual(["resonanz", ""]);
    expect(groups[0].concepts[0].items.map(i => i.text)).toEqual(["April.", "Mai."]);
    expect(groups[1].concepts[0].items[0].text).toBe("Januar.");
    expect(JSON.stringify(groups)).not.toContain("Gesperrt");
    expect(JSON.stringify(groups)).not.toContain("Undatiert");
    expect(JSON.stringify(groups)).not.toContain("Synthese");
  });
});
