import { describe, it, expect } from "vitest";
import { extractKeywords, buildResonanzpfad, buildThemenBalance } from "../extractKeywords.js";
import type { Conversation } from "../extractKeywords.js";

function makeConv(overrides: Partial<Conversation> & { id: string }): Conversation {
  return {
    id: overrides.id,
    date: overrides.date ?? "2026-01-01",
    preview: overrides.preview ?? "",
    messages: overrides.messages ?? [
      { role: "user", content: overrides.id },
      { role: "assistant", content: "Antwort." },
    ],
    ...overrides,
  };
}

describe("extractKeywords", () => {
  it("returns empty for empty conversations", () => {
    expect(extractKeywords([])).toHaveLength(0);
  });

  it("returns keywords from user messages", () => {
    const convs = [
      makeConv({ id: "c1", messages: [{ role: "user", content: "Resonanz und Denken" }] }),
    ];
    const kws = extractKeywords(convs);
    expect(kws.length).toBeGreaterThan(0);
    expect(kws.some(k => k.word === "resonanz" || k.word === "denken")).toBe(true);
  });

  it("respects topN limit", () => {
    const convs = [makeConv({ id: "c1", messages: [
      { role: "user", content: "Resonanz Denken Vernunft Wahrheit Dialog Begegnung Sprache Stille" }
    ]})];
    const kws = extractKeywords(convs, 3);
    expect(kws.length).toBeLessThanOrEqual(3);
  });

  it("domain-boosted words rank higher than unrelated words", () => {
    const convs = [makeConv({ id: "c1", messages: [
      { role: "user", content: "resonanzvernunft resonanzvernunft tisch tisch tisch tisch tisch" }
    ]})];
    const kws = extractKeywords(convs);
    const rvIdx = kws.findIndex(k => k.word === "resonanzvernunft");
    const tischIdx = kws.findIndex(k => k.word === "tisch");
    if (rvIdx >= 0 && tischIdx >= 0) {
      expect(rvIdx).toBeLessThan(tischIdx);
    }
  });

  it("filters stopwords", () => {
    const convs = [makeConv({ id: "c1", messages: [
      { role: "user", content: "und die der das ein eine" }
    ]})];
    const kws = extractKeywords(convs);
    const stopwords = ["und", "die", "der", "das", "ein", "eine"];
    for (const sw of stopwords) {
      expect(kws.some(k => k.word === sw)).toBe(false);
    }
  });
});

describe("buildResonanzpfad", () => {
  it("returns empty for empty input", () => {
    expect(buildResonanzpfad([])).toHaveLength(0);
  });

  it("returns empty when no conversations have feedback", () => {
    const convs = [makeConv({ id: "c1" })];
    expect(buildResonanzpfad(convs)).toHaveLength(0);
  });

  it("maps 'Ja' feedback to 1.0", () => {
    const convs = [makeConv({ id: "c1", date: "2026-01-01", feedback: { q1: "Ja — etwas hat mich bewegt", q2: "Ja — es gab einen Moment", q3: "Ja — eine Frage", freetext: "" } })];
    const result = buildResonanzpfad(convs);
    expect(result).toHaveLength(1);
    expect(result[0].q1).toBe(1.0);
    expect(result[0].q2).toBe(1.0);
    expect(result[0].q3).toBe(1.0);
  });

  it("maps 'Nein' feedback to 0.0", () => {
    const convs = [makeConv({ id: "c1", date: "2026-01-01", feedback: { q1: "Eher nicht", q2: "Nicht wirklich", q3: "Nein", freetext: "" } })];
    const result = buildResonanzpfad(convs);
    expect(result[0].q1).toBe(0.0);
    expect(result[0].q3).toBe(0.0);
  });

  it("maps 'Vielleicht' feedback to 0.5", () => {
    const convs = [makeConv({ id: "c1", date: "2026-01-01", feedback: { q1: "Ich weiß es noch nicht", q2: "Kurz, aber es war etwas", q3: "Vielleicht", freetext: "" } })];
    const result = buildResonanzpfad(convs);
    expect(result[0].q1).toBe(0.5);
    expect(result[0].q2).toBe(0.5);
    expect(result[0].q3).toBe(0.5);
  });

  it("sorts results by date", () => {
    const convs = [
      makeConv({ id: "c2", date: "2026-06-01", feedback: { q1: "Ja — x", q2: "Ja — x", q3: "Ja — x", freetext: "" } }),
      makeConv({ id: "c1", date: "2026-01-01", feedback: { q1: "Nein", q2: "Nein", q3: "Nein", freetext: "" } }),
    ];
    const result = buildResonanzpfad(convs);
    expect(result[0].date).toBe("2026-01-01");
    expect(result[1].date).toBe("2026-06-01");
  });
});

describe("buildThemenBalance", () => {
  it("returns empty for empty input", () => {
    expect(buildThemenBalance([])).toHaveLength(0);
  });

  it("counts resonanz-related terms", () => {
    const convs = [makeConv({ id: "c1", messages: [
      { role: "user", content: "Resonanz und Stille" }
    ]})];
    const result = buildThemenBalance(convs);
    expect(result.some(e => e.count > 0)).toBe(true);
  });

  it("sorts results by count descending", () => {
    const convs = [makeConv({ id: "c1", messages: [
      { role: "user", content: "Resonanz Resonanz Resonanz Stille" }
    ]})];
    const result = buildThemenBalance(convs);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].count).toBeGreaterThanOrEqual(result[i].count);
    }
  });
});
