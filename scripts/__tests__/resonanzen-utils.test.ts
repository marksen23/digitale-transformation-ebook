import { describe, it, expect } from "vitest";
import { contentHashFor, checkAnchorFormat } from "../lib/resonanzen-utils.js";

describe("contentHashFor", () => {
  it("returns 16 hex characters", () => {
    const h = contentHashFor("prompt", "response");
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });
  it("is deterministic", () => {
    expect(contentHashFor("a", "b")).toBe(contentHashFor("a", "b"));
  });
  it("differs on changed prompt", () => {
    expect(contentHashFor("a", "b")).not.toBe(contentHashFor("c", "b"));
  });
  it("differs on changed response", () => {
    expect(contentHashFor("a", "b")).not.toBe(contentHashFor("a", "c"));
  });
  it("separator is load-bearing: same chars with different split differ", () => {
    expect(contentHashFor("ab", "")).not.toBe(contentHashFor("a", "b"));
  });
});

describe("checkAnchorFormat", () => {
  it("accepts valid chapter anchor", () => {
    expect(checkAnchorFormat("chapter", "chapter:band1-kap2")).toBeNull();
  });
  it("rejects chapter without prefix", () => {
    expect(checkAnchorFormat("chapter", "band1-kap2")).not.toBeNull();
  });
  it("accepts valid analyse anchor", () => {
    expect(checkAnchorFormat("analyse", "analyse:begriff-a+begriff-b")).toBeNull();
  });
  it("rejects analyse with uppercase", () => {
    expect(checkAnchorFormat("analyse", "analyse:BegriffA")).not.toBeNull();
  });
  it("accepts valid path-analyse anchor", () => {
    expect(checkAnchorFormat("path-analyse", "path-analyse:von+nach")).toBeNull();
  });
  it("accepts graph-chat with anchor 'graph'", () => {
    expect(checkAnchorFormat("graph-chat", "graph")).toBeNull();
  });
  it("rejects graph-chat with wrong anchor", () => {
    expect(checkAnchorFormat("graph-chat", "graph-chat")).not.toBeNull();
  });
  it("accepts enkidu anchor", () => {
    expect(checkAnchorFormat("enkidu", "enkidu")).toBeNull();
  });
  it("rejects enkidu with wrong anchor", () => {
    expect(checkAnchorFormat("enkidu", "something")).not.toBeNull();
  });
  it("accepts valid passage anchor", () => {
    expect(checkAnchorFormat("passage", "passage:a1b2c3d4")).toBeNull();
  });
  it("rejects passage with wrong length", () => {
    expect(checkAnchorFormat("passage", "passage:abc")).not.toBeNull();
  });
  it("accepts valid dialog anchor", () => {
    expect(checkAnchorFormat("dialog", "dialog:freier")).toBeNull();
  });
  it("accepts valid translate anchor", () => {
    expect(checkAnchorFormat("translate", "translate:band1-kap1+de")).toBeNull();
  });
  it("returns null for unknown endpoint", () => {
    expect(checkAnchorFormat("unknown", "anything")).toBeNull();
  });
});
