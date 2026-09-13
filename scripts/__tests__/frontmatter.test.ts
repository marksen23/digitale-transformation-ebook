import { describe, it, expect } from "vitest";
import { stripQuotes, parseFrontmatter, extractFrageAntwort, normalizeNewlines } from "../lib/frontmatter.js";

describe("normalizeNewlines", () => {
  it("converts CRLF to LF", () => {
    expect(normalizeNewlines("a\r\nb\r\nc")).toBe("a\nb\nc");
  });
  it("converts CR to LF", () => {
    expect(normalizeNewlines("a\rb")).toBe("a\nb");
  });
  it("leaves LF unchanged", () => {
    expect(normalizeNewlines("a\nb")).toBe("a\nb");
  });
});

describe("stripQuotes", () => {
  it("strips double quotes", () => {
    expect(stripQuotes('"hello"')).toBe("hello");
  });
  it("strips single quotes", () => {
    expect(stripQuotes("'world'")).toBe("world");
  });
  it("leaves unquoted string unchanged", () => {
    expect(stripQuotes("plain")).toBe("plain");
  });
  it("leaves mismatched quotes unchanged", () => {
    expect(stripQuotes('"mixed\'')).toBe('"mixed\'');
  });
  it("strips empty quoted string", () => {
    expect(stripQuotes('""')).toBe("");
  });
});

describe("parseFrontmatter", () => {
  const md = `---
id: ABC123
ts: 2026-01-01T00:00:00Z
endpoint: analyse
anchor: analyse:begriffA+begriffB
nodeIds: [begriffA, begriffB]
status: raw
content_hash: deadbeef12345678
---

## Frage

Was ist Resonanz?

## Antwort

Resonanz ist...
`;

  it("parses all fields", () => {
    const { fm } = parseFrontmatter(md);
    expect(fm.id).toBe("ABC123");
    expect(fm.endpoint).toBe("analyse");
    expect(fm.anchor).toBe("analyse:begriffA+begriffB");
    expect(fm.status).toBe("raw");
  });

  it("parses nodeIds as array", () => {
    const { fm } = parseFrontmatter(md);
    expect(Array.isArray(fm.nodeIds)).toBe(true);
    expect(fm.nodeIds).toContain("begriffA");
    expect(fm.nodeIds).toContain("begriffB");
  });

  it("returns body after frontmatter", () => {
    const { body } = parseFrontmatter(md);
    expect(body).toContain("## Frage");
    expect(body).toContain("Was ist Resonanz?");
  });

  it("returns empty fm for content without frontmatter", () => {
    const { fm, body } = parseFrontmatter("# Kein Frontmatter\n\nNur Inhalt.");
    expect(Object.keys(fm)).toHaveLength(0);
    expect(body).toContain("Kein Frontmatter");
  });

  it("handles CRLF input", () => {
    const crlfMd = md.replace(/\n/g, "\r\n");
    const { fm } = parseFrontmatter(crlfMd);
    expect(fm.id).toBe("ABC123");
  });

  it("strips quotes from quoted values", () => {
    const quoted = `---\nid: "quoted-id"\n---\n`;
    const { fm } = parseFrontmatter(quoted);
    expect(fm.id).toBe("quoted-id");
  });
});

describe("extractFrageAntwort", () => {
  const body = `
## Frage

Was ist Resonanzvernunft?

## Antwort

Resonanzvernunft beschreibt eine philosophische Haltung...
`;

  it("extracts prompt from Frage section", () => {
    const { prompt } = extractFrageAntwort(body);
    expect(prompt).toContain("Was ist Resonanzvernunft?");
  });

  it("extracts response from Antwort section", () => {
    const { response } = extractFrageAntwort(body);
    expect(response).toContain("Resonanzvernunft beschreibt");
  });

  it("returns empty strings for missing sections", () => {
    const { prompt, response } = extractFrageAntwort("Kein Inhalt hier.");
    expect(prompt).toBe("");
    expect(response).toBe("");
  });

  it("handles CRLF in body", () => {
    const crlfBody = body.replace(/\n/g, "\r\n");
    const { prompt } = extractFrageAntwort(crlfBody);
    expect(prompt).toContain("Was ist Resonanzvernunft?");
  });
});
