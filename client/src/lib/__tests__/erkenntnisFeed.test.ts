import { describe, expect, it } from "vitest";
import { buildErkenntnisFeed, synthesisLead } from "../erkenntnisFeed";
import type { Erkenntnis } from "../erkenntnisse";
import type { ResonanzEntry } from "../resonanzenIndex";

function entry(partial: Partial<ResonanzEntry> & Pick<ResonanzEntry, "id">): ResonanzEntry {
  return {
    ts: "2026-11-11T16:00:00.000Z",
    endpoint: "analyse",
    anchor: "analyse:a+b",
    nodeIds: [],
    status: "raw",
    prompt: "p",
    response: "## Synthese\n\nEin geschlossener Gedanke über die Grenze.\n\n## Offene Frage\n\nWas folgt?",
    contextMeta: {},
    ...partial,
  };
}

describe("buildErkenntnisFeed", () => {
  const human: Erkenntnis = {
    id: "ERK-H",
    kernsatz: "Ein bestätigter Satz.",
    questionSourceId: "Q",
    answerId: "A",
    conceptAnchor: null,
    distinctness: 0.2,
    createdAt: "2026-06-01T00:00:00.000Z",
    actor: "admin",
  };

  it("zeigt automatische Kernsätze und nur veröffentlichte Auto-Master", () => {
    const feed = buildErkenntnisFeed(
      [human, { ...human, id: "ERK-A", actor: "auto", createdAt: "2026-11-11T16:00:00.000Z", kernsatz: "Automatisch." }],
      [
        entry({ id: "MASTER-1", status: "published", is_master: true, autoPublished: true, anchor: "analyse:x+y" }),
        entry({ id: "MASTER-2", status: "raw", is_master: true, autoPublished: true }),
        entry({ id: "MASTER-3", status: "published", is_master: true }),
      ],
    );
    expect(feed.map(i => i.id)).toEqual(["ERK-A", "MASTER-1", "ERK-H"]);
    expect(feed.find(i => i.id === "MASTER-1")?.text).toContain("geschlossener Gedanke");
    expect(synthesisLead("kurz.")).toBe("kurz.");
  });
});