/**
 * Monatsbericht und der anonyme Aufrufzähler der Erkenntnisse.
 */
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { isAdminRequest } from "../lib/adminToken.js";
import { findPublicErkenntnis } from "../lib/erkenntnisPublic.js";
import { conceptGrowth, mostRead, openFollowUps, utcMonth, type GrowthEntry, type OpenQuestion } from "../lib/monatsbericht.js";
import { withViewCounts } from "../lib/viewCounts.js";
import { rateLimiter } from "../middleware/rateLimit.js";

function readJson(file: string): unknown {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

export function createMonatRouter(): Router {
  const router = Router();

  router.post("/api/views/erkenntnis", rateLimiter("erkenntnis-view", 60, 60 * 60_000), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = typeof req.body?.id === "string" ? req.body.id : "";
    if (!findPublicErkenntnis(id)) return res.status(404).json({ ok: false });
    try {
      const count = await withViewCounts(counts => {
        counts[id] = (counts[id] ?? 0) + 1;
        return counts[id];
      });
      return res.json({ ok: true, count });
    } catch {
      return res.status(500).json({ ok: false });
    }
  });

  router.get("/api/admin/monat", async (req, res) => {
    if (!isAdminRequest(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    const month = utcMonth(new Date().toISOString()) ?? "";
    const dir = path.join(process.cwd(), "client/public");
    const index = readJson(path.join(dir, "resonanzen-index.json")) as { entries?: GrowthEntry[] } | null;
    const questionsFile = readJson(path.join(dir, "resonanzen-questions.json")) as { questions?: OpenQuestion[] } | null;
    const erk = readJson(path.join(dir, "resonanzen-erkenntnisse.json")) as { erkenntnisse?: Array<{ id: string; kernsatz: string }> } | null;
    const labels = new Map((erk?.erkenntnisse ?? []).map(item => [item.id, item.kernsatz]));
    try {
      const counts = await withViewCounts(current => ({ ...current }));
      return res.json({
        ok: true,
        month,
        concepts: conceptGrowth(index?.entries ?? [], month).slice(0, 12),
        questions: openFollowUps(questionsFile?.questions ?? []),
        reads: mostRead(counts, labels),
      });
    } catch {
      return res.status(500).json({ error: "Monatsbericht nicht lesbar" });
    }
  });

  return router;
}
