import { describe, it, expect } from "vitest";
import { extractKeywords, buildThemenBalance } from "../extractKeywords.js";
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

describe("Nachklang-Fragebogen (entfernt 2026-11-20)", () => {
  it("exportiert keinen Resonanzpfad mehr", async () => {
    const mod = await import("../extractKeywords.js");
    expect("buildResonanzpfad" in mod).toBe(false);
  });

  it("ignoriert alte Fragebogen-Antworten aus localStorage", () => {
    const withOld = makeConv({ id: "c1", feedback: { q1: "Ja", q2: "Ja", q3: "Ja", freetext: "Quantenschaum Quantenschaum" } });
    expect(extractKeywords([withOld], 50).map(k => k.word)).not.toContain("quantenschaum");
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
