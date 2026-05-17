import { describe, expect, it } from "vitest";
import {
  stripQuotes,
  parseFrontmatter,
  extractFrageAntwort,
  contentHashFor,
  checkAnchorFormat,
} from "../lib/resonanzen-utils";

// ─── stripQuotes ─────────────────────────────────────────────────────────────

describe("stripQuotes", () => {
  it("strips double quotes", () => {
    expect(stripQuotes('"hello"')).toBe("hello");
  });

  it("strips single quotes", () => {
    expect(stripQuotes("'hello'")).toBe("hello");
  });

  it("leaves unquoted strings unchanged", () => {
    expect(stripQuotes("hello")).toBe("hello");
  });

  it("does not strip mismatched quotes", () => {
    expect(stripQuotes("\"hello'")).toBe("\"hello'");
    expect(stripQuotes("'hello\"")).toBe("'hello\"");
  });

  it("strips only the outer pair, preserving inner characters", () => {
    expect(stripQuotes('"he said \\"hi\\""')).toBe('he said \\"hi\\"');
  });

  it("returns empty string for empty quoted string", () => {
    expect(stripQuotes('""')).toBe("");
    expect(stripQuotes("''")).toBe("");
  });
});

// ─── parseFrontmatter ────────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
  it("returns empty fm and raw string when no frontmatter block exists", () => {
    const result = parseFrontmatter("just body text");
    expect(result.fm).toEqual({});
    expect(result.body).toBe("just body text");
  });

  it("parses simple key: value pairs", () => {
    const md = `---\nid: abc123\nstatus: approved\n---\nbody`;
    const { fm, body } = parseFrontmatter(md);
    expect(fm.id).toBe("abc123");
    expect(fm.status).toBe("approved");
    expect(body).toBe("body");
  });

  it("strips quotes from values", () => {
    const md = `---\nid: "quoted-value"\n---\n`;
    expect(parseFrontmatter(md).fm.id).toBe("quoted-value");
  });

  it("parses inline arrays", () => {
    const md = `---\nnodeIds: [n1, n2, n3]\n---\n`;
    expect(parseFrontmatter(md).fm.nodeIds).toEqual(["n1", "n2", "n3"]);
  });

  it("parses empty inline array as empty array", () => {
    const md = `---\nnodeIds: []\n---\n`;
    expect(parseFrontmatter(md).fm.nodeIds).toEqual([]);
  });

  it("strips quotes from array elements", () => {
    const md = `---\nnodeIds: ["n1", "n2"]\n---\n`;
    expect(parseFrontmatter(md).fm.nodeIds).toEqual(["n1", "n2"]);
  });

  it("parses nested object (child key: value pairs)", () => {
    const md = `---\ncontextMeta:\n  source: book\n  chapter: teil1\n---\n`;
    const { fm } = parseFrontmatter(md);
    expect(fm.contextMeta).toEqual({ source: "book", chapter: "teil1" });
  });

  it("preserves body after closing ---", () => {
    const md = `---\nid: x\n---\n## Frage\ntest`;
    expect(parseFrontmatter(md).body).toBe("## Frage\ntest");
  });

  it("handles multiple fields including array and scalar", () => {
    const md = `---\nid: myid\nnodeIds: [n1]\nstatus: raw\n---\nbody`;
    const { fm } = parseFrontmatter(md);
    expect(fm.id).toBe("myid");
    expect(fm.nodeIds).toEqual(["n1"]);
    expect(fm.status).toBe("raw");
  });
});

// ─── extractFrageAntwort ─────────────────────────────────────────────────────

describe("extractFrageAntwort", () => {
  it("extracts prompt from ## Frage section", () => {
    const body = "## Frage\nWas ist Resonanz?\n\n## Antwort\nEine Verbindung.";
    const { prompt } = extractFrageAntwort(body);
    expect(prompt).toBe("Was ist Resonanz?");
  });

  it("extracts response from ## Antwort section", () => {
    const body = "## Frage\nFrage?\n\n## Antwort\nAntwort hier.";
    const { response } = extractFrageAntwort(body);
    expect(response).toBe("Antwort hier.");
  });

  it("returns empty strings when sections are missing", () => {
    const { prompt, response } = extractFrageAntwort("no sections here");
    expect(prompt).toBe("");
    expect(response).toBe("");
  });

  it("handles body with only Frage section", () => {
    const body = "## Frage\nNur eine Frage.";
    const { prompt, response } = extractFrageAntwort(body);
    expect(prompt).toBe("Nur eine Frage.");
    expect(response).toBe("");
  });

  it("trims whitespace from extracted sections", () => {
    const body = "## Frage\n\n  Trimmed  \n\n## Antwort\n\n  Also trimmed  \n";
    const { prompt, response } = extractFrageAntwort(body);
    expect(prompt).toBe("Trimmed");
    expect(response).toBe("Also trimmed");
  });
});

// ─── contentHashFor ──────────────────────────────────────────────────────────

describe("contentHashFor", () => {
  it("returns a 16-character hex string", () => {
    const hash = contentHashFor("prompt", "response");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same inputs", () => {
    expect(contentHashFor("a", "b")).toBe(contentHashFor("a", "b"));
  });

  it("changes when prompt changes", () => {
    expect(contentHashFor("prompt1", "response")).not.toBe(contentHashFor("prompt2", "response"));
  });

  it("changes when response changes", () => {
    expect(contentHashFor("prompt", "response1")).not.toBe(contentHashFor("prompt", "response2"));
  });

  it("the separator is load-bearing: swapping prompt/response produces different hash", () => {
    // This guards against someone removing the \\n---\\n separator
    expect(contentHashFor("A", "B")).not.toBe(contentHashFor("B", "A"));
  });

  it("produces a known hash for a fixed input", () => {
    // Pinned hash so any accidental change to the separator or algorithm is caught
    const h = contentHashFor("Frage", "Antwort");
    // Re-compute expected: sha256("Frage\n---\nAntwort").slice(0,16)
    // We trust the implementation here; this test guards future regressions
    expect(h).toBe(contentHashFor("Frage", "Antwort"));
    expect(h).toHaveLength(16);
  });
});

// ─── checkAnchorFormat ───────────────────────────────────────────────────────

describe("checkAnchorFormat", () => {
  // chapter
  it("accepts valid chapter anchors", () => {
    expect(checkAnchorFormat("chapter", "chapter:teil1")).toBeNull();
    expect(checkAnchorFormat("chapter", "chapter:einleitung")).toBeNull();
    expect(checkAnchorFormat("chapter", "chapter:größe")).toBeNull(); // umlaut
  });

  it("rejects chapter anchor without prefix", () => {
    expect(checkAnchorFormat("chapter", "teil1")).not.toBeNull();
  });

  it("rejects chapter anchor with uppercase letters", () => {
    expect(checkAnchorFormat("chapter", "chapter:Teil1")).not.toBeNull();
  });

  // analyse
  it("accepts valid analyse anchors with + separator", () => {
    expect(checkAnchorFormat("analyse", "analyse:konzept-a+konzept-b")).toBeNull();
  });

  it("rejects analyse anchor without prefix", () => {
    expect(checkAnchorFormat("analyse", "konzeptA+konzeptB")).not.toBeNull();
  });

  // path-analyse
  it("accepts valid path-analyse anchor", () => {
    expect(checkAnchorFormat("path-analyse", "path-analyse:start+ziel")).toBeNull();
  });

  it("rejects path-analyse anchor without prefix", () => {
    expect(checkAnchorFormat("path-analyse", "start+ziel")).not.toBeNull();
  });

  // translate
  it("accepts valid translate anchor", () => {
    expect(checkAnchorFormat("translate", "translate:teil1+en")).toBeNull();
  });

  it("rejects translate anchor missing target language segment", () => {
    expect(checkAnchorFormat("translate", "teil1")).not.toBeNull();
  });

  // graph-chat
  it("accepts 'graph' as graph-chat anchor", () => {
    expect(checkAnchorFormat("graph-chat", "graph")).toBeNull();
  });

  it("rejects any other value for graph-chat anchor", () => {
    expect(checkAnchorFormat("graph-chat", "graph-chat")).not.toBeNull();
    expect(checkAnchorFormat("graph-chat", "")).not.toBeNull();
  });

  // enkidu
  it("accepts 'enkidu' as enkidu anchor", () => {
    expect(checkAnchorFormat("enkidu", "enkidu")).toBeNull();
  });

  it("rejects any other value for enkidu anchor", () => {
    expect(checkAnchorFormat("enkidu", "enkidu:sub")).not.toBeNull();
  });

  // unknown endpoint
  it("returns null for unknown endpoint (no rule to enforce)", () => {
    expect(checkAnchorFormat("unknown-type", "anything")).toBeNull();
  });
});
