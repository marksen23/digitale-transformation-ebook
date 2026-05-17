import { describe, expect, it } from "vitest";
import { parseEbookMarkdown } from "../parseEbook";

// ─── Fixture helper ───────────────────────────────────────────────────────────
//
// Creates a markdown string with exactly 50 header lines (indices 0–49) so that
// section headings placed after the join start at index 50, matching where the
// scanner begins.

function makeMarkdown(...sections: Array<{ heading: string; body?: string }>): string {
  const header = Array(50).fill("preamble").join("\n");
  const sectionLines = sections
    .flatMap(s => [s.heading, s.body ?? "body content"])
    .join("\n");
  return `${header}\n${sectionLines}`;
}

// ─── meta ────────────────────────────────────────────────────────────────────

describe("parseEbookMarkdown — meta", () => {
  it("returns the fixed book metadata regardless of input content", () => {
    const { meta } = parseEbookMarkdown(makeMarkdown());
    expect(meta.title).toBe("Die Digitale Transformation");
    expect(meta.author).toBe("Markus Oehring");
    expect(meta.date).toBe("März 2026");
    expect(meta.copyright).toContain("2026");
  });
});

// ─── parts ───────────────────────────────────────────────────────────────────

describe("parseEbookMarkdown — parts", () => {
  it("always returns exactly 11 parts", () => {
    expect(parseEbookMarkdown(makeMarkdown()).parts).toHaveLength(11);
  });

  it("part ids cover all bands and sections", () => {
    const ids = parseEbookMarkdown(makeMarkdown()).parts.map(p => p.id);
    expect(ids).toContain("band1");
    expect(ids).toContain("band2");
    expect(ids).toContain("band3");
    expect(ids).toContain("einleitung");
    expect(ids).toContain("glossar");
  });
});

// ─── chapter detection ────────────────────────────────────────────────────────

describe("parseEbookMarkdown — chapter detection", () => {
  it("returns no chapters when there are no matching headings", () => {
    const md = Array(60).fill("filler line").join("\n");
    expect(parseEbookMarkdown(md).chapters).toHaveLength(0);
  });

  it("detects a Vorwort chapter", () => {
    const result = parseEbookMarkdown(makeMarkdown({ heading: "Vorwort" }));
    const ch = result.chapters.find(c => c.id === "vorwort");
    expect(ch).toBeDefined();
    expect(ch!.part).toBe("einleitung");
    expect(ch!.partTitle).toBe("Einleitung");
    expect(ch!.title).toBe("Vorwort");
  });

  it("detects multiple chapters in order", () => {
    const result = parseEbookMarkdown(
      makeMarkdown(
        { heading: "Vorwort", body: "vorwort body" },
        { heading: "Präambel zur Trilogie", body: "praeambel body" },
      ),
    );
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].id).toBe("vorwort");
    expect(result.chapters[1].id).toBe("praeambel");
  });

  it("marks BAND I title page with isTitlePage:true and a description", () => {
    const result = parseEbookMarkdown(
      makeMarkdown({ heading: "BAND I: DIE ÜBERFÜHRUNG — subtitle" }),
    );
    const ch = result.chapters.find(c => c.id === "band1-title");
    expect(ch).toBeDefined();
    expect(ch!.isTitlePage).toBe(true);
    expect(ch!.description).toBeTruthy();
  });

  it("non-title-page chapters do not have isTitlePage set", () => {
    const result = parseEbookMarkdown(makeMarkdown({ heading: "Vorwort" }));
    expect(result.chapters[0].isTitlePage).toBeUndefined();
  });
});

// ─── content boundary and extraction ─────────────────────────────────────────

describe("parseEbookMarkdown — content extraction", () => {
  it("does not include the heading line in chapter content", () => {
    const result = parseEbookMarkdown(
      makeMarkdown({ heading: "Vorwort", body: "real content" }),
    );
    const ch = result.chapters.find(c => c.id === "vorwort")!;
    expect(ch.content).toBe("real content");
    expect(ch.content).not.toMatch(/^Vorwort/);
  });

  it("content of first chapter stops before the next chapter heading", () => {
    const result = parseEbookMarkdown(
      makeMarkdown(
        { heading: "Vorwort", body: "vorwort body" },
        { heading: "Präambel zur Trilogie", body: "praeambel body" },
      ),
    );
    expect(result.chapters[0].content).toBe("vorwort body");
    expect(result.chapters[0].content).not.toContain("Präambel");
  });

  it("each chapter contains its own body text", () => {
    const result = parseEbookMarkdown(
      makeMarkdown(
        { heading: "Vorwort", body: "vorwort body" },
        { heading: "Präambel zur Trilogie", body: "praeambel body" },
      ),
    );
    expect(result.chapters[1].content).toBe("praeambel body");
  });

  it("strips known subtitle lines from chapter content start", () => {
    // "Von der Erschöpfung..." is a hardcoded subtitle of Präambel that gets stripped
    const body = "Von der Erschöpfung zur Erneuerung\nactual content";
    const result = parseEbookMarkdown(
      makeMarkdown({ heading: "Präambel zur Trilogie", body }),
    );
    const ch = result.chapters.find(c => c.id === "praeambel")!;
    expect(ch.content).toBe("actual content");
    expect(ch.content).not.toContain("Von der Erschöpfung");
  });

  it("strips blank lines at the start of chapter content", () => {
    const result = parseEbookMarkdown(
      makeMarkdown({ heading: "Vorwort", body: "\n\nreal content" }),
    );
    expect(result.chapters[0].content).not.toMatch(/^\n/);
    expect(result.chapters[0].content).toBe("real content");
  });
});

// ─── duplicate heading deduplication (ToC logic) ─────────────────────────────

describe("parseEbookMarkdown — ToC dedup", () => {
  it("uses the last occurrence when a heading appears twice after line 50", () => {
    const header = Array(50).fill("preamble").join("\n");
    // Line 50: first "Vorwort" (like a ToC entry)
    // Lines 51–53: filler
    // Line 54: second "Vorwort" (the real chapter)
    // Line 55: real body
    const body = [
      "Vorwort",           // line 50 — first occurrence
      "toc entry text",    // line 51
      "filler",            // line 52
      "more filler",       // line 53
      "Vorwort",           // line 54 — second (real) occurrence
      "real chapter body", // line 55
    ].join("\n");
    const result = parseEbookMarkdown(`${header}\n${body}`);
    const ch = result.chapters.find(c => c.id === "vorwort")!;
    expect(ch).toBeDefined();
    // Content should come from the second occurrence, not the first
    expect(ch.content).toBe("real chapter body");
    expect(ch.content).not.toContain("toc entry text");
  });
});

// ─── cleanContent ─────────────────────────────────────────────────────────────

describe("parseEbookMarkdown — cleanContent (via integration)", () => {
  it("removes embedded running-header pattern from chapter body", () => {
    const body = [
      "first paragraph",
      "DIE DIGITALE TRANSFORMATION",
      "42",
      "second paragraph",
    ].join("\n");
    const result = parseEbookMarkdown(
      makeMarkdown({ heading: "Vorwort", body }),
    );
    const ch = result.chapters.find(c => c.id === "vorwort")!;
    expect(ch.content).not.toContain("DIE DIGITALE TRANSFORMATION");
    expect(ch.content).toContain("first paragraph");
    expect(ch.content).toContain("second paragraph");
  });

  it("collapses three or more consecutive blank lines to two", () => {
    const body = ["para one", "", "", "", "para two"].join("\n");
    const result = parseEbookMarkdown(
      makeMarkdown({ heading: "Vorwort", body }),
    );
    const ch = result.chapters.find(c => c.id === "vorwort")!;
    // No run of 3+ newlines in output
    expect(ch.content).not.toMatch(/\n{3,}/);
    expect(ch.content).toContain("para one");
    expect(ch.content).toContain("para two");
  });
});
