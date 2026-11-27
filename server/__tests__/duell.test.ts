/**
 * Begriffs-Duelle: Stimme, Begründung, Korpus-Eintrag, Admin-Löschung.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { defaultDuellStorePath } from "../lib/duellStore.js";
import type { ResonanzEntry } from "../lib/resonanzLog.js";
import { createDuellRouter } from "../routes/duell.js";

const ENV = ["DUELL_STORE_PATH", "ADMIN_TOKEN"] as const;
const saved: Partial<Record<(typeof ENV)[number], string | undefined>> = {};
let dir = "";

beforeEach(() => {
  for (const key of ENV) saved[key] = process.env[key];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "duell-"));
  process.env.DUELL_STORE_PATH = path.join(dir, "votes.json");
  delete process.env.ADMIN_TOKEN;
});

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

function listen(app: express.Express) {
  const server = http.createServer(app);
  return new Promise<{ port: number; close: () => Promise<void> }>(resolve => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        close: () => new Promise(done => server.close(() => done())),
      });
    });
  });
}

function call(port: number, method: string, url: string, body?: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const reqHeaders = { ...headers };
    if (body !== undefined) {
      reqHeaders["content-type"] = "application/json";
      reqHeaders["content-length"] = String(Buffer.byteLength(body));
    }
    const req = http.request({ hostname: "127.0.0.1", port, method, path: url, headers: reqHeaders }, res => {
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(chunk as Buffer));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

describe("Begriffs-Duelle", () => {
  it("liegt außerhalb des öffentlichen Korpus", () => {
    expect(defaultDuellStorePath().includes(`${path.sep}client${path.sep}public`)).toBe(false);
  });

  it("zählt die Stimme, schreibt einen Leser-Eintrag mit Zeitpunkt und lässt den Admin löschen", async () => {
    const logged: ResonanzEntry[] = [];
    const app = express();
    app.use(express.json());
    app.use(createDuellRouter({ log: async entry => { logged.push(entry); } }));
    const server = await listen(app);
    try {
      const bad = await call(server.port, "POST", "/api/duelle/echo-resonanz/stimme", JSON.stringify({ side: "a", reason: "kurz" }));
      expect(bad.status).toBe(400);
      const vote = await call(server.port, "POST", "/api/duelle/echo-resonanz/stimme", JSON.stringify({
        side: "b",
        author: "Ada",
        reason: "Resonanz verändert beide Seiten.",
      }));
      expect(vote.status).toBe(201);
      const body = JSON.parse(vote.body);
      expect(body.vote.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(logged).toHaveLength(1);
      expect(logged[0].endpoint).toBe("dialog");
      expect(logged[0].nodeIds).toEqual(["resonanz"]);
      expect(logged[0].response).toContain("Resonanz verändert beide Seiten.");
      expect(logged[0].contextMeta?.createdAt).toBe(body.vote.createdAt);
      const list = await call(server.port, "GET", "/api/duelle");
      const duel = JSON.parse(list.body).duels.find((item: { id: string }) => item.id === "echo-resonanz");
      expect(duel.bCount).toBe(1);
      expect(duel.a.label).toBe("Echo");
      const hidden = await call(server.port, "GET", "/api/admin/duelle");
      expect(hidden.status).toBe(401);
      process.env.ADMIN_TOKEN = "admin-secret";
      const removed = await call(server.port, "POST", "/api/admin/duelle/delete", JSON.stringify({ id: body.vote.id }), { authorization: "Bearer admin-secret" });
      expect(removed.status).toBe(200);
      const after = await call(server.port, "GET", "/api/duelle");
      const again = JSON.parse(after.body).duels.find((item: { id: string }) => item.id === "echo-resonanz");
      expect(again.bCount).toBe(0);
    } finally {
      await server.close();
    }
  });
});
