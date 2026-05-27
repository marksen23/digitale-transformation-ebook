/**
 * Helper: findet für jede Manual-Query Kandidaten als expected_*-IDs.
 * Strategie: für jede Query 2-3 hochsignifikante Stichworte, dann pro
 * Werk-Chunk und Resonanz Score = Treffer-Anzahl × Stichwort-Gewicht.
 *
 * Output: schlägt für jede Query die top-5 Werk-Chunks + top-3 Resonanzen
 * als JSON-Block vor. Manuell ins manual-queries.json übernehmen.
 *
 * Nur kuratierte (published/approved) Resonanzen werden vorgeschlagen,
 * weil R5-Eval auch nur diese als ground-truth verwendet.
 */
import fs from "node:fs";
import path from "node:path";

interface WerkChunk { id: string; chapter: string; chapterTitle?: string; partTitle?: string; text: string; }
interface ResoEntry { id: string; status: string; prompt: string; response: string; endpoint?: string; anchor?: string; nodeIds?: string[]; }

const werkPath = path.resolve("client/public/werk-chunks.json");
const resoPath = path.resolve("client/public/resonanzen-index.json");

const werk: { chunks: WerkChunk[] } = JSON.parse(fs.readFileSync(werkPath, "utf-8"));
const reso: { entries: ResoEntry[] } = JSON.parse(fs.readFileSync(resoPath, "utf-8"));

const kuratiert = reso.entries.filter(r => r.status === "published" || r.status === "approved");

interface Spec {
  query: string;
  // Stichwörter mit Gewicht (höher = wichtiger)
  keywords: Array<[string, number]>;
}

const SPECS: Spec[] = [
  {
    query: "Was bedeutet Resonanz im Werk?",
    keywords: [["resonanz", 3], ["schwingung", 2], ["eigenfrequenz", 2], ["antwort", 1]],
  },
  {
    query: "Wie verhält sich Vernunft zur Resonanz?",
    keywords: [["resonanzvernunft", 3], ["vernunft", 2], ["resonanz", 2], ["kant", 1]],
  },
  {
    query: "Was ist die digitale Transformation aus phänomenologischer Sicht?",
    keywords: [["digital", 3], ["transformation", 3], ["phänomen", 2], ["technik", 1]],
  },
  {
    query: "Welche Rolle spielt Gilgamesch im Werk?",
    keywords: [["gilgamesch", 4], ["enkidu", 3], ["epos", 2], ["urgeschichte", 1]],
  },
  {
    query: "Wo berührt sich das Werk mit Heidegger?",
    keywords: [["heidegger", 4], ["dasein", 2], ["existenz", 1], ["sein", 1]],
  },
  {
    query: "Was ist Begegnung und was unterscheidet sie von Information?",
    keywords: [["begegnung", 3], ["information", 3], ["dazwischen", 2], ["zwischen", 1]],
  },
  {
    query: "Wie definiert das Werk Leerstelle?",
    keywords: [["leerstelle", 4], ["leere", 2], ["lücke", 2], ["öffnung", 1]],
  },
  {
    query: "Was sagt Kant über die Maschinenvernunft?",
    keywords: [["kant", 3], ["maschine", 3], ["vernunft", 2], ["kritik", 1]],
  },
];

function scoreText(text: string, keywords: Array<[string, number]>): number {
  const lower = text.toLowerCase();
  let s = 0;
  for (const [kw, weight] of keywords) {
    // Anzahl Vorkommen × Gewicht
    let count = 0;
    let idx = 0;
    while ((idx = lower.indexOf(kw, idx)) >= 0) { count++; idx += kw.length; }
    s += count * weight;
  }
  return s;
}

const output: Record<string, { werk_chunks: string[]; resonanzen: string[] }> = {};

for (const spec of SPECS) {
  const werkScored = werk.chunks
    .map(c => ({ id: c.id, s: scoreText(`${c.chapterTitle ?? ""} ${c.partTitle ?? ""} ${c.text}`, spec.keywords), preview: c.text.slice(0, 80) }))
    .filter(c => c.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);

  const resoScored = kuratiert
    .map(r => ({ id: r.id, s: scoreText(`${r.prompt} ${r.response}`, spec.keywords), preview: r.prompt.slice(0, 60) }))
    .filter(r => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);

  output[spec.query] = {
    werk_chunks: werkScored.map(c => c.id),
    resonanzen: resoScored.map(r => r.id),
  };

  console.log(`\n=== ${spec.query} ===`);
  console.log("Werk:");
  for (const c of werkScored) console.log(`  ${c.id}  score=${c.s}  · ${c.preview.replace(/\s+/g, " ")}`);
  console.log("Resonanzen:");
  for (const r of resoScored) console.log(`  ${r.id}  score=${r.s}  · ${r.preview}`);
}

console.log("\n\n=== JSON-Block für manual-queries.json ===");
console.log(JSON.stringify(output, null, 2));
