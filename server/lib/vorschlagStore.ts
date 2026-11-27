/**
 * Leser-Vorschläge für Begriffe und Verbindungen.
 * Liegen nur auf dem Server, bis der Admin sie hebt oder zurückzieht.
 * Nie in den öffentlichen Korpus-Dateien.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type ProposalKind = "concept" | "edge";
export type ProposalStatus = "pending" | "promoted" | "withdrawn";

export interface Proposal {
  id: string;
  kind: ProposalKind;
  status: ProposalStatus;
  createdAt: string;
  author: string;
  reason: string;
  source?: string;
  target?: string;
  conceptId?: string;
  fullLabel?: string;
  description?: string;
  anchorId?: string;
}

interface ProposalFile {
  proposals: Proposal[];
}

export function defaultVorschlagStorePath(): string {
  return path.join(process.cwd(), "data", "vorschlaege", "proposals.json");
}

export function vorschlagStorePath(): string {
  const configured = (process.env.VORSCHLAG_STORE_PATH ?? "").trim();
  return configured || defaultVorschlagStorePath();
}

function readFile(): ProposalFile {
  const file = vorschlagStorePath();
  if (!fs.existsSync(file)) return { proposals: [] };
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { proposals?: Proposal[] };
  if (!raw || !Array.isArray(raw.proposals)) throw new Error("Vorschlags-Speicher unlesbar");
  return { proposals: raw.proposals.filter(item => item && item.id && item.kind && item.reason) };
}

function writeFile(data: ProposalFile): void {
  const file = vorschlagStorePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, file);
}

let chain: Promise<unknown> = Promise.resolve();

export function withProposals<T>(fn: (data: ProposalFile) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const data = readFile();
    const result = await fn(data);
    writeFile(data);
    return result;
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}

export function newProposalId(): string {
  return randomBytes(6).toString("hex");
}

export function slugConceptId(label: string): string {
  return label
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
