/**
 * Montierte App: dieselbe Route-Liste und dieselben Antworten der Pfade,
 * die ohne externe APIs festliegen (Auth, Validierung, Static, SEO, Limiter).
 */
import fs from "fs";
import http from "http";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import type { Server } from "http";
import { createApp } from "../app.js";
import { SITE_URL } from "../lib/seo.js";

const ROUTES = [
  "GET /api/health",
  "POST /api/enkidu",
  "POST /api/ask",
  "POST /api/translate",
  "POST /api/analyse-cluster",
  "POST /api/analyse-pair",
  "POST /api/analyse-path",
  "POST /api/analyse-cluster/stream",
  "POST /api/analyse-path/stream",
  "POST /api/graph-chat",
  "POST /api/graph-chat/stream",
  "POST /api/dialog/persist",
  "POST /api/weiterdenken",
  "POST /api/weiterdenken/stream",
  "POST /api/passage-resonanz",
  "POST /api/admin/check",
  "GET /api/admin/resonanz-health",
  "POST /api/admin/trigger-rebuild",
  "GET /api/admin/workflow-runs",
  "POST /api/admin/curate",
  "POST /api/admin/curate-bulk",
  "POST /api/admin/promote-edge",
  "POST /api/admin/propose-concept",
  "POST /api/admin/distill-erkenntnis",
  "POST /api/admin/confirm-erkenntnis",
  "POST /api/admin/pre-score",
  "POST /api/admin/auto-curate",
  "POST /api/admin/synthesize-master",
  "GET /api/admin/citation-stats",
  "GET /api/admin/action-log",
  "GET /api/admin/config",
  "POST /api/admin/config",
  "POST /api/admin/delete",
  "POST /api/admin/delete-bulk",
  "POST /api/admin/dedup-corpus",
  "GET /api/admin/netlify-status",
  "GET /api/admin/render-status",
  "POST /api/embed",
  "GET /api/pdf",
  "GET /sitemap.xml",
  "GET /llms-full.txt",
  "GET *",
];

const ENV_KEYS = [
  "GEMINI_API_KEY",
  "GEMINI_API_KEYS",
  "GEMINI_API_KEY_FALLBACK",
  "ADMIN_TOKEN",
  "GITHUB_TOKEN",
  "CANONICAL_REDIRECT",
] as const;

type Hit = { status: number; headers: http.IncomingHttpHeaders; body: string };

function listRoutes(app: Express): string[] {
  type Layer = {
    route?: { path: string; methods: Record<string, boolean> };
    handle?: { stack?: Layer[] };
  };
  const stack = (app as unknown as { _router: { stack: Layer[] } })._router.stack;
  const out: string[] = [];
  const walk = (layers: Layer[]) => {
    for (const layer of layers) {
      if (layer.route) {
        for (const [method, on] of Object.entries(layer.route.methods)) {
          if (!on || method === "head") continue;
          out.push(`${method.toUpperCase()} ${layer.route.path}`);
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk(stack);
  return out;
}

describe("server routes", () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  let server: Server;
  let app: Express;
  let port = 0;
  let staticDir = "";

  beforeAll(async () => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "dt-static-"));
    const serverDir = path.join(staticDir, "server");
    const publicDir = path.join(staticDir, "dist", "public");
    fs.mkdirSync(path.join(publicDir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(publicDir, "note.txt"), "static-note");
    fs.writeFileSync(path.join(publicDir, "assets", "app-abc123.js"), "console.log(1)\n");
    fs.writeFileSync(
      path.join(publicDir, "index.html"),
      "<!doctype html><html><head><title>raw</title><meta name=\"description\" content=\"raw\" /><!--SEO-HEAD--></head><body><div id=\"root\"><!--SEO-BODY--></div></body></html>",
    );
    ({ app, server } = createApp(serverDir));
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    fs.rmSync(staticDir, { recursive: true, force: true });
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function call(method: string, urlPath: string, opts: { headers?: Record<string, string>; body?: string } = {}): Promise<Hit> {
    return new Promise((resolve, reject) => {
      const headers = { ...opts.headers };
      if (opts.body !== undefined) {
        headers["content-type"] ??= "application/json";
        headers["content-length"] = String(Buffer.byteLength(opts.body));
      }
      const req = http.request(
        { hostname: "127.0.0.1", port, method, path: urlPath, headers },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk as Buffer));
          res.on("end", () => {
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        },
      );
      req.on("error", reject);
      if (opts.body !== undefined) req.write(opts.body);
      req.end();
    });
  }

  function json(hit: Hit): unknown {
    return JSON.parse(hit.body);
  }

  it("registriert dieselben Routen in derselben Reihenfolge", () => {
    expect(listRoutes(app)).toEqual(ROUTES);
    expect(app.get("trust proxy")).toBe(1);
    expect(app.disabled("x-powered-by")).toBe(true);
  });

  it("liefert Health ohne Key, Security-Header und ohne Redirect", async () => {
    const hit = await call("GET", "/api/health", { headers: { host: "foo.onrender.com" } });
    expect(hit.status).toBe(200);
    expect(json(hit)).toEqual({
      status: "degraded",
      server: "ok",
      gemini: "not_configured",
      embedding: "not_configured",
      message: "Kein Embedding-Key (GEMINI_API_KEY[S]/FALLBACK) gesetzt.",
    });
    expect(hit.headers["x-powered-by"]).toBeUndefined();
    expect(hit.headers["x-content-type-options"]).toBe("nosniff");
    expect(hit.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(hit.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(String(hit.headers["content-security-policy"])).toContain("default-src 'self'");
    if (process.env.NODE_ENV === "production") {
      expect(hit.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
    } else {
      expect(hit.headers["strict-transport-security"]).toBeUndefined();
    }
  });

  it("leitet bei CANONICAL_REDIRECT=1 von onrender auf die Site-URL um", async () => {
    process.env.CANONICAL_REDIRECT = "1";
    try {
      const hit = await call("GET", "/api/health?x=1", { headers: { host: "foo.onrender.com" } });
      expect(hit.status).toBe(301);
      expect(hit.headers.location).toBe(`${SITE_URL}/api/health?x=1`);
    } finally {
      delete process.env.CANONICAL_REDIRECT;
    }
  });

  it("prüft den Admin-Token konstantzeitlich", async () => {
    const missing = await call("POST", "/api/admin/check", { body: "{}" });
    expect(missing.status).toBe(503);
    expect(json(missing)).toEqual({
      ok: false,
      error: "Admin-Zugang nicht konfiguriert (ADMIN_TOKEN env var fehlt).",
    });

    process.env.ADMIN_TOKEN = "expected-token";
    try {
      const wrong = await call("POST", "/api/admin/check", {
        headers: { authorization: "Bearer wrong" },
        body: "{}",
      });
      expect(wrong.status).toBe(401);
      expect(json(wrong)).toEqual({ ok: false, error: "Token ungültig oder fehlt." });

      const ok = await call("POST", "/api/admin/check", {
        headers: { authorization: "Bearer expected-token" },
        body: "{}",
      });
      expect(ok.status).toBe(200);
      expect(json(ok)).toEqual({ ok: true });
    } finally {
      delete process.env.ADMIN_TOKEN;
    }
  });

  it("validiert Ask und Embed, bevor ein Modell aufgerufen wird", async () => {
    const askNoKey = await call("POST", "/api/ask", { body: JSON.stringify({ question: "Warum?" }) });
    expect(askNoKey.status).toBe(500);
    expect(json(askNoKey)).toEqual({ error: "GEMINI_API_KEY ist nicht konfiguriert." });

    const embedNoKey = await call("POST", "/api/embed", { body: JSON.stringify({ text: "hallo" }) });
    expect(embedNoKey.status).toBe(503);
    expect(json(embedNoKey)).toEqual({ error: "Embedding-API nicht konfiguriert." });

    process.env.GEMINI_API_KEY = "test-key-not-used";
    try {
      const askEmpty = await call("POST", "/api/ask", { body: "{}" });
      expect(askEmpty.status).toBe(400);
      expect(json(askEmpty)).toEqual({ error: "Frage ist erforderlich." });

      const embedEmpty = await call("POST", "/api/embed", { body: "{}" });
      expect(embedEmpty.status).toBe(400);
      expect(json(embedEmpty)).toEqual({ error: "text ist erforderlich." });

      const embedLong = await call("POST", "/api/embed", { body: JSON.stringify({ text: "x".repeat(8001) }) });
      expect(embedLong.status).toBe(400);
      expect(json(embedLong)).toEqual({ error: "text zu lang (max 8000 Zeichen)." });
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it("antwortet auf ein fehlendes Ebook mit der PDF-404", async () => {
    const hit = await call("GET", "/api/pdf");
    expect(hit.status).toBe(404);
    expect(json(hit)).toEqual({ error: "Ebook-Inhalt nicht gefunden." });
  });

  it("begrenzt dialog/persist mit 429 und Retry-After", async () => {
    const first = await call("POST", "/api/dialog/persist", {
      body: JSON.stringify({ turns: [{ role: "user", text: "hallo" }, { role: "user", text: "noch" }] }),
    });
    expect(first.status).toBe(400);
    expect(json(first)).toEqual({ error: "Letzter Turn muss eine Model-Antwort sein" });

    for (let i = 0; i < 29; i++) {
      const hit = await call("POST", "/api/dialog/persist", { body: "{}" });
      expect(hit.status).toBe(400);
    }
    const blocked = await call("POST", "/api/dialog/persist", { body: "{}" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toMatch(/^\d+$/);
    const retryAfter = Number(blocked.headers["retry-after"]);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(3600);
    expect(json(blocked)).toEqual({
      error: `Zu viele Anfragen — bitte ${retryAfter} Sekunden warten.`,
    });
  });

  it("serviert Statik vor dem Catch-all und injiziert SEO in die SPA", async () => {
    const note = await call("GET", "/note.txt");
    expect(note.status).toBe(200);
    expect(note.body).toBe("static-note");

    const asset = await call("GET", "/assets/app-abc123.js");
    expect(asset.status).toBe(200);
    expect(asset.headers["cache-control"]).toBe("public, max-age=31536000, immutable");

    const raw = await call("GET", "/index.html");
    expect(raw.status).toBe(200);
    expect(raw.body).toContain("<!--SEO-HEAD-->");
    expect(raw.headers["cache-control"]).toBe("no-cache");

    const home = await call("GET", "/");
    expect(home.status).toBe(200);
    expect(home.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(home.headers["cache-control"]).toBe("no-cache");
    expect(home.body).not.toContain("<!--SEO-HEAD-->");
    expect(home.body).toContain("Resonanzvernunft");
    expect(home.body).toContain("application/ld+json");

    const werk = await call("GET", "/werk?x=1");
    expect(werk.status).toBe(200);
    expect(werk.body).toContain("Das Werk lesen");
  });

  it("liefert Sitemap und llms-full mit den bisherigen Headern", async () => {
    const sitemap = await call("GET", "/sitemap.xml");
    expect(sitemap.status).toBe(200);
    expect(sitemap.headers["content-type"]).toBe("application/xml; charset=utf-8");
    expect(sitemap.headers["cache-control"]).toBe("public, max-age=3600");
    expect(sitemap.body.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>")).toBe(true);
    expect(sitemap.body).toContain(`${SITE_URL}/werk`);

    const llms = await call("GET", "/llms-full.txt");
    expect(llms.status).toBe(200);
    expect(llms.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(llms.headers["cache-control"]).toBe("public, max-age=3600");
    expect(llms.body).toContain("kuratierter Korpus");
  });
});
