/**
 * build-corpus-timeline.ts — Tier-1-3-Roadmap, Feature I.
 *
 * Liest alle versions/snapshot-*.json + den aktuellen resonanzen-
 * index.json und erzeugt client/public/resonanzen-timeline.json:
 * eine Zeitreihe mit Status/Endpoint-Verteilung + (aus dem aktuellen
 * Index abgeleitet) Median-Werk-Voice + Echo/Novelty-Anteilen.
 *
 * Frontend-Konsument: AdminHealthPage Section „Kohärenz über Zeit".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const VERSIONS_DIR = path.join(ROOT, "versions");
const INDEX_PATH = path.join(ROOT, "client/public/resonanzen-index.json");
const OUTPUT = path.join(ROOT, "client/public/resonanzen-timeline.json");

interface SnapshotFile {
  date: string;
  generatedAt: string;
  commit?: string;
  filesChecked?: number;
  aggregates: {
    byEndpoint: Record<string, number>;
    byStatus: Record<string, number>;
    orphanNodeIds?: string[];
  };
}

interface TimelineBucket {
  date: string;             // YYYY-MM-DD
  totalEntries: number;
  byStatus: Record<string, number>;
  byEndpoint: Record<string, number>;
  publishedRatio?: number;
  // Folgendes nur für den letzten Eintrag (aus aktuellem Index)
  medianWerkVoice?: number;
  medianCorpusVoice?: number;
  echoRatio?: number;
  noveltyRatio?: number;
}

interface TimelineFile {
  generatedAt: string;
  buckets: TimelineBucket[];
  stats: {
    totalSnapshots: number;
    avgGrowthPerDay: number;
    latestEchoRatio: number | null;
    latestNoveltyRatio: number | null;
  };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function main() {
  if (!fs.existsSync(VERSIONS_DIR)) {
    console.log("[build-corpus-timeline] versions/ nicht vorhanden — schreibe leeren Timeline");
    fs.writeFileSync(OUTPUT, JSON.stringify({
      generatedAt: new Date().toISOString(),
      buckets: [],
      stats: { totalSnapshots: 0, avgGrowthPerDay: 0, latestEchoRatio: null, latestNoveltyRatio: null },
    }, null, 2));
    return;
  }

  const files = fs.readdirSync(VERSIONS_DIR)
    .filter(f => f.startsWith("snapshot-") && f.endsWith(".json"))
    .sort();

  const buckets: TimelineBucket[] = [];
  for (const f of files) {
    try {
      const snap = JSON.parse(fs.readFileSync(path.join(VERSIONS_DIR, f), "utf-8")) as SnapshotFile;
      const total = Object.values(snap.aggregates.byEndpoint).reduce((s, n) => s + n, 0);
      const published = snap.aggregates.byStatus.published ?? 0;
      buckets.push({
        date: snap.date,
        totalEntries: total,
        byStatus: snap.aggregates.byStatus,
        byEndpoint: snap.aggregates.byEndpoint,
        publishedRatio: total > 0 ? published / total : 0,
      });
    } catch (err) {
      console.warn(`[build-corpus-timeline] skip ${f}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Den aktuellen Index lesen — wenn neuer als letzter Snapshot, als
  // "heutigen" Bucket dranhängen mit voller Metric-Liste.
  if (fs.existsSync(INDEX_PATH)) {
    try {
      const idx = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as {
        generatedAt: string;
        entries: Array<{
          status?: string; endpoint?: string;
          werkVoiceScore?: number; corpusVoiceScore?: number;
          nearDuplicates?: string[]; novelty?: boolean;
        }>;
      };
      const today = idx.generatedAt.slice(0, 10);
      const byStatus: Record<string, number> = {};
      const byEndpoint: Record<string, number> = {};
      const werkVoices: number[] = [];
      const corpusVoices: number[] = [];
      let echoes = 0, novelties = 0;
      for (const e of idx.entries) {
        const st = e.status ?? "raw";
        byStatus[st] = (byStatus[st] ?? 0) + 1;
        const ep = e.endpoint ?? "unknown";
        byEndpoint[ep] = (byEndpoint[ep] ?? 0) + 1;
        if (typeof e.werkVoiceScore === "number") werkVoices.push(e.werkVoiceScore);
        if (typeof e.corpusVoiceScore === "number") corpusVoices.push(e.corpusVoiceScore);
        if (Array.isArray(e.nearDuplicates) && e.nearDuplicates.length > 0) echoes++;
        if (e.novelty) novelties++;
      }
      const total = idx.entries.length;
      const todaysBucket: TimelineBucket = {
        date: today,
        totalEntries: total,
        byStatus,
        byEndpoint,
        publishedRatio: total > 0 ? (byStatus.published ?? 0) / total : 0,
        medianWerkVoice: werkVoices.length > 0 ? median(werkVoices) : undefined,
        medianCorpusVoice: corpusVoices.length > 0 ? median(corpusVoices) : undefined,
        echoRatio: total > 0 ? echoes / total : 0,
        noveltyRatio: total > 0 ? novelties / total : 0,
      };
      // Heutigen Bucket replaceen wenn Datum gleich, sonst anfügen
      const existingIdx = buckets.findIndex(b => b.date === today);
      if (existingIdx >= 0) buckets[existingIdx] = { ...buckets[existingIdx], ...todaysBucket };
      else buckets.push(todaysBucket);
    } catch (err) {
      console.warn(`[build-corpus-timeline] index parse failed: ${err}`);
    }
  }

  buckets.sort((a, b) => a.date.localeCompare(b.date));

  // Stats
  const last = buckets[buckets.length - 1];
  let avgGrowthPerDay = 0;
  if (buckets.length >= 2) {
    const first = buckets[0];
    const days = Math.max(1, (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000);
    avgGrowthPerDay = (last.totalEntries - first.totalEntries) / days;
  }

  const out: TimelineFile = {
    generatedAt: new Date().toISOString(),
    buckets,
    stats: {
      totalSnapshots: buckets.length,
      avgGrowthPerDay: Number(avgGrowthPerDay.toFixed(2)),
      latestEchoRatio: last?.echoRatio ?? null,
      latestNoveltyRatio: last?.noveltyRatio ?? null,
    },
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));
  console.log(`[build-corpus-timeline] OK — ${buckets.length} buckets → ${OUTPUT}`);
}

main();
