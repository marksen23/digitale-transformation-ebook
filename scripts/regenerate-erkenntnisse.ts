/**
 * regenerate-erkenntnisse.ts — erzeugt die Erkenntnisse der Seite neu.
 *
 * Inkrementell, nicht als Voll-Lauf:
 * 1. Destilliert neue Erkenntnis-Kandidaten (noch nicht bestätigt, Entwurf
 *    fehlt oder die Antwort hat sich geändert) nach
 *    client/public/resonanzen-erkenntnis-drafts.json. Bestätigte Kernsätze
 *    bleiben unangetastet.
 * 2. Schreibt Master nur für Anker mit genug neuen Varianten (Default 2).
 *    Ein unveränderter Anker wird nicht neu synthetisiert.
 * 3. Wenn nichts fällig ist, bleibt der Baum unangetastet (changed: false).
 * 4. Geänderte Master-Embeddings kommen auf die Refresh-Liste, damit der
 *    anschließende Index-Build sie neu rechnet.
 *
 * Braucht GEMINI_API_KEY (oder FALLBACK / GEMINI_API_KEYS). Der Workflow
 * .github/workflows/regenerate-erkenntnisse.yml setzt das Repo-Secret.
 *
 * Danach: CORPUS_SOURCE=local pnpm tsx scripts/build-resonanzen-index.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callClaude, getClaudeModel, getLastClaudeError, isClaudeAvailable } from "../server/lib/claudeClient.js";
import { getKeys } from "../server/lib/embeddingClient.js";
import { callGemini, getLastGeminiError, resolveThinkingBudget } from "../server/lib/geminiText.js";
import {
  ERKENNTNIS_DISTILL_SYSTEM,
  MASTER_SYNTHESIS_SYSTEM,
  buildSynthesisUserPrompt,
} from "../server/lib/insightPrompts.js";
import { parseFrontmatter, extractFrageAntwort } from "./lib/frontmatter.js";
import {
  cleanKernsatz,
  contentHashFor,
  freshMasterFm,
  masterIdForAnchor,
  masterRelPath,
  planKernsatzCandidates,
  planMaster,
  renderMasterMarkdown,
  synthesisShapeOk,
  voiceViolations,
  type KernsatzCandidate,
  type KernsatzDraftRef,
} from "./lib/insightRegen.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const ERKENNTNISSE = path.join(ROOT, "client/public/resonanzen-erkenntnisse.json");
const CANDIDATES = path.join(ROOT, "client/public/resonanzen-erkenntnis-candidates.json");
const DRAFTS = path.join(ROOT, "client/public/resonanzen-erkenntnis-drafts.json");
const EMBEDDING_REFRESH = path.join(ROOT, "client/public/resonanzen-embedding-refresh.json");
const REPORT = path.join(ROOT, "regenerate-erkenntnisse-report.json");
const MIN_NEW = positiveInt(process.env.ERKENNTNIS_MIN_NEW_VARIANTS, 2);
const CANDIDATE_LIMIT = positiveInt(process.env.ERKENNTNIS_CANDIDATE_LIMIT, 8);

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

const DISTILL_MODEL = process.env.PRESCORE_MODEL?.trim() || "gemini-2.5-pro";
const SYNTH_MODEL = process.env.SYNTHESIS_MODEL?.trim() || "gemini-2.5-pro";

function llmBackend(): "gemini" | "claude" {
  if (getKeys().length > 0) return "gemini";
  if (isClaudeAvailable()) return "claude";
  return "gemini";
}

/** Gemini, und wenn kein Key da ist der im Repo hinterlegte Claude-Fallback. */
async function callText(opts: {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  geminiModel: string;
  thinkingBudget?: number;
}): Promise<{ text: string | null; model: string; error: string | null }> {
  if (getKeys().length > 0) {
    const text = await callGemini({
      system: opts.system,
      user: opts.user,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      model: opts.geminiModel,
      // Pro lehnt 0 ab; Flash darf 0. callGemini legt das Denk-Budget über
      // outputTokenBudget auf das Ausgabe-Budget, damit die Prosa bleibt.
      thinkingBudget: resolveThinkingBudget(opts.geminiModel, opts.thinkingBudget ?? 0),
    });
    return { text, model: opts.geminiModel, error: text ? null : getLastGeminiError() };
  }
  const text = await callClaude({
    system: opts.system,
    user: opts.user,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
  });
  return { text, model: getClaudeModel(), error: text ? null : getLastClaudeError() };
}

interface ErkenntnisRecord {
  id: string;
  kernsatz: string;
  questionSourceId: string;
  answerId: string;
  conceptAnchor: string | null;
  masterAnchor?: string | null;
  distinctness: number;
  createdAt: string;
  actor: string;
  redistilledAt?: string;
  distilledModel?: string;
}

interface CorpusDoc {
  filePath: string;
  fmRaw: string;
  id: string;
  ts: string;
  endpoint: string;
  anchor: string;
  isMaster: boolean;
  prompt: string;
  response: string;
}

function isBilling(err: string | null): boolean {
  if (!err) return false;
  return /402|billing|prepayment|depleted|RESOURCE_EXHAUSTED|PERMISSION_DENIED|dunning/i.test(err);
}

function walkMd(dir: string): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkMd(abs));
    else if (ent.name.endsWith(".md") && ent.name !== "README.md") out.push(abs);
  }
  return out;
}

function loadCorpus(): CorpusDoc[] {
  const docs: CorpusDoc[] = [];
  for (const filePath of walkMd(path.join(ROOT, "content/resonanzen"))) {
    const raw = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) continue;
    const { fm, body } = parseFrontmatter(raw);
    const { prompt, response } = extractFrageAntwort(body);
    if (!fm.id || !fm.endpoint) continue;
    docs.push({
      filePath,
      fmRaw: m[1],
      id: String(fm.id),
      ts: String(fm.ts ?? ""),
      endpoint: String(fm.endpoint),
      anchor: String(fm.anchor ?? ""),
      isMaster: fm.is_master === true || fm.is_master === "true",
      prompt,
      response,
    });
  }
  return docs;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function distillKernsatz(response: string): Promise<{ kernsatz: string; model: string }> {
  let last = "keine Antwort";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { text, model, error } = await callText({
      system: ERKENNTNIS_DISTILL_SYSTEM,
      user: response.slice(0, 6000),
      maxTokens: 2048,
      temperature: attempt === 1 ? 0.3 : 0.5,
      geminiModel: DISTILL_MODEL,
      thinkingBudget: 512,
    });
    if (!text) {
      if (isBilling(error)) throw new Error(`LLM-Guthaben oder Berechtigung: ${error}`);
      last = error ?? "leere Antwort";
      await sleep(2000);
      continue;
    }
    const kern = cleanKernsatz(text);
    const violations = voiceViolations(kern);
    const words = kern.split(/\s+/).filter(Boolean).length;
    if (violations.length === 0 && words >= 8 && (words <= 45 || attempt === 3)) return { kernsatz: kern, model };
    last = violations.length
      ? `Stimme: ${violations.join(", ")} — ${kern.slice(0, 180)}`
      : `Länge ${words} — ${kern.slice(0, 180)}`;
    await sleep(800);
  }
  throw new Error(last);
}

function stripFence(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  return (m ? m[1] : t).trim();
}

async function synthesizeMaster(
  variants: Array<{ id: string; ts: string; prompt: string; response: string }>,
): Promise<{ text: string; model: string }> {
  const user = buildSynthesisUserPrompt(variants, null);
  let last = "keine Antwort";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { text, model, error } = await callText({
      system: MASTER_SYNTHESIS_SYSTEM,
      user,
      maxTokens: 8192,
      temperature: 0.7,
      geminiModel: SYNTH_MODEL,
      thinkingBudget: resolveThinkingBudget(SYNTH_MODEL, 0),
    });
    if (!text) {
      if (isBilling(error)) throw new Error(`LLM-Guthaben oder Berechtigung: ${error}`);
      last = error ?? "leere Antwort";
      await sleep(3000);
      continue;
    }
    const body = stripFence(text);
    if (synthesisShapeOk(body)) return { text: body, model };
    const violations = voiceViolations(body);
    last = violations.length
      ? `Stimme/Schluss: ${violations.join(", ")}`
      : "Format: ## Synthese und ## Offene Frage fehlen oder der Schluss bricht ab";
    last += ` — Ende: ${body.slice(-120).replace(/\s+/g, " ")}`;
    await sleep(1200);
  }
  throw new Error(last);
}

/** Markiert Master-IDs zum Neu-Einbetten. Die 18-MB-Datei bleibt; der nächste
 *  Build mit Gemini-Key verwirft genau diese Vektoren (sie stammen noch aus
 *  der leeren Antwort) und rechnet sie aus dem neuen Text. */
function dropMasterEmbeddings(ids: string[]): number {
  fs.writeFileSync(EMBEDDING_REFRESH, JSON.stringify(ids, null, 2) + "\n");
  return ids.length;
}

interface DraftRecord extends KernsatzDraftRef {
  id: string;
  questionSourceId: string;
  kernsatz: string;
  conceptAnchor: string | null;
  distinctness: number;
  distilledAt: string;
  distilledModel: string;
}

interface Report {
  generatedAt: string;
  changed: boolean;
  needsIndexRebuild: boolean;
  minNewVariants: number;
  distillModel: string;
  synthesisModel: string;
  distilled: number;
  synthesized: number;
  skippedMasters: number;
  embeddingsDropped: number;
  failures: Array<{ id: string; error: string }>;
  kernsatz: Array<{ id: string; words: number; text: string }>;
  masters: Array<{ id: string; anchor: string; action: "create" | "update"; chars: number; ending: string }>;
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function anchorKey(endpoint: string, anchor: string): string {
  return `${endpoint}\n${anchor}`;
}

function masterOfIds(doc: CorpusDoc): string[] {
  const raw = fs.readFileSync(doc.filePath, "utf-8");
  const { fm } = parseFrontmatter(raw);
  return Array.isArray(fm.master_of) ? fm.master_of.map(String) : [];
}

function loadCandidates(): KernsatzCandidate[] {
  const file = readJson<{ candidates?: Array<Record<string, unknown>> }>(CANDIDATES, { candidates: [] });
  const out: KernsatzCandidate[] = [];
  for (const c of file.candidates ?? []) {
    const answerId = String(c.answerId ?? "");
    if (!answerId) continue;
    const resolves = Array.isArray(c.resolves) ? c.resolves : [];
    const first = resolves[0] as { sourceId?: string } | undefined;
    out.push({
      id: String(c.id ?? answerId),
      answerId,
      questionSourceId: String(first?.sourceId ?? ""),
      conceptAnchor: c.conceptAnchor == null ? null : String(c.conceptAnchor),
      distinctness: typeof c.distinctness === "number" ? c.distinctness : 0,
    });
  }
  return out;
}

async function main(): Promise<void> {
  const corpus = loadCorpus();
  const byId = new Map(corpus.map(d => [d.id, d]));
  const variantsByAnchor = new Map<string, CorpusDoc[]>();
  const masterByAnchor = new Map<string, CorpusDoc>();
  for (const doc of corpus) {
    const key = anchorKey(doc.endpoint, doc.anchor);
    if (doc.isMaster) masterByAnchor.set(key, doc);
    else if (doc.response.trim()) {
      const list = variantsByAnchor.get(key) ?? [];
      list.push(doc);
      variantsByAnchor.set(key, list);
    }
  }

  const keys = new Set<string>([...variantsByAnchor.keys(), ...masterByAnchor.keys()]);
  const masterPlans = [...keys].map(key => {
    const [endpoint, anchor] = key.split("\n");
    const variants = (variantsByAnchor.get(key) ?? []).sort((a, b) => a.ts.localeCompare(b.ts));
    const master = masterByAnchor.get(key);
    const plan = planMaster({
      endpoint,
      anchor,
      variantIds: variants.map(v => v.id),
      masterOf: master ? masterOfIds(master) : null,
      minNew: MIN_NEW,
    });
    return { endpoint, anchor, variants, master, plan };
  });

  const erkFile = readJson<{ erkenntnisse?: ErkenntnisRecord[] }>(ERKENNTNISSE, { erkenntnisse: [] });
  const confirmed = new Set((erkFile.erkenntnisse ?? []).map(e => e.answerId));
  const draftFile = readJson<{ drafts?: DraftRecord[] }>(DRAFTS, { drafts: [] });
  const drafts = draftFile.drafts ?? [];
  const answerHashById = new Map<string, string>();
  for (const doc of corpus) {
    if (!doc.isMaster && doc.response.trim()) answerHashById.set(doc.id, contentHashFor(doc.prompt, doc.response));
  }
  const kernPlans = planKernsatzCandidates({
    candidates: loadCandidates(),
    confirmedAnswerIds: confirmed,
    drafts,
    answerHashById,
    limit: CANDIDATE_LIMIT,
  });
  const dueMasters = masterPlans.filter(p => p.plan.action !== "skip");
  console.log(`[regenerate-erkenntnisse] fällig: ${kernPlans.length} Kernsatz-Kandidaten, ${dueMasters.length} Master, übersprungen ${masterPlans.length - dueMasters.length}, Backend=${llmBackend()}`);
  for (const p of masterPlans) {
    if (p.plan.action === "skip") continue;
    console.log(`[plan] ${p.plan.action} ${p.anchor} neu=${p.plan.newIds.length} varianten=${p.plan.variantIds.length}`);
  }

  const failures: Report["failures"] = [];
  const distilled: DraftRecord[] = [];
  const synthesized: Array<{
    id: string;
    endpoint: string;
    anchor: string;
    filePath: string;
    fmRaw: string;
    text: string;
    model: string;
    variantIds: string[];
    action: "create" | "update";
  }> = [];

  if (kernPlans.length === 0 && dueMasters.length === 0) {
    const report = emptyReport(failures, masterPlans.length);
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log("[regenerate-erkenntnisse] nichts geändert");
    return;
  }
  if (process.argv.includes("--plan")) {
    const report = emptyReport(failures, masterPlans.filter(p => p.plan.action === "skip").length);
    report.distilled = kernPlans.length;
    report.synthesized = dueMasters.length;
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    return;
  }
  if (getKeys().length === 0 && !isClaudeAvailable()) {
    throw new Error("Kein GEMINI_API_KEY / GEMINI_API_KEYS / GEMINI_API_KEY_FALLBACK und kein ANTHROPIC_API_KEY");
  }

  let billing = false;
  for (let i = 0; i < kernPlans.length; i++) {
    const c = kernPlans[i];
    const doc = byId.get(c.answerId);
    if (!doc?.response.trim()) {
      console.log(`[distill ${i + 1}/${kernPlans.length}] ${c.id} ohne Antwort im Korpus, übersprungen`);
      continue;
    }
    try {
      const kern = await distillKernsatz(doc.response);
      distilled.push({
        id: c.id,
        answerId: c.answerId,
        questionSourceId: c.questionSourceId,
        kernsatz: kern.kernsatz,
        conceptAnchor: c.conceptAnchor,
        distinctness: c.distinctness,
        distilledAt: new Date().toISOString(),
        distilledModel: kern.model,
        sourceHash: answerHashById.get(c.answerId),
      });
      console.log(`[distill ${i + 1}/${kernPlans.length}] ${c.id} (${kern.kernsatz.split(/\s+/).length} Wörter) ${kern.kernsatz}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ id: c.id, error: msg });
      console.error(`[distill ${i + 1}/${kernPlans.length}] ${c.id} ${msg}`);
      if (isBilling(msg)) { billing = true; break; }
    }
    await sleep(400);
  }

  if (!billing) {
    for (let i = 0; i < dueMasters.length; i++) {
      const item = dueMasters[i];
      const variants = item.variants.map(d => ({ id: d.id, ts: d.ts, prompt: d.prompt, response: d.response }));
      try {
        console.log(`[synth ${i + 1}/${dueMasters.length}] ${item.plan.action} ${item.anchor} aus ${variants.length} Varianten (${item.plan.newIds.length} neu) …`);
        const text = await synthesizeMaster(variants);
        const action = item.plan.action === "create" ? "create" : "update";
        const filePath = item.master?.filePath ?? path.join(ROOT, masterRelPath(item.endpoint, item.anchor));
        synthesized.push({
          id: item.master?.id ?? masterIdForAnchor(item.anchor),
          endpoint: item.endpoint,
          anchor: item.anchor,
          filePath,
          fmRaw: item.master?.fmRaw ?? freshMasterFm({ endpoint: item.endpoint, anchor: item.anchor, now: new Date().toISOString() }),
          text: text.text,
          model: text.model,
          variantIds: item.plan.variantIds,
          action,
        });
        console.log(`[synth ${i + 1}/${dueMasters.length}] ${item.anchor} ${text.text.length} Zeichen`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push({ id: item.anchor, error: msg });
        console.error(`[synth ${i + 1}/${dueMasters.length}] ${item.anchor} ${msg}`);
        if (isBilling(msg)) { billing = true; break; }
      }
    }
  }

  const now = new Date().toISOString();
  if (distilled.length > 0) {
    const byAnswer = new Map(drafts.map(d => [d.answerId, d]));
    for (const d of distilled) byAnswer.set(d.answerId, d);
    fs.mkdirSync(path.dirname(DRAFTS), { recursive: true });
    fs.writeFileSync(DRAFTS, JSON.stringify({
      generatedAt: now,
      drafts: [...byAnswer.values()].sort((a, b) => a.id.localeCompare(b.id)),
    }, null, 2) + "\n");
  }
  for (const s of synthesized) {
    const md = renderMasterMarkdown({
      fmRaw: s.fmRaw,
      now,
      variantIds: s.variantIds,
      synthesisText: s.text,
      model: s.model,
      event: s.action === "create" ? "synthesized" : "re-synthesized",
    });
    fs.mkdirSync(path.dirname(s.filePath), { recursive: true });
    fs.writeFileSync(s.filePath, md);
  }

  const report: Report = {
    ...emptyReport(failures, masterPlans.filter(p => p.plan.action === "skip").length),
    changed: distilled.length > 0 || synthesized.length > 0,
    needsIndexRebuild: synthesized.length > 0,
    distillModel: distilled[0]?.distilledModel ?? DISTILL_MODEL,
    synthesisModel: synthesized[0]?.model ?? SYNTH_MODEL,
    distilled: distilled.length,
    synthesized: synthesized.length,
    embeddingsDropped: synthesized.length > 0 ? dropMasterEmbeddings(synthesized.map(s => s.id)) : 0,
    kernsatz: distilled.map(d => ({
      id: d.id,
      words: d.kernsatz.split(/\s+/).filter(Boolean).length,
      text: d.kernsatz,
    })),
    masters: synthesized.map(s => ({
      id: s.id,
      anchor: s.anchor,
      action: s.action,
      chars: s.text.length,
      ending: s.text.trim().slice(-90).replace(/\s+/g, " "),
    })),
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(`[regenerate-erkenntnisse] geschrieben: ${distilled.length} Entwürfe, ${synthesized.length} Master, geändert=${report.changed}`);
  if (billing && distilled.length === 0 && synthesized.length === 0) {
    throw new Error(`LLM-Guthaben oder Berechtigung, nichts geschrieben. ${failures.length} Fehler.`);
  }
  if ((kernPlans.length > 0 || dueMasters.length > 0) && distilled.length === 0 && synthesized.length === 0 && failures.length > 0) {
    throw new Error(`Nichts geschrieben. ${failures.length} Fehler.`);
  }
}

function emptyReport(failures: Report["failures"], skippedMasters: number): Report {
  return {
    generatedAt: new Date().toISOString(),
    changed: false,
    needsIndexRebuild: false,
    minNewVariants: MIN_NEW,
    distillModel: DISTILL_MODEL,
    synthesisModel: SYNTH_MODEL,
    distilled: 0,
    synthesized: 0,
    skippedMasters,
    embeddingsDropped: 0,
    failures,
    kernsatz: [],
    masters: [],
  };
}


main().catch(err => {
  console.error(`[regenerate-erkenntnisse] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
