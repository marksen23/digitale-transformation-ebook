/**
 * Vorlage für den täglichen Leser-Lauf.
 * Schreibt nur eine Dichte-Zählung. Ruft keine Schnittstelle auf
 * und liest keinen Schlüssel.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { densitySnapshot, validatePlan } from "./plan.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));

function dayStamp(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function runPlan(planPath: string, options: { write: boolean; now?: Date }): { snapshotPath: string | null; summary: string } {
  const raw = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const checked = validatePlan(raw);
  if (!checked.ok) throw new Error(checked.error);
  const snapshot = densitySnapshot(checked.plan, dayStamp(options.now));
  const lines = [
    `Leser-Lauf (Vorlage), ${snapshot.date}, ${snapshot.total} Schritte, kein Versand.`,
    ...checked.plan.steps.map(step => `- ${step.kind}: ${step.nodeIds.join(" + ")}`),
  ];
  let snapshotPath: string | null = null;
  if (options.write) {
    const dir = path.join(DIR, "snapshots");
    fs.mkdirSync(dir, { recursive: true });
    snapshotPath = path.join(dir, `${snapshot.date}.json`);
    fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    lines.push(`Dichte geschrieben: ${snapshotPath}`);
  }
  return { snapshotPath, summary: lines.join("\n") };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const planPath = process.env.PERSONA_PLAN || path.join(DIR, "plan.example.json");
  const write = process.argv.includes("--write");
  const result = runPlan(planPath, { write });
  console.log(result.summary);
}
