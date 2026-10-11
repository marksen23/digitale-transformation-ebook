import { describe, it, expect, afterEach } from "vitest";
import { geminiAuthHeaders, geminiGenerateUrl, geminiStreamUrl, redactSecrets } from "../lib/geminiHttp.js";

describe("gemini URLs", () => {
  it("legt den Key nicht in die URL", () => {
    expect(geminiGenerateUrl()).not.toContain("key=");
    expect(geminiGenerateUrl()).toContain(":generateContent");
    expect(geminiStreamUrl()).toContain("alt=sse");
    expect(geminiStreamUrl()).not.toContain("key=");
  });

  it("setzt den Key als Header", () => {
    const headers = geminiAuthHeaders("secret-key-value");
    expect(headers["x-goog-api-key"]).toBe("secret-key-value");
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

describe("redactSecrets", () => {
  const prev = process.env.GEMINI_API_KEY;

  afterEach(() => {
    if (prev === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prev;
  });

  it("schwärzt ?key= in URLs", () => {
    const out = redactSecrets("fetch failed https://example.test/v1?key=supersecret&alt=sse");
    expect(out).not.toContain("supersecret");
    expect(out).toContain("key=[redacted]");
  });

  it("schwärzt den gesetzten Gemini-Key, auch mitten im Text", () => {
    process.env.GEMINI_API_KEY = "AIzaSyTESTKEY123456";
    const out = redactSecrets("API_KEY_INVALID: AIzaSyTESTKEY123456");
    expect(out).not.toContain("AIzaSyTESTKEY123456");
    expect(out).toContain("[redacted]");
  });
});
