/**
 * insightRegen.ts — Prüfung und Zusammensetzung für die Neuerzeugung der
 * Erkenntnisse und Master-Synthesen. Kein Netz, keine Gemini-Calls.
 */
import crypto from "node:crypto";
import { endsComplete } from "../../server/lib/geminiText.js";

const FORBIDDEN: Array<{ re: RegExp; label: string }> = [
  { re: /\bOehring\b/i, label: "Oehring" },
  { re: /\bMarkus\b/, label: "Markus" },
  { re: /Begriffsraum/i, label: "Begriffsraum" },
  { re: /tiefgründig/i, label: "tiefgründig" },
  { re: /tiefgruendig/i, label: "tiefgruendig" },
  { re: /\b(?:der|die|den|dem|des) Autors?\b/i, label: "Autor" },
];

/** Verstöße gegen Stimme und Schluss. Leer = der Text darf auf die Seite. */
export function voiceViolations(text: string): string[] {
  const hits: string[] = [];
  for (const { re, label } of FORBIDDEN) {
    if (re.test(text)) hits.push(label);
  }
  if (!text.trim()) hits.push("leer");
  else if (!endsComplete(text)) hits.push("unvollständig");
  return hits;
}

/** Nimmt aus einer Destillations-Antwort den einen Satz. */
export function cleanKernsatz(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^```(?:\w+)?\s*\n?/, "").replace(/\n?```$/, "").trim();
  t = t.replace(/^(?:Kernsatz|Satz)\s*:\s*/i, "");
  t = t.replace(/^["„]|["“]$/g, "").trim();
  const paras = t.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const first = paras[0] ?? "";
  if (paras.length > 1 && /[.!?…]$/.test(first)) return first;
  return paras.join(" ").replace(/\s+/g, " ").trim();
}

export function contentHashFor(prompt: string, response: string): string {
  return crypto.createHash("sha256")
    .update(prompt)
    .update("\n---\n")
    .update(response)
    .digest("hex")
    .slice(0, 16);
}

export function setFrontmatterField(fm: string, key: string, value: string): string {
  const re = new RegExp(`^${key}:.*$`, "m");
  if (re.test(fm)) return fm.replace(re, `${key}: ${value}`);
  return `${fm.replace(/\s*$/, "")}\n${key}: ${value}`;
}

/**
 * Schreibt einen bestehenden Master neu: dieselbe id (Permalinks), frische
 * Synthese als Antwort, neuer content_hash, Audit-Ereignis angehängt.
 * existingMaster wird bewusst nicht in den Prompt gemischt — die Neuerzeugung
 * soll aus den aktuellen Varianten kommen, nicht aus dem alten Text.
 */
export function renderMasterMarkdown(opts: {
  fmRaw: string;
  now: string;
  variantIds: string[];
  synthesisText: string;
  model: string;
  /** Erster Wurf eines Masters, sonst eine Neufassung. */
  event?: "synthesized" | "re-synthesized";
}): string {
  const prompt = extractPromptLine(opts.fmRaw, opts.variantIds);
  const response = opts.synthesisText.trim();
  const hash = contentHashFor(prompt, response);
  let fm = opts.fmRaw.replace(/\s*$/, "");
  fm = setFrontmatterField(fm, "ts", opts.now);
  fm = setFrontmatterField(fm, "created_at", opts.now);
  fm = setFrontmatterField(fm, "master_of", `[${opts.variantIds.join(", ")}]`);
  fm = setFrontmatterField(fm, "variant_count", String(opts.variantIds.length));
  fm = setFrontmatterField(fm, "content_hash", hash);
  fm = setFrontmatterField(fm, "llm", opts.model);
  const event = [
    `  - event: ${opts.event ?? "re-synthesized"}`,
    `    ts: ${opts.now}`,
    `    actor: regenerate-erkenntnisse`,
    `    source_ids: [${opts.variantIds.join(", ")}]`,
  ].join("\n");
  if (/^audit_trail:\s*$/m.test(fm)) fm += `\n${event}`;
  else fm += `\naudit_trail:\n${event}`;

  const frage = `Synthese von ${opts.variantIds.length} Varianten zu: ${anchorFromFm(fm)}`;
  return `---\n${fm}\n---\n\n## Frage\n\n${frage}\n\n## Antwort\n\n${response}\n`;
}

function extractPromptLine(fmRaw: string, variantIds: string[]): string {
  const anchor = anchorFromFm(fmRaw);
  return `Synthese von ${variantIds.length} Varianten zu: ${anchor}`;
}

function anchorFromFm(fm: string): string {
  const m = fm.match(/^anchor:\s*(.+)$/m);
  return (m?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
}

/** So viele neue Varianten braucht ein Anker, bevor ein Master entsteht oder neu geschrieben wird. */
export const DEFAULT_MIN_NEW_VARIANTS = 2;

const SKIP_MASTER_ENDPOINTS = new Set(["graph-chat", "enkidu", "translate"]);

export interface MasterPlan {
  action: "create" | "update" | "skip";
  reason: "ready" | "too-few" | "unchanged" | "skipped-endpoint" | "human";
  /** Varianten, die im letzten Master noch nicht standen. */
  newIds: string[];
  /** Alle Varianten, aus denen der Master geschrieben würde. */
  variantIds: string[];
}

/**
 * Bestehender Master: nur bei genug neuen Varianten neu schreiben.
 * Noch kein Master: alle Varianten zählen als neu, Schwelle dieselbe.
 * graph-chat, enkidu und translate sind keine Synthese-Anker.
 */
export function planMaster(opts: {
  endpoint: string;
  anchor: string;
  variantIds: string[];
  /** null = noch kein Master. Sonst die IDs aus master_of. */
  masterOf: string[] | null;
  /** rejected oder eine menschliche Zurücknahme: nicht anfassen. */
  blocked?: boolean;
  minNew?: number;
}): MasterPlan {
  const minNew = opts.minNew ?? DEFAULT_MIN_NEW_VARIANTS;
  const empty = { newIds: [] as string[], variantIds: opts.variantIds };
  if (opts.blocked) return { action: "skip", reason: "human", ...empty };
  if (SKIP_MASTER_ENDPOINTS.has(opts.endpoint) || !opts.anchor.includes(":")) {
    return { action: "skip", reason: "skipped-endpoint", ...empty };
  }
  const seen = new Set(opts.masterOf ?? []);
  const newIds = opts.variantIds.filter(id => !seen.has(id));
  if (opts.masterOf === null) {
    if (opts.variantIds.length < minNew) return { action: "skip", reason: "too-few", newIds, variantIds: opts.variantIds };
    return { action: "create", reason: "ready", newIds, variantIds: opts.variantIds };
  }
  if (newIds.length < minNew) return { action: "skip", reason: "unchanged", newIds, variantIds: opts.variantIds };
  return { action: "update", reason: "ready", newIds, variantIds: opts.variantIds };
}

export function masterIdForAnchor(anchor: string): string {
  return `MASTER-${crypto.createHash("sha256").update(anchor).digest("hex").slice(0, 8).toUpperCase()}`;
}

/** analyse:a+b → content/resonanzen/master/analyse/analyse_a-b.md */
export function masterRelPath(endpoint: string, anchor: string): string {
  const slug = anchor.replace(/:/g, "_").replace(/\+/g, "-");
  return `content/resonanzen/master/${endpoint}/${slug}.md`;
}

export function freshMasterFm(opts: { endpoint: string; anchor: string; now: string }): string {
  const nodeIds = (opts.anchor.split(":")[1] ?? "").split("+").map(s => s.trim()).filter(Boolean);
  return [
    `id: ${masterIdForAnchor(opts.anchor)}`,
    `ts: ${opts.now}`,
    `created_at: ${opts.now}`,
    `endpoint: ${opts.endpoint}`,
    `anchor: ${opts.anchor}`,
    `is_master: true`,
    `master_of: []`,
    `variant_count: 0`,
    `nodeIds: [${nodeIds.join(", ")}]`,
    `status: published`,
    `auto_published: true`,
    `content_hash: 0000000000000000`,
    `llm: pending`,
    `audit_trail:`,
  ].join("\n");
}

export interface KernsatzCandidate {
  id: string;
  answerId: string;
  questionSourceId: string;
  conceptAnchor: string | null;
  distinctness: number;
}

export interface KernsatzDraftRef {
  answerId: string;
  sourceHash?: string;
}

/**
 * Kandidaten, die noch keinen bestätigten Kernsatz haben.
 * Ein Entwurf wird nur neu destilliert, wenn sich die Antwort geändert hat.
 */
export function planKernsatzCandidates(opts: {
  candidates: KernsatzCandidate[];
  confirmedAnswerIds: Iterable<string>;
  /** Zurückgenommene Antwort-IDs. Werden nie wieder automatisch destilliert. */
  withdrawnAnswerIds?: Iterable<string>;
  drafts: KernsatzDraftRef[];
  answerHashById: Map<string, string>;
  limit?: number;
}): KernsatzCandidate[] {
  const confirmed = new Set(opts.confirmedAnswerIds);
  const withdrawn = new Set(opts.withdrawnAnswerIds ?? []);
  const draftByAnswer = new Map(opts.drafts.map(d => [d.answerId, d]));
  const fresh: KernsatzCandidate[] = [];
  for (const c of opts.candidates) {
    if (!c.answerId || confirmed.has(c.answerId) || withdrawn.has(c.answerId)) continue;
    const hash = opts.answerHashById.get(c.answerId);
    if (!hash) continue;
    const draft = draftByAnswer.get(c.answerId);
    if (draft && draft.sourceHash === hash) continue;
    fresh.push(c);
    if (fresh.length >= (opts.limit ?? 8)) break;
  }
  return fresh;
}

export interface AutoKernsatz {
  id: string;
  kernsatz: string;
  questionSourceId: string;
  answerId: string;
  conceptAnchor: string | null;
  distinctness: number;
  createdAt: string;
  actor: "auto";
}

export interface ExistingErkenntnisRef {
  id: string;
  answerId: string;
  actor?: string;
}

/**
 * Kernsätze, die automatisch in die öffentliche Liste dürfen.
 * Schon bestätigte, zurückgenommene und stimmlich ungeeignete Sätze bleiben draußen.
 * Bestehende Einträge werden nie ersetzt.
 */
export function autoKernsaetzeToPublish(opts: {
  drafts: Array<{
    id: string;
    answerId: string;
    questionSourceId: string;
    kernsatz: string;
    conceptAnchor: string | null;
    distinctness: number;
    distilledAt: string;
  }>;
  existing: ExistingErkenntnisRef[];
  withdrawnAnswerIds: Iterable<string>;
}): AutoKernsatz[] {
  const taken = new Set<string>();
  for (const e of opts.existing) {
    taken.add(e.id);
    taken.add(e.answerId);
  }
  const withdrawn = new Set(opts.withdrawnAnswerIds);
  const out: AutoKernsatz[] = [];
  for (const d of opts.drafts) {
    if (!d.answerId || !d.kernsatz.trim() || !d.questionSourceId) continue;
    if (taken.has(d.id) || taken.has(d.answerId) || withdrawn.has(d.answerId)) continue;
    if (voiceViolations(d.kernsatz).length > 0) continue;
    taken.add(d.id);
    taken.add(d.answerId);
    out.push({
      id: d.id,
      kernsatz: d.kernsatz.trim(),
      questionSourceId: d.questionSourceId,
      answerId: d.answerId,
      conceptAnchor: d.conceptAnchor,
      distinctness: d.distinctness,
      createdAt: d.distilledAt,
      actor: "auto",
    });
  }
  return out;
}

/** true, wenn die Synthese die verlangten Abschnitte trägt und zu Ende kommt. */
export function synthesisShapeOk(text: string): boolean {
  const t = text.trim();
  if (!/^##\s+Synthese\b/m.test(t)) return false;
  if (!/^##\s+Offene Frage\b/m.test(t)) return false;
  if (!voiceViolations(t).length) return true;
  return false;
}
