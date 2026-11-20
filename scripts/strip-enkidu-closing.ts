/**
 * Einmalige Bereinigung (2026-11-20, Wunsch Markus): entfernt die
 * Enkidu-Abschlussformel „Nach diesem Gespräch warten drei kurze Fragen auf
 * dich — nicht über mich, sondern über dich.“ aus allen Korpus-Texten, auch
 * veröffentlichten und verworfenen.
 *
 * Pro geänderter Datei:
 *   - nur der Formel-Absatz am Ende der Antwort fällt weg, sonst kein Wort,
 *   - content_hash wird neu berechnet (über Frage + Antwort),
 *   - audit_trail bekommt `event: content-edited` mit from_hash/to_hash.
 * status, id, Pfad und Embeddings bleiben unverändert. Idempotent.
 *
 *   pnpm tsx scripts/strip-enkidu-closing.ts           # Dry-Run
 *   pnpm tsx scripts/strip-enkidu-closing.ts --write
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractFrageAntwort, parseFrontmatter } from "./lib/frontmatter.js";
import { contentHashFor } from "./lib/resonanzen-utils.js";
import { hasEnkiduClosing, stripEnkiduClosing } from "./lib/enkiduClosing.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = path.join(ROOT, "content/resonanzen");
const WRITE = process.argv.includes("--write");
const NOW = process.env.STRIP_TS ?? new Date().toISOString();
const REASON = "Enkidu-Abschlussformel (drei kurze Fragen) entfernt";

function walk(dir: string, out: string[] = []): string[] {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else if (d.name.endsWith(".md")) out.push(p);
  }
  return out;
}

/** Hängt ein Ereignis ans Ende der audit_trail-Liste (Text-Edit, Rest der YAML bleibt Byte-gleich). */
export function appendAuditEvent(fmText: string, eventLines: string[]): string {
  const lines = fmText.split("\n");
  const start = lines.findIndex(l => /^audit_trail:\s*$/.test(l));
  if (start < 0) return `${fmText.replace(/\s*$/, "")}\naudit_trail:\n${eventLines.join("\n")}`;
  let end = start + 1;
  while (end < lines.length && /^\s+\S|^\s*$/.test(lines[end]) && !/^\S/.test(lines[end])) end++;
  while (end > start + 1 && lines[end - 1].trim() === "") end--;
  lines.splice(end, 0, ...eventLines);
  return lines.join("\n");
}

function main() {
  const files = walk(CORPUS);
  let changed = 0;
  const left: string[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf-8");
    if (!hasEnkiduClosing(raw)) continue;
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) { left.push(`${file} (kein Frontmatter)`); continue; }
    const [, fmText, body] = m;
    const stripped = stripEnkiduClosing(body);
    if (!stripped.changed) { left.push(`${file} (Formel nicht als eigener Absatz)`); continue; }

    const { fm } = parseFrontmatter(raw);
    const fromHash = String(fm.content_hash ?? "");
    const { prompt, response } = extractFrageAntwort(stripped.text);
    const toHash = contentHashFor(prompt, response);
    let newFm = fmText.replace(/^content_hash:.*$/m, `content_hash: ${toHash}`);
    newFm = appendAuditEvent(newFm, [
      "  - event: content-edited",
      `    ts: ${NOW}`,
      "    actor: editorial",
      `    reason: ${REASON}`,
      `    from_hash: ${fromHash}`,
      `    to_hash: ${toHash}`,
    ]);
    const out = `---\n${newFm}\n---\n${stripped.text}`;
    changed++;
    console.log(`${WRITE ? "edit" : "would edit"} ${path.relative(ROOT, file)} (${String(fm.status)}) ${fromHash} → ${toHash}`);
    if (WRITE) fs.writeFileSync(file, out);
  }
  console.log(`[strip-enkidu-closing] ${changed} Dateien ${WRITE ? "bereinigt" : "betroffen (Dry-Run)"}, ${left.length} übrig`);
  for (const l of left) console.log(`  übrig: ${l}`);
  if (left.length) process.exitCode = 1;
}

// Nur als CLI ausführen, nicht beim Import (Tests nutzen appendAuditEvent).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
