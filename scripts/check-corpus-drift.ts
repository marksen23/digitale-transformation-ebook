/**
 * check-corpus-drift.ts — vergleicht aktuellen Snapshot mit dem letzten
 * stabilen Stand und meldet bedenkliche Veränderungen.
 *
 * Liest alle versions/snapshot-*.json, sortiert nach Datum, vergleicht
 * den neuesten mit dem zweitneuesten. Schreibt einen Drift-Report nach
 * client/public/resonanzen-drift-report.json. Exit-Code 1 bei Drift,
 * 0 bei normaler Variation.
 *
 * Drift-Regeln:
 *   - filesChecked monoton: Abnahme um >2 oder >5% → Drift
 *   - byEndpoint: kein Endpoint schrumpft um >30% absolut
 *   - byStatus: published darf nicht plötzlich schrumpfen (>0)
 *   - Wachstum ist immer OK
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const VERSIONS_DIR = path.join(ROOT, "versions");
const REPORT_OUTPUT = path.join(ROOT, "client/public/resonanzen-drift-report.json");

interface Snapshot {
  date: string;
  generatedAt: string;
  commit: string;
  filesChecked: number;
  aggregates: {
    byEndpoint: Record<string, number>;
    byStatus: Record<string, number>;
    orphanNodeIds: string[];
  };
  errors: number;
  warnings: number;
}

interface DriftIssue {
  level: "warning" | "alarm";
  rule: string;
  detail: string;
}

function loadSnapshots(): Snapshot[] {
  if (!fs.existsSync(VERSIONS_DIR)) return [];
  const files = fs.readdirSync(VERSIONS_DIR)
    .filter(f => f.startsWith("snapshot-") && f.endsWith(".json"))
    .sort();
  return files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(VERSIONS_DIR, f), "utf-8")); }
    catch { return null; }
  }).filter((s): s is Snapshot => s !== null);
}

function compareCounts(label: string, before: Record<string, number>, after: Record<string, number>): DriftIssue[] {
  const issues: DriftIssue[] = [];
  for (const key of Object.keys(before)) {
    const b = before[key], a = after[key] ?? 0;
    const delta = a - b;
    const ratio = b > 0 ? Math.abs(delta) / b : 0;
    if (delta < 0 && ratio > 0.3) {
      issues.push({
        level: ratio > 0.5 ? "alarm" : "warning",
        rule: `${label}-shrink`,
        detail: `${key}: ${b} → ${a} (-${Math.abs(delta)}, ${(ratio * 100).toFixed(0)}%)`,
      });
    }
  }
  return issues;
}

function detectDrift(prev: Snapshot, curr: Snapshot): DriftIssue[] {
  const issues: DriftIssue[] = [];

  // 1. Files-Total
  const fileDelta = curr.filesChecked - prev.filesChecked;
  if (fileDelta < -2) {
    const ratio = prev.filesChecked > 0 ? Math.abs(fileDelta) / prev.filesChecked : 0;
    issues.push({
      level: ratio > 0.05 ? "alarm" : "warning",
      rule: "files-shrink",
      detail: `filesChecked: ${prev.filesChecked} → ${curr.filesChecked} (${fileDelta})`,
    });
  }

  // 2. Endpoint-Verteilung
  issues.push(...compareCounts("endpoint", prev.aggregates.byEndpoint, curr.aggregates.byEndpoint));

  // 3. Status-Verteilung — published darf nie schrumpfen
  const prevPub = prev.aggregates.byStatus.published ?? 0;
  const currPub = curr.aggregates.byStatus.published ?? 0;
  if (currPub < prevPub) {
    issues.push({
      level: "alarm",
      rule: "published-shrink",
      detail: `published-Einträge geschrumpft: ${prevPub} → ${currPub} — kuratiertes Korpus sollte nie kleiner werden`,
    });
  }
  issues.push(...compareCounts("status", prev.aggregates.byStatus, curr.aggregates.byStatus));

  // 4. Wachstum: monotones Wachsen ist immer OK, kein Drift
  return issues;
}

function main() {
  const snapshots = loadSnapshots();
  console.log(`[check-corpus-drift] ${snapshots.length} snapshots found`);

  if (snapshots.length < 2) {
    console.log("[check-corpus-drift] need >=2 snapshots for comparison — no drift check possible yet");
    fs.mkdirSync(path.dirname(REPORT_OUTPUT), { recursive: true });
    fs.writeFileSync(REPORT_OUTPUT, JSON.stringify({
      generatedAt: new Date().toISOString(),
      status: "insufficient-data",
      snapshots: snapshots.length,
      issues: [],
    }, null, 2));
    process.exit(0);
  }

  const curr = snapshots[snapshots.length - 1];
  const prev = snapshots[snapshots.length - 2];
  console.log(`[check-corpus-drift] comparing ${prev.date} → ${curr.date}`);

  const issues = detectDrift(prev, curr);
  const alarms = issues.filter(i => i.level === "alarm");
  const warnings = issues.filter(i => i.level === "warning");

  const report = {
    generatedAt: new Date().toISOString(),
    status: alarms.length > 0 ? "drift-alarm" : warnings.length > 0 ? "drift-warning" : "stable",
    previousSnapshot: { date: prev.date, commit: prev.commit, filesChecked: prev.filesChecked },
    currentSnapshot: { date: curr.date, commit: curr.commit, filesChecked: curr.filesChecked },
    delta: {
      files: curr.filesChecked - prev.filesChecked,
    },
    issues,
  };

  fs.mkdirSync(path.dirname(REPORT_OUTPUT), { recursive: true });
  fs.writeFileSync(REPORT_OUTPUT, JSON.stringify(report, null, 2));
  console.log(`[check-corpus-drift] status: ${report.status}`);

  if (alarms.length > 0) {
    console.error("\n=== DRIFT ALARMS ===");
    for (const i of alarms) console.error(`  [${i.rule}] ${i.detail}`);
    process.exit(1);
  }
  if (warnings.length > 0) {
    console.warn("\n=== DRIFT WARNINGS ===");
    for (const i of warnings) console.warn(`  [${i.rule}] ${i.detail}`);
  } else {
    console.log("[check-corpus-drift] OK — corpus stable");
  }
}

main();
