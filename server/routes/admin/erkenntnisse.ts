/**
 * Admin-Teil „erkenntnisse". Dieselben Routen, nur aus der einen Datei gelöst.
 */
import { type Router } from "express";
import { recordAdminAction } from "../../lib/adminActionLog.js";
import { resolvePrescoreConfig } from "../../lib/adminConfig.js";
import { updateInIndex } from "../../lib/indexUpdater.js";
import { ERKENNTNIS_DISTILL_SYSTEM } from "../../lib/insightPrompts.js";
import { rateLimiter } from "../../middleware/rateLimit.js";
import {
  checkAdminToken,
  findEntryFile,
  curateEntryStatus,
  callTextLLM,
} from "./helpers.js";
export function mountErkenntnisse(router: Router): void {
// ─── Erkenntnisse (Erkenntnisse-Vision, Phase 2) ─────────────────────────
// distill: destilliert den Kernsatz einer Antwort (KI-Entwurf, reine
// Zusammenfassung — LLM-zuverlässig, kein Werturteil). confirm: verleiht den
// menschlich-autorisierten Status „Erkenntnis", persistiert additiv.
router.post("/api/admin/distill-erkenntnis", rateLimiter('admin-distill-erkenntnis', 60, 60 * 60_000), async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  const { answerId } = req.body as { answerId?: string };
  if (!answerId) return res.status(400).json({ error: "answerId fehlt" });

  const file = await findEntryFile(answerId);
  if (!file) return res.status(404).json({ error: `Eintrag ${answerId} nicht gefunden` });
  const mBody = file.content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  let response = "";
  for (const s of (mBody?.[1] ?? "").split(/^##\s+/m)) {
    if (/^Antwort\s*\n/.test(s)) response = s.replace(/^Antwort\s*\n+/, "").trim();
  }
  if (!response) return res.status(400).json({ error: "Kein Antwort-Section gefunden" });

  const distillPrescoreCfg = await resolvePrescoreConfig();
  const { text, error } = await callTextLLM(
    { system: ERKENNTNIS_DISTILL_SYSTEM, user: response.slice(0, 4000), maxTokens: 2048, temperature: 0.3,
      thinkingBudget: parseInt(process.env.PRESCORE_THINKING_BUDGET ?? "512", 10) },
    { backend: distillPrescoreCfg.backend, geminiModel: distillPrescoreCfg.model },
  );
  if (!text) return res.status(502).json({ error: `Destillation fehlgeschlagen — ${error ?? "kein Detail"}` });
  return res.json({ ok: true, answerId, kernsatz: text.trim().replace(/^["„]|["“]$/g, "").trim() });
});

router.post("/api/admin/confirm-erkenntnis", async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  const { id, kernsatz, questionSourceId, answerId, conceptAnchor, masterAnchor, distinctness } = req.body as {
    id?: string; kernsatz?: string; questionSourceId?: string; answerId?: string;
    conceptAnchor?: string | null; masterAnchor?: string | null; distinctness?: number;
  };
  if (!id || !kernsatz?.trim() || !answerId || !questionSourceId) {
    return res.status(400).json({ error: "id, kernsatz, questionSourceId, answerId erforderlich" });
  }
  const { acceptErkenntnis } = await import("../../lib/erkenntnisse.js");
  const r = await acceptErkenntnis({
    id, kernsatz: kernsatz.trim(), questionSourceId, answerId,
    conceptAnchor: conceptAnchor ?? null, masterAnchor: masterAnchor ?? null,
    distinctness: typeof distinctness === "number" ? distinctness : 0,
    createdAt: new Date().toISOString(), actor: "admin",
  });
  recordAdminAction({
    type: "confirm-erkenntnis", actor: "admin", targetId: id, ok: r.ok,
    reason: r.ok ? undefined : r.error,
    payload: { answerId, questionSourceId },
  });
  if (!r.ok) return res.status(502).json({ ok: false, error: r.error });
  return res.json({ ok: true, id, already: r.already ?? false });
});

// Automatisch Veröffentlichte von der Seite nehmen oder zurücklegen.
// Die Sperrliste verhindert, dass der nächste Erkenntnisse-Lauf sie wieder setzt.
router.post("/api/admin/withdraw-erkenntnis", async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  const { kind, id } = req.body as { kind?: string; id?: string };
  if (!id || (kind !== "kernsatz" && kind !== "master")) {
    return res.status(400).json({ error: "kind (kernsatz|master) und id erforderlich" });
  }
  if (kind === "kernsatz") {
    const { withdrawAutoKernsatz } = await import("../../lib/erkenntnisse.js");
    const r = await withdrawAutoKernsatz(id);
    recordAdminAction({
      type: "withdraw-erkenntnis", actor: "admin", targetId: id, ok: r.ok,
      reason: r.ok ? undefined : r.error, payload: { kind },
    });
    if (!r.ok) return res.status(502).json({ ok: false, error: r.error });
    return res.json({ ok: true, id, kind });
  }
  const { setMasterWithdrawn } = await import("../../lib/erkenntnisse.js");
  const blocked = await setMasterWithdrawn(id, true);
  if (!blocked.ok) {
    recordAdminAction({
      type: "withdraw-erkenntnis", actor: "admin", targetId: id, ok: false,
      reason: blocked.error, payload: { kind },
    });
    return res.status(502).json({ ok: false, error: blocked.error });
  }
  const curated = await curateEntryStatus(id, "raw", "withdraw-erkenntnis");
  if (curated.ok) await updateInIndex(id, { autoPublished: false });
  recordAdminAction({
    type: "withdraw-erkenntnis", actor: "admin", targetId: id, ok: curated.ok,
    reason: curated.ok ? undefined : curated.error, payload: { kind, newStatus: "raw" },
  });
  if (!curated.ok) return res.status(curated.code).json({ ok: false, error: curated.error });
  return res.json({ ok: true, id, kind, newStatus: "raw" });
});

router.post("/api/admin/restore-erkenntnis", async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  const { kind, id } = req.body as { kind?: string; id?: string };
  if (!id || (kind !== "kernsatz" && kind !== "master")) {
    return res.status(400).json({ error: "kind (kernsatz|master) und id erforderlich" });
  }
  if (kind === "kernsatz") {
    const { restoreAutoKernsatz } = await import("../../lib/erkenntnisse.js");
    const r = await restoreAutoKernsatz(id);
    recordAdminAction({
      type: "restore-erkenntnis", actor: "admin", targetId: id, ok: r.ok,
      reason: r.ok ? undefined : r.error, payload: { kind },
    });
    if (!r.ok) return res.status(502).json({ ok: false, error: r.error });
    return res.json({ ok: true, id, kind });
  }
  const { setMasterWithdrawn } = await import("../../lib/erkenntnisse.js");
  const opened = await setMasterWithdrawn(id, false);
  if (!opened.ok) {
    recordAdminAction({
      type: "restore-erkenntnis", actor: "admin", targetId: id, ok: false,
      reason: opened.error, payload: { kind },
    });
    return res.status(502).json({ ok: false, error: opened.error });
  }
  const curated = await curateEntryStatus(id, "published", "restore-erkenntnis");
  if (curated.ok) await updateInIndex(id, { autoPublished: true });
  recordAdminAction({
    type: "restore-erkenntnis", actor: "admin", targetId: id, ok: curated.ok,
    reason: curated.ok ? undefined : curated.error, payload: { kind, newStatus: "published" },
  });
  if (!curated.ok) return res.status(curated.code).json({ ok: false, error: curated.error });
  return res.json({ ok: true, id, kind, newStatus: "published" });
});
}
