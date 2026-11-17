import { afterEach, describe, expect, it, vi } from "vitest";
import { pairKey, promoteEdge } from "../lib/conceptEdges.js";
import { canonicalEdgeKeys } from "../lib/graphContext.js";

const savedToken = process.env.GITHUB_TOKEN;

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = savedToken;
});

/** GET-Antwort der Kantendatei mit den übergebenen Kanten. */
function edgesResponse(edges: Array<{ source: string; target: string }>) {
  const content = Buffer.from(JSON.stringify({
    generatedAt: "2026-11-17T00:00:00.000Z",
    edges: edges.map(e => ({ ...e, createdAt: "2026-11-17T00:00:00.000Z", actor: "admin" })),
  })).toString("base64");
  return new Response(JSON.stringify({ sha: "sha-1", content }), { status: 200 });
}

describe("pairKey", () => {
  it("ist richtungslos", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
  });
  it("trennt verschiedene Paare", () => {
    expect(pairKey("a", "b")).not.toBe(pairKey("a", "c"));
  });
});

describe("canonicalEdgeKeys", () => {
  it("enthält Kanten aus EDGES und aus LEITMOTIV_EDGES", () => {
    // EDGES: steht im Self-Cluster von conceptGraph.ts
    expect(canonicalEdgeKeys.has(pairKey("selbst", "bewusstsein"))).toBe(true);
    // LEITMOTIV_EDGES: genau die Kante, die einst doppelt erhoben wurde
    expect(canonicalEdgeKeys.has(pairKey("freiheit", "lm-grenze"))).toBe(true);
  });
  it("ist richtungsunabhängig abfragbar", () => {
    expect(canonicalEdgeKeys.has(pairKey("lm-grenze", "freiheit"))).toBe(true);
  });
  it("enthält keine frei erfundene Verbindung", () => {
    expect(canonicalEdgeKeys.has(pairKey("schatten", "zeit"))).toBe(false);
  });
});

describe("promoteEdge — Dedup gegen den statischen Kanon", () => {
  it("schreibt nicht und ruft das Netz gar nicht erst, wenn die Kante im Kanon steht", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (_u: string, init?: RequestInit) => {
      calls.push(init?.method ?? "GET");
      return edgesResponse([]);
    });

    const r = await promoteEdge({
      source: "freiheit", target: "lm-grenze", actor: "admin",
      canonicalKeys: canonicalEdgeKeys,
    });

    expect(r).toEqual({ ok: true, already: true, canonical: true });
    expect(calls).toEqual([]); // kein GET, kein PUT
  });

  it("erkennt den Kanon auch bei umgekehrter Richtung", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    vi.stubGlobal("fetch", async () => { throw new Error("darf nicht aufgerufen werden"); });
    const r = await promoteEdge({
      source: "lm-grenze", target: "freiheit", actor: "admin",
      canonicalKeys: canonicalEdgeKeys,
    });
    expect(r).toEqual({ ok: true, already: true, canonical: true });
  });

  it("lässt eine Kante durch, die NICHT im Kanon steht", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    let put: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", async (_u: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "PUT") {
        put = JSON.parse(String(init?.body));
        return new Response("{}", { status: 200 });
      }
      return edgesResponse([]);
    });

    const r = await promoteEdge({
      source: "schatten", target: "zeit", actor: "admin",
      canonicalKeys: canonicalEdgeKeys,
    });

    expect(r).toEqual({ ok: true });
    expect(put).not.toBeNull();
    const written = JSON.parse(Buffer.from(String(put!.content), "base64").toString("utf-8"));
    expect(written.edges).toHaveLength(1);
    expect(written.edges[0]).toMatchObject({ source: "schatten", target: "zeit", actor: "admin" });
  });
});

describe("promoteEdge — Dedup gegen die bereits erhobenen Kanten", () => {
  it("meldet already, ohne zu schreiben, wenn die Kante schon in der Datei steht", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const methods: string[] = [];
    vi.stubGlobal("fetch", async (_u: string, init?: RequestInit) => {
      methods.push(init?.method ?? "GET");
      return edgesResponse([{ source: "stimme", target: "zwischen" }]);
    });

    const r = await promoteEdge({ source: "zwischen", target: "stimme", actor: "admin" });

    expect(r).toEqual({ ok: true, already: true });
    expect(methods).toEqual(["GET"]); // kein PUT
  });
});

describe("promoteEdge — Eingabeprüfung", () => {
  it("lehnt identische Endpunkte ab", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const r = await promoteEdge({ source: "freiheit", target: "freiheit", actor: "admin" });
    expect(r).toEqual({ ok: false, error: "source und target identisch" });
  });

  it("lehnt unbekannte Begriffe ab", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const r = await promoteEdge({
      source: "freiheit", target: "gibtsnicht", actor: "admin",
      validIds: new Set(["freiheit"]),
    });
    expect(r).toEqual({ ok: false, error: "unbekannter Begriff: gibtsnicht" });
  });

  it("meldet den fehlenden Token, statt still zu scheitern", async () => {
    delete process.env.GITHUB_TOKEN;
    const r = await promoteEdge({ source: "a", target: "b", actor: "admin" });
    expect(r).toEqual({ ok: false, error: "GITHUB_TOKEN fehlt — Kante nicht persistierbar" });
  });
});
