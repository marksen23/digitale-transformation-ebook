/**
 * Moderierte Begriffs- und Verbindungsvorschläge von Lesern.
 * Öffentlich nur das Anlegen. Heben und Zurückziehen bleiben beim Admin.
 */
import { Router } from "express";
import { NODES } from "../../client/src/data/conceptGraph.js";
import { recordAdminAction } from "../lib/adminActionLog.js";
import { isAdminRequest } from "../lib/adminToken.js";
import { canonicalEdgeKeys } from "../lib/graphContext.js";
import {
  newProposalId,
  slugConceptId,
  withProposals,
  type Proposal,
} from "../lib/vorschlagStore.js";
import { rateLimiter } from "../middleware/rateLimit.js";

const nodeById = new Map(NODES.map(node => [node.id, node]));
const MAX_PENDING = 200;

function cleanLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export interface ProposalPromoteResult {
  ok: true;
}

export interface ProposalDeps {
  promoteEdge?: (proposal: Proposal) => Promise<ProposalPromoteResult | { ok: false; error: string }>;
  promoteConcept?: (proposal: Proposal) => Promise<ProposalPromoteResult | { ok: false; error: string }>;
}

async function defaultPromoteEdge(proposal: Proposal): Promise<ProposalPromoteResult | { ok: false; error: string }> {
  const { promoteEdge } = await import("../lib/conceptEdges.js");
  const { loadDynamicNodeIds } = await import("../lib/conceptNodes.js");
  const dyn = await loadDynamicNodeIds().catch(() => new Set<string>());
  const validIds = new Set<string>([...nodeById.keys(), ...dyn]);
  const result = await promoteEdge({
    source: proposal.source ?? "",
    target: proposal.target ?? "",
    note: proposal.reason,
    actor: "admin",
    validIds,
    canonicalKeys: canonicalEdgeKeys,
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

async function defaultPromoteConcept(proposal: Proposal): Promise<ProposalPromoteResult | { ok: false; error: string }> {
  const { fetchEmbedding } = await import("../lib/embeddingClient.js");
  const { evaluateConcept, acceptConceptNode, loadDynamicNodeIds } = await import("../lib/conceptNodes.js");
  const { resolveConceptNewConfig } = await import("../lib/adminConfig.js");
  const { CANVAS_W, CANVAS_H } = await import("../../client/src/data/conceptGraph.js");
  const id = proposal.conceptId ?? "";
  if (nodeById.has(id) || (await loadDynamicNodeIds().catch(() => new Set<string>())).has(id)) {
    return { ok: false, error: "Dieser Begriff steht schon im Netz." };
  }
  const fullLabel = proposal.fullLabel ?? "";
  const description = proposal.description ?? "";
  const vec = await fetchEmbedding(`${fullLabel}: ${description}`);
  if (!vec) return { ok: false, error: "Der Begriff konnte nicht geprüft werden." };
  const wall = await resolveConceptNewConfig();
  const gate = await evaluateConcept(vec, { evidenceSim: wall.evidenceSim });
  if (gate.distinctness < wall.distinctMin || gate.evidence < wall.evidenceMin) {
    return { ok: false, error: "Der Schutzwall lässt den Begriff noch nicht zu." };
  }
  const anchor = nodeById.get(proposal.anchorId ?? "");
  if (!anchor) return { ok: false, error: "Der Anker-Begriff fehlt." };
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const angle = (hash % 360) * Math.PI / 180;
  const dist = (anchor.r ?? 24) + 46;
  const record = {
    id,
    label: fullLabel,
    fullLabel,
    description,
    category: "knowledge",
    x: Math.round(Math.max(30, Math.min(CANVAS_W - 30, anchor.x + Math.cos(angle) * dist))),
    y: Math.round(Math.max(30, Math.min(CANVAS_H - 30, anchor.y + Math.sin(angle) * dist))),
    r: 22,
    anchorId: anchor.id,
    evidence: gate.evidence,
    distinctness: Number(gate.distinctness.toFixed(3)),
    createdAt: new Date().toISOString(),
    actor: "leser-vorschlag",
  };
  const saved = await acceptConceptNode(record);
  return saved.ok ? { ok: true } : { ok: false, error: saved.error };
}

export function createVorschlagRouter(deps: ProposalDeps = {}): Router {
  const router = Router();
  const promoteEdge = deps.promoteEdge ?? defaultPromoteEdge;
  const promoteConcept = deps.promoteConcept ?? defaultPromoteConcept;

  router.post("/api/vorschlaege", rateLimiter("vorschlag", 8, 60 * 60_000), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const kind = req.body?.kind === "concept" || req.body?.kind === "edge" ? req.body.kind : "";
    const reason = cleanLine(req.body?.reason, 400);
    const author = cleanLine(req.body?.author, 40) || "Ohne Namen";
    if (!kind) return res.status(400).json({ error: "Art des Vorschlags fehlt." });
    if (reason.length < 10) return res.status(400).json({ error: "Die Begründung braucht mindestens 10 Zeichen." });

    const proposal: Proposal = {
      id: newProposalId(),
      kind,
      status: "pending",
      createdAt: new Date().toISOString(),
      author,
      reason,
    };

    if (kind === "edge") {
      const source = cleanLine(req.body?.source, 64);
      const target = cleanLine(req.body?.target, 64);
      if (!nodeById.has(source) || !nodeById.has(target)) {
        return res.status(400).json({ error: "Beide Begriffe müssen im Netz stehen." });
      }
      if (source === target) return res.status(400).json({ error: "Eine Verbindung braucht zwei verschiedene Begriffe." });
      proposal.source = source;
      proposal.target = target;
    } else {
      const fullLabel = cleanLine(req.body?.fullLabel, 80);
      const description = cleanLine(req.body?.description, 400);
      const anchorId = cleanLine(req.body?.anchorId, 64);
      const conceptId = slugConceptId(fullLabel);
      if (fullLabel.length < 2 || description.length < 20) {
        return res.status(400).json({ error: "Name und eine kurze Beschreibung fehlen." });
      }
      if (!conceptId || nodeById.has(conceptId)) {
        return res.status(400).json({ error: "Diesen Namen gibt es schon, oder er lässt sich nicht als Begriff schreiben." });
      }
      if (!nodeById.has(anchorId)) return res.status(400).json({ error: "Der Anker muss ein Begriff aus dem Netz sein." });
      proposal.conceptId = conceptId;
      proposal.fullLabel = fullLabel;
      proposal.description = description;
      proposal.anchorId = anchorId;
    }

    try {
      const saved = await withProposals(data => {
        const pending = data.proposals.filter(item => item.status === "pending");
        if (pending.length >= MAX_PENDING) return { error: "Zu viele offene Vorschläge. Bitte später noch einmal." };
        const duplicate = kind === "edge"
          ? pending.some(item => item.kind === "edge" && (
            (item.source === proposal.source && item.target === proposal.target)
            || (item.source === proposal.target && item.target === proposal.source)
          ))
          : pending.some(item => item.kind === "concept" && item.conceptId === proposal.conceptId);
        if (duplicate) return { error: "Dieser Vorschlag liegt schon vor." };
        data.proposals.push(proposal);
        return { id: proposal.id };
      });
      if ("error" in saved) return res.status(409).json({ error: saved.error });
      return res.status(201).json({ ok: true, id: saved.id, status: "pending" });
    } catch {
      return res.status(500).json({ error: "Der Vorschlag konnte nicht gespeichert werden." });
    }
  });

  router.get("/api/admin/vorschlaege", async (req, res) => {
    if (!isAdminRequest(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    res.setHeader("Cache-Control", "no-store");
    try {
      const proposals = await withProposals(data => data.proposals.filter(item => item.status === "pending"));
      return res.json({ ok: true, proposals });
    } catch {
      return res.status(500).json({ error: "Vorschläge nicht lesbar" });
    }
  });

  router.post("/api/admin/vorschlaege/promote", async (req, res) => {
    if (!isAdminRequest(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    const id = cleanLine(req.body?.id, 32);
    let proposal: Proposal | undefined;
    try {
      proposal = await withProposals(data => data.proposals.find(item => item.id === id && item.status === "pending"));
    } catch {
      return res.status(500).json({ error: "Vorschläge nicht lesbar" });
    }
    if (!proposal) return res.status(404).json({ error: "Kein offener Vorschlag." });
    const result = proposal.kind === "edge" ? await promoteEdge(proposal) : await promoteConcept(proposal);
    recordAdminAction({
      type: "vorschlag-promote",
      actor: "admin",
      targetId: id,
      ok: result.ok,
      reason: result.ok ? undefined : result.error,
    });
    if (!result.ok) return res.status(422).json({ error: result.error });
    await withProposals(data => {
      const found = data.proposals.find(item => item.id === id);
      if (found) found.status = "promoted";
    });
    return res.json({ ok: true });
  });

  router.post("/api/admin/vorschlaege/delete", async (req, res) => {
    if (!isAdminRequest(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    const id = cleanLine(req.body?.id, 32);
    try {
      const removed = await withProposals(data => {
        const index = data.proposals.findIndex(item => item.id === id && item.status === "pending");
        if (index < 0) return false;
        data.proposals[index].status = "withdrawn";
        return true;
      });
      if (!removed) return res.status(404).json({ error: "Kein offener Vorschlag." });
      recordAdminAction({ type: "vorschlag-delete", actor: "admin", targetId: id, ok: true });
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "Zurückziehen fehlgeschlagen" });
    }
  });

  return router;
}
