import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock embeddingClient before the module under test is imported
vi.mock("../lib/embeddingClient.js", () => {
  const cosineSim = (a: number[], b: number[]): number => {
    if (a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
    return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  };
  return { fetchEmbedding: vi.fn(), cosineSim };
});

// Stub global fetch before the module is imported
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { detectEchoes, getEchoDetectorHealth, _resetCacheForTest } from "../lib/echoDetector";
import { fetchEmbedding } from "../lib/embeddingClient";

const mockedFetchEmbedding = vi.mocked(fetchEmbedding);

// ─── getEchoDetectorHealth ────────────────────────────────────────────────────

describe("getEchoDetectorHealth", () => {
  beforeEach(() => {
    _resetCacheForTest();
    vi.clearAllMocks();
  });

  it("reports null cacheAgeSec and 0 entries when cache has never loaded", () => {
    const h = getEchoDetectorHealth();
    expect(h.cacheAgeSec).toBeNull();
    expect(h.cachedEntries).toBe(0);
    expect(h.lastEchoCount).toBe(0);
  });
});

// ─── detectEchoes ─────────────────────────────────────────────────────────────

describe("detectEchoes", () => {
  beforeEach(() => {
    _resetCacheForTest();
    vi.clearAllMocks();
  });

  it("returns empty array when cache fetch fails (non-ok response)", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    const result = await detectEchoes("prompt", "response");
    expect(result).toEqual([]);
  });

  it("returns empty array when both fetch calls throw a network error", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));
    const result = await detectEchoes("prompt", "response");
    expect(result).toEqual([]);
  });

  it("returns empty array when fetchEmbedding returns null (no API key)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: {}, entries: [] }),
    });
    mockedFetchEmbedding.mockResolvedValue(null);
    const result = await detectEchoes("prompt", "response");
    expect(result).toEqual([]);
  });

  it("returns empty array when no cached embeddings exceed the threshold", async () => {
    // One cached entry with an orthogonal vector — cosine = 0, below threshold 0.88
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: { "entry-1": [0, 1, 0] },
        entries: [{ id: "entry-1", anchor: "chapter:1", endpoint: "chapter" }],
      }),
    });
    mockedFetchEmbedding.mockResolvedValue([1, 0, 0]); // orthogonal to [0,1,0]
    const result = await detectEchoes("prompt", "response");
    expect(result).toEqual([]);
  });

  it("returns matched echoes when cosine exceeds threshold", async () => {
    const cachedVec = [0.9999, 0.001, 0];
    const queryVec  = [0.9998, 0.002, 0]; // cosine ≈ 0.9999…, well above 0.88
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: { "entry-1": cachedVec },
        entries: [{ id: "entry-1", anchor: "chapter:teil1", endpoint: "chapter" }],
      }),
    });
    mockedFetchEmbedding.mockResolvedValue(queryVec);
    const result = await detectEchoes("prompt", "response");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("entry-1");
    expect(result[0].anchor).toBe("chapter:teil1");
    expect(result[0].endpoint).toBe("chapter");
    expect(result[0].score).toBeGreaterThan(0.88);
  });

  it("returns at most TOP_K=5 results even with many matches", async () => {
    const queryVec = [1, 0, 0];
    const embeddings: Record<string, number[]> = {};
    const entries: { id: string; anchor: string; endpoint: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const id = `e${i}`;
      // All very similar — cosine ≈ 1.0
      embeddings[id] = [0.9999 - i * 0.0001, 0.001, 0];
      entries.push({ id, anchor: `chapter:${i}`, endpoint: "chapter" });
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings, entries }),
    });
    mockedFetchEmbedding.mockResolvedValue(queryVec);
    const result = await detectEchoes("p", "r");
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("results are sorted by score descending", async () => {
    const queryVec = [1, 0, 0];
    const embeddings = {
      "high": [0.9999, 0.001, 0],  // very similar
      "low":  [0.92,   0.2,  0],   // above threshold but lower
    };
    const entries = [
      { id: "high", anchor: "chapter:h", endpoint: "chapter" },
      { id: "low",  anchor: "chapter:l", endpoint: "chapter" },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings, entries }),
    });
    mockedFetchEmbedding.mockResolvedValue(queryVec);
    const result = await detectEchoes("p", "r");
    expect(result[0].score).toBeGreaterThanOrEqual(result[result.length - 1].score);
  });

  it("excludes chapter:* prefixed IDs from echo candidates", async () => {
    const queryVec = [1, 0, 0];
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: {
          "chapter:teil1": [0.9999, 0.001, 0], // should be excluded
          "corpus-entry":  [0.9999, 0.001, 0], // should be included
        },
        entries: [
          { id: "chapter:teil1", anchor: "chapter:teil1", endpoint: "chapter" },
          { id: "corpus-entry",  anchor: "analyse:test",  endpoint: "analyse" },
        ],
      }),
    });
    mockedFetchEmbedding.mockResolvedValue(queryVec);
    const result = await detectEchoes("p", "r");
    expect(result.some(r => r.id === "chapter:teil1")).toBe(false);
    expect(result.some(r => r.id === "corpus-entry")).toBe(true);
  });

  it("health reflects last echo count after a detection run", async () => {
    const queryVec = [0.9999, 0.001, 0];
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: { "e1": [0.9998, 0.002, 0] },
        entries: [{ id: "e1", anchor: "chapter:x", endpoint: "chapter" }],
      }),
    });
    mockedFetchEmbedding.mockResolvedValue(queryVec);
    await detectEchoes("p", "r");
    expect(getEchoDetectorHealth().lastEchoCount).toBe(1);
  });
});
