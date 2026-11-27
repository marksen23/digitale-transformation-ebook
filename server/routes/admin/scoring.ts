/**
 * Admin-Teil „scoring". Dieselben Routen, nur aus der einen Datei gelöst.
 */
import { type Router } from "express";
import { recordAdminAction } from "../../lib/adminActionLog.js";
import { resolveAutoCurateConfig, resolvePrescoreConfig } from "../../lib/adminConfig.js";
import { loadIndex, updateInIndex } from "../../lib/indexUpdater.js";
import { rateLimiter } from "../../middleware/rateLimit.js";
import {
  checkAdminToken,
  findEntryFile,
  writeOrDeleteFile,
  mutateFrontmatter,
  curateEntryStatus,
  PRE_SCORE_SYSTEM,
  parsePreScore,
  callTextLLM,
  ScoredEntry,
  classifyForAutoCurate,
} from "./helpers.js";
export function mountScoring(router: Router): void {
// ─── AI-Pre-Score (Tier-1-3-Roadmap, Feature E) ──────────────────────────
// Bewertet einen oder mehrere raw/pending-Einträge auf einer 1-5-Skala
// gegen das stilistische und thematische Profil des Werks. Schreibt
// ai_score + ai_score_reason ins Frontmatter, das der Build-Step in
// den Index aufnimmt. Erlaubt im UI Bulk-Approve via Schwellwert.
//
// Manual-Trigger only — verbraucht Claude-API. Bei Bulk-Run mit Concurrency
// 3 (analog Curation-Bulk).


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
}
