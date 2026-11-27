/**
 * Admin-Teil „curate". Dieselben Routen, nur aus der einen Datei gelöst.
 */
import { type Router } from "express";
import { recordAdminAction } from "../../lib/adminActionLog.js";
import { updateManyInIndex } from "../../lib/indexUpdater.js";
import { invalidateResonanzRetrievalCache } from "../../lib/werkRetrieval.js";
import {
  checkAdminToken,
  VALID_STATUS_VALUES,
  findEntryFiles,
  getContentsByPath,
  writeOrDeleteFileRetry,
  mutateFrontmatter,
  curateEntryStatus,
} from "./helpers.js";
export function mountCurate(router: Router): void {
// ─── Phase 2: Kuration ──────────────────────────────────────────────
// POST /api/admin/curate { id, status }     → Status-Wechsel
// POST /api/admin/delete { id }             → Eintrag löschen
// Beide brauchen ADMIN_TOKEN für Auth + GITHUB_TOKEN für Repo-Schreiben.
// Audit-Trail wird automatisch erweitert (Provenance-Erhalt).


router.post("/api/admin/curate", async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  const { id, status } = req.body as { id?: string; status?: string };
  if (!id) return res.status(400).json({ error: "id fehlt" });
  if (!status || !VALID_STATUS_VALUES.has(status)) {
    return res.status(400).json({ error: `status muss eines von ${Array.from(VALID_STATUS_VALUES).join("|")} sein` });
  }
  const r = await curateEntryStatus(id, status, "admin");
  recordAdminAction({
    type: "curate", actor: "admin", targetId: id, ok: r.ok,
    reason: r.ok ? undefined : r.error,
    payload: { newStatus: status },
  });
  if (!r.ok) return res.status(r.code).json({ error: r.error });
  return res.json({ ok: true, id, oldStatus: r.oldStatus, newStatus: status, path: r.path });
});

// Bulk-Curate: setzt für VIELE Einträge denselben Status — in EINEM
// Index-Schreibvorgang statt N parallele (die vorher um den SHA rannten und
// zu ~50% verloren gingen). MD-Writes laufen mit Retry-on-conflict, der
// Git-Tree wird nur einmal geholt. Antwort enthält per-ID-Resultate.
router.post("/api/admin/curate-bulk", async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  const { ids, status } = req.body as { ids?: string[]; status?: string };
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids[] fehlt" });
  if (!status || !VALID_STATUS_VALUES.has(status)) {
    return res.status(400).json({ error: `status muss eines von ${Array.from(VALID_STATUS_VALUES).join("|")} sein` });
  }
  const uniqueIds = Array.from(new Set(ids));
  const fileMap = await findEntryFiles(uniqueIds);

  const applyOne = async (id: string): Promise<{ id: string; ok: boolean; oldStatus?: string; error?: string }> => {
    const file = fileMap.get(id);
    if (!file) return { id, ok: false, error: "Eintrag nicht gefunden" };
    let oldStatus = "raw";
    const mutate = (content: string) => mutateFrontmatter(content, doc => {
      oldStatus = String(doc.get("status") ?? "raw");
      doc.set("status", status);
      const trail = doc.get("audit_trail") as { add?: (item: unknown) => void } | undefined;
      const ev = { event: "status-changed", ts: new Date().toISOString(), actor: "admin", from: oldStatus, to: status };
      if (trail && typeof trail.add === "function") trail.add(ev);
      else doc.set("audit_trail", [ev]);
    });
    let newContent: string;
    try { newContent = await mutate(file.content); }
    catch (err) { return { id, ok: false, error: `Frontmatter: ${err instanceof Error ? err.message : err}` }; }
    const w = await writeOrDeleteFileRetry(
      "update",
      { path: file.path, sha: file.sha, content: newContent },
      `curate(${id}): ${oldStatus} → ${status}`,
      async () => {
        const fresh = await getContentsByPath(file.path);
        if (!fresh) return null;
        return { sha: fresh.sha, content: await mutate(fresh.content) };
      },
    );
    if (!w.ok) return { id, ok: false, error: w.error };
    return { id, ok: true, oldStatus };
  };

  // MD-Writes begrenzt parallel (distinkte Files; Retry deckt 409 ab)
  const results: { id: string; ok: boolean; oldStatus?: string; error?: string }[] = [];
  const queue = [...uniqueIds];
  const worker = async (): Promise<void> => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      results.push(await applyOne(id));
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, uniqueIds.length) }, () => worker()));

  const okIds = results.filter(r => r.ok).map(r => r.id);
  // EIN Index-Schreibvorgang für die ganze Charge (Retry-on-conflict)
  const indexOk = await updateManyInIndex(okIds.map(id => ({ id, patch: { status } })));
  invalidateResonanzRetrievalCache();
  const failed = results.filter(r => !r.ok).length;
  recordAdminAction({
    type: "bulk-curate", actor: "admin", targetCount: uniqueIds.length, ok: failed === 0,
    reason: failed === 0 ? undefined : `${failed} von ${uniqueIds.length} fehlgeschlagen`,
    payload: { newStatus: status, succeeded: okIds.length },
  });
  return res.json({ ok: failed === 0, total: uniqueIds.length, succeeded: okIds.length, failed, indexUpdated: indexOk, results });
});
}
