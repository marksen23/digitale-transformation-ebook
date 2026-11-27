/**
 * Aggregierte Aufrufe von Erkenntnissen. Nur id → Zahl.
 * Keine IP, kein Personenbezug. Datei gitignoriert.
 */
import fs from "node:fs";
import path from "node:path";

export function defaultViewCountPath(): string {
  return path.join(process.cwd(), "data", "views", "erkenntnisse.json");
}

export function viewCountPath(): string {
  const configured = (process.env.VIEW_COUNT_PATH ?? "").trim();
  return configured || defaultViewCountPath();
}

function readCounts(): Record<string, number> {
  const file = viewCountPath();
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { counts?: Record<string, number> };
  if (!raw || typeof raw.counts !== "object" || !raw.counts) throw new Error("Aufruf-Zähler unlesbar");
  const counts: Record<string, number> = {};
  for (const [id, count] of Object.entries(raw.counts)) {
    if (typeof count === "number" && count > 0) counts[id] = count;
  }
  return counts;
}

function writeCounts(counts: Record<string, number>): void {
  const file = viewCountPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ counts }, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, file);
}

let chain: Promise<unknown> = Promise.resolve();

export function withViewCounts<T>(fn: (counts: Record<string, number>) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const counts = readCounts();
    const result = await fn(counts);
    writeCounts(counts);
    return result;
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}
