import { describe, expect, it } from "vitest";
import {
  pickDailyErkenntnis,
  recentDailyErkenntnisse,
  utcDateString,
} from "../../shared/dailyErkenntnis.js";
import { buildErkenntnisFeedXml } from "../lib/erkenntnisFeed.js";

const pool = [
  { id: "B", kernsatz: "Zweiter Satz.", answerId: "a2", conceptAnchor: "werden", createdAt: "2026-01-01" },
  { id: "A", kernsatz: "Erster Satz.", answerId: "a1", conceptAnchor: "freiheit", createdAt: "2026-01-02" },
  { id: "C", kernsatz: "   ", answerId: "a3", conceptAnchor: null, createdAt: "2026-01-03" },
];

describe("pickDailyErkenntnis", () => {
  it("ist am selben UTC-Tag stabil und lässt Leeres und Zurückgenommenes weg", () => {
    const day = new Date("2026-11-20T15:00:00Z");
    const first = pickDailyErkenntnis(pool, day, ["a1"]);
    const again = pickDailyErkenntnis(pool, day, ["a1"]);
    expect(first?.id).toBe("B");
    expect(again?.id).toBe(first?.id);
    expect(pickDailyErkenntnis(pool, day, ["a1", "a2"])).toBeNull();
  });

  it("wechselt mit dem Datum, nicht mit der Uhrzeit", () => {
    const morning = pickDailyErkenntnis(pool, new Date("2026-11-20T01:00:00Z"), []);
    const evening = pickDailyErkenntnis(pool, new Date("2026-11-20T23:00:00Z"), []);
    expect(morning?.id).toBe(evening?.id);
    const next = pickDailyErkenntnis(pool, new Date("2026-11-21T01:00:00Z"), []);
    expect(next?.id).not.toBe(morning?.id);
  });
});

describe("Erkenntnis-Feed", () => {
  it("liefert Atom mit einem Eintrag pro Tag und Landkarten-Link", () => {
    const xml = buildErkenntnisFeedXml(pool, [], new Date("2026-11-20T12:00:00Z"), "https://example.test");
    expect(xml.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>")).toBe(true);
    expect(xml).toContain("<feed xmlns=\"http://www.w3.org/2005/Atom\">");
    expect(xml).toContain(`Erkenntnis des Tages — ${utcDateString(new Date("2026-11-20T12:00:00Z"))}`);
    expect(xml).toContain("https://example.test/landkarte?begriff=");
    expect(recentDailyErkenntnisse(pool, new Date("2026-11-20T00:00:00Z"), 3, []).length).toBe(3);
  });
});
