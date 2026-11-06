/**
 * /api/admin/* — Auth, Kuration, Begriffsnetz, Erkenntnisse, Synthese, Hosting.
 * Aus server/index.ts unverändert herausgelöst.
 */
import { createHash, timingSafeEqual } from "crypto";
import express, { Router } from "express";
import { CANVAS_H, CANVAS_W } from "../../client/src/data/conceptGraph.js";
import { getAdminActionLog, getAdminActionLogStats, recordAdminAction } from "../lib/adminActionLog.js";
import {
  buildConfigFields,
  resolveAutoCurateConfig,
  resolveConceptNewConfig,
  resolvePrescoreConfig,
  resolveSynthesisConfig,
  setConfigValues,
  type AutoCurateThresholds,
} from "../lib/adminConfig.js";
import { getCitationStats } from "../lib/citationTracker.js";
import { findExactDuplicates } from "../lib/dedupCorpus.js";
import { nodeSrv } from "../lib/graphContext.js";
import { loadIndex, removeFromIndex, removeManyFromIndex, updateInIndex, updateManyInIndex } from "../lib/indexUpdater.js";
import { getResonanzLogHealth } from "../lib/resonanzLog.js";
import { invalidateResonanzRetrievalCache } from "../lib/werkRetrieval.js";
import { ERKENNTNIS_DISTILL_SYSTEM, MASTER_SYNTHESIS_SYSTEM, buildSynthesisUserPrompt } from "../lib/insightPrompts.js";
import { OUTPUT_VOICE_RULE } from "../lib/promptSafety.js";
import { rateLimiter } from "../middleware/rateLimit.js";

export function createAdminRouter(): Router {
  const router = Router();
  // ─── Admin-Endpoints ────────────────────────────────────────────────
  // Token-basierte Auth: ADMIN_TOKEN als env var in Render gesetzt.
  // Phase 1: Read-Only Auth-Check für Dashboard-Zugang.
  // Phase 2 später: curate, delete (mit Schreib-Operationen via GitHub-API).
  function checkAdminToken(req: express.Request): boolean {
    const expected = process.env.ADMIN_TOKEN;
    if (!expected) return false; // Wenn nicht gesetzt: Admin-Zugang deaktiviert
    const auth = req.headers.authorization ?? "";
    const m = auth.match(/^Bearer\s+(.+)$/);
    if (m === null) return false;
    // Konstant-zeitiger Vergleich (kein ===): via SHA-256-Digest beider Seiten
    // sind die Puffer gleich lang → timingSafeEqual ohne Längen-Leak.
    const a = createHash("sha256").update(m[1]).digest();
    const b = createHash("sha256").update(expected).digest();
    return timingSafeEqual(a, b);
  }

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

  // ─── Phase 2: Kuration ──────────────────────────────────────────────
  // POST /api/admin/curate { id, status }     → Status-Wechsel
  // POST /api/admin/delete { id }             → Eintrag löschen
  // Beide brauchen ADMIN_TOKEN für Auth + GITHUB_TOKEN für Repo-Schreiben.
  // Audit-Trail wird automatisch erweitert (Provenance-Erhalt).

  const VALID_STATUS_VALUES = new Set(["raw", "pending", "approved", "published", "rejected"]);

  /** Findet ein Resonanz-File anhand der ID via GitHub Tree-API + raw download. */
  async function findEntryFile(id: string): Promise<{ path: string; content: string; sha: string } | null> {
    const token = process.env.GITHUB_TOKEN;
    const owner  = process.env.GITHUB_REPO_OWNER  ?? "marksen23";
    const repo   = process.env.GITHUB_REPO_NAME   ?? "digitale-transformation-ebook";
    const branch = process.env.GITHUB_REPO_BRANCH ?? "main";
    if (!token) return null;
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", Accept: "application/vnd.github+json" },
    });
    if (!treeRes.ok) return null;
    const treeData = await treeRes.json();
    interface TreeBlobEntry { type: string; path: string }
    const blobs = (treeData.tree ?? []) as TreeBlobEntry[];
    const candidates = blobs.filter((e: TreeBlobEntry) =>
      e.type === "blob" && e.path.startsWith("content/resonanzen/") && e.path.endsWith(".md") && e.path.includes(id)
    );
    for (const c of candidates) {
      const contentsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${c.path}?ref=${branch}`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", Accept: "application/vnd.github+json" },
      });
      if (!contentsRes.ok) continue;
      const data = await contentsRes.json();
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      // Verifiziere dass Frontmatter wirklich diese ID hat (Path-Match alleine reicht nicht)
      if (new RegExp(`^id:\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(content)) {
        return { path: c.path, content, sha: data.sha };
      }
    }
    return null;
  }

  /**
   * Wie findEntryFile, aber für VIELE IDs in einem Rutsch: holt den Git-Tree
   * GENAU EINMAL (statt pro ID einen rekursiven Tree-Fetch) und löst dann die
   * Contents (sha + content) je ID auf — begrenzt parallel. Vermeidet das
   * N-fache Tree-Fetchen + Rate-Limit-Risiko bei Bulk-Operationen.
   */
  async function findEntryFiles(
    ids: string[],
  ): Promise<Map<string, { path: string; content: string; sha: string }>> {
    const out = new Map<string, { path: string; content: string; sha: string }>();
    const token = process.env.GITHUB_TOKEN;
    const owner  = process.env.GITHUB_REPO_OWNER  ?? "marksen23";
    const repo   = process.env.GITHUB_REPO_NAME   ?? "digitale-transformation-ebook";
    const branch = process.env.GITHUB_REPO_BRANCH ?? "main";
    if (!token || ids.length === 0) return out;
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", Accept: "application/vnd.github+json" },
    });
    if (!treeRes.ok) return out;
    const treeData = await treeRes.json();
    interface TreeBlobEntry { type: string; path: string }
    const blobs = ((treeData.tree ?? []) as TreeBlobEntry[]).filter(
      e => e.type === "blob" && e.path.startsWith("content/resonanzen/") && e.path.endsWith(".md")
    );
    const resolveOne = async (id: string): Promise<void> => {
      const candidates = blobs.filter(e => e.path.includes(id));
      for (const c of candidates) {
        const contentsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${c.path}?ref=${branch}`, {
          headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", Accept: "application/vnd.github+json" },
        });
        if (!contentsRes.ok) continue;
        const data = await contentsRes.json();
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        if (new RegExp(`^id:\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(content)) {
          out.set(id, { path: c.path, content, sha: data.sha });
          return;
        }
      }
    };
    // Contents begrenzt parallel auflösen (lesend, kein Schreib-Konflikt)
    const queue = [...ids];
    const worker = async (): Promise<void> => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) await resolveOne(id);
    };
    await Promise.all(Array.from({ length: Math.min(6, ids.length) }, () => worker()));
    return out;
  }

  /** Holt sha + content eines Files per Pfad (für Retry-Reload nach 409). */
  async function getContentsByPath(path: string): Promise<{ sha: string; content: string } | null> {
    const token = process.env.GITHUB_TOKEN;
    const owner  = process.env.GITHUB_REPO_OWNER  ?? "marksen23";
    const repo   = process.env.GITHUB_REPO_NAME   ?? "digitale-transformation-ebook";
    const branch = process.env.GITHUB_REPO_BRANCH ?? "main";
    if (!token) return null;
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", Accept: "application/vnd.github+json" },
    });
    if (!r.ok) return null;
    const data = await r.json();
    return { sha: data.sha, content: Buffer.from(data.content, "base64").toString("utf-8") };
  }

  /** Schreibt File-Content zurück (PUT) oder löscht (DELETE) via Contents-API. */
  async function writeOrDeleteFile(
    op: "update" | "delete", path: string, sha: string, newContent: string | null, message: string,
  ): Promise<{ ok: boolean; error?: string; status?: number }> {
    const token = process.env.GITHUB_TOKEN;
    const owner  = process.env.GITHUB_REPO_OWNER  ?? "marksen23";
    const repo   = process.env.GITHUB_REPO_NAME   ?? "digitale-transformation-ebook";
    const branch = process.env.GITHUB_REPO_BRANCH ?? "main";
    if (!token) return { ok: false, error: "GITHUB_TOKEN fehlt" };
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    // Bei leerem sha: GitHub interpretiert als CREATE. Bei vorhandenem sha:
    // UPDATE/DELETE. Damit kann derselbe Helper auch neue Master-Files
    // erzeugen (Phase 4) ohne separate "create"-Branch.
    const body: Record<string, unknown> = { message, branch };
    if (sha) body.sha = sha;
    if (op === "update" && newContent !== null) {
      body.content = Buffer.from(newContent, "utf-8").toString("base64");
    }
    const res = await fetch(url, {
      method: op === "update" ? "PUT" : "DELETE",
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", "Content-Type": "application/json", Accept: "application/vnd.github+json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `${res.status}: ${txt.slice(0, 200)}`, status: res.status };
    }
    return { ok: true };
  }

  /**
   * writeOrDeleteFile mit Retry bei transienten Fehlern (409 SHA-Konflikt,
   * 5xx, 403 secondary-rate-limit). Bei 409 wird der aktuelle SHA neu geholt
   * und die Mutation neu auf den frischen Content angewandt (via reload).
   * `reload` liefert {sha, content} neu — für MD-Writes, wo der Content vom
   * SHA abhängt. Garantiert, dass auch unter Last jeder Write landet.
   */
  async function writeOrDeleteFileRetry(
    op: "update" | "delete",
    initial: { path: string; sha: string; content: string | null },
    message: string,
    reload: () => Promise<{ sha: string; content: string | null } | null>,
    maxAttempts = 6,
  ): Promise<{ ok: boolean; error?: string }> {
    let { sha, content } = initial;
    let lastErr = "unbekannt";
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await writeOrDeleteFile(op, initial.path, sha, content, message);
      if (res.ok) return { ok: true };
      lastErr = res.error ?? "Schreibfehler";
      const transient = res.status === 409 || res.status === 403 || (res.status ?? 0) >= 500;
      if (!transient || attempt === maxAttempts - 1) return { ok: false, error: lastErr };
      await new Promise(r => setTimeout(r, 200 * (attempt + 1) + Math.floor(Math.random() * 200)));
      // SHA (und ggf. Content) frisch holen und Mutation neu anwenden
      const fresh = await reload();
      if (!fresh) return { ok: false, error: `${lastErr} (reload fehlgeschlagen)` };
      sha = fresh.sha;
      content = fresh.content;
    }
    return { ok: false, error: lastErr };
  }

  /** Modifiziert Frontmatter mit YAML-Library (Reihenfolge bleibt erhalten). */
  async function mutateFrontmatter(content: string, mutator: (doc: import("yaml").Document.Parsed) => void): Promise<string> {
    const yaml = await import("yaml");
    const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) throw new Error("Kein Frontmatter im File");
    const doc = yaml.parseDocument(m[1]);
    mutator(doc);
    const newFm = doc.toString().trimEnd();
    return `---\n${newFm}\n---\n${m[2]}`;
  }

  // Gemeinsame Status-Mutationskette — von /api/admin/curate (actor "admin")
  // und /api/admin/auto-curate (actor "auto-curate") genutzt. Schreibt status
  // ins MD-Frontmatter + audit_trail, synct live-Index, invalidiert RAG-Cache.
  async function curateEntryStatus(
    id: string, status: string, actor: string,
  ): Promise<{ ok: true; oldStatus: string; path: string } | { ok: false; code: number; error: string }> {
    const file = await findEntryFile(id);
    if (!file) return { ok: false, code: 404, error: `Eintrag ${id} nicht gefunden` };
    let oldStatus = "raw";
    let newContent: string;
    try {
      newContent = await mutateFrontmatter(file.content, doc => {
        oldStatus = String(doc.get("status") ?? "raw");
        doc.set("status", status);
        const trail = doc.get("audit_trail") as { add?: (item: unknown) => void } | undefined;
        const newEvent = { event: "status-changed", ts: new Date().toISOString(), actor, from: oldStatus, to: status };
        if (trail && typeof trail.add === "function") trail.add(newEvent);
        else doc.set("audit_trail", [newEvent]);
      });
    } catch (err) {
      return { ok: false, code: 500, error: `Frontmatter-Update fehlgeschlagen: ${err instanceof Error ? err.message : err}` };
    }
    const writeRes = await writeOrDeleteFile(
      "update", file.path, file.sha, newContent,
      `curate(${id}): ${oldStatus} → ${status}${actor === "admin" ? "" : ` [${actor}]`}`
    );
    if (!writeRes.ok) return { ok: false, code: 502, error: writeRes.error ?? "Schreibfehler" };
    // S1: live-Index synchron — AWAIT (nicht fire-and-forget), damit der
    // Schreibvorgang abgeschlossen ist, bevor wir antworten. updateInIndex
    // hat jetzt Retry-on-conflict, verwirft also keine Updates mehr still.
    await updateInIndex(id, { status });
    invalidateResonanzRetrievalCache();         // R1: Retrieval-Pool invalidieren
    return { ok: true, oldStatus, path: file.path };
  }

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

  // ─── Begriffsnetz-Wachstum (Phase 5b) ─────────────────────────────────────
  // Erhebt eine werdende Verbindung (aus der Wissens-Landkarte) in den Kanon —
  // server-persistiert nach client/public/concept-edges.json, von allen Lesern
  // gesehen. Admin-gegated; jede Kante trägt Provenienz.
  router.post("/api/admin/promote-edge", async (req, res) => {
    if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    const { source, target, note, evidence } = req.body as { source?: string; target?: string; note?: string; evidence?: number };
    if (!source || !target) return res.status(400).json({ error: "source und target erforderlich" });
    const { promoteEdge } = await import("../lib/conceptEdges.js");
    const { loadDynamicNodeIds } = await import("../lib/conceptNodes.js");
    // Knoten-Existenz: statische NODES ∪ dynamische Begriffe (5c) — verhindert
    // Kanten auf Unsinn-/Tipp-IDs.
    const dynIds = await loadDynamicNodeIds().catch(() => new Set<string>());
    const validIds = new Set<string>([...Array.from(nodeSrv.keys()), ...Array.from(dynIds)]);
    const r = await promoteEdge({ source, target, note, evidence, actor: "admin", validIds });
    recordAdminAction({
      type: "promote-edge", actor: "admin", targetId: `${source}→${target}`, ok: r.ok,
      reason: r.ok ? undefined : r.error,
      payload: { source, target, note, evidence },
    });
    if (!r.ok) {
      // unbekannter Begriff = 400 (Client-Fehler), Schreibfehler = 502
      const code = r.error.startsWith("unbekannter Begriff") ? 400 : 502;
      return res.status(code).json({ error: r.error });
    }
    return res.json({ ok: true, already: r.already ?? false, source, target });
  });

  // ─── Begriffsnetz-Wachstum: neue Begriffe / Wortschöpfungen (Phase 5c) ────
  // Erhebt eine Wortschöpfung in den Kanon — server-persistiert nach
  // client/public/concept-nodes.json (additive Schicht; statische NODES
  // unberührt). Schutzwall: Korpus-Evidenz + Distinktheit + menschliche
  // Autorisierung. mode=preview liefert nur das Gate-Verdikt (mutiert nichts).
  const VALID_CATEGORIES = new Set(["core", "ontological", "relational", "language", "knowledge", "temporal", "transformation", "leitmotiv", "prinzip"]);

  router.post("/api/admin/propose-concept", async (req, res) => {
    if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    const { mode, id, label, fullLabel, description, category, anchorId } = req.body as {
      mode?: string; id?: string; label?: string; fullLabel?: string; description?: string; category?: string; anchorId?: string;
    };
    if (mode !== "preview" && mode !== "accept") return res.status(400).json({ error: 'mode muss "preview" oder "accept" sein' });
    const cleanId = String(id ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!cleanId) return res.status(400).json({ error: "id fehlt/ungültig (nur a-z, 0-9, -)" });
    if (!fullLabel?.trim() || !description?.trim()) return res.status(400).json({ error: "fullLabel und description erforderlich" });
    if (!category || !VALID_CATEGORIES.has(category)) return res.status(400).json({ error: `category muss eines von ${Array.from(VALID_CATEGORIES).join("|")} sein` });
    if (!anchorId || !nodeSrv.has(anchorId)) return res.status(400).json({ error: "anchorId muss ein existierender Begriff sein" });

    const { loadDynamicNodeIds, evaluateConcept, acceptConceptNode } = await import("../lib/conceptNodes.js");
    if (nodeSrv.has(cleanId)) return res.status(409).json({ error: `Begriff '${cleanId}' existiert bereits (statisch)` });
    if ((await loadDynamicNodeIds()).has(cleanId)) return res.status(409).json({ error: `Begriff '${cleanId}' existiert bereits (dynamisch)` });

    const { fetchEmbedding } = await import("../lib/embeddingClient.js");
    const vec = await fetchEmbedding(`${fullLabel.trim()}: ${description.trim()}`);
    if (!vec) return res.status(502).json({ error: "Embedding fehlgeschlagen (Gemini)" });

    const CONCEPT_NEW = await resolveConceptNewConfig();
    const gate = await evaluateConcept(vec, { evidenceSim: CONCEPT_NEW.evidenceSim });
    const passDistinct = gate.distinctness >= CONCEPT_NEW.distinctMin;
    const passEvidence = gate.evidence >= CONCEPT_NEW.evidenceMin;
    const pass = passDistinct && passEvidence;
    const reasons: string[] = [];
    if (!passDistinct) reasons.push(`zu nah an „${gate.nearestConcept}" (distinctness ${gate.distinctness.toFixed(2)} < ${CONCEPT_NEW.distinctMin})`);
    if (!passEvidence) reasons.push(`zu wenig Korpus-Evidenz (${gate.evidence} < ${CONCEPT_NEW.evidenceMin})`);
    const verdict = {
      pass,
      distinctness: Number(gate.distinctness.toFixed(3)),
      nearestConcept: gate.nearestConcept,
      nearestSim: Number(gate.nearestSim.toFixed(3)),
      evidence: gate.evidence,
      thresholds: CONCEPT_NEW,
      reason: reasons.join(" · ") || "werk-nah, distinkt, korpus-getragen",
    };

    if (mode === "preview") return res.json({ ok: true, verdict, applied: false });
    if (!pass) return res.status(422).json({ ok: false, verdict, error: `Gate nicht bestanden: ${verdict.reason}` });

    // Position aus dem Anker (x/y + deterministischer radialer Offset).
    const anchor = nodeSrv.get(anchorId)!;
    let h = 0; for (let i = 0; i < cleanId.length; i++) h = (h * 31 + cleanId.charCodeAt(i)) >>> 0;
    const ang = (h % 360) * Math.PI / 180;
    const dist = (anchor.r ?? 24) + 46;
    const x = Math.round(Math.max(30, Math.min(CANVAS_W - 30, anchor.x + Math.cos(ang) * dist)));
    const y = Math.round(Math.max(30, Math.min(CANVAS_H - 30, anchor.y + Math.sin(ang) * dist)));

    const record = {
      id: cleanId,
      label: (label?.trim() || fullLabel.trim()),
      fullLabel: fullLabel.trim(),
      description: description.trim(),
      category, x, y, r: 22, anchorId,
      evidence: gate.evidence,
      distinctness: Number(gate.distinctness.toFixed(3)),
      createdAt: new Date().toISOString(),
      actor: "admin",
    };
    const r = await acceptConceptNode(record);
    recordAdminAction({
      type: "propose-concept", actor: "admin", targetId: cleanId, ok: r.ok,
      reason: r.ok ? undefined : r.error,
      payload: { fullLabel: record.fullLabel, category, anchorId },
    });
    if (!r.ok) return res.status(502).json({ ok: false, verdict, error: r.error });
    return res.json({ ok: true, verdict, applied: true, already: r.already ?? false, node: record });
  });

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
    const { acceptErkenntnis } = await import("../lib/erkenntnisse.js");
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

  // ─── AI-Pre-Score (Tier-1-3-Roadmap, Feature E) ──────────────────────────
  // Bewertet einen oder mehrere raw/pending-Einträge auf einer 1-5-Skala
  // gegen das stilistische und thematische Profil des Werks. Schreibt
  // ai_score + ai_score_reason ins Frontmatter, das der Build-Step in
  // den Index aufnimmt. Erlaubt im UI Bulk-Approve via Schwellwert.
  //
  // Manual-Trigger only — verbraucht Claude-API. Bei Bulk-Run mit Concurrency
  // 3 (analog Curation-Bulk).

  const PRE_SCORE_SYSTEM = `Du bist ein STRENGER Lektor und schützt das Niveau des deutschen Philosophiewerks „Resonanzvernunft — Digitale Transformation". Du beurteilst, ob eine KI-generierte Resonanz dem Werk wirklich ebenbürtig ist. Nenne in SCHWÄCHE und BEGRÜNDUNG keinen Autorennamen.

Werk-Profil: dichter philosophischer Duktus, mediale Anthropologie, Heidegger/Resonanz/Aufklärung-Bezüge, prosaisch (keine Listen), präzise ohne Akademismus. Zentrale Begriffe: Resonanz, Dasein, Werden, Zwischen, Leerstelle, Antlitz, Geviert, Kairos, Antwort, Begegnung.

KALIBRIERUNG (entscheidend — bewerte streng, im Zweifel runde AB):
Die MEISTE KI-Prosa verdient eine 3. Eine 5 vergibst du höchstens bei jedem zwanzigsten Text — nur wenn du den Absatz WORTWÖRTLICH ins gedruckte Buch übernehmen würdest, ohne ein Wort zu ändern. Großzügigkeit zerstört den Sinn dieser Bewertung; ein „schön klingender" Text ist noch lange keine 5.

KI-MARKER, die den Score auf HÖCHSTENS 3 deckeln (auch bei schöner Sprache):
rhetorische Dreierfiguren; „es ist wichtig zu betonen/verstehen"; aufzählende oder gliedernde Struktur; Meta-Kommentar über die eigene Antwort; generische Schlusswendungen („letztlich zeigt sich", „in diesem Sinne", „eine Einladung, …"); zentrale Begriffe bloß benannt statt wirklich gedacht.

LEITFRAGE (zuerst beantworten, sie entscheidet über 3 vs. 4):
Bringt der Text einen GEDANKEN, den das Werk noch nicht hat, und TRÄGT er ihn — also leitet er ihn her, statt ihn bloß zu behaupten?
  • NEIN — er referiert, paraphrasiert oder behauptet kompetent und werknah, aber ohne neuen, hergeleiteten Schritt → HÖCHSTENS 3, egal wie schön die Sprache klingt.
  • JA — nur dann kommen 4 und 5 überhaupt in Frage.

SKALA:
5 — Ununterscheidbar von der eigenen Hand des Werks UND ein eigener denkerischer Schritt, der die Frage weiterführt. Du würdest kein Wort ändern. (Sehr selten.)
4 — Ein echter eigener Gedanke, hergeleitet und werktreu — mit nur EINEM stilistischen Makel (eine generische Wendung, ein schwächerer Schlusssatz). KEINE 4, wenn der Kern Behauptung, Paraphrase oder Referat ist.
3 — STANDARD (hier landen die meisten): thematisch passend, formal korrekt, werknah — aber der zentrale Zug ist Behauptung/Paraphrase statt eines hergeleiteten neuen Gedankens, ODER der KI-Duktus ist erkennbar.
2 — stilistisch fremd (Schulbuch-Ton, Aufzählungen) oder inhaltlich beliebig.
1 — off-topic, generisch, oder bricht in Listen/Bullets aus.

Nenne ZUERST die größte Schwäche des Textes, DANN erst den Score — das diszipliniert dein Urteil und verhindert Gefälligkeit.

OUTPUT-FORMAT (STRIKT — exakt drei Zeilen, sonst nichts):
SCHWÄCHE: <die größte Schwäche, ein Satz>
SCORE: <1-5>
BEGRÜNDUNG: <ein Satz, max 25 Wörter, konkret>

${OUTPUT_VOICE_RULE}`;

  function parsePreScore(text: string): { score: number; reason: string } | null {
    const scoreMatch = text.match(/SCORE:\s*([1-5])/i);
    const reasonMatch = text.match(/BEGR(?:Ü|UE|U)NDUNG:\s*([\s\S]+?)(?:\n|$)/i);
    if (!scoreMatch) return null;
    return {
      score: parseInt(scoreMatch[1], 10),
      reason: (reasonMatch?.[1] ?? "").trim().slice(0, 240) || "(keine Begründung)",
    };
  }

  /**
   * Provider-agnostischer Text-LLM-Dispatcher. Default Gemini (gemini-2.5-pro
   * als unabhängiger Richter — die Resonanzen erzeugt gemini-2.5-flash, also
   * kein Selbst-Bewertungs-Bias). Claude per *_BACKEND=claude als Fallback.
   * Reicht das genutzte Modell + den echten Fehler durch (Observability).
   */
  async function callTextLLM(
    opts: { system: string; user: string; maxTokens?: number; temperature?: number; thinkingBudget?: number },
    cfg: { backend: string; geminiModel: string },
  ): Promise<{ text: string | null; model: string; error: string | null }> {
    if (cfg.backend === "claude") {
      const { callClaude, isClaudeAvailable, getClaudeModel, getLastClaudeError } = await import("../lib/claudeClient.js");
      if (!isClaudeAvailable()) return { text: null, model: getClaudeModel(), error: "ANTHROPIC_API_KEY fehlt" };
      const text = await callClaude(opts);  // thinkingBudget ist Gemini-spezifisch, Claude ignoriert es
      return { text, model: getClaudeModel(), error: text ? null : (getLastClaudeError() ?? "Claude-Call fehlgeschlagen") };
    }
    const { callGemini, isGeminiAvailable, getLastGeminiError } = await import("../lib/geminiText.js");
    if (!isGeminiAvailable()) return { text: null, model: cfg.geminiModel, error: "Kein GEMINI_API_KEY[S]/FALLBACK gesetzt" };
    const text = await callGemini({ ...opts, model: cfg.geminiModel });
    return { text, model: cfg.geminiModel, error: text ? null : (getLastGeminiError() ?? "Gemini-Call fehlgeschlagen") };
  }

  /** Bewertet einen einzelnen Eintrag, schreibt das Ergebnis ins Frontmatter. */
  async function preScoreSingle(id: string): Promise<{ ok: boolean; score?: number; reason?: string; error?: string }> {
    const file = await findEntryFile(id);
    if (!file) return { ok: false, error: `Eintrag ${id} nicht gefunden` };

    // Extrahiere Frage + Antwort aus dem Body. Pattern wie loadAnchorVariants.
    const mBody = file.content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    const body = mBody?.[1] ?? "";
    const sections = body.split(/^##\s+/m);
    let prompt = "", response = "";
    for (const s of sections) {
      if (/^Frage\s*\n/.test(s)) prompt = s.replace(/^Frage\s*\n+/, "").trim();
      else if (/^Antwort\s*\n/.test(s)) response = s.replace(/^Antwort\s*\n+/, "").trim();
    }
    if (!response) return { ok: false, error: "Kein Antwort-Section gefunden" };

    const userPrompt = `**Frage:** ${prompt || "(keine Frage notiert)"}\n\n**KI-Antwort:** ${response}\n\nBewerte diese Antwort.`;
    // maxTokens großzügig: gemini-2.5-pro ist ein Thinking-Modell — die
    // Denk-Tokens zählen gegen maxOutputTokens; bei 200 bleibt kein Platz für
    // die (kurze) Antwort → leere Response. 2048 gibt Headroom (die Antwort
    // selbst sind nur 2 Zeilen). Claude braucht das nicht, schadet aber nicht.
    const preScorePrescoreCfg = await resolvePrescoreConfig();
    const { text: raw, model, error: llmError } = await callTextLLM(
      { system: PRE_SCORE_SYSTEM, user: userPrompt, maxTokens: 2048, temperature: 0.2,
        thinkingBudget: parseInt(process.env.PRESCORE_THINKING_BUDGET ?? "512", 10) },
      { backend: preScorePrescoreCfg.backend, geminiModel: preScorePrescoreCfg.model },
    );
    if (!raw) return { ok: false, error: `Pre-Score-LLM fehlgeschlagen — ${llmError ?? "kein Detail"}` };
    const parsed = parsePreScore(raw);
    if (!parsed) return { ok: false, error: `Score-Format nicht erkannt: ${raw.slice(0, 120)}` };

    const now = new Date().toISOString();
    let newContent: string;
    try {
      newContent = await mutateFrontmatter(file.content, doc => {
        doc.set("ai_score", parsed.score);
        doc.set("ai_score_reason", parsed.reason);
        doc.set("ai_score_at", now);
        doc.set("ai_score_model", model);
      });
    } catch (err) {
      return { ok: false, error: `Frontmatter-Update fehlgeschlagen: ${err instanceof Error ? err.message : err}` };
    }

    const writeRes = await writeOrDeleteFile(
      "update", file.path, file.sha, newContent,
      `pre-score(${id}): ${parsed.score}/5`
    );
    if (!writeRes.ok) return { ok: false, error: writeRes.error };
    // S1: live-Index synchronisieren — AI-Score sofort im Filter/Badge sichtbar.
    void updateInIndex(id, {
      ai_score: parsed.score,
      ai_score_reason: parsed.reason,
      ai_score_at: now,
      ai_score_model: model,
    } as Record<string, unknown>);
    return { ok: true, score: parsed.score, reason: parsed.reason };
  }

  router.post("/api/admin/pre-score", rateLimiter('admin-pre-score', 60, 60 * 60_000), async (req, res) => {
    if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    const { id, ids } = req.body as { id?: string; ids?: string[] };

    if (id && !ids) {
      const result = await preScoreSingle(id);
      recordAdminAction({
        type: "pre-score", actor: "admin", targetId: id, ok: result.ok,
        reason: result.ok ? undefined : result.error,
        payload: { score: result.score },
      });
      if (!result.ok) return res.status(502).json({ error: result.error });
      return res.json({ ok: true, id, score: result.score, reason: result.reason });
    }
    if (ids && Array.isArray(ids)) {
      if (ids.length === 0) return res.status(400).json({ error: "ids leer" });
      if (ids.length > 200) return res.status(400).json({ error: "Bulk-Limit: max 200 IDs/Call" });
      // Sequenziell — Claude-Rate-Limits sind sensibler als GitHub-PUTs
      const results: Array<{ id: string; ok: boolean; score?: number; reason?: string; error?: string }> = [];
      for (const eid of ids) {
        const r = await preScoreSingle(eid);
        results.push({ id: eid, ...r });
        // Tiny gap zwischen Calls — sanfte Drosselung
        await new Promise(r2 => setTimeout(r2, 200));
      }
      const succeeded = results.filter(r => r.ok).length;
      recordAdminAction({
        type: "bulk-pre-score", actor: "admin", targetCount: ids.length, ok: succeeded === ids.length,
        reason: succeeded === ids.length ? undefined : `${ids.length - succeeded} von ${ids.length} fehlgeschlagen`,
        payload: { succeeded },
      });
      return res.json({ ok: true, total: ids.length, succeeded, failed: ids.length - succeeded, results });
    }
    return res.status(400).json({ error: "id oder ids erforderlich" });
  });

  // ─── Auto-Kuratierung — kontrollierte Selbst-Erweiterung ─────────────────
  // Klassifiziert raw/pending-Einträge in approve / reject / review anhand
  // verfügbarer Qualitäts-/Drift-Signale und gibt die klar-guten frei (und
  // lehnt die klar-schlechten ab) — alles Unsichere bleibt beim Menschen.
  //
  // Gate-Philosophie (siehe Plan): werkVoiceScore ist beim kleinen Korpus
  // blind (braucht ≥10 kuratierte), daher trägt corpusVoiceScore (Cosine zum
  // BUCHTEXT — statischer, menschlich-autorisierter Drift-Anker) den Schutz
  // gegen die Selbst-Amplifikations-Schleife. werkVoiceScore wird zusätzlich
  // genutzt, sobald vorhanden.
  //
  // mode=preview → read-only (klassifiziert nur bereits bewertete Einträge).
  // mode=apply   → bewertet fehlende ai_scores nach, dann approve/reject.

  // Triangulierter Schutzwall (Phase 5): conceptVoiceScore (Cosine zur
  // BEGRIFFSSTRUKTUR) als dritter, korroborierender Anker. Empirisch korreliert
  // er mit corpusVoiceScore — er LIBERALISIERT nicht, sondern HÄRTET den Wall.
  // Kalibrierung (Messung 2026-06-22 über den raw-Pool): cn-Verteilung min 0.634,
  // p25 0.669, median 0.703. Bei conceptMin 0.68 saßen 29 sonst freigabefähige
  // Einträge in der Totzone [0.62,0.68) fest → auf 0.65 gesenkt (bleibt klar über
  // der 0.62-Reject-Schwelle, kein begriffs-ferner Eintrag rutscht durch).
  // Graceful: wenn conceptVoiceScore fehlt (vor CI-Rebuild), blockt er nicht.
  // Schwellenwerte: seit Batch 4a per resolveAutoCurateConfig() aufgelöst
  // (Env-Default, optional überlagert durch /admin/settings-Override).

  interface ScoredEntry {
    id: string; status: string; prompt: string;
    ai_score?: number; ai_score_model?: string;
    corpusVoiceScore?: number; werkVoiceScore?: number;
    conceptVoiceScore?: number;
    novelty?: boolean; nearDuplicates?: string[];
  }

  function classifyForAutoCurate(e: ScoredEntry, AUTO_CURATE: AutoCurateThresholds): { decision: "approve" | "reject" | "review"; reason: string } {
    const ai = e.ai_score, cv = e.corpusVoiceScore, wv = e.werkVoiceScore, cn = e.conceptVoiceScore;
    const echoCount = e.nearDuplicates?.length ?? 0;
    // Harte Ablehnung zuerst (Sicherheit: nichts klar Schlechtes durchlassen)
    if (ai !== undefined && ai <= AUTO_CURATE.aiReject) return { decision: "reject", reason: `ai_score ${ai} ≤ ${AUTO_CURATE.aiReject}` };
    if (cv !== undefined && cv < AUTO_CURATE.corpusReject) return { decision: "reject", reason: `corpusVoice ${cv.toFixed(2)} < ${AUTO_CURATE.corpusReject} (buch-fern)` };
    if (cn !== undefined && cn < AUTO_CURATE.conceptReject) return { decision: "reject", reason: `conceptVoice ${cn.toFixed(2)} < ${AUTO_CURATE.conceptReject} (begriffs-fern)` };
    // Freigabe verlangt ALLE positiven Signale vorhanden
    if (ai === undefined) return { decision: "review", reason: "noch nicht bewertet (Pre-Score nötig)" };
    if (cv === undefined) return { decision: "review", reason: "kein corpusVoiceScore (kein Drift-Anker)" };
    if (echoCount > 0) return { decision: "review", reason: `Echo (${echoCount} Near-Duplikate)` };
    if (e.novelty === true) return { decision: "review", reason: "novelty/peripher — Mensch entscheidet" };
    // Triangulierter Anker: ai + Prosa-Nähe + (Begriffs-Nähe, wenn vorhanden) +
    // (Werk-Stimme, wenn vorhanden). conceptVoice härtet, blockt aber nicht bei
    // Abwesenheit (vor dem nächsten CI-Rebuild noch nicht berechnet).
    if (ai >= AUTO_CURATE.aiMin && cv >= AUTO_CURATE.corpusMin
        && (cn === undefined || cn >= AUTO_CURATE.conceptMin)
        && (wv === undefined || wv >= AUTO_CURATE.werkMin)) {
      return { decision: "approve", reason: `ai ${ai} · corpusVoice ${cv.toFixed(2)}${cn !== undefined ? ` · conceptVoice ${cn.toFixed(2)}` : ""}${wv !== undefined ? ` · werkVoice ${wv.toFixed(2)}` : ""}` };
    }
    return { decision: "review", reason: `unter Schwelle (ai ${ai} / corpusVoice ${cv.toFixed(2)}${cn !== undefined ? ` / conceptVoice ${cn.toFixed(2)}` : ""})` };
  }

  router.post("/api/admin/auto-curate", rateLimiter('admin-auto-curate', 60, 60 * 60_000), async (req, res) => {
    if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    const { mode, limit, offset, skipReject, rescore, scoreOnly } = req.body as { mode?: string; limit?: number; offset?: number; skipReject?: boolean; rescore?: boolean; scoreOnly?: boolean };
    if (mode !== "preview" && mode !== "apply") {
      return res.status(400).json({ error: 'mode muss "preview" oder "apply" sein' });
    }
    const cap = Math.min(Math.max(1, Number(limit) || 50), 200);
    const off = Math.max(0, Number(offset) || 0);

    const entries = await loadIndex();
    if (!entries) return res.status(503).json({ error: "Index nicht ladbar (GITHUB_TOKEN fehlt?)" });

    // offset/limit fenstern den (ts-absteigend sortierten) raw/pending-Pool —
    // damit lange Pools in mehreren kürzeren Requests durchgearbeitet werden
    // können, ohne dass ein einzelner Request am Render-Timeout scheitert.
    const pool = (entries as unknown as ScoredEntry[]).filter(e => e.status === "raw" || e.status === "pending");
    const candidates = pool.slice(off, off + cap);

    const AUTO_CURATE = await resolveAutoCurateConfig();
    // Aktueller Richter (muss zur Wahl in preScoreSingle passen) — für die
    // rescore-Bedingung: Einträge mit fremdem ai_score_model neu bewerten.
    const autoCuratePrescoreCfg = await resolvePrescoreConfig();
    const judgeModel = autoCuratePrescoreCfg.backend === "claude"
      ? (process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-4-6")
      : autoCuratePrescoreCfg.model;

    // apply: ai_scores nachbewerten. Default nur fehlende; mit rescore werden
    // ZUSÄTZLICH bereits bewertete Einträge neu beurteilt — egal ob der alte
    // Score von einem anderen Richter (Skalen-Kohärenz) ODER demselben Richter
    // unter einem alten Rubric (z.B. die flat-5-Scores vor der Rubric-Härtung)
    // stammt. So wirkt eine Rubric-Änderung auch auf schon bewertete Einträge.
    let scored = 0, rescored = 0;
    if (mode === "apply") {
      for (const e of candidates) {
        const isStale = rescore === true && e.ai_score !== undefined;
        if (e.ai_score === undefined || isStale) {
          const r = await preScoreSingle(e.id);
          if (r.ok && typeof r.score === "number") {
            if (isStale) rescored++; else scored++;
            e.ai_score = r.score; e.ai_score_model = judgeModel;
          }
          await new Promise(r2 => setTimeout(r2, 200));
        }
      }
    }

    const classified = candidates.map(e => {
      const { decision, reason } = classifyForAutoCurate(e, AUTO_CURATE);
      return {
        id: e.id, decision, reason,
        prompt: (e.prompt ?? "").slice(0, 100),
        ai_score: e.ai_score ?? null,
        corpusVoiceScore: e.corpusVoiceScore ?? null,
        conceptVoiceScore: e.conceptVoiceScore ?? null,
        werkVoiceScore: e.werkVoiceScore ?? null,
        echoCount: e.nearDuplicates?.length ?? 0,
        novelty: e.novelty ?? false,
      };
    });
    const approve = classified.filter(c => c.decision === "approve");
    const reject = classified.filter(c => c.decision === "reject");
    const review = classified.filter(c => c.decision === "review");
    const unscored = classified.filter(c => c.ai_score === null).length;

    const applied: Array<{ id: string; to: string; ok: boolean; error?: string }> = [];
    // scoreOnly: Einträge wurden (oben) bewertet, aber KEIN Status wird geändert —
    // erlaubt, die Richter-Verteilung gefahrlos zu beobachten, bevor man bewusst
    // applyt. ai_score-Mutationen bleiben (sind harmlos + gewünscht).
    if (mode === "apply" && !scoreOnly) {
      for (const c of approve) {
        const r = await curateEntryStatus(c.id, "approved", "auto-curate");
        applied.push({ id: c.id, to: "approved", ok: r.ok, ...(r.ok ? {} : { error: r.error }) });
      }
      // skipReject (approve-only): die Reject-Klassifikation bleibt in der
      // Antwort sichtbar, wird aber NICHT angewandt — Borderline-Einträge (z. B.
      // werknah, aber ai_score niedrig) bleiben `raw` für die manuelle Sichtung.
      if (!skipReject) {
        for (const c of reject) {
          const r = await curateEntryStatus(c.id, "rejected", "auto-curate");
          applied.push({ id: c.id, to: "rejected", ok: r.ok, ...(r.ok ? {} : { error: r.error }) });
        }
      }
    }

    if (mode === "apply" && !scoreOnly) {
      const appliedFailed = applied.filter(a => !a.ok).length;
      recordAdminAction({
        type: "auto-curate", actor: "admin", targetCount: applied.length, ok: appliedFailed === 0,
        reason: appliedFailed === 0 ? undefined : `${appliedFailed} von ${applied.length} fehlgeschlagen`,
        payload: { approved: approve.length, rejected: skipReject ? 0 : reject.length, review: review.length },
      });
    }

    return res.json({
      mode,
      thresholds: AUTO_CURATE,
      poolSize: pool.length,
      offset: off,
      candidateCount: candidates.length,
      counts: { approve: approve.length, reject: reject.length, review: review.length },
      unscored,           // nur im preview relevant: so viele bräuchten erst Pre-Score
      scored,             // im apply: so viele wurden frisch bewertet
      judgeModel,         // aktueller Pre-Score-Richter
      approve, reject, review,
      ...(mode === "apply" ? { applied, skipReject: skipReject === true, scoreOnly: scoreOnly === true, rescored } : {}),
    });
  });

  // ─── Master-Synthese (Phase 4) ────────────────────────────────────────
  // Lädt alle Varianten zu einem Anker, ruft Claude für eine konsolidierte
  // Synthese, schreibt das Master-File nach content/resonanzen/master/.
  // Manual-Trigger only — kein Auto-Run, weil User-Curation entscheidet.

  /** Slug-Variante des Anchors für Dateinamen (analyse:a+b → analyse_a-b).
   *  Doppelpunkte sind in Windows-Pfaden nicht erlaubt, deshalb der Swap. */
  function slugifyAnchor(anchor: string): string {
    return anchor.replace(/:/g, "_").replace(/\+/g, "-");
  }

  /** Lädt alle Varianten eines Ankers über die GitHub Tree-API.
   *  Returnt parsed entries (frontmatter + body), sortiert nach ts asc. */
  async function loadAnchorVariants(endpoint: string, anchor: string): Promise<Array<{
    id: string; ts: string; prompt: string; response: string; path: string;
  }>> {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_REPO_OWNER ?? "marksen23";
    const repo = process.env.GITHUB_REPO_NAME ?? "digitale-transformation-ebook";
    const branch = process.env.GITHUB_REPO_BRANCH ?? "main";
    if (!token) return [];

    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", Accept: "application/vnd.github+json" },
    });
    if (!treeRes.ok) return [];
    const treeData = await treeRes.json();
    interface TreeBlobEntry { type: string; path: string }
    const blobs = (treeData.tree ?? []) as TreeBlobEntry[];

    // Anker-Pfad enthält den slug (analyse:a+b+c → analyse/a+b+c/<ts>-<id>.md)
    // Wir suchen alle raw/-Files unter dem entsprechenden Anker-Ordner.
    const anchorBody = anchor.split(":")[1] ?? anchor;
    const prefix = `content/resonanzen/raw/${endpoint}/${anchorBody}/`;
    const candidatePaths = blobs.filter(b =>
      b.type === "blob" && b.path.startsWith(prefix) && b.path.endsWith(".md")
    ).map(b => b.path);

    // Raw fetchen + parsen
    const variants: Array<{ id: string; ts: string; prompt: string; response: string; path: string }> = [];
    for (const p of candidatePaths) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p}`;
      const rawRes = await fetch(rawUrl);
      if (!rawRes.ok) continue;
      const md = await rawRes.text();
      // Frontmatter + Body parsen (gleiches Pattern wie scripts/build-resonanzen-index.ts)
      const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      if (!m) continue;
      const fm = m[1];
      const body = m[2];
      const idMatch = fm.match(/^id:\s*["']?([^"'\n]+)["']?\s*$/m);
      const tsMatch = fm.match(/^ts:\s*["']?([^"'\n]+)["']?\s*$/m);
      const isMasterMatch = fm.match(/^is_master:\s*true\s*$/m);
      if (!idMatch || !tsMatch) continue;
      if (isMasterMatch) continue;  // master nicht als Variante!
      // ## Frage und ## Antwort extrahieren
      const sections = body.split(/^##\s+/m);
      let prompt = "", response = "";
      for (const s of sections) {
        if (/^Frage\s*\n/.test(s)) prompt = s.replace(/^Frage\s*\n+/, "").trim();
        else if (/^Antwort\s*\n/.test(s)) response = s.replace(/^Antwort\s*\n+/, "").trim();
      }
      variants.push({ id: idMatch[1], ts: tsMatch[1], prompt, response, path: p });
    }
    variants.sort((a, b) => a.ts.localeCompare(b.ts));
    return variants;
  }

  /** Lädt existierenden Master (falls vorhanden) für inkrementelle Synthese.
   *  Returnt { content, sha, bodyText } oder null. */
  async function loadMaster(endpoint: string, anchor: string): Promise<{ content: string; sha: string; bodyText: string } | null> {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_REPO_OWNER ?? "marksen23";
    const repo = process.env.GITHUB_REPO_NAME ?? "digitale-transformation-ebook";
    const branch = process.env.GITHUB_REPO_BRANCH ?? "main";
    if (!token) return null;

    const masterPath = `content/resonanzen/master/${endpoint}/${slugifyAnchor(anchor)}.md`;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${masterPath}?ref=${branch}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "dt-admin", Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    return { content, sha: data.sha, bodyText: bodyMatch ? bodyMatch[1] : "" };
  }

  router.post("/api/admin/synthesize-master", rateLimiter('admin-synthesize-master', 60, 60 * 60_000), async (req, res) => {
    if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    const { anchor, endpoint } = req.body as { anchor?: string; endpoint?: string };
    if (!anchor || !endpoint) return res.status(400).json({ error: "anchor + endpoint fehlt" });
    if (anchor === "graph" || !anchor.includes(":")) {
      return res.status(400).json({ error: "Anker für graph-chat ist nicht synthetisierbar" });
    }

    // 1. Varianten laden
    const variants = await loadAnchorVariants(endpoint, anchor);
    if (variants.length < 2) {
      return res.status(400).json({ error: `Anker '${anchor}' hat nur ${variants.length} Variante(n) — Synthese benötigt ≥2` });
    }

    // 2. Existierenden Master laden (für inkrementelle Synthese)
    const existingMaster = await loadMaster(endpoint, anchor);

    // 3. Synthese-LLM (Default Gemini gemini-2.5-pro; per SYNTHESIS_BACKEND=claude
    // oder /admin/settings-Override umstellbar)
    const synthesisCfg = await resolveSynthesisConfig();
    const { text: synthesisText, model: synthModel, error: synthError } = await callTextLLM(
      { system: MASTER_SYNTHESIS_SYSTEM, user: buildSynthesisUserPrompt(variants, existingMaster), maxTokens: 6000, temperature: 0.7 },
      { backend: synthesisCfg.backend, geminiModel: synthesisCfg.model },
    );
    if (!synthesisText) {
      return res.status(502).json({ error: `Synthese-LLM fehlgeschlagen — ${synthError ?? "siehe Server-Logs"}` });
    }

    // 4. Master-MD bauen (Frontmatter + Body)
    const now = new Date().toISOString();
    // Bug (gefunden 2026-09-02): Buffer.from(anchor + now).toString("hex").slice(0, 8)
    // hext nur die ersten 4 BYTES der ROH-Zeichenkette, nicht einen Hash — bei jedem
    // Anchor mit demselben 4-Zeichen-Präfix (z.B. alle "dialog:…") entstand exakt
    // dieselbe ID, egal was `now` war. sha256 verteilt über die volle Eingabe.
    const masterId = `MASTER-${createHash("sha256").update(anchor + now).digest("hex").slice(0, 8).toUpperCase()}`;
    const variantIds = variants.map(v => v.id);
    const auditEvent = `  - event: ${existingMaster ? "re-synthesized" : "synthesized"}\n    ts: ${now}\n    actor: admin\n    source_ids: [${variantIds.join(", ")}]`;
    // content_hash — Pflichtfeld des Konsistenz-Wächters (validate-resonanzen):
    // sha256(prompt + "\n---\n" + response), 16 hex. prompt/response = genau die
    // "## Frage"/"## Antwort"-Abschnitte unten. Fehlte bis 2026-07-03 → CI rot.
    const masterPrompt = `Synthese von ${variants.length} Varianten zu: ${anchor}`;
    const masterHash = createHash("sha256")
      .update(masterPrompt).update("\n---\n").update(synthesisText)
      .digest("hex").slice(0, 16);
    const masterMd = [
      `---`,
      `id: ${masterId}`,
      `ts: ${now}`,
      `created_at: ${now}`,
      `endpoint: ${endpoint}`,
      `anchor: ${anchor}`,
      `is_master: true`,
      `master_of: [${variantIds.join(", ")}]`,
      `variant_count: ${variants.length}`,
      `nodeIds: [${(anchor.split(":")[1] ?? "").split("+").join(", ")}]`,
      `status: published`,
      `content_hash: ${masterHash}`,
      `llm: ${synthModel}`,
      `audit_trail:`,
      auditEvent,
      `---`,
      ``,
      `## Frage`,
      ``,
      `Synthese von ${variants.length} Varianten zu: ${anchor}`,
      ``,
      `## Antwort`,
      ``,
      synthesisText,
      ``,
    ].join("\n");

    // 5. Schreiben (create wenn neu, update wenn existing)
    const masterPath = `content/resonanzen/master/${endpoint}/${slugifyAnchor(anchor)}.md`;
    const writeRes = await writeOrDeleteFile(
      "update",
      masterPath,
      existingMaster?.sha ?? "",
      masterMd,
      `synthesize-master(${anchor}): ${variants.length} variants → ${existingMaster ? "re-" : ""}master`,
    );
    recordAdminAction({
      type: "synthesize-master", actor: "admin", targetId: anchor, ok: writeRes.ok,
      reason: writeRes.ok ? undefined : writeRes.error,
      payload: { endpoint, variantCount: variants.length, wasUpdate: !!existingMaster },
    });
    if (!writeRes.ok) return res.status(502).json({ error: writeRes.error });

    return res.json({
      ok: true,
      anchor, endpoint, variantCount: variants.length,
      path: masterPath, masterId,
      wasUpdate: !!existingMaster,
      synthesisPreview: synthesisText.slice(0, 500),
    });
  });

  // R6: Citation-Stats — read-only Diagnose-Endpunkt für AdminHealthPage.
  // Zeigt welche Werk-Chunks + Resonanzen tatsächlich von der KI zitiert
  // werden und welche „verschlafen" (retrieved aber nie zitiert).
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

  // Bulk-Delete: löscht VIELE Einträge — Tree einmal geholt, MD-Deletes mit
  // Retry, EIN Index-Schreibvorgang (statt N parallele, die zu ~50% verloren
  // gingen).
  // Gemeinsamer Bulk-Delete-Kern — Tree einmal geholt (via findEntryFiles),
  // MD-Deletes mit Retry, EIN Index-Schreibvorgang. Von delete-bulk UND
  // dedup-corpus(apply) genutzt, statt den Worker-Pool zweimal zu pflegen.
  async function bulkDeleteEntries(ids: string[]): Promise<{
    results: Array<{ id: string; ok: boolean; error?: string }>;
    okIds: string[]; indexOk: boolean;
  }> {
    const uniqueIds = Array.from(new Set(ids));
    const fileMap = await findEntryFiles(uniqueIds);

    const deleteOne = async (id: string): Promise<{ id: string; ok: boolean; error?: string }> => {
      const file = fileMap.get(id);
      if (!file) return { id, ok: false, error: "Eintrag nicht gefunden" };
      const w = await writeOrDeleteFileRetry(
        "delete",
        { path: file.path, sha: file.sha, content: null },
        `admin-delete: ${id} (${file.path.split("/").slice(-2, -1)[0] ?? "unknown"})`,
        async () => {
          const fresh = await getContentsByPath(file.path);
          return fresh ? { sha: fresh.sha, content: null } : null;
        },
      );
      return w.ok ? { id, ok: true } : { id, ok: false, error: w.error };
    };

    const results: { id: string; ok: boolean; error?: string }[] = [];
    const queue = [...uniqueIds];
    const worker = async (): Promise<void> => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        results.push(await deleteOne(id));
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, uniqueIds.length) }, () => worker()));

    const okIds = results.filter(r => r.ok).map(r => r.id);
    const indexOk = await removeManyFromIndex(okIds);
    invalidateResonanzRetrievalCache();
    return { results, okIds, indexOk };
  }

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
  return router;
}
