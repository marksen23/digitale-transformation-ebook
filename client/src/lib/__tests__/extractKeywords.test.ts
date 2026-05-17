import { describe, expect, it } from "vitest";
import {
  extractKeywords,
  buildResonanzpfad,
  buildThemenBalance,
  type Conversation,
} from "../extractKeywords";

const makeConv = (
  messages: { role: "user" | "assistant"; content: string; error?: boolean }[],
  feedback?: { q1: string; q2: string; q3: string; freetext: string },
  date = "2024-01-01T00:00:00Z",
  id = "test",
): Conversation => ({ id, date, preview: "", messages, feedback });

// ─── extractKeywords ─────────────────────────────────────────────────────────

describe("extractKeywords", () => {
  it("returns empty array for no conversations", () => {
    expect(extractKeywords([])).toEqual([]);
  });

  it("counts frequency from user messages only", () => {
    const conv = makeConv([
      { role: "user", content: "resonanz resonanz resonanz" },
      { role: "assistant", content: "resonanz resonanz" }, // must not count
    ]);
    const result = extractKeywords([conv]);
    const top = result[0];
    expect(top.word).toBe("resonanz");
    expect(top.count).toBe(3);
  });

  it("applies domain boost so boosted words rank above equally-frequent plain words", () => {
    // resonanz boost=2.0, welt boost=1.4 — both appear once
    const conv = makeConv([{ role: "user", content: "resonanz welt" }]);
    const result = extractKeywords([conv]);
    const r = result.find(e => e.word === "resonanz")!;
    const w = result.find(e => e.word === "welt")!;
    expect(r.score).toBeGreaterThan(w.score);
  });

  it("filters German stopwords", () => {
    const conv = makeConv([{ role: "user", content: "ich bin der eine also damit" }]);
    expect(extractKeywords([conv])).toHaveLength(0);
  });

  it("filters tokens shorter than 4 characters", () => {
    const conv = makeConv([{ role: "user", content: "abc xyz" }]);
    const result = extractKeywords([conv]);
    expect(result.every(e => e.word.length >= 4)).toBe(true);
  });

  it("skips messages with the error flag set", () => {
    const conv = makeConv([{ role: "user", content: "resonanz resonanz", error: true }]);
    expect(extractKeywords([conv])).toHaveLength(0);
  });

  it("includes freetext feedback in extraction", () => {
    const conv = makeConv(
      [{ role: "user", content: "danke" }], // stopword
      { q1: "", q2: "", q3: "", freetext: "resonanz resonanz" },
    );
    const result = extractKeywords([conv]);
    const r = result.find(e => e.word === "resonanz");
    expect(r).toBeDefined();
    expect(r!.count).toBe(2);
  });

  it("respects topN limit", () => {
    // Use purely alphabetic unique words; tokenizer strips digits so we avoid them
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const words = Array.from({ length: 15 }, (_, i) =>
      "wort" + letters[i % 26] + letters[(i + 1) % 26],
    );
    const conv = makeConv([{ role: "user", content: words.join(" ") }]);
    expect(extractKeywords([conv], 10)).toHaveLength(10);
  });

  it("results are sorted by score descending", () => {
    const conv = makeConv([{
      role: "user",
      content: "resonanzvernunft resonanzvernunft resonanzvernunft resonanz welt denken",
    }]);
    const result = extractKeywords([conv]);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });
});

// ─── buildResonanzpfad ───────────────────────────────────────────────────────

describe("buildResonanzpfad", () => {
  it("returns empty for no conversations", () => {
    expect(buildResonanzpfad([])).toEqual([]);
  });

  it("omits conversations without feedback", () => {
    const conv = makeConv([{ role: "user", content: "test" }]);
    expect(buildResonanzpfad([conv])).toHaveLength(0);
  });

  it("maps 'ja'-starting answers to 1.0", () => {
    const conv = makeConv([], {
      q1: "Ja — etwas hat mich berührt",
      q2: "Ja — es gab einen Moment",
      q3: "Ja — eine Frage bleibt",
      freetext: "",
    });
    const [p] = buildResonanzpfad([conv]);
    expect(p.q1).toBe(1.0);
    expect(p.q2).toBe(1.0);
    expect(p.q3).toBe(1.0);
    expect(p.avg).toBeCloseTo(1.0);
  });

  it("maps 'Vielleicht', 'Kurz…', 'Ich weiß…' to 0.5", () => {
    const conv = makeConv([], {
      q1: "Ich weiß es noch nicht",
      q2: "Kurz, aber es war da",
      q3: "Vielleicht",
      freetext: "",
    });
    const [p] = buildResonanzpfad([conv]);
    expect(p.q1).toBe(0.5);
    expect(p.q2).toBe(0.5);
    expect(p.q3).toBe(0.5);
  });

  it("maps 'Eher nicht', 'Nicht wirklich', 'Nein' to 0.0", () => {
    const conv = makeConv([], {
      q1: "Eher nicht",
      q2: "Nicht wirklich",
      q3: "Nein",
      freetext: "",
    });
    const [p] = buildResonanzpfad([conv]);
    expect(p.q1).toBe(0.0);
    expect(p.q2).toBe(0.0);
    expect(p.q3).toBe(0.0);
  });

  it("avg equals mean of q1, q2, q3", () => {
    const conv = makeConv([], { q1: "Ja", q2: "Vielleicht", q3: "Nein", freetext: "" });
    const [p] = buildResonanzpfad([conv]);
    expect(p.avg).toBeCloseTo((1.0 + 0.5 + 0.0) / 3);
  });

  it("sorts output by date ascending", () => {
    const c1 = makeConv([], { q1: "Ja", q2: "Ja", q3: "Ja", freetext: "" }, "2024-03-01", "c1");
    const c2 = makeConv([], { q1: "Nein", q2: "Nein", q3: "Nein", freetext: "" }, "2024-01-01", "c2");
    const result = buildResonanzpfad([c1, c2]);
    expect(result[0].date).toBe("2024-01-01");
    expect(result[1].date).toBe("2024-03-01");
  });
});

// ─── buildThemenBalance ──────────────────────────────────────────────────────

describe("buildThemenBalance", () => {
  it("returns empty for no conversations", () => {
    expect(buildThemenBalance([])).toEqual([]);
  });

  it("counts occurrences of cluster alias words", () => {
    const conv = makeConv([{ role: "user", content: "resonanz resonanz echo" }]);
    const result = buildThemenBalance([conv]);
    const r = result.find(e => e.term === "resonanz");
    expect(r).toBeDefined();
    expect(r!.count).toBeGreaterThanOrEqual(3); // "resonanz"×2 + "echo"×1
  });

  it("excludes clusters with zero matches", () => {
    const conv = makeConv([{ role: "user", content: "resonanz" }]);
    const result = buildThemenBalance([conv]);
    for (const entry of result) {
      expect(entry.count).toBeGreaterThan(0);
    }
  });

  it("sorts results by count descending", () => {
    // Flood resonanz cluster aliases, sparse mentions of others
    const conv = makeConv([{
      role: "user",
      content: "resonanz resonanz resonanz echo echo klang klang dasein",
    }]);
    const result = buildThemenBalance([conv]);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].count).toBeGreaterThanOrEqual(result[i].count);
    }
  });

  it("does not count assistant messages", () => {
    const conv = makeConv([
      { role: "assistant", content: "resonanz resonanz resonanz resonanz" },
    ]);
    const result = buildThemenBalance([conv]);
    const r = result.find(e => e.term === "resonanz");
    expect(r).toBeUndefined();
  });
});
