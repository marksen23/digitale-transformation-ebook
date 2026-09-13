import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getEchoDetectorHealth", () => {
  it("returns null cacheAgeSec when cache is empty", async () => {
    const mod = await import("../lib/echoDetector.js");
    mod._resetCacheForTest();
    const h = mod.getEchoDetectorHealth();
    expect(h.cacheAgeSec).toBeNull();
    expect(h.cachedEntries).toBe(0);
    expect(h.lastEchoCount).toBe(0);
  });
});

describe("detectEchoes", () => {
  it("returns empty array when fetch fails", async () => {
    const mod = await import("../lib/echoDetector.js");
    mod._resetCacheForTest();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const result = await mod.detectEchoes([0.1, 0.2, 0.3]);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when embeddings endpoint returns no data", async () => {
    const mod = await import("../lib/echoDetector.js");
    mod._resetCacheForTest();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: {} }),
    }));
    const result = await mod.detectEchoes([0.1, 0.2, 0.3]);
    expect(result).toHaveLength(0);
  });
});
