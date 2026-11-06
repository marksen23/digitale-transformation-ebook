import http, { createServer, type Server } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { blockHeavyAssets } from "../lib/blockHeavyAssets.js";
import { compressResponses } from "../lib/compressResponses.js";
import { chunkForReader, topSimilar, topWerkChapters } from "../lib/similarity.js";
import { createCorpusReadRouter, type CorpusDeps, type WerkChunksFile } from "../routes/corpusRead.js";
import type { ResonanzEntry } from "../../client/src/lib/resonanzenIndex.js";

function entry(partial: Partial<ResonanzEntry> & { id: string }): ResonanzEntry {
  return {
    id: partial.id,
    ts: partial.ts ?? "2026-01-02T00:00:00.000Z",
    endpoint: partial.endpoint ?? "analyse",
    anchor: partial.anchor ?? "chapter:vorwort",
    nodeIds: partial.nodeIds ?? [],
    status: partial.status ?? "published",
    prompt: partial.prompt ?? "Was ist Resonanz?",
    response: partial.response ?? "Eine Antwort auf die Frage.",
    contextMeta: partial.contextMeta ?? {},
  };
}

const werk: WerkChunksFile = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  chunkCount: 3,
  embeddedCount: 3,
  chunks: [
    {
      id: "c1", chapter: "vorwort", part: "einleitung", position: 1,
      text: "Alpha über Resonanz und Dasein.", chapterTitle: "Vorwort",
      embedding: [1, 0, 0],
    },
    {
      id: "c0", chapter: "vorwort", part: "einleitung", position: 0,
      text: "Anfang des Vorworts.", chapterTitle: "Vorwort",
      embedding: [0.2, 0.9, 0],
    },
    {
      id: "c2", chapter: "teil1", part: "band1", position: 0,
      text: "Beta, orthogonal.", chapterTitle: "Teil I",
      embedding: [0, 1, 0],
    },
  ],
};

function deps(embed: CorpusDeps["embed"] = async () => [1, 0, 0]): CorpusDeps {
  return {
    embed,
    werkChunks: async () => werk,
    resonanzEmbeddings: async () => ({
      generatedAt: "2026-01-01T00:00:00.000Z",
      embeddings: { a: [1, 0, 0], b: [0, 1, 0], raw: [1, 0, 0] },
    }),
    resonanzIndex: async () => ({
      entries: [
        entry({ id: "a", status: "published" }),
        entry({ id: "b", status: "approved", prompt: "Andere Frage" }),
        entry({ id: "raw", status: "raw", prompt: "Rohling" }),
      ],
    }),
    conceptEmbeddings: async () => ({
      generatedAt: "2026-01-01T00:00:00.000Z",
      embeddings: { resonanz: [1, 0, 0], fern: [0, 1, 0] },
    }),
    philosopherEmbeddings: async () => ({
      generatedAt: "2026-01-01T00:00:00.000Z",
      embeddings: { spinoza: [1, 0], kant: [0, 1] },
    }),
  };
}

function longVectorArrays(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    if (value.length > 8 && value.every(n => typeof n === "number")) return [path];
    return value.flatMap((item, i) => longVectorArrays(item, `${path}[${i}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => {
      const next = longVectorArrays(v, `${path}.${k}`);
      return k === "embedding" ? [path + ".embedding", ...next] : next;
    });
  }
  return [];
}

let server: Server | null = null;

async function listen(app: express.Express): Promise<string> {
  server = createServer(app);
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  if (!server) return;
  const current = server;
  server = null;
  await new Promise<void>((resolve, reject) => current.close(err => err ? reject(err) : resolve()));
});

describe("similarity", () => {
  it("keeps the best chunk per chapter and drops weak scores", () => {
    const hits = topWerkChapters([1, 0, 0], werk.chunks, { minScore: 0.4, limit: 8 });
    expect(hits.map(h => h.id)).toEqual(["vorwort"]);
    expect(hits[0].chunkId).toBe("c1");
    expect(hits[0].score).toBeCloseTo(1, 5);
    expect(hits[0].text).toContain("Resonanz");
  });

  it("ranks ids and respects the cutoff", () => {
    const hits = topSimilar([1, 0, 0], [
      { id: "near", vector: [1, 0, 0] },
      { id: "far", vector: [0, 1, 0] },
      { id: "missing", vector: null },
    ], { minScore: 0.4, limit: 5 });
    expect(hits).toEqual([{ id: "near", score: 1 }]);
  });

  it("strips embeddings from reader chunks", () => {
    const pub = chunkForReader({ ...werk.chunks[0], embedding: [1, 2, 3] } as WerkChunksFile["chunks"][number]);
    expect(pub).not.toHaveProperty("embedding");
    expect(pub.text).toContain("Resonanz");
  });
});

describe("corpus read API", () => {
  it("serves chapter text and a chunk map without vectors", async () => {
    const app = express();
    app.use(express.json());
    app.use(createCorpusReadRouter(deps()));
    const base = await listen(app);

    const chapter = await fetch(`${base}/api/werk/chunks?chapter=vorwort`);
    expect(chapter.status).toBe(200);
    expect(chapter.headers.get("cache-control")).toContain("max-age=3600");
    const body = await chapter.json();
    expect(body.chunks.map((c: { id: string }) => c.id)).toEqual(["c0", "c1"]);
    expect(longVectorArrays(body)).toEqual([]);

    const map = await fetch(`${base}/api/werk/chunk-map`).then(r => r.json());
    expect(map.chunks).toEqual([
      { id: "c1", chapter: "vorwort" },
      { id: "c0", chapter: "vorwort" },
      { id: "c2", chapter: "teil1" },
    ]);
    expect(longVectorArrays(map)).toEqual([]);

    const bad = await fetch(`${base}/api/werk/chunks?chapter=../etc`);
    expect(bad.status).toBe(400);
  });

  it("ranks curated resonanzen, concepts and werk hits", async () => {
    let embedCalls = 0;
    const app = express();
    app.use(express.json());
    app.use(createCorpusReadRouter(deps(async () => {
      embedCalls++;
      return [1, 0, 0];
    })));
    const base = await listen(app);

    const first = await fetch(`${base}/api/corpus/similar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corpus: "resonanzen", text: "Resonanz", limit: 5, minScore: 0.4 }),
    });
    const resonanzen = await first.json();
    expect(resonanzen.hits.map((h: { id: string }) => h.id)).toEqual(["a"]);
    expect(longVectorArrays(resonanzen)).toEqual([]);

    const second = await fetch(`${base}/api/corpus/similar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corpus: "resonanzen", text: "Resonanz", limit: 5 }),
    });
    expect(second.status).toBe(200);
    expect(embedCalls).toBe(1);

    const concepts = await fetch(`${base}/api/corpus/similar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corpus: "concepts", text: "Resonanz" }),
    }).then(r => r.json());
    expect(concepts.hits[0].id).toBe("resonanz");

    const chapters = await fetch(`${base}/api/corpus/similar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corpus: "werk", text: "Resonanz", limit: 5 }),
    }).then(r => r.json());
    expect(chapters.hits[0]).toMatchObject({ id: "vorwort", chunkId: "c1" });
    expect(JSON.stringify(chapters)).not.toContain('"embedding"');
  });

  it("returns 503 when the query cannot be embedded", async () => {
    const app = express();
    app.use(express.json());
    app.use(createCorpusReadRouter(deps(async () => null)));
    const base = await listen(app);
    const res = await fetch(`${base}/api/corpus/similar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corpus: "werk", text: "Frage" }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/nicht berechnet/);
  });

  it("reports embedding counts without shipping vectors", async () => {
    const app = express();
    app.use(createCorpusReadRouter(deps()));
    const base = await listen(app);
    const meta = await fetch(`${base}/api/corpus/meta`).then(r => r.json());
    expect(meta.files.map((f: { name: string; count: number }) => [f.name, f.count])).toEqual([
      ["Werk-Chunks", 3],
      ["Resonanzen", 3],
      ["Begriffe", 2],
      ["Philosophen", 2],
    ]);
    expect(longVectorArrays(meta)).toEqual([]);
  });

  it("does not hand the heavy JSON files to the browser", async () => {
    const app = express();
    app.use(blockHeavyAssets);
    app.use((_req, res) => { res.status(200).type("json").send("{\"embedding\":[1,2,3]}"); });
    const base = await listen(app);
    for (const path of [
      "/werk-chunks.json",
      "/resonanzen-embeddings.json",
      "/resonanzen-question-embeddings.json",
      "/concepts-embeddings.json",
      "/philosophers-embeddings.json",
    ]) {
      const res = await fetch(base + path);
      expect(res.status, path).toBe(404);
      const text = await res.text();
      expect(text).not.toContain("[1,2,3]");
    }
    const index = await fetch(`${base}/resonanzen-index.json`);
    expect(index.status).toBe(200);
  });
});

function rawGet(url: string, headers: Record<string, string>): Promise<{ headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, res => {
      req.setTimeout(5000, () => req.destroy(new Error("timeout")));
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
  });
}

describe("compressResponses", () => {
  function appWith(body: string, headers?: Record<string, string>) {
    const app = express();
    app.use(compressResponses);
    app.get("/payload", (_req, res) => {
      if (headers) {
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      }
      res.type("json").send(body);
    });
    app.get("/sse", (_req, res) => {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-transform");
      res.write("data: hallo\n\n");
      res.end();
    });
    return app;
  }

  it("prefers brotli and falls back to gzip", async () => {
    const payload = JSON.stringify({ text: "ä".repeat(2000) });
    const base = await listen(appWith(payload));

    const br = await rawGet(`${base}/payload`, { "Accept-Encoding": "gzip, deflate, br" });
    expect(br.headers["content-encoding"]).toBe("br");
    expect(String(br.headers.vary)).toMatch(/Accept-Encoding/);
    expect(brotliDecompressSync(br.body).toString("utf8")).toBe(payload);
    expect(br.body.length).toBeLessThan(Buffer.byteLength(payload));

    const gz = await rawGet(`${base}/payload`, { "Accept-Encoding": "gzip" });
    expect(gz.headers["content-encoding"]).toBe("gzip");
    expect(gunzipSync(gz.body).toString("utf8")).toBe(payload);

    const plain = await rawGet(`${base}/payload`, {});
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(plain.body.toString("utf8")).toBe(payload);
  });

  it("compresses a streamed static file without stalling", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dt-compress-"));
    const payload = `console.log(${JSON.stringify("x".repeat(180_000))});\n`;
    fs.writeFileSync(path.join(dir, "app.js"), payload);
    const app = express();
    app.use(compressResponses);
    app.use(express.static(dir));
    const base = await listen(app);
    const res = await rawGet(`${base}/app.js`, { "Accept-Encoding": "br" });
    expect(res.headers["content-encoding"]).toBe("br");
    expect(brotliDecompressSync(res.body).toString("utf8")).toBe(payload);
    expect(res.body.length).toBeLessThan(Buffer.byteLength(payload));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does not compress event streams", async () => {
    const base = await listen(appWith("{}"));
    const res = await rawGet(`${base}/sse`, { "Accept-Encoding": "br, gzip" });
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.body.toString("utf8")).toBe("data: hallo\n\n");
  });
});
