/**
 * Gruppen-Werkstatt: Code, Beiträge, Abschluss, Export, Admin-Löschung.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { defaultWerkstattStorePath } from "../lib/werkstattStore.js";
import { createWerkstattRouter } from "../routes/werkstatt.js";

const ENV = ["WERKSTATT_STORE_PATH", "ADMIN_TOKEN"] as const;
const saved: Partial<Record<(typeof ENV)[number], string | undefined>> = {};
let dir = "";

beforeEach(() => {
  for (const key of ENV) saved[key] = process.env[key];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "werkstatt-"));
  process.env.WERKSTATT_STORE_PATH = path.join(dir, "sessions.json");
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
      resolve({
        port,
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

describe("Werkstatt", () => {
  it("liegt außerhalb des öffentlichen Korpus", () => {
    const file = defaultWerkstattStorePath();
    expect(file.includes(`${path.sep}client${path.sep}public`)).toBe(false);
    expect(file.endsWith(path.join("data", "werkstatt", "sessions.json"))).toBe(true);
  });

  it("führt eine Runde bis zur Sammlung und lässt den Admin löschen", async () => {
    const app = express();
    app.use(express.json());
    app.use(createWerkstattRouter());
    const server = await listen(app);
    try {
      const missing = await call(server.port, "POST", "/api/werkstatt", JSON.stringify({ conceptId: "gibt-es-nicht" }));
      expect(missing.status).toBe(400);

      const created = await call(server.port, "POST", "/api/werkstatt", JSON.stringify({ conceptId: "resonanz", title: "Runde am Abend" }));
      expect(created.status).toBe(201);
      const workshop = JSON.parse(created.body).workshop;
      expect(workshop.code).toMatch(/^[a-z0-9]{8}$/);
      expect(workshop.conceptLabel.length).toBeGreaterThan(0);

      const added = await call(server.port, "POST", `/api/werkstatt/${workshop.code}/beitrag`, JSON.stringify({
        author: "Ada",
        text: "Resonanz ist keine Wiederholung.",
      }));
      expect(added.status).toBe(201);
      expect(JSON.parse(added.body).workshop.contributions).toHaveLength(1);

      const exported = await call(server.port, "GET", `/api/werkstatt/${workshop.code}/export`);
      expect(exported.status).toBe(200);
      expect(exported.body).toContain("Runde am Abend");
      expect(exported.body).toContain("Resonanz ist keine Wiederholung.");
      expect(exported.body).toContain("Ada");

      const closed = await call(server.port, "POST", `/api/werkstatt/${workshop.code}/abschluss`);
      expect(closed.status).toBe(200);
      const after = await call(server.port, "POST", `/api/werkstatt/${workshop.code}/beitrag`, JSON.stringify({ text: "Zu spät." }));
      expect(after.status).toBe(409);

      const hidden = await call(server.port, "GET", "/api/admin/werkstatt");
      expect(hidden.status).toBe(401);
      process.env.ADMIN_TOKEN = "admin-secret";
      const list = await call(server.port, "GET", "/api/admin/werkstatt", undefined, { authorization: "Bearer admin-secret" });
      expect(list.status).toBe(200);
      expect(JSON.parse(list.body).count).toBe(1);
      const contributionId = JSON.parse(added.body).workshop.contributions[0].id;
      const dropped = await call(server.port, "POST", "/api/admin/werkstatt/delete", JSON.stringify({ code: workshop.code, contributionId }), { authorization: "Bearer admin-secret" });
      expect(dropped.status).toBe(200);
      const gone = await call(server.port, "POST", "/api/admin/werkstatt/delete", JSON.stringify({ code: workshop.code }), { authorization: "Bearer admin-secret" });
      expect(gone.status).toBe(200);
      const missingRoom = await call(server.port, "GET", `/api/werkstatt/${workshop.code}`);
      expect(missingRoom.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});
