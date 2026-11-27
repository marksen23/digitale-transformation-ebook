/**
 * Prüft, ob der Korpus seit mehr als 48 Stunden stillsteht, und schreibt
 * die Entscheidung für den Workflow nach stdout (GITHUB_OUTPUT) plus den
 * Issue-Text in eine Datei. Öffnet selbst kein Issue.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { assessFreshness } from "./lib/corpusFreshness.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const INDEX = path.join(ROOT, "client/public/resonanzen-index.json");

function indexTimestamps(): string[] {
  if (!fs.existsSync(INDEX)) return [];
  const raw = JSON.parse(fs.readFileSync(INDEX, "utf8")) as { entries?: Array<{ ts?: string }> };
  return (raw.entries ?? []).map(entry => entry.ts ?? "");
}

function lastReaderCommit(): { at: string | null; subject: string | null } {
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%cI%x09%s", "--grep=^log(resonanz):"],
      { cwd: ROOT, encoding: "utf8" },
    ).trim();
    if (!out) return { at: null, subject: null };
    const tab = out.indexOf("\t");
    if (tab < 0) return { at: out, subject: null };
    return { at: out.slice(0, tab), subject: out.slice(tab + 1) };
  } catch {
    return { at: null, subject: null };
  }
}

const now = new Date();
const commit = lastReaderCommit();
const report = assessFreshness({
  indexTimestamps: indexTimestamps(),
  commitAt: commit.at,
  commitSubject: commit.subject,
  now,
});

const bodyFile = path.join(process.env.RUNNER_TEMP || "/tmp", "corpus-freshness-body.md");
fs.writeFileSync(bodyFile, report.body, "utf8");

const lines = [
  `stale=${report.stale ? "true" : "false"}`,
  `latest=${report.latest ?? ""}`,
  `source=${report.source}`,
  `age_hours=${report.ageHours ?? ""}`,
  `title=${report.title}`,
  `body_file=${bodyFile}`,
];
const output = process.env.GITHUB_OUTPUT;
if (output) fs.appendFileSync(output, `${lines.join("\n")}\n`);
else console.log(lines.join("\n"));
