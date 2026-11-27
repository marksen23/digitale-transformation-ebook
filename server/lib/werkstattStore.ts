/**
 * Gruppen-Werkstätten. Liegen nur auf dem Server, nicht im öffentlichen
 * Korpus und nicht unter client/public. Pfad über WERKSTATT_STORE_PATH,
 * sonst data/werkstatt/sessions.json (gitignoriert).
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export interface WorkshopContribution {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface Workshop {
  code: string;
  conceptId: string;
  conceptLabel: string;
  title: string;
  createdAt: string;
  closedAt: string | null;
  contributions: WorkshopContribution[];
}

interface WorkshopFile {
  workshops: Workshop[];
}

export function defaultWerkstattStorePath(): string {
  return path.join(process.cwd(), "data", "werkstatt", "sessions.json");
}

export function werkstattStorePath(): string {
  const configured = (process.env.WERKSTATT_STORE_PATH ?? "").trim();
  return configured || defaultWerkstattStorePath();
}

function emptyFile(): WorkshopFile {
  return { workshops: [] };
}

function normalize(raw: unknown): WorkshopFile {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as WorkshopFile).workshops)) {
    throw new Error("Werkstatt-Speicher unlesbar");
  }
  const workshops: Workshop[] = [];
  for (const item of (raw as WorkshopFile).workshops) {
    if (!item || typeof item !== "object") continue;
    if (!item.code || !item.conceptId) continue;
    const contributions = Array.isArray(item.contributions)
      ? item.contributions.filter(c => c && c.id && c.text).map(c => ({
        id: c.id,
        author: c.author || "Ohne Namen",
        text: c.text,
        createdAt: c.createdAt || item.createdAt,
      }))
      : [];
    workshops.push({
      code: item.code,
      conceptId: item.conceptId,
      conceptLabel: item.conceptLabel || item.conceptId,
      title: item.title || item.conceptLabel || item.conceptId,
      createdAt: item.createdAt || new Date(0).toISOString(),
      closedAt: item.closedAt ?? null,
      contributions,
    });
  }
  return { workshops };
}

function readFile(): WorkshopFile {
  const file = werkstattStorePath();
  if (!fs.existsSync(file)) return emptyFile();
  return normalize(JSON.parse(fs.readFileSync(file, "utf8")));
}

function writeFile(data: WorkshopFile): void {
  const file = werkstattStorePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, file);
}

let chain: Promise<unknown> = Promise.resolve();

export function withWorkshops<T>(fn: (data: WorkshopFile) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const data = readFile();
    const result = await fn(data);
    writeFile(data);
    return result;
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}

export function newWorkshopCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = randomBytes(8);
    let code = "";
    for (let i = 0; i < 8; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
    if (!existing.has(code)) return code;
  }
  throw new Error("Kein freier Werkstatt-Code");
}

export function newContributionId(): string {
  return randomBytes(6).toString("hex");
}

export function workshopMarkdown(workshop: Workshop): string {
  const lines = [
    `# ${workshop.title}`,
    "",
    `Begriff: ${workshop.conceptLabel}`,
    `Code: ${workshop.code}`,
    `Begonnen: ${workshop.createdAt}`,
    workshop.closedAt ? `Abgeschlossen: ${workshop.closedAt}` : "Offen",
    "",
    `Beiträge: ${workshop.contributions.length}`,
    "",
  ];
  workshop.contributions.forEach((item, index) => {
    lines.push(`## ${index + 1}. ${item.author}`, "", item.text, "", `_${item.createdAt}_`, "");
  });
  return lines.join("\n");
}
