import { describe, expect, it } from "vitest";
import { conceptGrowth, mostRead, openFollowUps, utcMonth } from "../lib/monatsbericht.js";
import { defaultViewCountPath } from "../lib/viewCounts.js";
import path from "node:path";

describe("Monatsbericht", () => {
  it("zählt nur gesicherte Einträge des Monats und lässt offene Fragen oben", () => {
    expect(utcMonth("2026-11-27T10:00:00Z")).toBe("2026-11");
    expect(utcMonth("2026-13-01")).toBeNull();
    const concepts = conceptGrowth([
      { ts: "2026-11-02T00:00:00Z", status: "published", nodeIds: ["resonanz", "echo"] },
      { ts: "2026-11-20T00:00:00Z", status: "approved", nodeIds: ["resonanz"] },
      { ts: "2026-10-20T00:00:00Z", status: "published", nodeIds: ["schatten"] },
      { ts: "2026-11-21T00:00:00Z", status: "raw", nodeIds: ["licht"] },
    ], "2026-11");
    expect(concepts).toEqual([
      { id: "resonanz", count: 2 },
      { id: "echo", count: 1 },
    ]);
    const questions = openFollowUps([
      { sourceId: "a", question: "Offen?", ts: "2026-11-01", answered: false, followUp: false },
      { sourceId: "b", question: "Folge?", ts: "2026-10-01", answered: false, followUp: true },
      { sourceId: "c", question: "Zu.", ts: "2026-11-02", answered: true, followUp: true },
    ]);
    expect(questions.map(item => item.sourceId)).toEqual(["b", "a"]);
    const reads = mostRead({ "ERK-A": 3, "ERK-B": 9, "fehlt": 4 }, new Map([["ERK-A", "Satz A"], ["ERK-B", "Satz B"]]));
    expect(reads.map(item => item.id)).toEqual(["ERK-B", "ERK-A"]);
    expect(defaultViewCountPath().includes(`${path.sep}client${path.sep}public`)).toBe(false);
  });
});
