/**
 * auto-curate.ts — CLI-Wrapper um /api/admin/auto-curate.
 *
 * Skaliert den `raw → approved/rejected`-Schritt sicher: das Gate ist
 * server-autoritativ (ai_score + corpusVoiceScore + conceptVoiceScore +
 * werkVoiceScore, Schwellen via AUTO_CURATE_*-ENV). Dieses Skript ist nur der
 * bequeme Terminal-Zugang — identische Logik wie das /admin-Panel.
 *
 * SICHER per Default: `preview` ist read-only (zeigt die Klassifikation, ändert
 * nichts). Mutiert NUR mit `--apply` — dann werden fehlende ai_scores zuerst per
 * Claude nachbewertet, danach approve/reject gesetzt (audit_trail actor
 * "auto-curate"). BEIDE Modi brauchen ADMIN_TOKEN (Endpoint ist token-gated).
 *
 * Aufrufe:
 *   ADMIN_TOKEN=… pnpm tsx scripts/auto-curate.ts                  # preview (read-only), limit 50
 *   ADMIN_TOKEN=… pnpm tsx scripts/auto-curate.ts --limit 200      # preview, mehr Kandidaten
 *   ADMIN_TOKEN=… pnpm tsx scripts/auto-curate.ts --apply --limit 25
 *   ADMIN_TOKEN=… pnpm tsx scripts/auto-curate.ts --apply --no-reject  # NUR approves anwenden
 *   ADMIN_TOKEN=… pnpm tsx scripts/auto-curate.ts --apply --rescore --limit 10  # Alt-Scores neu bewerten
 *   ADMIN_TOKEN=… pnpm tsx scripts/auto-curate.ts --apply --score-only --rescore --limit 25  # nur bewerten, Verteilung sehen
 *   ADMIN_TOKEN=… pnpm tsx scripts/auto-curate.ts --apply --score-only --limit 20 --offset 40  # Pool-Fenster 40–60
 *
 * --offset N / --limit M: fenstern den raw/pending-Pool (Fenster N…N+M), damit
 * lange Pools in mehreren kurzen Requests durchgearbeitet werden — vermeidet
 * Render-Timeouts bei vielen langsamen Thinking-Modell-Calls.
 *
 * --score-only: bewertet (schreibt ai_scores) + zeigt die Klassifikation/
 * Verteilung, ändert aber KEINEN Status — gefahrloses Beobachten der Richter-
 * Verteilung vor dem bewussten Apply.
 *
 * --no-reject (approve-only): wendet beim Apply nur Freigaben an; die
 * Reject-Klassifikation bleibt sichtbar, aber Borderline-Einträge (z. B.
 * werknah, aber ai_score niedrig) bleiben `raw` für die manuelle Sichtung.
 *
 * --rescore: bewertet beim Apply zusätzlich Einträge neu, deren ai_score von
 * einem ANDEREN Richter stammt (Skalen-Kohärenz — z.B. alte claude-sonnet-4-5-
 * Scores unter dem aktuellen gemini-2.5-pro neu bewerten). Ohne Flag bleiben
 * bewertete Einträge unangetastet.
 *
 * Env:
 *   ADMIN_TOKEN  (Pflicht) — der Admin-Bearer-Token
 *   API_BASE     (optional) — Default https://digitale-transformation-ebook.onrender.com
 */
const API_BASE = process.env.API_BASE ?? "https://digitale-transformation-ebook.onrender.com";
const APPLY = process.argv.includes("--apply");
const NO_REJECT = process.argv.includes("--no-reject");
const RESCORE = process.argv.includes("--rescore");
// --score-only: bewertet (schreibt ai_scores), ändert aber KEINEN Status —
// zum gefahrlosen Beobachten der Richter-Verteilung vor dem bewussten Apply.
const SCORE_ONLY = process.argv.includes("--score-only");

function argNum(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) { const n = parseInt(process.argv[i + 1], 10); if (!Number.isNaN(n)) return n; }
  const eq = process.argv.find(a => a.startsWith(`${flag}=`));
  if (eq) { const n = parseInt(eq.split("=")[1], 10); if (!Number.isNaN(n)) return n; }
  return fallback;
}
const LIMIT = Math.min(Math.max(1, argNum("--limit", 50)), 200);
const OFFSET = Math.max(0, argNum("--offset", 0));

interface ClassifiedEntry {
  id: string; decision: string; reason: string; prompt: string;
  ai_score: number | null; corpusVoiceScore: number | null;
  conceptVoiceScore: number | null; werkVoiceScore: number | null;
}
interface AutoCurateResponse {
  mode: string;
  poolSize?: number;
  offset?: number;
  candidateCount: number;
  counts: { approve: number; reject: number; review: number };
  unscored: number;
  scored: number;
  rescored?: number;
  judgeModel?: string;
  approve: ClassifiedEntry[]; reject: ClassifiedEntry[]; review: ClassifiedEntry[];
  applied?: Array<{ id: string; to: string; ok: boolean; error?: string }>;
  skipReject?: boolean;
  scoreOnly?: boolean;
}

const fmt = (n: number | null) => (typeof n === "number" ? n.toFixed(2) : "–");
function sample(label: string, arr: ClassifiedEntry[]): void {
  if (!arr?.length) return;
  console.log(`  ${label} (${arr.length}):`);
  for (const c of arr.slice(0, 8)) {
    console.log(`    ${c.id}  ai:${c.ai_score ?? "–"} cv:${fmt(c.corpusVoiceScore)} cn:${fmt(c.conceptVoiceScore)} wv:${fmt(c.werkVoiceScore)}  — ${c.reason}`);
  }
  if (arr.length > 8) console.log(`    … +${arr.length - 8} weitere`);
}

async function main() {
  const token = process.env.ADMIN_TOKEN;
  if (!token) { console.error("[auto-curate] ADMIN_TOKEN fehlt — Abbruch."); process.exit(1); }
  const mode = APPLY ? "apply" : "preview";

  const tags = [APPLY && SCORE_ONLY ? "score-only" : null, APPLY && NO_REJECT && !SCORE_ONLY ? "approve-only" : null, APPLY && RESCORE ? "rescore-stale" : null].filter(Boolean);
  console.log(`[auto-curate] mode=${mode} · limit=${LIMIT}${tags.length ? " · " + tags.join(" · ") : ""} · ${API_BASE}`);
  const r = await fetch(`${API_BASE}/api/admin/auto-curate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mode, limit: LIMIT, offset: OFFSET, ...(NO_REJECT ? { skipReject: true } : {}), ...(RESCORE ? { rescore: true } : {}), ...(SCORE_ONLY ? { scoreOnly: true } : {}) }),
  });
  const data = await r.json().catch(() => ({})) as AutoCurateResponse & { error?: string };
  if (!r.ok) { console.error(`[auto-curate] HTTP ${r.status}:`, data.error ?? data); process.exit(1); }

  const window = data.poolSize != null ? ` [Fenster ${data.offset ?? 0}–${(data.offset ?? 0) + data.candidateCount} von ${data.poolSize}]` : "";
  console.log(
    `[auto-curate] ${data.candidateCount} Kandidaten${window} · ` +
    `approve ${data.counts.approve} · reject ${data.counts.reject} · review ${data.counts.review}`,
  );
  // Score-Histogramm über ALLE klassifizierten — zeigt die Richter-Trennschärfe
  // (z.B. ob gemini-pro pauschal 5 vergibt oder differenziert).
  {
    const all = [...data.approve, ...data.reject, ...data.review];
    const hist: Record<string, number> = { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0, "—": 0 };
    for (const c of all) hist[c.ai_score == null ? "—" : String(c.ai_score)]++;
    console.log(`[auto-curate] ai_score-Verteilung: 5:${hist["5"]} 4:${hist["4"]} 3:${hist["3"]} 2:${hist["2"]} 1:${hist["1"]} · ohne:${hist["—"]}`);
  }
  if (mode === "preview" && data.unscored > 0) {
    console.log(`[auto-curate] ${data.unscored} ohne ai_score → bei --apply werden sie zuerst pre-gescored (${data.judgeModel ?? "LLM"}) und dann erst entschieden.`);
  }
  sample("approve", data.approve);
  sample("reject", data.reject);

  if (mode === "apply") {
    const ok = (data.applied ?? []).filter(a => a.ok).length;
    const fail = (data.applied ?? []).length - ok;
    console.log(`\n[auto-curate] FERTIG — ${ok} angewandt, ${fail} fehlgeschlagen (${data.scored} frisch bewertet${data.rescored ? `, ${data.rescored} neu bewertet [${data.judgeModel}]` : ""}).`);
    if (data.scoreOnly) console.log(`[auto-curate] score-only: NUR bewertet, KEIN Status geändert. ${data.counts.approve} würden bei echtem --apply approved. Verteilung oben prüfen, dann bewusst applyen.`);
    else if (data.skipReject) console.log(`[auto-curate] approve-only: ${data.counts.reject} Rejects NICHT angewandt — bleiben raw für manuelle Sichtung.`);
    if (fail > 0) console.log("[auto-curate] Fehler:", (data.applied ?? []).filter(a => !a.ok).slice(0, 5));
  } else {
    console.log("\n[auto-curate] PREVIEW — nichts geändert. Mit `--apply` (und ADMIN_TOKEN) ausführen.");
  }
}

main().catch(err => { console.error("[auto-curate] FAILED:", err instanceof Error ? err.stack : err); process.exit(1); });
