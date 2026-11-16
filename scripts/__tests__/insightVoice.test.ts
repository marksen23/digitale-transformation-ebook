/**
 * Stimme und Vollständigkeit dessen, was die Seite als Erkenntnisse zeigt:
 * bestätigte Kernsätze, Master-Antworten im Index, Kandidaten-Auszüge.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { voiceViolations } from "../lib/insightRegen.js";

function readJson(rel: string): unknown {
  return JSON.parse(fs.readFileSync(path.resolve(rel), "utf-8"));
}

describe("Erkenntnisse auf der Seite", () => {
  it("Kernsätze sind vollständig und ohne Autorname oder Floskel", () => {
    const data = readJson("client/public/resonanzen-erkenntnisse.json") as {
      erkenntnisse: Array<{ id: string; kernsatz: string }>;
    };
    expect(data.erkenntnisse.length).toBeGreaterThanOrEqual(42);
    for (const e of data.erkenntnisse) {
      expect(voiceViolations(e.kernsatz), e.id).toEqual([]);
    }
  });

  it("Master-Synthesen stehen vollständig im Index", () => {
    const data = readJson("client/public/resonanzen-index.json") as {
      count: number;
      entries: Array<{ id: string; is_master?: boolean; response?: string }>;
    };
    expect(data.count).toBeGreaterThanOrEqual(250);
    const masters = data.entries.filter(e => e.is_master);
    expect(masters.length).toBeGreaterThanOrEqual(6);
    for (const m of masters) {
      expect((m.response ?? "").length, m.id).toBeGreaterThan(400);
      expect(voiceViolations(m.response ?? ""), m.id).toEqual([]);
      expect(m.response ?? "", m.id).toMatch(/##\s+Synthese/);
      expect(m.response ?? "", m.id).toMatch(/##\s+Offene Frage/);
    }
  });

  it("Erkenntnis-Kandidaten tragen keine verbotene Floskel", () => {
    const data = readJson("client/public/resonanzen-erkenntnis-candidates.json") as {
      candidates: Array<{ id: string; answerExcerpt?: string; answerId: string }>;
    };
    // Leer ist gültig: der Index-Build nimmt Antworten heraus, die schon bestätigt
    // oder automatisch veröffentlicht sind. Am 15.11. blieb dadurch 0 übrig
    // (58 herausgefiltert), und die Untergrenze ≥ 1 brach den Sonntagslauf ab.
    expect(Array.isArray(data.candidates)).toBe(true);
    assertNoCandidateFloskel(data.candidates);
  });

  it("eine leere Kandidatenmenge besteht, eine Floskel im Auszug nicht", () => {
    assertNoCandidateFloskel([]);
    expect(() => assertNoCandidateFloskel([
      { id: "x", answerExcerpt: "Markus Oehring denkt den Begriffsraum tiefgründig." },
    ])).toThrow();
  });
});

/** Auszüge sind absichtlich gekürzt, deshalb zählt „unvollständig“ hier nicht. */
function assertNoCandidateFloskel(candidates: Array<{ id: string; answerExcerpt?: string }>): void {
  for (const c of candidates) {
    const hits = voiceViolations(c.answerExcerpt ?? "").filter(v => v !== "unvollständig");
    expect(hits, c.id).toEqual([]);
  }
}
