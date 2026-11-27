/**
 * Begriffs-Duelle. Stimme und Begründung, ratenbegrenzt.
 * Die Begründung geht als Leser-Eintrag in den Korpus, mit echtem Zeitpunkt.
 */
import { Router } from "express";
import { duelById, DUELS } from "../../shared/duelle.js";
import { recordAdminAction } from "../lib/adminActionLog.js";
import { isAdminRequest } from "../lib/adminToken.js";
import { newVoteId, tally, withVotes, type DuelVote } from "../lib/duellStore.js";
import { logResonanz, type ResonanzEntry } from "../lib/resonanzLog.js";
import { rateLimiter } from "../middleware/rateLimit.js";

function cleanLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, 600);
}

export function createDuellRouter(deps: { log?: (entry: ResonanzEntry) => Promise<void> } = {}): Router {
  const router = Router();
  const log = deps.log ?? logResonanz;

  router.get("/api/duelle", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const votes = await withVotes(data => data.votes);
      return res.json({
        ok: true,
        duels: DUELS.map(duel => {
          const result = tally(votes, duel.id);
          return { ...duel, aCount: result.a, bCount: result.b, reasons: result.reasons };
        }),
      });
    } catch {
      return res.status(500).json({ ok: false, error: "Duelle nicht lesbar" });
    }
  });

  router.post("/api/duelle/:id/stimme", rateLimiter("duell-stimme", 20, 60 * 60_000), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const duel = duelById(String(req.params.id || ""));
    if (!duel) return res.status(404).json({ ok: false, error: "Dieses Duell gibt es nicht." });
    const side = req.body?.side === "a" || req.body?.side === "b" ? req.body.side : null;
    if (!side) return res.status(400).json({ ok: false, error: "Bitte eine Seite wählen." });
    const reason = cleanText(req.body?.reason);
    if (reason.length < 10) return res.status(400).json({ ok: false, error: "Die Begründung ist zu kurz." });
    const author = cleanLine(req.body?.author, 40) || "Ohne Namen";
    const createdAt = new Date().toISOString();
    const chosen = side === "a" ? duel.a : duel.b;
    const vote: DuelVote = { id: newVoteId(), duelId: duel.id, side, reason, author, createdAt };
    try {
      await withVotes(data => { data.votes.push(vote); });
      await log({
        endpoint: "dialog",
        anchor: `dialog:${duel.a.id}+${duel.b.id}`,
        nodeIds: [chosen.id],
        prompt: duel.question,
        response: `Für ${chosen.label}: ${reason}`,
        model: "leser",
        contextMeta: { kind: "duell", duelId: duel.id, side, author, createdAt },
      });
      return res.status(201).json({ ok: true, vote });
    } catch {
      return res.status(500).json({ ok: false, error: "Die Stimme konnte nicht gespeichert werden." });
    }
  });

  router.get("/api/admin/duelle", async (req, res) => {
    if (!isAdminRequest(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    try {
      const votes = await withVotes(data => data.votes);
      return res.json({ ok: true, count: votes.length, votes });
    } catch {
      return res.status(500).json({ error: "Duell-Speicher nicht lesbar" });
    }
  });

  router.post("/api/admin/duelle/delete", async (req, res) => {
    if (!isAdminRequest(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    const id = cleanLine(req.body?.id, 32);
    if (!id) return res.status(400).json({ error: "Stimme fehlt" });
    try {
      const removed = await withVotes(data => {
        const before = data.votes.length;
        data.votes = data.votes.filter(vote => vote.id !== id);
        return data.votes.length !== before;
      });
      recordAdminAction({ type: "duell-delete", actor: "admin", targetId: id, ok: removed });
      if (!removed) return res.status(404).json({ error: "Nicht gefunden" });
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "Löschen fehlgeschlagen" });
    }
  });

  return router;
}
