/**
 * 402 „Guthaben aufgebraucht“ ist ein Billing-Fehler: kein Retry am selben
 * Key, sofortiger Wechsel auf den nächsten Key (GEMINI_API_KEY_FALLBACK) —
 * für Embeddings, Text und Stream gleich. Keine echten Gemini-Calls: fetch
 * ist durchgehend gemockt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyError, fetchEmbedding, isCreditsDepleted } from "../lib/embeddingClient";
import { generateFlashContent } from "../lib/geminiText";
import { streamGeminiSSE } from "../lib/geminiStream";
import { flashErrorDetail } from "../lib/proseAssist";

const BODY_402 = JSON.stringify({
  error: {
    code: 402,
    message: "Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.",
    status: "RESOURCE_EXHAUSTED",
  },
});
const BODY_429_QUOTA = JSON.stringify({
  error: {
    code: 429,
    message: "You exceeded your current quota, please check your plan and billing details.",
    status: "RESOURCE_EXHAUSTED",
  },
});

function jsonResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { "Content-Type": "application/json" } });
}

function keyOf(init: RequestInit | undefined): string {
  return (init?.headers as Record<string, string>)["x-goog-api-key"];
}

describe("classifyError", () => {
  it("402 Guthaben aufgebraucht → billing", () => {
    expect(classifyError(402, BODY_402)).toBe("billing");
    expect(classifyError(402, "")).toBe("billing");
  });

  it("429 mit Prepaid-Hinweis → billing, normales 429 → quota", () => {
    expect(classifyError(429, BODY_402.replace("402", "429"))).toBe("billing");
    expect(classifyError(429, BODY_429_QUOTA)).toBe("quota");
  });

  it("bestehende Klassen bleiben", () => {
    expect(classifyError(403, "PERMISSION_DENIED dunning")).toBe("billing");
    expect(classifyError(403, "forbidden")).toBe("auth");
    expect(classifyError(401, "")).toBe("auth");
    expect(classifyError(400, "API_KEY_INVALID")).toBe("auth");
    expect(classifyError(503, "")).toBe("transient");
    expect(classifyError(0, "")).toBe("transient");
  });

  it("isCreditsDepleted erkennt nur den Prepaid-Fall", () => {
    expect(isCreditsDepleted(BODY_402)).toBe(true);
    expect(isCreditsDepleted(BODY_429_QUOTA)).toBe(false);
  });
});

describe("Key-Failover bei 402", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEYS", "");
    vi.stubEnv("GEMINI_API_KEY", "primary-key-0000");
    vi.stubEnv("GEMINI_API_KEY_FALLBACK", "fallback-key-1111");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fetchEmbedding: kein Retry am 402-Key, direkt Fallback", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      keyOf(init) === "primary-key-0000"
        ? jsonResponse(402, BODY_402)
        : jsonResponse(200, JSON.stringify({ embedding: { values: [0.1, 0.2] } })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const vec = await fetchEmbedding("text", { maxRetries: 3 });
    expect(vec).toEqual([0.1, 0.2]);
    const primaryCalls = fetchMock.mock.calls.filter(c => keyOf(c[1]) === "primary-key-0000");
    expect(primaryCalls).toHaveLength(1);
  });

  it("fetchEmbedding: alle Keys 402 → null, ohne Backoff-Retries", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(402, BODY_402));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchEmbedding("text", { maxRetries: 3 })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2); // je Key genau ein Versuch
  });

  it("generateFlashContent: alle Keys 402 → status 402 und Kontingent-Text", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(402, BODY_402));
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateFlashContent({ contents: [{ role: "user", parts: [{ text: "Hi" }] }] });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(402);
    expect(flashErrorDetail(r)).toContain("KI-Kontingent aufgebraucht");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("generateFlashContent: 402 rotiert auf den Fallback-Key", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      keyOf(init) === "primary-key-0000"
        ? jsonResponse(402, BODY_402)
        : jsonResponse(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: "Antwort" }] }, finishReason: "STOP" }] })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateFlashContent({ contents: [{ role: "user", parts: [{ text: "Hi" }] }] });
    expect(r.ok).toBe(true);
    expect(r.text).toBe("Antwort");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("streamGeminiSSE: alle Keys 402 → verständliche Fehlermeldung", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(402, BODY_402));
    vi.stubGlobal("fetch", fetchMock);
    const writes: string[] = [];
    const res = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: (chunk: string) => { writes.push(chunk); return true; },
      end: vi.fn(),
    };
    const out = await streamGeminiSSE(res as never, {
      apiKeys: ["primary-key-0000", "fallback-key-1111"],
      contents: [],
      generationConfig: {},
    });
    expect(out).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2); // beide Keys versucht
    expect(writes.join("")).toContain("KI-Kontingent derzeit aufgebraucht");
  });
});
