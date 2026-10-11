import { describe, expect, it } from "vitest";
import { deoverlapTexts, paragraphsForChapter } from "@/lib/werkChunks";

describe("deoverlapTexts", () => {
  it("passes through a single chunk unchanged", () => {
    const result = deoverlapTexts(["Erster Satz. Zweiter Satz."]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Erster Satz. Zweiter Satz.");
  });

  it("removes the overlapping trailing sentence between adjacent chunks", () => {
    const chunks = [
      "Satz A. Satz B. Satz C.",
      "Satz C. Satz D. Satz E.",
    ];
    const result = deoverlapTexts(chunks);
    expect(result[0]).toContain("Satz A");
    expect(result[1]).not.toContain("Satz C");
    expect(result[1]).toContain("Satz D");
  });

  it("does not strip anything when chunks share no overlap", () => {
    const chunks = ["Satz A. Satz B.", "Satz C. Satz D."];
    const result = deoverlapTexts(chunks);
    expect(result[0]).toBe("Satz A. Satz B.");
    expect(result[1]).toBe("Satz C. Satz D.");
  });

  it("handles an empty array", () => {
    expect(deoverlapTexts([])).toEqual([]);
  });

  it("handles a chunk that is entirely the overlap of the previous", () => {
    const chunks = ["Satz A. Satz B.", "Satz A. Satz B.", "Satz C."];
    const result = deoverlapTexts(chunks);
    expect(result[0]).toBe("Satz A. Satz B.");
    expect(result[2]).toContain("Satz C");
  });
});

describe("paragraphsForChapter", () => {
  it("splits on double newlines", () => {
    const long = (s: string) => s.padEnd(100, " und mehr Text");
    const content = `${long("Erster Absatz")}\n\n${long("Zweiter Absatz")}`;
    const result = paragraphsForChapter(content);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("filters out very short paragraphs", () => {
    const content = "Kurz.\n\nDieser Absatz ist lang genug um den Mindestschwellenwert von achtzig Zeichen zu überschreiten und damit durchzukommen.";
    const result = paragraphsForChapter(content);
    expect(result.every(p => p.length >= 80)).toBe(true);
  });

  it("collapses internal whitespace", () => {
    const content = "Satz   mit  extra   Leerzeichen und noch mehr Text damit es die Mindestlänge überschreitet.";
    const result = paragraphsForChapter(content);
    expect(result[0]).not.toMatch(/  /);
  });

  it("returns empty array for content with no long paragraphs", () => {
    expect(paragraphsForChapter("Kurz.\n\nAuch kurz.")).toEqual([]);
  });
});
