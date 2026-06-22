/**
 * curation-worklist.ts — kritik-gestützte Kuratierungs-Liste.
 *
 * Hintergrund: Der LLM-Richter (gemini-2.5-pro) streut den numerischen ai_score
 * nicht (er klebt am Modalwert), TAUGT aber als Kritiker — seine Ein-Satz-
 * Schwäche (`ai_score_reason`) ist präzise. Statt auf eine unzuverlässige Zahl
 * zu auto-approven, druckt dieses Script eine skimmbare Liste: jeder raw/pending-
 * Eintrag mit seiner Schwäche-Kritik + den (unabhängigen) Voice-Scores. Du gehst
 * sie durch und gibst im /admin frei — Mensch entscheidet die Decke, kritik-
 * gestützt, ohne 96 Volltexte zu lesen.
 *
 * READ-ONLY: kein Token, keine Mutation. Liest den Live-Index von GitHub-Raw.
 *
 * Aufruf:
 *   pnpm tsx scripts/curation-worklist.ts                 # alle raw/pending
 *   pnpm tsx scripts/curation-worklist.ts --scored-only   # nur die mit Kritik
 *   pnpm tsx scripts/curation-worklist.ts --min-cv 0.7    # nur werk-nahe
 * Schreibt curation-worklist.md (lokal, NICHT committen) + Konsolen-Summary.
 */
import fs from "node:fs";

const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? "marksen23";
const REPO_NAME = process.env.GITHUB_REPO_NAME ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";
const INDEX_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/client/public/resonanzen-index.json`;
const SITE = "https://digitale-transformation-ebook.netlify.app";
const OUT = "curation-worklist.md";

const SCORED_ONLY = process.argv.includes("--scored-only");
const minCvIdx = process.argv.indexOf("--min-cv");
const MIN_CV = minCvIdx >= 0 ? parseFloat(process.argv[minCvIdx + 1] ?? "0") : 0;

interface Entry {
  id: string; endpoint: string; anchor: string; prompt: string; status: string;
  ai_score?: number; ai_score_reason?: string;
  corpusVoiceScore?: number; conceptVoiceScore?: number; werkVoiceScore?: number;
  nearDuplicates?: string[]; novelty?: boolean;
}

const f = (n?: number) => (typeof n === "number" ? n.toFixed(2) : "–");
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

async function main() {
  const res = await fetch(`${INDEX_URL}?cb=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Index laden fehlgeschlagen: ${res.status}`);
  const idx = await res.json() as { entries: Entry[] };

  let pool = idx.entries.filter(e => e.status === "raw" || e.status === "pending");
  if (SCORED_ONLY) pool = pool.filter(e => e.ai_score !== undefined);
  if (MIN_CV > 0) pool = pool.filter(e => (e.corpusVoiceScore ?? 0) >= MIN_CV);

  // Sortierung: stärkste Werk-Nähe zuerst (du siehst die aussichtsreichsten
  // Kandidaten oben), bewertete vor unbewerteten.
  pool.sort((a, b) =>
    (Number(b.ai_score !== undefined) - Number(a.ai_score !== undefined)) ||
    ((b.corpusVoiceScore ?? 0) - (a.corpusVoiceScore ?? 0)),
  );

  const scored = pool.filter(e => e.ai_score !== undefined).length;
  const rows = pool.map((e, i) => {
    const echo = e.nearDuplicates?.length ?? 0;
    const flags = [echo > 0 ? `echo×${echo}` : "", e.novelty ? "novelty" : ""].filter(Boolean).join(" ");
    const crit = e.ai_score_reason ? clip(e.ai_score_reason.replace(/\|/g, "/"), 160) : "_(noch nicht bewertet)_";
    return `| ${i + 1} | [${e.id}](${SITE}/resonanz/${e.id}) | ${e.endpoint} | ${e.ai_score ?? "–"} | ${crit} | ${f(e.corpusVoiceScore)}/${f(e.conceptVoiceScore)}/${f(e.werkVoiceScore)} | ${flags || "—"} | ${clip((e.prompt ?? "").replace(/\|/g, "/"), 60)} |`;
  });

  const md = [
    `# Kuratierungs-Liste — ${pool.length} Kandidaten (raw/pending)`,
    ``,
    `Stand: ${new Date().toLocaleString("de-DE")} · ${scored}/${pool.length} mit Kritik bewertet`,
    `Sortierung: Werk-Nähe (corpusVoiceScore) absteigend. Spalte **Schwäche** = die`,
    `Ein-Satz-Kritik des Richters — daran entscheidest du, ob der Eintrag trägt.`,
    `Scores: corpus/concept/werk-Voice (Werk-, Begriffs-, Stimme-Nähe). **Flags**:`,
    `\`echo\` = Variation eines anderen Eintrags (Vorsicht, evtl. Dublette); \`novelty\` = peripher.`,
    ``,
    `Freigeben/Ablehnen im Admin: ${SITE}/admin → Kuratierung (Inline je Eintrag).`,
    ``,
    `| # | ID | Bereich | ai | Schwäche (Kritik) | cv/cn/wv | Flags | Frage |`,
    `|---|---|---|---|---|---|---|---|`,
    ...rows,
    ``,
  ].join("\n");

  fs.writeFileSync(OUT, md, "utf-8");
  console.log(`[worklist] ${pool.length} Kandidaten (${scored} mit Kritik, ${pool.length - scored} noch unbewertet)`);
  if (pool.length - scored > 0) {
    console.log(`[worklist] Tipp: unbewertete zuerst bekritiken — pnpm tsx scripts/auto-curate.ts --apply --score-only --rescore --limit 20 (in --offset-Fenstern), dann diese Liste neu erzeugen.`);
  }
  console.log(`[worklist] geschrieben: ${OUT} (lokal — NICHT committen)`);
}

main().catch(err => { console.error("[worklist] FAILED:", err instanceof Error ? err.stack : err); process.exit(1); });
