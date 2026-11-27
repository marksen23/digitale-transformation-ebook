/**
 * Gruppen-Werkstatt. Teilbarer Code, Beiträge, Abschluss, Admin-Löschung.
 */
import { Router } from "express";
import { NODES } from "../../client/src/data/conceptGraph.js";
import { recordAdminAction } from "../lib/adminActionLog.js";
import { isAdminRequest } from "../lib/adminToken.js";
import { rateLimiter } from "../middleware/rateLimit.js";
import {
  newContributionId,
  newWorkshopCode,
  withWorkshops,
  workshopMarkdown,
  type Workshop,
} from "../lib/werkstattStore.js";

const nodeById = new Map(NODES.map(node => [node.id, node]));
const CODE = /^[a-z0-9]{8}$/;
const MAX_TEXT = 2000;
const MAX_WORKSHOP = 200;

function cleanLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, MAX_TEXT);
}

function publicWorkshop(workshop: Workshop) {
  return {
    code: workshop.code,
    conceptId: workshop.conceptId,
    conceptLabel: workshop.conceptLabel,
    title: workshop.title,
    createdAt: workshop.createdAt,
    closedAt: workshop.closedAt,
    contributions: workshop.contributions,
  };
}

export function createWerkstattRouter(): Router {
  const router = Router();

  router.post("/api/werkstatt", rateLimiter("werkstatt-create", 8, 60 * 60_000), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const conceptId = cleanLine(req.body?.conceptId, 64);
    const node = nodeById.get(conceptId);
    if (!node) return res.status(400).json({ ok: false, error: "Bitte einen Begriff aus dem Netz wählen." });
    const title = cleanLine(req.body?.title, 80) || node.fullLabel;
    try {
      const workshop = await withWorkshops(data => {
        const code = newWorkshopCode(new Set(data.workshops.map(item => item.code)));
        const created: Workshop = {
          code,
          conceptId: node.id,
          conceptLabel: node.fullLabel,
          title,
          createdAt: new Date().toISOString(),
          closedAt: null,
          contributions: [],
        };
        data.workshops.push(created);
        return created;
      });
      return res.status(201).json({ ok: true, workshop: publicWorkshop(workshop) });
    } catch {
      return res.status(500).json({ ok: false, error: "Die Werkstatt konnte nicht angelegt werden." });
    }
  });

  router.get("/api/werkstatt/:code/export", (req, res) => {
    const code = String(req.params.code || "").toLowerCase();
    if (!CODE.test(code)) return res.status(404).type("text/plain").send("Werkstatt nicht gefunden");
    return withWorkshops(data => {
      const workshop = data.workshops.find(item => item.code === code);
      if (!workshop) return res.status(404).type("text/plain").send("Werkstatt nicht gefunden");
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="werkstatt-${code}.md"`);
      res.setHeader("Cache-Control", "no-store");
      return res.send(workshopMarkdown(workshop));
    }).catch(() => res.status(500).type("text/plain").send("Export nicht möglich"));
  });

  router.post("/api/werkstatt/:code/beitrag", rateLimiter("werkstatt-beitrag", 30, 60 * 60_000), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const code = String(req.params.code || "").toLowerCase();
    if (!CODE.test(code)) return res.status(404).json({ ok: false, error: "Werkstatt nicht gefunden" });
    const text = cleanText(req.body?.text);
    if (text.length < 2) return res.status(400).json({ ok: false, error: "Der Beitrag ist zu kurz." });
    const author = cleanLine(req.body?.author, 40) || "Ohne Namen";
    try {
      const result = await withWorkshops(data => {
        const workshop = data.workshops.find(item => item.code === code);
        if (!workshop) return { status: 404 as const };
        if (workshop.closedAt) return { status: 409 as const };
        if (workshop.contributions.length >= MAX_WORKSHOP) return { status: 409 as const, full: true };
        workshop.contributions.push({
          id: newContributionId(),
          author,
          text,
          createdAt: new Date().toISOString(),
        });
        return { status: 201 as const, workshop };
      });
      if (result.status === 404) return res.status(404).json({ ok: false, error: "Werkstatt nicht gefunden" });
      if (result.status === 409) {
        return res.status(409).json({
          ok: false,
          error: result.full ? "Diese Werkstatt ist voll." : "Diese Werkstatt ist abgeschlossen.",
        });
      }
      return res.status(201).json({ ok: true, workshop: publicWorkshop(result.workshop) });
    } catch {
      return res.status(500).json({ ok: false, error: "Der Beitrag konnte nicht gespeichert werden." });
    }
  });

  router.post("/api/werkstatt/:code/abschluss", rateLimiter("werkstatt-close", 10, 60 * 60_000), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const code = String(req.params.code || "").toLowerCase();
    if (!CODE.test(code)) return res.status(404).json({ ok: false, error: "Werkstatt nicht gefunden" });
    try {
      const workshop = await withWorkshops(data => {
        const found = data.workshops.find(item => item.code === code);
        if (!found) return null;
        if (!found.closedAt) found.closedAt = new Date().toISOString();
        return found;
      });
      if (!workshop) return res.status(404).json({ ok: false, error: "Werkstatt nicht gefunden" });
      return res.json({ ok: true, workshop: publicWorkshop(workshop) });
    } catch {
      return res.status(500).json({ ok: false, error: "Abschluss nicht möglich" });
    }
  });

  router.get("/api/werkstatt/:code", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const code = String(req.params.code || "").toLowerCase();
    if (!CODE.test(code)) return res.status(404).json({ ok: false, error: "Werkstatt nicht gefunden" });
    try {
      const workshop = await withWorkshops(data => data.workshops.find(item => item.code === code) ?? null);
      if (!workshop) return res.status(404).json({ ok: false, error: "Werkstatt nicht gefunden" });
      return res.json({ ok: true, workshop: publicWorkshop(workshop) });
    } catch {
      return res.status(500).json({ ok: false, error: "Werkstatt nicht lesbar" });
    }
  });

  router.get("/api/admin/werkstatt", async (req, res) => {
    if (!isAdminRequest(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    try {
      const workshops = await withWorkshops(data => data.workshops.map(publicWorkshop));
      return res.json({ ok: true, count: workshops.length, workshops });
    } catch {
      return res.status(500).json({ error: "Werkstatt-Speicher nicht lesbar" });
    }
  });

  router.post("/api/admin/werkstatt/delete", async (req, res) => {
    if (!isAdminRequest(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    const code = cleanLine(req.body?.code, 8).toLowerCase();
    const contributionId = cleanLine(req.body?.contributionId, 32);
    if (!CODE.test(code)) return res.status(400).json({ error: "Code fehlt" });
    try {
      const removed = await withWorkshops(data => {
        const index = data.workshops.findIndex(item => item.code === code);
        if (index < 0) return false;
        if (!contributionId) {
          data.workshops.splice(index, 1);
          return true;
        }
        const workshop = data.workshops[index];
        const before = workshop.contributions.length;
        workshop.contributions = workshop.contributions.filter(item => item.id !== contributionId);
        return workshop.contributions.length !== before;
      });
      recordAdminAction({
        type: contributionId ? "werkstatt-beitrag-delete" : "werkstatt-delete",
        actor: "admin",
        targetId: contributionId ? `${code}/${contributionId}` : code,
        ok: removed,
      });
      if (!removed) return res.status(404).json({ error: "Nicht gefunden" });
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "Löschen fehlgeschlagen" });
    }
  });

  return router;
}
