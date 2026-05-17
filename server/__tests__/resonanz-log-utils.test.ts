import { describe, expect, it } from "vitest";
import {
  passesSpamFilter,
  yamlString,
  contentHash,
  buildPath,
} from "../lib/resonanz-log-utils";
import type { ResonanzEntryLike } from "../lib/resonanz-log-utils";

const makeEntry = (prompt: string, response: string): ResonanzEntryLike => ({
  endpoint: "chapter",
  prompt,
  response,
});

// ─── passesSpamFilter ─────────────────────────────────────────────────────────

describe("passesSpamFilter", () => {
  it("passes a normal entry", () => {
    expect(passesSpamFilter(makeEntry("Was ist Resonanz?", "Resonanz ist die Fähigkeit einer Beziehung, tief zu wirken."))).toBe(true);
  });

  it("rejects empty prompt", () => {
    expect(passesSpamFilter(makeEntry("", "Ausreichend lange Antwort hier vorhanden."))).toBe(false);
  });

  it("rejects prompt shorter than 2 characters", () => {
    expect(passesSpamFilter(makeEntry("?", "Ausreichend lange Antwort hier."))).toBe(false);
  });

  it("accepts prompt of exactly 2 characters", () => {
    expect(passesSpamFilter(makeEntry("ok", "Ausreichend lange Antwort hier."))).toBe(true);
  });

  it("rejects response shorter than 10 characters", () => {
    expect(passesSpamFilter(makeEntry("Eine Frage?", "Kurz"))).toBe(false);
  });

  it("accepts response of exactly 10 characters", () => {
    expect(passesSpamFilter(makeEntry("Eine Frage?", "0123456789"))).toBe(true);
  });

  it("rejects response containing 'keine antwort erhalten'", () => {
    expect(passesSpamFilter(makeEntry("Frage", "Es wurde keine antwort erhalten vom Modell."))).toBe(false);
  });

  it("'keine antwort erhalten' check is case-insensitive", () => {
    expect(passesSpamFilter(makeEntry("Frage", "KEINE ANTWORT ERHALTEN — try again."))).toBe(false);
  });

  it("rejects entry with only whitespace prompt", () => {
    expect(passesSpamFilter(makeEntry("   ", "Ausreichend lange Antwort hier."))).toBe(false);
  });
});

// ─── yamlString ───────────────────────────────────────────────────────────────

describe("yamlString", () => {
  it("returns simple alphanumeric strings without quotes", () => {
    expect(yamlString("simple")).toBe("simple");
    expect(yamlString("abc123")).toBe("abc123");
  });

  it("allows colons, dots, slashes, plus, hyphens and underscores without quoting", () => {
    expect(yamlString("chapter:band1-kap3")).toBe("chapter:band1-kap3");
    expect(yamlString("analyse:resonanz+zwischen")).toBe("analyse:resonanz+zwischen");
    expect(yamlString("path/to/file")).toBe("path/to/file");
  });

  it("wraps strings with spaces in double quotes", () => {
    const result = yamlString("has spaces");
    expect(result).toBe('"has spaces"');
  });

  it("wraps strings with special YAML characters in double quotes", () => {
    expect(yamlString("value: with colon space")).toMatch(/^"/);
  });

  it("escapes backslashes inside quoted strings", () => {
    const result = yamlString("back\\slash");
    expect(result).toBe('"back\\\\slash"');
  });

  it("escapes double quotes inside quoted strings", () => {
    const result = yamlString('say "hello"');
    expect(result).toBe('"say \\"hello\\""');
  });

  it("does not double-quote strings that only have allowed chars", () => {
    const safe = "gemini-2.5-flash";
    expect(yamlString(safe)).toBe(safe);
  });
});

// ─── contentHash ─────────────────────────────────────────────────────────────

describe("contentHash", () => {
  it("returns a 16-character hex string", () => {
    expect(contentHash("p", "r")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic", () => {
    expect(contentHash("prompt", "response")).toBe(contentHash("prompt", "response"));
  });

  it("changes when prompt changes", () => {
    expect(contentHash("p1", "r")).not.toBe(contentHash("p2", "r"));
  });

  it("changes when response changes", () => {
    expect(contentHash("p", "r1")).not.toBe(contentHash("p", "r2"));
  });

  it("separator is load-bearing: swapping prompt/response gives different hash", () => {
    expect(contentHash("A", "B")).not.toBe(contentHash("B", "A"));
  });
});

// ─── buildPath ────────────────────────────────────────────────────────────────

describe("buildPath", () => {
  const TS = "2024-06-15T10:30:00Z";
  const ID = "TEST123";

  it("uses date prefix from ISO timestamp", () => {
    expect(buildPath(ID, "chapter", "chapter:band1-kap1", TS)).toContain("2024-06-15");
  });

  it("includes the entry ID in the filename", () => {
    expect(buildPath(ID, "chapter", "chapter:band1-kap1", TS)).toContain(ID);
  });

  it("routes chapter anchors into raw/chapter/<subdir>", () => {
    const p = buildPath(ID, "chapter", "chapter:band1-kap1", TS);
    expect(p).toBe(`content/resonanzen/raw/chapter/band1-kap1/2024-06-15-${ID}.md`);
  });

  it("routes analyse anchors with + separator into raw/analyse/<subdir>", () => {
    const p = buildPath(ID, "analyse", "analyse:resonanz+zwischen", TS);
    expect(p).toBe(`content/resonanzen/raw/analyse/resonanz+zwischen/2024-06-15-${ID}.md`);
  });

  it("routes path-analyse anchors into raw/path-analyse/<subdir>", () => {
    const p = buildPath(ID, "path-analyse", "path-analyse:start+ziel", TS);
    expect(p).toBe(`content/resonanzen/raw/path-analyse/start+ziel/2024-06-15-${ID}.md`);
  });

  it("routes graph-chat (anchor='graph') into raw/graph-chat (no subdir)", () => {
    const p = buildPath(ID, "graph-chat", "graph", TS);
    expect(p).toBe(`content/resonanzen/raw/graph-chat/2024-06-15-${ID}.md`);
  });

  it("routes enkidu (anchor='enkidu') into raw/enkidu (no subdir)", () => {
    const p = buildPath(ID, "enkidu", "enkidu", TS);
    expect(p).toBe(`content/resonanzen/raw/enkidu/2024-06-15-${ID}.md`);
  });

  it("sanitizes unsafe characters in subdir (replaces with underscore)", () => {
    const p = buildPath(ID, "chapter", "chapter:bad chars & more!", TS);
    expect(p).not.toMatch(/[ &!]/);
    expect(p).toContain("bad_chars___more_");
  });

  it("output always ends in .md", () => {
    expect(buildPath(ID, "chapter", "chapter:x", TS)).toMatch(/\.md$/);
  });
});
