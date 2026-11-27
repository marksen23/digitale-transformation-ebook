import { describe, expect, it } from "vitest";
import { entityTag, isNotModified } from "../lib/assetFreshness.js";

describe("ETag der Korpus-Dateien", () => {
  it("bleibt gleich beim selben Text und erkennt den Header", () => {
    const tag = entityTag('{"count":1}');
    expect(entityTag('{"count":1}')).toBe(tag);
    expect(entityTag('{"count":2}')).not.toBe(tag);
    expect(isNotModified(tag, tag)).toBe(true);
    expect(isNotModified(`W/"andere", ${tag}`, tag)).toBe(true);
    expect(isNotModified(undefined, tag)).toBe(false);
  });
});