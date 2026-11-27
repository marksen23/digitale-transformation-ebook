/**
 * Admin-Teil „maintenance". Dieselben Routen, nur aus der einen Datei gelöst.
 */
import { type Router } from "express";
import {
  getAdminActionLog,
  getAdminActionLogStats,
  recordAdminAction,
} from "../../lib/adminActionLog.js";
import { buildConfigFields, setConfigValues } from "../../lib/adminConfig.js";
import { getCitationStats } from "../../lib/citationTracker.js";
import { findExactDuplicates } from "../../lib/dedupCorpus.js";
import { loadIndex, removeFromIndex } from "../../lib/indexUpdater.js";
import { invalidateResonanzRetrievalCache } from "../../lib/werkRetrieval.js";
import {
  checkAdminToken,
  findEntryFile,
  writeOrDeleteFile,
  bulkDeleteEntries,
} from "./helpers.js";
export function mountMaintenance(router: Router): void {
router.get("/api/admin/citation-stats", async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  return res.json(getCitationStats());
});

// Server-seitiges Audit-Log (adminActionLog.ts) — geräteunabhängige Sicht
// auf Admin-Mutationen, ergänzt das rein lokale client/src/lib/adminActionLog.ts.
router.get("/api/admin/action-log", async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  const limit = parseInt(String(req.query.limit ?? ""), 10);
  return res.json({
    ok: true,
    entries: getAdminActionLog(Number.isFinite(limit) ? limit : undefined),
    stats: getAdminActionLogStats(),
  });
});

// Kuratierungs-Schwellenwerte + KI-Backend-Wahl (adminConfig.ts) —
// editierbar über /admin/settings, git-persistiert, additiv über den
// Env-Defaults. GET liefert die volle Feldliste (Wert + Herkunft), POST
// validiert + persistiert ein Patch.
router.get("/api/admin/config", async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  const { fields, updatedAt } = await buildConfigFields();
  return res.json({ ok: true, fields, updatedAt });
});

router.post("/api/admin/config", async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  const { values } = req.body as { values?: Record<string, unknown> };
  if (!values || typeof values !== "object") return res.status(400).json({ error: "values fehlt" });
  const r = await setConfigValues(values, "admin");
  recordAdminAction({
    type: "config-update", actor: "admin", targetCount: Object.keys(values).length, ok: r.ok,
    reason: r.ok ? undefined : r.error,
    payload: r.ok ? { updatedKeys: r.updatedKeys } : undefined,
  });
  if (!r.ok) return res.status(400).json({ error: r.error });
  return res.json({ ok: true, updatedKeys: r.updatedKeys, values: r.values });
});

router.post("/api/admin/delete", async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  const { id } = req.body as { id?: string };
  if (!id) return res.status(400).json({ error: "id fehlt" });

  const file = await findEntryFile(id);
  if (!file) return res.status(404).json({ error: `Eintrag ${id} nicht gefunden` });

  const writeRes = await writeOrDeleteFile(
    "delete", file.path, file.sha, null,
    `admin-delete: ${id} (${file.path.split("/").slice(-2, -1)[0] ?? "unknown"})`
  );
  recordAdminAction({
    type: "delete", actor: "admin", targetId: id, ok: writeRes.ok,
    reason: writeRes.ok ? undefined : writeRes.error,
  });
  if (!writeRes.ok) return res.status(502).json({ error: writeRes.error });
  // S1: live-Index synchronisieren — gelöschter Eintrag verschwindet sofort
  // aus resonanzen-index.json, nicht erst nach dem nächsten CI-Build.
  await removeFromIndex(id);
  // R1: Retrieval-Cache invalidieren — gelöschter Eintrag darf nicht mehr
  // als Quelle in neue Antworten einfließen.
  invalidateResonanzRetrievalCache();
  return res.json({ ok: true, id, path: file.path });
});


router.post("/api/admin/delete-bulk", async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  const { ids } = req.body as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids[] fehlt" });
  const uniqueIds = Array.from(new Set(ids));
  const { results, okIds, indexOk } = await bulkDeleteEntries(uniqueIds);
  const failed = results.filter(r => !r.ok).length;
  recordAdminAction({
    type: "bulk-delete", actor: "admin", targetCount: uniqueIds.length, ok: failed === 0,
    reason: failed === 0 ? undefined : `${failed} von ${uniqueIds.length} fehlgeschlagen`,
    payload: { succeeded: okIds.length },
  });
  return res.json({ ok: failed === 0, total: uniqueIds.length, succeeded: okIds.length, failed, indexUpdated: indexOk, results });
});

// ─── Exakte Dubletten (dedupCorpus.ts) ───────────────────────────────────
// Admin-Panel-Variante von scripts/dedup-corpus.ts — gruppiert nach
// endpoint+anchor+normalisierter Frage, behält je Gruppe den besten
// Eintrag. mode=preview mutiert nichts; mode=apply löscht über denselben
// Bulk-Delete-Kern wie delete-bulk (in-process, kein HTTP-Chunking nötig).
router.post("/api/admin/dedup-corpus", async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  const { mode, rawOnly } = req.body as { mode?: string; rawOnly?: boolean };
  if (mode !== "preview" && mode !== "apply") {
    return res.status(400).json({ error: 'mode muss "preview" oder "apply" sein' });
  }
  const entries = await loadIndex();
  if (!entries) return res.status(503).json({ error: "Index nicht ladbar (GITHUB_TOKEN fehlt?)" });

  const preview = findExactDuplicates(entries, { rawOnly: rawOnly === true });
  if (mode === "preview") return res.json({ ok: true, mode, ...preview });

  if (preview.toDelete.length === 0) {
    recordAdminAction({ type: "dedup-corpus", actor: "admin", targetCount: 0, ok: true, payload: { rawOnly: rawOnly === true } });
    return res.json({ ok: true, mode, ...preview, deleted: 0, failed: 0, results: [] });
  }
  const ids = preview.toDelete.map(e => e.id);
  const { results, okIds, indexOk } = await bulkDeleteEntries(ids);
  const failed = results.filter(r => !r.ok).length;
  recordAdminAction({
    type: "dedup-corpus", actor: "admin", targetCount: ids.length, ok: failed === 0,
    reason: failed === 0 ? undefined : `${failed} von ${ids.length} fehlgeschlagen`,
    payload: { rawOnly: rawOnly === true, deleted: okIds.length },
  });
  return res.json({ ok: failed === 0, mode, ...preview, deleted: okIds.length, failed, indexUpdated: indexOk, results });
});

// ─── Phase 3: Hosting-Health (Netlify + Render) ─────────────────────────
// Read-Only-Proxies, die an die jeweiligen Provider-APIs durchreichen.
// Tokens dürfen den Browser nie sehen — alles serverseitig.
// Env vars (alle optional, jeweils via Render-Dashboard):
//   NETLIFY_TOKEN       (PAT, scope: read deploys)
//   NETLIFY_SITE_ID     (UUID des Netlify-Sites)
//   RENDER_API_KEY      (Render API-Key, scope: read services + deploys)
//   RENDER_SERVICE_ID   (z.B. srv-XXXXXXXX, das ID des Backend-Service)
//
// Wenn ein Wertepaar fehlt → 503 mit Klartext, das UI zeigt einen
// Hinweis statt zu crashen. Beide Endpoints sind Bearer-auth via ADMIN_TOKEN.

router.get("/api/admin/netlify-status", async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  const token = process.env.NETLIFY_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;
  if (!token || !siteId) {
    return res.status(503).json({ error: "Netlify-API nicht konfiguriert (NETLIFY_TOKEN / NETLIFY_SITE_ID env vars fehlen)." });
  }
  try {
    const [siteRes, deploysRes] = await Promise.all([
      fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
        headers: { "Authorization": `Bearer ${token}` },
      }),
      fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys?per_page=5`, {
        headers: { "Authorization": `Bearer ${token}` },
      }),
    ]);
    if (!siteRes.ok || !deploysRes.ok) {
      return res.status(502).json({ error: `Netlify-API: ${siteRes.status}/${deploysRes.status}` });
    }
    const site = await siteRes.json();
    const deploys = await deploysRes.json();
    // Curated Subset zurückgeben — nicht das ganze Site-Objekt
    return res.json({
      site: {
        name: site.name,
        url: site.url,
        ssl_url: site.ssl_url,
        state: site.state,
        updated_at: site.updated_at,
        published_deploy_id: site.published_deploy?.id ?? null,
        screenshot_url: site.screenshot_url ?? null,
      },
      deploys: (deploys as Array<Record<string, unknown>>).map(d => ({
        id: d.id,
        state: d.state,
        branch: d.branch,
        commit_ref: d.commit_ref,
        commit_url: d.commit_url,
        title: d.title,
        deploy_time: d.deploy_time,    // seconds
        created_at: d.created_at,
        published_at: d.published_at,
        error_message: d.error_message,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: `Netlify-API-Fehler: ${msg}` });
  }
});

router.get("/api/admin/render-status", async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  const apiKey = process.env.RENDER_API_KEY;
  const serviceId = process.env.RENDER_SERVICE_ID;
  if (!apiKey || !serviceId) {
    return res.status(503).json({ error: "Render-API nicht konfiguriert (RENDER_API_KEY / RENDER_SERVICE_ID env vars fehlen)." });
  }
  try {
    const [serviceRes, deploysRes] = await Promise.all([
      fetch(`https://api.render.com/v1/services/${serviceId}`, {
        headers: { "Authorization": `Bearer ${apiKey}`, "Accept": "application/json" },
      }),
      fetch(`https://api.render.com/v1/services/${serviceId}/deploys?limit=3`, {
        headers: { "Authorization": `Bearer ${apiKey}`, "Accept": "application/json" },
      }),
    ]);
    if (!serviceRes.ok || !deploysRes.ok) {
      return res.status(502).json({ error: `Render-API: ${serviceRes.status}/${deploysRes.status}` });
    }
    const service = await serviceRes.json();
    const deploysWrapped = await deploysRes.json();
    // Render returnt deploys als Array von { deploy: {...} }
    const deploys = Array.isArray(deploysWrapped)
      ? deploysWrapped.map((w: Record<string, unknown>) => w.deploy ?? w)
      : [];
    return res.json({
      service: {
        name: service.name,
        type: service.type,
        repo: service.repo,
        branch: service.branch,
        serviceDetails: service.serviceDetails ? {
          url: service.serviceDetails.url,
          region: service.serviceDetails.region,
          plan: service.serviceDetails.plan,
        } : null,
        suspended: service.suspended,
        updatedAt: service.updatedAt,
      },
      deploys: (deploys as Array<Record<string, unknown>>).map(d => ({
        id: d.id,
        status: d.status,
        commit: d.commit ? {
          id: (d.commit as Record<string, unknown>).id,
          message: (d.commit as Record<string, unknown>).message,
        } : null,
        createdAt: d.createdAt,
        finishedAt: d.finishedAt,
        trigger: d.trigger,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: `Render-API-Fehler: ${msg}` });
  }
});
}
