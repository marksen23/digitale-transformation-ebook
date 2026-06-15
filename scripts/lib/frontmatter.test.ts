import { describe, it, expect } from "vitest";
import { parseFrontmatter, extractFrageAntwort, stripQuotes, normalizeNewlines } from "./frontmatter";

// Diese Tests sperren die CRLF-Robustheit fest: scripts/lib/frontmatter.ts ist
// die EINZIGE Quelle, durch die der ganze Korpus (build + validate) parst. Eine
// Regression beim Newline-Handling würde nodeIds/Anchors/content_hash still
// korrumpieren (Windows-Checkout → CRLF). Vorher waren die Parser dupliziert
// und ohne \r-Normalisierung.

describe("normalizeNewlines", () => {
  it("wandelt CRLF und CR in LF", () => {
    expect(normalizeNewlines("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });
});

describe("stripQuotes", () => {
  it("entfernt doppelte und einfache Anführungszeichen", () => {
    expect(stripQuotes('"x"')).toBe("x");
    expect(stripQuotes("'y'")).toBe("y");
    expect(stripQuotes("z")).toBe("z");
  });
});

describe("parseFrontmatter", () => {
  const expectCore = (md: string) => {
    const { fm, body } = parseFrontmatter(md);
    expect(fm.id).toBe("x42");
    expect(fm.status).toBe("raw");
    expect(fm.nodeIds).toEqual(["a", "b"]);
    expect(body).toContain("## Frage");
  };

  it("parst LF-Frontmatter", () => {
    expectCore("---\nid: x42\nstatus: raw\nnodeIds: [a, b]\n---\n## Frage\nWas?\n");
  });

  it("parst CRLF-Frontmatter identisch (Windows-Checkout)", () => {
    expectCore("---\r\nid: x42\r\nstatus: raw\r\nnodeIds: [a, b]\r\n---\r\n## Frage\r\nWas?\r\n");
  });

  it("liefert leere fm bei fehlendem Frontmatter", () => {
    const { fm, body } = parseFrontmatter("kein frontmatter hier");
    expect(fm).toEqual({});
    expect(body).toBe("kein frontmatter hier");
  });

  it("parst leere Listen und entfernt Quotes in Listen", () => {
    const { fm } = parseFrontmatter('---\nempty: []\nquoted: ["a", "b"]\n---\n');
    expect(fm.empty).toEqual([]);
    expect(fm.quoted).toEqual(["a", "b"]);
  });

  it("parst verschachtelte Kind-Objekte (audit_trail-artig)", () => {
    const { fm } = parseFrontmatter("---\nid: z\nmeta:\n  actor: admin\n  from: raw\n---\n");
    expect(fm.id).toBe("z");
    expect(fm.meta).toEqual({ actor: "admin", from: "raw" });
  });
});

describe("extractFrageAntwort", () => {
  it("extrahiert Frage + Antwort (LF)", () => {
    const { prompt, response } = extractFrageAntwort("## Frage\nWas ist X?\n\n## Antwort\nX ist Y.\n");
    expect(prompt).toBe("Was ist X?");
    expect(response).toBe("X ist Y.");
  });

  it("extrahiert Frage + Antwort identisch bei CRLF", () => {
    const { prompt, response } = extractFrageAntwort("## Frage\r\nWas ist X?\r\n\r\n## Antwort\r\nX ist Y.\r\n");
    expect(prompt).toBe("Was ist X?");
    expect(response).toBe("X ist Y.");
  });
});
