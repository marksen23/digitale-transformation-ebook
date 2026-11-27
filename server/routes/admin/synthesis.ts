/**
 * Admin-Teil „synthesis". Dieselben Routen, nur aus der einen Datei gelöst.
 */
import { createHash } from "crypto";
import { type Router } from "express";
import { recordAdminAction } from "../../lib/adminActionLog.js";
import { resolveSynthesisConfig } from "../../lib/adminConfig.js";
import { MASTER_SYNTHESIS_SYSTEM, buildSynthesisUserPrompt } from "../../lib/insightPrompts.js";
import { rateLimiter } from "../../middleware/rateLimit.js";
import {
  checkAdminToken,
  writeOrDeleteFile,
  callTextLLM,
  slugifyAnchor,
  loadAnchorVariants,
  loadMaster,
} from "./helpers.js";
export function mountSynthesis(router: Router): void {
// ─── Master-Synthese (Phase 4) ────────────────────────────────────────
// Lädt alle Varianten zu einem Anker, ruft Claude für eine konsolidierte
// Synthese, schreibt das Master-File nach content/resonanzen/master/.
// Manual-Trigger only — kein Auto-Run, weil User-Curation entscheidet.


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
}
