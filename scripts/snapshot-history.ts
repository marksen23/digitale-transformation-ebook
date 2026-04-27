/**
 * snapshot-history.ts
 *
 * Generiert die drei History-Schichten aus dem aktuellen Korpus-Zustand:
 *   content/history/snapshots/<datum>.json   — Aggregat-Übersicht
 *   content/history/manifests/<datum>.jsonl  — Tages-Events
 *   content/history/ledger/<jahr>-Q<n>.jsonl — Quartals-Append-Log
 *
 * Idempotent: kann beliebig oft am selben Tag laufen.
 * Ledger ist append-only mit Dedup über Event-IDs.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const RESONANZEN_DIR = path.join(ROOT, "content", "resonanzen");
const HISTORY_DIR = path.join(ROOT, "content", "history");

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function* walkMarkdownFiles(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "README.md") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkMarkdownFiles(full);
    } else if (entry.name.endsWith(".md")) {
      yield full;
    }
  }
}

interface ParsedFrontmatter {
  id?: string;
  ts?: string;
  created_at?: string;
  endpoint?: string;
  anchor?: string;
  status?: string;
  content_hash?: string;
  nodeIds?: string[];
  audit_trail?: Array<{ event?: string; ts?: string; actor?: string; content_hash?: string }>;
}

/**
 * Minimaler Frontmatter-Parser für unser bekanntes Schema.
 * Nicht ein voller YAML-Parser — nur die Felder, die wir brauchen.
 */
function parseFrontmatter(md: string): ParsedFrontmatter {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const lines = match[1].split(/\r?\n/);
  const fm: ParsedFrontmatter = {};
  const audit: ParsedFrontmatter["audit_trail"] = [];
  let inAuditTrail = false;
  let currentAuditEntry: { event?: string; ts?: string; actor?: string; content_hash?: string } | null = null;

  for (const line of lines) {
    if (line.match(/^audit_trail:\s*$/)) {
      inAuditTrail = true;
      continue;
    }
    if (inAuditTrail && line.match(/^[a-zA-Z_]+:/)) {
      // Verlassen audit_trail, neuer top-level key
      if (currentAuditEntry) audit.push(currentAuditEntry);
      currentAuditEntry = null;
      inAuditTrail = false;
    }
    if (inAuditTrail) {
      const m = line.match(/^\s*-\s*event:\s*(.*)$/);
      if (m) {
        if (currentAuditEntry) audit.push(currentAuditEntry);
        currentAuditEntry = { event: m[1].trim() };
        continue;
      }
      const kv = line.match(/^\s+([a-zA-Z_]+):\s*(.*)$/);
      if (kv && currentAuditEntry) {
        currentAuditEntry[kv[1] as "ts" | "actor" | "content_hash"] = kv[2].trim();
        continue;
      }
    }
    // Top-level keys
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();
    // Strip Quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "nodeIds") {
      const inner = value.replace(/^\[|\]$/g, "").trim();
      fm.nodeIds = inner ? inner.split(/,\s*/).filter(Boolean) : [];
    } else if (["id", "ts", "created_at", "endpoint", "anchor", "status", "content_hash"].includes(key)) {
      (fm as Record<string, string>)[key] = value;
    }
  }
  if (currentAuditEntry) audit.push(currentAuditEntry);
  fm.audit_trail = audit;
  return fm;
}

interface ResonanzRecord {
  filePath: string;        // relativ zu ROOT
  fm: ParsedFrontmatter;
}

function loadAllResonanzen(): ResonanzRecord[] {
  const records: ResonanzRecord[] = [];
  for (const file of walkMarkdownFiles(RESONANZEN_DIR)) {
    const md = fs.readFileSync(file, "utf-8");
    const fm = parseFrontmatter(md);
    if (!fm.id) continue;
    records.push({ filePath: path.relative(ROOT, file).replace(/\\/g, "/"), fm });
  }
  return records;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function buildSnapshot(records: ResonanzRecord[], runTs: string) {
  const counts: Record<string, number> = {};
  const status: Record<string, number> = {};
  const tagFreq: Record<string, number> = {};
  const anchorFreq: Record<string, number> = {};
  const hashes: string[] = [];

  for (const r of records) {
    const ep = r.fm.endpoint ?? "unknown";
    counts[ep] = (counts[ep] ?? 0) + 1;
    const st = r.fm.status ?? "unknown";
    status[st] = (status[st] ?? 0) + 1;
    for (const tag of r.fm.nodeIds ?? []) {
      tagFreq[tag] = (tagFreq[tag] ?? 0) + 1;
    }
    if (r.fm.anchor) anchorFreq[r.fm.anchor] = (anchorFreq[r.fm.anchor] ?? 0) + 1;
    if (r.fm.content_hash) hashes.push(r.fm.content_hash);
  }

  // Korpus-Hash: deterministisch über alle File-Hashes
  hashes.sort();
  const corpusHash = crypto.createHash("sha256").update(hashes.join("|")).digest("hex").slice(0, 16);

  const topN = (m: Record<string, number>, n: number) =>
    Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ key: k, count: v }));

  return {
    ts: runTs,
    schema_version: 1,
    total_files: records.length,
    corpus_hash: `sha256:${corpusHash}`,
    counts_by_endpoint: counts,
    status_distribution: status,
    top_anchors: topN(anchorFreq, 20),
    top_tags: topN(tagFreq, 20),
  };
}

// ─── Manifest pro Tag ──────────────────────────────────────────────────────────

interface Event {
  id: string;            // <recordId>:<eventName>
  ts: string;
  event: string;
  record_id: string;
  endpoint: string;
  anchor: string;
  path: string;
  content_hash?: string;
  actor?: string;
}

function buildEventsForRecord(r: ResonanzRecord): Event[] {
  const out: Event[] = [];
  const recordId = r.fm.id!;
  for (const ev of r.fm.audit_trail ?? []) {
    if (!ev.event || !ev.ts) continue;
    out.push({
      id: `${recordId}:${ev.event}`,
      ts: ev.ts,
      event: ev.event,
      record_id: recordId,
      endpoint: r.fm.endpoint ?? "unknown",
      anchor: r.fm.anchor ?? "",
      path: r.filePath,
      content_hash: ev.content_hash ?? r.fm.content_hash,
      actor: ev.actor,
    });
  }
  return out;
}

function eventsByDate(events: Event[]): Map<string, Event[]> {
  const byDate = new Map<string, Event[]>();
  for (const ev of events) {
    const date = ev.ts.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(ev);
  }
  for (const arr of byDate.values()) arr.sort((a, b) => a.ts.localeCompare(b.ts));
  return byDate;
}

// ─── Quartal aus Datum ─────────────────────────────────────────────────────────

function quarterKey(date: string): string {
  const [y, m] = date.split("-");
  const q = Math.floor((parseInt(m, 10) - 1) / 3) + 1;
  return `${y}-Q${q}`;
}

// ─── Output schreiben ──────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeSnapshot(snapshot: ReturnType<typeof buildSnapshot>) {
  const date = snapshot.ts.slice(0, 10);
  const dir = path.join(HISTORY_DIR, "snapshots");
  ensureDir(dir);
  const file = path.join(dir, `${date}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function writeManifests(byDate: Map<string, Event[]>) {
  const dir = path.join(HISTORY_DIR, "manifests");
  ensureDir(dir);
  const written: string[] = [];
  for (const [date, events] of byDate.entries()) {
    const file = path.join(dir, `${date}.jsonl`);
    const content = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    fs.writeFileSync(file, content);
    written.push(path.relative(ROOT, file).replace(/\\/g, "/"));
  }
  return written;
}

function appendToLedger(events: Event[]) {
  const dir = path.join(HISTORY_DIR, "ledger");
  ensureDir(dir);
  const byQuarter = new Map<string, Event[]>();
  for (const ev of events) {
    const q = quarterKey(ev.ts.slice(0, 10));
    if (!byQuarter.has(q)) byQuarter.set(q, []);
    byQuarter.get(q)!.push(ev);
  }
  const written: string[] = [];
  for (const [q, qEvents] of byQuarter.entries()) {
    const file = path.join(dir, `${q}.jsonl`);
    // Dedup: lese existierende IDs
    const seen = new Set<string>();
    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file, "utf-8");
      for (const line of existing.split("\n")) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.id) seen.add(obj.id);
        } catch { /* ignore malformed */ }
      }
    }
    const newOnes = qEvents.filter((e) => !seen.has(e.id));
    if (newOnes.length === 0) continue;
    newOnes.sort((a, b) => a.ts.localeCompare(b.ts));
    const append = newOnes.map((e) => JSON.stringify(e)).join("\n") + "\n";
    fs.appendFileSync(file, append);
    written.push(`${path.relative(ROOT, file).replace(/\\/g, "/")} (+${newOnes.length})`);
  }
  return written;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const runTs = new Date().toISOString();
  const records = loadAllResonanzen();
  console.log(`[snapshot] ${records.length} Resonanz-Files gelesen`);

  // 1. Snapshot
  const snapshot = buildSnapshot(records, runTs);
  const snapPath = writeSnapshot(snapshot);
  console.log(`[snapshot] geschrieben: ${snapPath}`);

  // 2. Events sammeln
  const allEvents = records.flatMap(buildEventsForRecord);
  console.log(`[snapshot] ${allEvents.length} Events insgesamt`);

  // 3. Manifests pro Tag (vollständig neu)
  const byDate = eventsByDate(allEvents);
  const manifestPaths = writeManifests(byDate);
  console.log(`[snapshot] ${manifestPaths.length} Manifest(s) geschrieben`);

  // 4. Ledger pro Quartal (append + dedup)
  const ledgerWritten = appendToLedger(allEvents);
  if (ledgerWritten.length === 0) {
    console.log(`[snapshot] Ledger: keine neuen Events`);
  } else {
    for (const w of ledgerWritten) console.log(`[snapshot] Ledger: ${w}`);
  }

  console.log(`[snapshot] OK (corpus_hash=${snapshot.corpus_hash})`);
}

main();
