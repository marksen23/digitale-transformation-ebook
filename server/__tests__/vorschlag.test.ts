/**
 * Leser-Vorschläge: Begründung, ausstehend, Admin hebt oder zieht zurück.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { defaultVorschlagStorePath } from "../lib/vorschlagStore.js";
import { createVorschlagRouter, type Proposal } from "../routes/vorschlag.js";

const ENV = ["VORSCHLAG_STORE_PATH", "ADMIN_TOKEN"] as const;
const saved: Partial<Record<(typeof ENV)[number], string | undefined>> = {};
let dir = "";

beforeEach(() => {
  for (const key of ENV) saved[key] = process.env[key];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vorschlag-"));
  process.env.VORSCHLAG_STORE_PATH = path.join(dir, "proposals.json");
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
  app.set("trust proxy", 1);
  const server = http.createServer(app);
  return new Promise<{ port: number; close: () => Promise<void> }>(resolve => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ port, close: () => new Promise(done => server.close(() => done())) });
    });
  });
}

function call(port: number, method: string, urlPath: string, body?: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; json: Record<string, unknown> }>(resolve => {
    const req = http.request({
      host: "127.0.0.1", port, path: urlPath, method,
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.40", ...headers },
    }, res => {
      let raw = "";
      res.on("data", chunk => { raw += chunk; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, json: raw ? JSON.parse(raw) : {} }));
    });
    if (body) req.write(body);
    req.end();
  });
}

describe("Begriffsvorschläge", () => {
  it("hält Verbindungen ausstehend und lässt nur den Admin heben oder zurückziehen", async () => {
    expect(defaultVorschlagStorePath().includes(`${path.sep}client${path.sep}public`)).toBe(false);
    const promoted: Proposal[] = [];
    const app = express();
    app.use(express.json());
    app.use(createVorschlagRouter({
      promoteEdge: async proposal => { promoted.push(proposal); return { ok: true }; },
      promoteConcept: async () => ({ ok: false, error: "noch nicht" }),
    }));
    const server = await listen(app);
    try {
      const short = await call(server.port, "POST", "/api/vorschlaege", JSON.stringify({
        kind: "edge", source: "resonanz", target: "echo", reason: "kurz",
      }));
      expect(short.status).toBe(400);

      const created = await call(server.port, "POST", "/api/vorschlaege", JSON.stringify({
        kind: "edge", source: "resonanz", target: "echo", reason: "Echo ist die Antwort, die nicht weiterträgt.",
      }));
      expect(created.status).toBe(201);
      expect(created.json.status).toBe("pending");
      const stored = JSON.parse(fs.readFileSync(process.env.VORSCHLAG_STORE_PATH!, "utf8")) as { proposals: Proposal[] };
      expect(stored.proposals[0]?.status).toBe("pending");
      expect(stored.proposals[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const locked = await call(server.port, "GET", "/api/admin/vorschlaege");
      expect(locked.status).toBe(401);

      process.env.ADMIN_TOKEN = "admin-secret";
      const auth = { authorization: "Bearer admin-secret" };
      const lifted = await call(server.port, "POST", "/api/admin/vorschlaege/promote", JSON.stringify({ id: created.json.id }), auth);
      expect(lifted.status).toBe(200);
      expect(promoted[0]?.source).toBe("resonanz");
      expect(promoted[0]?.target).toBe("echo");

      const concept = await call(server.port, "POST", "/api/vorschlaege", JSON.stringify({
        kind: "concept", anchorId: "resonanz", fullLabel: "Zwischenraum",
        description: "Der Raum, der zwischen zwei Begriffen offen bleibt.",
        reason: "Er fehlt neben der Resonanz als eigener Ort.",
      }));
      expect(concept.status).toBe(201);
      const refused = await call(server.port, "POST", "/api/admin/vorschlaege/promote", JSON.stringify({ id: concept.json.id }), auth);
      expect(refused.status).toBe(422);
      const withdrawn = await call(server.port, "POST", "/api/admin/vorschlaege/delete", JSON.stringify({ id: concept.json.id }), auth);
      expect(withdrawn.status).toBe(200);
      const list = await call(server.port, "GET", "/api/admin/vorschlaege", undefined, auth);
      const proposals = list.json.proposals as Array<{ id: string }>;
      expect(proposals.some(item => item.id === concept.json.id)).toBe(false);
    } finally {
      await server.close();
    }
  });
});