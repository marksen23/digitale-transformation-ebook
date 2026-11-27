import { describe, expect, it } from "vitest";
import { densitySince, insightsSince, toggleBookmark } from "@/lib/begriffBookmarks";

describe("Meine Begriffe", () => {
  it("merkt sich den ersten Zeitpunkt und nimmt ihn beim zweiten Klick zurück", () => {
    const once = toggleBookmark([], "concept", "resonanz", "2026-05-01T00:00:00Z");
    const again = toggleBookmark(once, "concept", "resonanz", "2026-06-01T00:00:00Z");
    expect(once).toEqual([{ kind: "concept", id: "resonanz", savedAt: "2026-05-01T00:00:00Z" }]);
    expect(again).toEqual([]);
  });

  it("vergleicht die Dichte am Merk-Tag mit heute und listet spätere Erkenntnisse", () => {
    const frames = [
      { date: "2026-04-01", counts: { resonanz: 2 } },
      { date: "2026-06-01", counts: { resonanz: 5 } },
    ];
    expect(densitySince(frames, "resonanz", "2026-05-01T12:00:00Z")).toEqual({ atBookmark: 2, now: 5 });
    expect(densitySince(frames, "schatten", "2026-03-01T00:00:00Z")).toEqual({ atBookmark: 0, now: 0 });
    const since = insightsSince([
      { createdAt: "2026-04-01T00:00:00Z", conceptAnchor: "resonanz", text: "alt" },
      { createdAt: "2026-05-02T00:00:00Z", conceptAnchor: "resonanz", text: "neu" },
      { createdAt: "2026-06-01T00:00:00Z", conceptAnchor: "echo", text: "anders" },
    ], "resonanz", "2026-05-01T00:00:00Z");
    expect(since.map(item => item.text)).toEqual(["neu"]);
  });
});
