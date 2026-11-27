import { describe, expect, it } from "vitest";
import { assessFreshness, FRESHNESS_MARKER, STALE_MS } from "../lib/corpusFreshness.js";

const NOW = new Date("2026-11-27T12:00:00.000Z");

describe("Korpus-Frische", () => {
  it("schlägt erst nach mehr als 48 Stunden an und nimmt den neueren Zeitpunkt", () => {
    const fresh = assessFreshness({
      indexTimestamps: ["2026-11-26T12:00:00.000Z", "kein-datum"],
      commitAt: "2026-11-25T12:00:00.000Z",
      now: NOW,
    });
    expect(fresh.stale).toBe(false);
    expect(fresh.source).toBe("index");
    expect(fresh.ageHours).toBe(24);

    const exact = assessFreshness({
      indexTimestamps: [new Date(NOW.getTime() - STALE_MS).toISOString()],
      now: NOW,
    });
    expect(exact.stale).toBe(false);

    const stale = assessFreshness({
      indexTimestamps: ["2026-11-24T12:00:00.000Z"],
      commitAt: "2026-11-25T10:00:00.000Z",
      commitSubject: "log(resonanz): dialog dialog:resonanz ABC",
      now: NOW,
    });
    expect(stale.stale).toBe(true);
    expect(stale.source).toBe("commit");
    expect(stale.body).toContain(FRESHNESS_MARKER);
    expect(stale.body).toContain("log(resonanz): dialog dialog:resonanz ABC");
    expect(stale.title).toContain("48 Stunden");
  });

  it("gilt als stehengeblieben, wenn gar kein Zeitpunkt da ist", () => {
    const empty = assessFreshness({ indexTimestamps: [], commitAt: null, now: NOW });
    expect(empty.stale).toBe(true);
    expect(empty.source).toBe("none");
    expect(empty.body).toContain("kein Zeitstempel gefunden");
  });
});
