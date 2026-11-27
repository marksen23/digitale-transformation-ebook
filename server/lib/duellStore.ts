/**
 * Stimmen der Begriffs-Duelle. Nur auf dem Server, gitignoriert.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type DuelSideId = "a" | "b";

export interface DuelVote {
  id: string;
  duelId: string;
  side: DuelSideId;
  reason: string;
  author: string;
  createdAt: string;
}

interface DuelFile {
  votes: DuelVote[];
}

export function defaultDuellStorePath(): string {
  return path.join(process.cwd(), "data", "duelle", "votes.json");
}

export function duellStorePath(): string {
  const configured = (process.env.DUELL_STORE_PATH ?? "").trim();
  return configured || defaultDuellStorePath();
}

function readFile(): DuelFile {
  const file = duellStorePath();
  if (!fs.existsSync(file)) return { votes: [] };
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { votes?: DuelVote[] };
  if (!raw || !Array.isArray(raw.votes)) throw new Error("Duell-Speicher unlesbar");
  return {
    votes: raw.votes.filter(vote => vote && vote.id && vote.duelId && (vote.side === "a" || vote.side === "b") && vote.reason),
  };
}

function writeFile(data: DuelFile): void {
  const file = duellStorePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, file);
}

let chain: Promise<unknown> = Promise.resolve();

export function withVotes<T>(fn: (data: DuelFile) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const data = readFile();
    const result = await fn(data);
    writeFile(data);
    return result;
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}

export function newVoteId(): string {
  return randomBytes(6).toString("hex");
}

export function tally(votes: DuelVote[], duelId: string): { a: number; b: number; reasons: DuelVote[] } {
  const mine = votes.filter(vote => vote.duelId === duelId).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  return {
    a: mine.filter(vote => vote.side === "a").length,
    b: mine.filter(vote => vote.side === "b").length,
    reasons: mine,
  };
}
