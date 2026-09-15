import { describe, it, expect } from "vitest";
import { passesSpamFilter, yamlString, contentHash, buildPath } from "../lib/resonanz-log-utils.js";

describe("passesSpamFilter", () => {
  it("rejects empty prompt", () => {
    expect(passesSpamFilter({ endpoint: "analyse", prompt: "", response: "valide Antwort hier" })).toBe(false);
  });
  it("rejects single-char prompt", () => {
    expect(passesSpamFilter({ endpoint: "analyse", prompt: "x", response: "valide Antwort hier" })).toBe(false);
  });
  it("rejects short response", () => {
    expect(passesSpamFilter({ endpoint: "analyse", prompt: "echte Frage", response: "kurz" })).toBe(false);
  });
  it("rejects 'keine antwort erhalten' in response", () => {
    expect(passesSpamFilter({ endpoint: "analyse", prompt: "echte Frage", response: "Keine Antwort erhalten vom System" })).toBe(false);
  });
  it("accepts valid entry", () => {
    expect(passesSpamFilter({ endpoint: "analyse", prompt: "Was ist Resonanzvernunft?", response: "Resonanzvernunft beschreibt eine Form des Denkens, die..." })).toBe(true);
  });
  it("rejects whitespace-only prompt", () => {
    expect(passesSpamFilter({ endpoint: "enkidu", prompt: "   ", response: "Eine ausreichend lange Antwort hier" })).toBe(false);
  });
});

describe("yamlString", () => {
  it("returns plain string without quotes for simple values", () => {
    expect(yamlString("analyse")).toBe("analyse");
    expect(yamlString("gemini-2.5-flash")).toBe("gemini-2.5-flash");
  });
  it("wraps string with spaces in quotes", () => {
    const result = yamlString("hello world");
    expect(result).toBe('"hello world"');
  });
  it("escapes backslashes", () => {
    const result = yamlString("back\\slash");
    expect(result).toContain("\\\\");
  });
  it("escapes double quotes", () => {
    const result = yamlString('say "hello"');
    expect(result).toContain('\\"');
  });
  it("allows colon in plain string", () => {
    expect(yamlString("analyse:konzept")).toBe("analyse:konzept");
  });
  it("allows plus in plain string", () => {
    expect(yamlString("a+b")).toBe("a+b");
  });
});

describe("contentHash", () => {
  it("returns 16 hex chars", () => {
    const h = contentHash("Frage", "Antwort");
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });
  it("is deterministic", () => {
    expect(contentHash("abc", "def")).toBe(contentHash("abc", "def"));
  });
  it("changes when prompt changes", () => {
    expect(contentHash("a", "b")).not.toBe(contentHash("x", "b"));
  });
  it("changes when response changes", () => {
    expect(contentHash("a", "b")).not.toBe(contentHash("a", "y"));
  });
  it("separator is load-bearing: same chars with different split differ", () => {
    expect(contentHash("ab", "")).not.toBe(contentHash("a", "b"));
  });
});

describe("buildPath", () => {
  it("builds correct path for chapter endpoint", () => {
    const p = buildPath("ABC123", "chapter", "chapter:band1-kap2", "2026-01-15T10:00:00Z");
    expect(p).toBe("content/resonanzen/raw/chapter/band1-kap2/2026-01-15-ABC123.md");
  });
  it("builds correct path for analyse endpoint with anchor", () => {
    const p = buildPath("XYZ", "analyse", "analyse:begriffA+begriffB", "2026-03-20T00:00:00Z");
    expect(p).toBe("content/resonanzen/raw/analyse/begriffA+begriffB/2026-03-20-XYZ.md");
  });
  it("sanitizes special chars in subdir", () => {
    const p = buildPath("ID1", "analyse", "analyse:a/b", "2026-01-01T00:00:00Z");
    expect(p).not.toContain("/a/b/");
    expect(p).toContain("a_b");
  });
  it("builds path without subdir for graph-chat", () => {
    const p = buildPath("G1", "graph-chat", "graph", "2026-06-01T00:00:00Z");
    expect(p).toBe("content/resonanzen/raw/graph-chat/2026-06-01-G1.md");
  });
});
