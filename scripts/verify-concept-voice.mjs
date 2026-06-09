/**
 * verify-concept-voice.mjs — beweist + kalibriert den Begriffs-Anker
 * (conceptVoiceScore) lokal aus den committeten Embeddings.
 *
 * conceptVoiceScore = max Cosine eines Eintrag-Embeddings zu allen
 * Begriffs-Embeddings (concepts-embeddings.json). Parallel zu corpusVoiceScore
 * (max Cosine zum Buchtext), aber gegen die BEGRIFFSSTRUKTUR statt die Prosa.
 *
 * Zweck: zeigen, dass der Anker diskriminiert (Verteilung) UND dass er sich
 * von corpusVoiceScore UNTERSCHEIDET (sonst wäre er redundant). Nur Lesen +
 * Drucken — schreibt nichts.
 *
 * Lauf: node scripts/verify-concept-voice.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf-8"));

const concepts = read("client/public/concepts-embeddings.json").embeddings;
const entryEmb = read("client/public/resonanzen-embeddings.json").embeddings;
const index = read("client/public/resonanzen-index.json");

const conceptIds = Object.keys(concepts);
const conceptVecs = conceptIds.map((id) => concepts[id]);
console.log(`Begriffe: ${conceptIds.length} · Eintrag-Embeddings: ${Object.keys(entryEmb).length} · Index-Einträge: ${index.entries.length}`);

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

const rows = [];
for (const e of index.entries) {
  const v = entryEmb[e.id];
  if (!v) continue;
  let best = 0, bestId = null;
  for (let i = 0; i < conceptVecs.length; i++) {
    const c = cosine(v, conceptVecs[i]);
    if (c > best) { best = c; bestId = conceptIds[i]; }
  }
  rows.push({ id: e.id, prompt: (e.prompt ?? "").slice(0, 60), cn: best, anchor: bestId, cv: e.corpusVoiceScore });
}

const cns = rows.map((r) => r.cn).sort((a, b) => a - b);
const q = (p) => cns[Math.floor(p * (cns.length - 1))];
console.log(`\nconceptVoiceScore über ${rows.length} Einträge:`);
console.log(`  min ${cns[0].toFixed(3)} · p25 ${q(0.25).toFixed(3)} · median ${q(0.5).toFixed(3)} · p75 ${q(0.75).toFixed(3)} · max ${cns[cns.length - 1].toFixed(3)} · mean ${(cns.reduce((s, x) => s + x, 0) / cns.length).toFixed(3)}`);

// Diskriminiert er ANDERS als corpusVoiceScore? Korrelation grob via Rangdivergenz.
const withCv = rows.filter((r) => typeof r.cv === "number");
if (withCv.length > 5) {
  const diffs = withCv.map((r) => r.cn - r.cv);
  const md = diffs.slice().sort((a, b) => a - b)[Math.floor(diffs.length / 2)];
  console.log(`\nconcept vs corpus (n=${withCv.length}): median(conceptVoice - corpusVoice) = ${md.toFixed(3)}`);
  // Einträge, wo die Anker DIVERGIEREN (concept-nah aber buch-fern) — genau die,
  // die der reine Buch-Anker fälschlich als Drift abtun würde.
  const divergent = withCv.filter((r) => r.cn - r.cv > 0.1).sort((a, b) => (b.cn - b.cv) - (a.cn - a.cv)).slice(0, 5);
  console.log(`\nDivergente (begriffs-nah, prosa-ferner) — die der Begriffs-Anker rettet:`);
  for (const r of divergent) console.log(`  cn ${r.cn.toFixed(2)} cv ${(r.cv ?? 0).toFixed(2)} [${r.anchor}] ${r.prompt}`);
}

console.log(`\nTop 5 begriffs-nah:`);
for (const r of rows.slice().sort((a, b) => b.cn - a.cn).slice(0, 5)) console.log(`  ${r.cn.toFixed(3)} [${r.anchor}] ${r.prompt}`);
console.log(`\nUnterste 5 (begriffs-fern → Drift-Verdacht):`);
for (const r of rows.slice().sort((a, b) => a.cn - b.cn).slice(0, 5)) console.log(`  ${r.cn.toFixed(3)} [${r.anchor}] ${r.prompt}`);
