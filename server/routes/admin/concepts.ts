/**
 * Admin-Teil „concepts". Dieselben Routen, nur aus der einen Datei gelöst.
 */
import { type Router } from "express";
import { CANVAS_H, CANVAS_W } from "../../../client/src/data/conceptGraph.js";
import { recordAdminAction } from "../../lib/adminActionLog.js";
import { resolveConceptNewConfig } from "../../lib/adminConfig.js";
import { canonicalEdgeKeys, nodeSrv } from "../../lib/graphContext.js";
import { checkAdminToken } from "./helpers.js";
export function mountConcepts(router: Router): void {
// ─── Begriffsnetz-Wachstum (Phase 5b) ─────────────────────────────────────
// Erhebt eine werdende Verbindung (aus der Wissens-Landkarte) in den Kanon —
// server-persistiert nach client/public/concept-edges.json, von allen Lesern
// gesehen. Admin-gegated; jede Kante trägt Provenienz.
router.post("/api/admin/promote-edge", async (req, res) => {
  if (!checkAdminToken(req)) return res.status(401).json({ error: "Nicht autorisiert" });
  const { source, target, note, evidence } = req.body as { source?: string; target?: string; note?: string; evidence?: number };
  if (!source || !target) return res.status(400).json({ error: "source und target erforderlich" });
  const { promoteEdge } = await import("../../lib/conceptEdges.js");
  const { loadDynamicNodeIds } = await import("../../lib/conceptNodes.js");
  // Knoten-Existenz: statische NODES ∪ dynamische Begriffe (5c) — verhindert
  // Kanten auf Unsinn-/Tipp-IDs.
  const dynIds = await loadDynamicNodeIds().catch(() => new Set<string>());
  const validIds = new Set<string>([...Array.from(nodeSrv.keys()), ...Array.from(dynIds)]);
  const r = await promoteEdge({ source, target, note, evidence, actor: "admin", validIds,
    canonicalKeys: canonicalEdgeKeys });
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
  return res.json({ ok: true, already: r.already ?? false, canonical: r.canonical ?? false, source, target });
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

  const { loadDynamicNodeIds, evaluateConcept, acceptConceptNode } = await import("../../lib/conceptNodes.js");
  if (nodeSrv.has(cleanId)) return res.status(409).json({ error: `Begriff '${cleanId}' existiert bereits (statisch)` });
  if ((await loadDynamicNodeIds()).has(cleanId)) return res.status(409).json({ error: `Begriff '${cleanId}' existiert bereits (dynamisch)` });

  const { fetchEmbedding } = await import("../../lib/embeddingClient.js");
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
}
