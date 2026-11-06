/**
 * regenerate-erkenntnisse.ts — erzeugt die Erkenntnisse der Seite neu.
 *
 * 1. Destilliert jeden bestätigten Kernsatz in client/public/resonanzen-erkenntnisse.json
 *    aus der aktuellen Antwort (dieselbe Prompt-Zeile wie /api/admin/distill-erkenntnis).
 * 2. Synthetisiert jede Master-Datei in content/resonanzen/master aus den aktuellen
 *    Varianten neu (dieselbe Prompt-Zeile wie /api/admin/synthesize-master), ohne den
 *    alten Mastertext einzuspeisen. Die id bleibt, damit Permalinks halten.
 * 3. Löscht die Master-Embeddings, damit der anschließende Index-Build sie aus dem
 *    neuen Text neu rechnet (Reuse ist id-basiert und würde den alten Vektor behalten).
 *
 * Braucht GEMINI_API_KEY (oder FALLBACK / GEMINI_API_KEYS). Der Workflow
 * .github/workflows/regenerate-erkenntnisse.yml setzt das Repo-Secret.
 *
 * Danach: CORPUS_SOURCE=local pnpm tsx scripts/build-resonanzen-index.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getKeys } from "../server/lib/embeddingClient.js";
import { callGemini, getLastGeminiError } from "../server/lib/geminiText.js";
import {
  ERKENNTNIS_DISTILL_SYSTEM,
  MASTER_SYNTHESIS_SYSTEM,
  buildSynthesisUserPrompt,
} from "../server/lib/insightPrompts.js";
import { parseFrontmatter, extractFrageAntwort } from "./lib/frontmatter.js";
import {
  cleanKernsatz,
  renderMasterMarkdown,
  synthesisShapeOk,
  voiceViolations,
} from "./lib/insightRegen.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const ERKENNTNISSE = path.join(ROOT, "client/public/resonanzen-erkenntnisse.json");
const EMBEDDINGS = path.join(ROOT, "client/public/resonanzen-embeddings.json");
const REPORT = path.join(ROOT, "regenerate-erkenntnisse-report.json");

const DISTILL_MODEL = process.env.PRESCORE_MODEL?.trim() || "gemini-2.5-pro";
const SYNTH_MODEL = process.env.SYNTHESIS_MODEL?.trim() || "gemini-2.5-pro";

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

async function distillKernsatz(response: string): Promise<string> {
  let last = "keine Antwort";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const text = await callGemini({
      system: ERKENNTNIS_DISTILL_SYSTEM,
      user: response.slice(0, 6000),
      maxTokens: 2048,
      temperature: attempt === 1 ? 0.3 : 0.5,
      model: DISTILL_MODEL,
      thinkingBudget: 512,
    });
    if (!text) {
      const err = getLastGeminiError();
      if (isBilling(err)) throw new Error(`Gemini-Guthaben oder Berechtigung: ${err}`);
      last = err ?? "leere Antwort";
      await sleep(2000);
      continue;
    }
    const kern = cleanKernsatz(text);
    const violations = voiceViolations(kern);
    const words = kern.split(/\s+/).filter(Boolean).length;
    if (violations.length === 0 && words >= 8 && (words <= 45 || attempt === 3)) return kern;
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
): Promise<string> {
  const user = buildSynthesisUserPrompt(variants, null);
  let last = "keine Antwort";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const text = await callGemini({
      system: MASTER_SYNTHESIS_SYSTEM,
      user,
      maxTokens: 8192,
      temperature: 0.7,
      model: SYNTH_MODEL,
      thinkingBudget: 0,
    });
    if (!text) {
      const err = getLastGeminiError();
      if (isBilling(err)) throw new Error(`Gemini-Guthaben oder Berechtigung: ${err}`);
      last = err ?? "leere Antwort";
      await sleep(3000);
      continue;
    }
    const body = stripFence(text);
    if (synthesisShapeOk(body)) return body;
    const violations = voiceViolations(body);
    last = violations.length
      ? `Stimme/Schluss: ${violations.join(", ")}`
      : "Format: ## Synthese und ## Offene Frage fehlen oder der Schluss bricht ab";
    last += ` — Ende: ${body.slice(-120).replace(/\s+/g, " ")}`;
    await sleep(1200);
  }
  throw new Error(last);
}

function dropMasterEmbeddings(ids: string[]): number {
  if (!fs.existsSync(EMBEDDINGS)) return 0;
  const data = JSON.parse(fs.readFileSync(EMBEDDINGS, "utf-8")) as { embeddings?: Record<string, number[]> };
  let n = 0;
  for (const id of ids) {
    if (data.embeddings && id in data.embeddings) {
      delete data.embeddings[id];
      n++;
    }
  }
  fs.writeFileSync(EMBEDDINGS, JSON.stringify(data, null, 2));
  return n;
}

interface Report {
  generatedAt: string;
  distillModel: string;
  synthesisModel: string;
  distilled: number;
  synthesized: number;
  embeddingsDropped: number;
  failures: Array<{ id: string; error: string }>;
  kernsatz: Array<{ id: string; words: number; text: string }>;
  masters: Array<{ id: string; anchor: string; chars: number; ending: string }>;
}

async function main(): Promise<void> {
  if (process.argv.includes("--plan")) {
    const corpus = loadCorpus();
    const byId = new Map(corpus.map(d => [d.id, d]));
    const erkFile = JSON.parse(fs.readFileSync(ERKENNTNISSE, "utf-8")) as { erkenntnisse: ErkenntnisRecord[] };
    const missing = (erkFile.erkenntnisse ?? []).filter(e => !byId.get(e.answerId)?.response.trim());
    const masters = corpus.filter(d => d.isMaster);
    for (const doc of masters) {
      const anchorBody = doc.anchor.split(":")[1] ?? doc.anchor;
      const variantDir = path.join(ROOT, "content/resonanzen/raw", doc.endpoint, anchorBody);
      const n = corpus.filter(d => !d.isMaster && d.filePath.startsWith(variantDir + path.sep) && d.response.trim()).length;
      console.log(`[plan] ${doc.id} ${doc.anchor} varianten=${n} antwort=${doc.response.length}`);
    }
    console.log(`[plan] erkenntnisse=${erkFile.erkenntnisse.length} fehlendeAntworten=${missing.length} keys=${getKeys().length}`);
    if (missing.length) console.log(missing.map(e => e.id + " " + e.answerId).join("\n"));
    return;
  }
  if (getKeys().length === 0) {
    throw new Error("Kein GEMINI_API_KEY / GEMINI_API_KEYS / GEMINI_API_KEY_FALLBACK gesetzt");
  }
  const corpus = loadCorpus();
  const byId = new Map(corpus.map(d => [d.id, d]));
  const erkFile = JSON.parse(fs.readFileSync(ERKENNTNISSE, "utf-8")) as { erkenntnisse: ErkenntnisRecord[] };
  const erkenntnisse = erkFile.erkenntnisse ?? [];
  const masters = corpus.filter(d => d.isMaster);
  console.log(`[regenerate-erkenntnisse] ${erkenntnisse.length} Erkenntnisse, ${masters.length} Master, Modell Destill=${DISTILL_MODEL} Synthese=${SYNTH_MODEL}`);

  const failures: Report["failures"] = [];
  const newKern = new Map<string, string>();

  for (let i = 0; i < erkenntnisse.length; i++) {
    const e = erkenntnisse[i];
    const doc = byId.get(e.answerId);
    if (!doc || !doc.response.trim()) {
      failures.push({ id: e.id, error: `Antwort ${e.answerId} nicht gefunden oder leer` });
      console.error(`[distill ${i + 1}/${erkenntnisse.length}] ${e.id} FEHLT ${e.answerId}`);
      continue;
    }
    try {
      const kern = await distillKernsatz(doc.response);
      newKern.set(e.id, kern);
      console.log(`[distill ${i + 1}/${erkenntnisse.length}] ${e.id} (${kern.split(/\s+/).length} Wörter) ${kern}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ id: e.id, error: msg });
      console.error(`[distill ${i + 1}/${erkenntnisse.length}] ${e.id} ${msg}`);
      if (isBilling(msg)) break;
    }
    await sleep(400);
  }

  const synthesized: Array<{ doc: CorpusDoc; text: string; variantIds: string[] }> = [];
  if (!failures.some(f => isBilling(f.error))) {
    for (let i = 0; i < masters.length; i++) {
      const doc = masters[i];
      const anchorBody = doc.anchor.split(":")[1] ?? doc.anchor;
      const variantDir = path.join(ROOT, "content/resonanzen/raw", doc.endpoint, anchorBody);
      const variants = corpus
        .filter(d => !d.isMaster && d.filePath.startsWith(variantDir + path.sep) && d.response.trim())
        .sort((a, b) => a.ts.localeCompare(b.ts))
        .map(d => ({ id: d.id, ts: d.ts, prompt: d.prompt, response: d.response }));
      if (variants.length < 2) {
        failures.push({ id: doc.id, error: `nur ${variants.length} Variante(n) unter ${variantDir}` });
        console.error(`[synth ${i + 1}/${masters.length}] ${doc.id} zu wenige Varianten`);
        continue;
      }
      try {
        console.log(`[synth ${i + 1}/${masters.length}] ${doc.anchor} aus ${variants.length} Varianten …`);
        const text = await synthesizeMaster(variants);
        synthesized.push({ doc, text, variantIds: variants.map(v => v.id) });
        console.log(`[synth ${i + 1}/${masters.length}] ${doc.id} ${text.length} Zeichen, Schluss: ${text.trim().slice(-80).replace(/\s+/g, " ")}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push({ id: doc.id, error: msg });
        console.error(`[synth ${i + 1}/${masters.length}] ${doc.id} ${msg}`);
        if (isBilling(msg)) break;
      }
    }
  }

  const report: Report = {
    generatedAt: new Date().toISOString(),
    distillModel: DISTILL_MODEL,
    synthesisModel: SYNTH_MODEL,
    distilled: newKern.size,
    synthesized: synthesized.length,
    embeddingsDropped: 0,
    failures,
    kernsatz: erkenntnisse.filter(e => newKern.has(e.id)).map(e => {
      const text = newKern.get(e.id)!;
      return { id: e.id, words: text.split(/\s+/).filter(Boolean).length, text };
    }),
    masters: synthesized.map(s => ({
      id: s.doc.id,
      anchor: s.doc.anchor,
      chars: s.text.length,
      ending: s.text.trim().slice(-90).replace(/\s+/g, " "),
    })),
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

  if (failures.length > 0 || newKern.size !== erkenntnisse.length || synthesized.length !== masters.length) {
    throw new Error(`Unvollständig: ${newKern.size}/${erkenntnisse.length} Kernsätze, ${synthesized.length}/${masters.length} Master, ${failures.length} Fehler. Nichts geschrieben.`);
  }

  const now = new Date().toISOString();
  const updated = erkenntnisse.map(e => ({
    ...e,
    kernsatz: newKern.get(e.id)!,
    redistilledAt: now,
    distilledModel: DISTILL_MODEL,
  }));
  fs.writeFileSync(ERKENNTNISSE, JSON.stringify({ generatedAt: now, erkenntnisse: updated }, null, 2) + "\n");

  for (const s of synthesized) {
    const md = renderMasterMarkdown({
      fmRaw: s.doc.fmRaw,
      now,
      variantIds: s.variantIds,
      synthesisText: s.text,
      model: SYNTH_MODEL,
    });
    fs.writeFileSync(s.doc.filePath, md);
  }
  report.embeddingsDropped = dropMasterEmbeddings(synthesized.map(s => s.doc.id));
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(`[regenerate-erkenntnisse] geschrieben: ${updated.length} Kernsätze, ${synthesized.length} Master, ${report.embeddingsDropped} Embeddings zum Neu-Rechnen freigegeben`);
}

main().catch(err => {
  console.error(`[regenerate-erkenntnisse] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
