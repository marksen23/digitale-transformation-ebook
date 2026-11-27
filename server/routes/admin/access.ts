/**
 * Admin-Teil „access". Dieselben Routen, nur aus der einen Datei gelöst.
 */
import { type Router } from "express";
import { recordAdminAction } from "../../lib/adminActionLog.js";
import { getResonanzLogHealth } from "../../lib/resonanzLog.js";
import { checkAdminToken } from "./helpers.js";
export function mountAccess(router: Router): void {
// ─── Admin-Endpoints ────────────────────────────────────────────────
// Token-basierte Auth: ADMIN_TOKEN als env var in Render gesetzt.
// Phase 1: Read-Only Auth-Check für Dashboard-Zugang.
// Phase 2 später: curate, delete (mit Schreib-Operationen via GitHub-API).

router.post("/api/admin/check", async (req, res) => {
  if (!process.env.ADMIN_TOKEN) {
    return res.status(503).json({ ok: false, error: "Admin-Zugang nicht konfiguriert (ADMIN_TOKEN env var fehlt)." });
  }
  if (!checkAdminToken(req)) {
    return res.status(401).json({ ok: false, error: "Token ungültig oder fehlt." });
  }
  return res.json({ ok: true });
});

/**
 * GET /api/admin/resonanz-health — Diagnostik für Auto-Ingest.
 *
 * Zeigt, ob der Logging-Pfad funktioniert:
 *   - githubTokenPresent: ist die env var gesetzt?
 *   - successCount/failureCount: wie viele Logs liefen / scheiterten
 *   - skippedNoToken: wie oft wurde wegen fehlendem Token still verworfen
 *   - lastSuccess/lastFailure: Details des letzten Events
 *
 * Wenn successCount=0 trotz aktiver KI-Nutzung, ist die Pipeline kaputt.
 * Wenn skippedNoToken>0 fehlt das Token komplett.
 */
router.get("/api/admin/resonanz-health", async (req, res) => {
  if (!checkAdminToken(req)) {
    return res.status(401).json({ error: "Nicht autorisiert" });
  }
  return res.json(getResonanzLogHealth());
});

/**
 * POST /api/admin/trigger-rebuild — dispatches validate-corpus.yml
 * über die GitHub Actions API. Bevölkert beim nächsten Run die
 * Semantik-Felder (related, nearDuplicates, werkVoiceScore,
 * corpusVoiceScore) inkl. Buchtext-Embeddings, sofern GEMINI_API_KEY
 * als Repo-Secret gesetzt ist.
 *
 * Benötigt: GITHUB_TOKEN mit `actions:write` Scope (= `workflow` PAT).
 */
router.post("/api/admin/trigger-rebuild", async (req, res) => {
  if (!checkAdminToken(req)) {
    return res.status(401).json({ error: "Nicht autorisiert" });
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(503).json({ ok: false, error: "GITHUB_TOKEN env var fehlt" });
  }
  const owner = process.env.GITHUB_REPO_OWNER ?? "marksen23";
  const repo  = process.env.GITHUB_REPO_NAME ?? "digitale-transformation-ebook";
  const branch = process.env.GITHUB_REPO_BRANCH ?? "main";
  try {
    const dispatchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/validate-corpus.yml/dispatches`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "dt-admin-rebuild",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: branch }),
      }
    );
    if (dispatchRes.status === 204) {
      recordAdminAction({ type: "trigger-rebuild", actor: "admin", ok: true });
      return res.json({
        ok: true,
        message: "Workflow triggered — neuer Run auf GitHub Actions sichtbar in ~5s",
        actionsUrl: `https://github.com/${owner}/${repo}/actions/workflows/validate-corpus.yml`,
      });
    }
    const errText = await dispatchRes.text().catch(() => "");
    // Häufigster Fehler: Token-Scope. 403 mit "actions" hint = workflow-scope fehlt.
    const hint = dispatchRes.status === 403 && errText.includes("workflow")
      ? "GITHUB_TOKEN fehlt der workflow-Scope. Neuen PAT mit actions:write erzeugen."
      : null;
    recordAdminAction({
      type: "trigger-rebuild", actor: "admin", ok: false,
      reason: `HTTP ${dispatchRes.status} ${dispatchRes.statusText}`,
    });
    return res.status(502).json({
      ok: false,
      error: `Dispatch fehlgeschlagen: HTTP ${dispatchRes.status} ${dispatchRes.statusText}`,
      hint, detail: errText.slice(0, 300),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verbindungsfehler";
    recordAdminAction({ type: "trigger-rebuild", actor: "admin", ok: false, reason: msg });
    return res.status(502).json({
      ok: false,
      error: msg,
    });
  }
});

/**
 * GET /api/admin/workflow-runs — letzte N Runs von validate-corpus.yml.
 * Damit das Admin-Panel zeigen kann, ob/wann der Workflow zuletzt
 * erfolgreich lief — ohne dass User die GitHub-Actions-UI öffnen muss.
 *
 * Anonym abrufbar (public repo) — kein Token nötig, aber ein gesetzter
 * Token erhöht das API-Rate-Limit von 60 auf 5000 calls/h.
 */
router.get("/api/admin/workflow-runs", async (req, res) => {
  if (!checkAdminToken(req)) {
    return res.status(401).json({ error: "Nicht autorisiert" });
  }
  const owner = process.env.GITHUB_REPO_OWNER ?? "marksen23";
  const repo  = process.env.GITHUB_REPO_NAME ?? "digitale-transformation-ebook";
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "dt-admin-workflow-runs",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const apiRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/validate-corpus.yml/runs?per_page=5`,
      { headers }
    );
    if (!apiRes.ok) {
      return res.status(502).json({
        ok: false,
        error: `GitHub API: HTTP ${apiRes.status} ${apiRes.statusText}`,
      });
    }
    const data = await apiRes.json();
    const runs = (data.workflow_runs ?? []).map((r: any) => ({
      id: r.id,
      runNumber: r.run_number,
      status: r.status,         // queued / in_progress / completed
      conclusion: r.conclusion, // success / failure / cancelled / null
      event: r.event,           // push / workflow_dispatch / etc.
      displayTitle: r.display_title,
      headSha: r.head_sha?.slice(0, 7),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      htmlUrl: r.html_url,
      triggeringActor: r.triggering_actor?.login,
    }));
    return res.json({ ok: true, runs });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : "Verbindungsfehler",
    });
  }
});
}
