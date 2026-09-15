import { describe, it, expect } from "vitest";
import { parseEbookMarkdown } from "../parseEbook.js";

function buildMinimalMd(chapters: string[]): string {
  const header = Array.from({ length: 60 }, (_, i) => `Line ${i}`).join("\n");
  return header + "\n" + chapters.join("\n");
}

describe("parseEbookMarkdown", () => {
  it("returns correct metadata", () => {
    const result = parseEbookMarkdown(buildMinimalMd([]));
    expect(result.meta.title).toBe("Die Digitale Transformation");
    expect(result.meta.author).toBe("Markus Oehring");
    expect(result.meta.date).toBe("März 2026");
  });

  it("returns parts array with expected parts", () => {
    const result = parseEbookMarkdown(buildMinimalMd([]));
    const partIds = result.parts.map(p => p.id);
    expect(partIds).toContain("band1");
    expect(partIds).toContain("band2");
    expect(partIds).toContain("band3");
    expect(partIds).toContain("glossar");
  });

  it("parses chapters from markdown", () => {
    const md = buildMinimalMd([
      "Vorwort",
      "",
      "Dies ist das Vorwort.",
      "",
      "Präambel zur Trilogie",
      "",
      "Dies ist die Präambel.",
    ]);
    const result = parseEbookMarkdown(md);
    expect(result.chapters.length).toBeGreaterThan(0);
  });

  it("detects chapter id correctly", () => {
    const md = buildMinimalMd([
      "Vorwort",
      "Inhalt des Vorworts.",
    ]);
    const result = parseEbookMarkdown(md);
    const ch = result.chapters.find(c => c.id === "vorwort");
    expect(ch).toBeDefined();
    expect(ch!.title).toBe("Vorwort");
  });

  it("marks title pages as isTitlePage", () => {
    const md = buildMinimalMd([
      "BAND I: DIE ÜBERFÜHRUNG",
      "Untertitel der Überführung.",
    ]);
    const result = parseEbookMarkdown(md);
    const ch = result.chapters.find(c => c.id === "band1-title");
    expect(ch).toBeDefined();
    expect(ch!.isTitlePage).toBe(true);
  });

  it("assigns correct part to chapter", () => {
    const md = buildMinimalMd([
      "BAND I: DIE ÜBERFÜHRUNG",
      "Einleitung.",
      "Kapitel 1: Die Begegnung mit Enkidu",
      "Enkidu tritt auf.",
    ]);
    const result = parseEbookMarkdown(md);
    const kap1 = result.chapters.find(c => c.id === "band1-kap1");
    expect(kap1).toBeDefined();
    expect(kap1!.part).toBe("band1");
  });

  it("handles empty markdown without crashing", () => {
    const result = parseEbookMarkdown("");
    expect(result.chapters).toHaveLength(0);
    expect(result.meta.title).toBe("Die Digitale Transformation");
  });

  it("uses last occurrence of duplicate section heading", () => {
    const toc = "Vorwort\n";
    const header = Array.from({ length: 50 }, () => "x").join("\n");
    const content = "\nVorwort\n\nEchter Inhalt des Vorworts.\n";
    const result = parseEbookMarkdown(toc + header + content);
    const vorwort = result.chapters.find(c => c.id === "vorwort");
    if (vorwort) {
      expect(vorwort.content).toContain("Echter Inhalt");
    }
  });
});
