/**
 * build-resonanzen-index.ts — generiert client/public/resonanzen-index.json
 * aus dem content/resonanzen/-Korpus für die FAQ-Ansicht.
 *
 * Wird als Pre-Build-Step in pnpm build ausgeführt — der JSON-Output ist ein
 * statisches Asset, das vom Frontend lazy geladen wird (kein Bundle-Aufnahme).
 *
 * Ausgabe-Schema:
 *   { generatedAt, count, entries: [{ id, ts, endpoint, anchor, nodeIds,
 *                                      status, prompt, response,
 *                                      contextMeta }] }
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Pfade deterministisch relativ zum Skript auflösen — process.cwd() ist
// im Netlify-Build-Context nicht zuverlässig der Repo-Root.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const RESONANZEN_DIR = path.join(ROOT, "content/resonanzen");
const OUTPUT = path.join(ROOT, "client/public/resonanzen-index.json");

interface ResonanzEntry {
  id: string;
  ts: string;
  endpoint: string;
  anchor: string;
  nodeIds: string[];
  status: string;
  prompt: string;
  response: string;
  contextMeta: Record<string, unknown>;
}

/**
 * Minimal YAML-Frontmatter-Parser — reicht für unser Schema.
 * Unterstützt: skalare Strings, in-line Arrays [a, b, c], verschachtelte
 * Objekte (eine Ebene Einrückung). Keine multi-line strings, kein YAML-Spec.
 */
function parseFrontmatter(md: string): { fm: Record<string, unknown>; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: md };
  const fmRaw = m[1];
  const body = m[2];
  const fm: Record<string, unknown> = {};
  const lines = fmRaw.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.startsWith("#") || line.match(/^\s+/)) { i++; continue; }
    const colon = line.indexOf(":");
    if (colon < 0) { i++; continue; }
    const key = line.slice(0, colon).trim();
    const valueRaw = line.slice(colon + 1).trim();
    if (valueRaw === "") {
      // Verschachteltes Objekt — sammle alle eingerückten Folgezeilen
      const children: Record<string, string> = {};
      i++;
      while (i < lines.length && lines[i].match(/^\s+/) && !lines[i].match(/^\s+-/)) {
        const childLine = lines[i].trim();
        const cIdx = childLine.indexOf(":");
        if (cIdx > 0) {
          children[childLine.slice(0, cIdx).trim()] = stripQuotes(childLine.slice(cIdx + 1).trim());
        }
        i++;
      }
      fm[key] = children;
      continue;
    }
    if (valueRaw.startsWith("[") && valueRaw.endsWith("]")) {
      const inner = valueRaw.slice(1, -1).trim();
      fm[key] = inner === "" ? [] : inner.split(",").map(s => stripQuotes(s.trim()));
    } else {
      fm[key] = stripQuotes(valueRaw);
    }
    i++;
  }
  return { fm, body };
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** Extrahiert Frage und Antwort aus dem Markdown-Body (## Frage / ## Antwort). */
function extractFrageAntwort(body: string): { prompt: string; response: string } {
  const sections = body.split(/^##\s+/m);
  let prompt = "", response = "";
  for (const section of sections) {
    if (/^Frage\s*\n/.test(section)) {
      prompt = section.replace(/^Frage\s*\n+/, "").trim();
    } else if (/^Antwort\s*\n/.test(section)) {
      response = section.replace(/^Antwort\s*\n+/, "").trim();
    }
  }
  return { prompt, response };
}

function* walkMd(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkMd(full);
    } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
      yield full;
    }
  }
}

function main() {
  console.log(`[build-resonanzen-index] ROOT=${ROOT}`);
  console.log(`[build-resonanzen-index] RESONANZEN_DIR=${RESONANZEN_DIR}`);
  console.log(`[build-resonanzen-index] OUTPUT=${OUTPUT}`);
  if (!fs.existsSync(RESONANZEN_DIR)) {
    console.warn(`[build-resonanzen-index] ${RESONANZEN_DIR} not found — writing empty index.`);
    console.warn(`[build-resonanzen-index] Sibling dirs at ROOT:`, fs.existsSync(ROOT) ? fs.readdirSync(ROOT).slice(0, 20) : "ROOT does not exist");
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: 0, entries: [] }, null, 2));
    return;
  }

  const entries: ResonanzEntry[] = [];
  for (const file of walkMd(RESONANZEN_DIR)) {
    try {
      const md = fs.readFileSync(file, "utf-8");
      const { fm, body } = parseFrontmatter(md);
      const { prompt, response } = extractFrageAntwort(body);
      if (!fm.id || !fm.ts || !fm.endpoint) continue; // skip malformed
      entries.push({
        id: String(fm.id),
        ts: String(fm.ts),
        endpoint: String(fm.endpoint),
        anchor: String(fm.anchor ?? ""),
        nodeIds: Array.isArray(fm.nodeIds) ? fm.nodeIds.map(String) : [],
        status: String(fm.status ?? "raw"),
        prompt,
        response,
        contextMeta: (fm.context_meta as Record<string, unknown>) ?? {},
      });
    } catch (err) {
      console.warn(`[build-resonanzen-index] skip ${file}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Neueste zuerst
  entries.sort((a, b) => b.ts.localeCompare(a.ts));

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(
    OUTPUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: entries.length, entries }, null, 2)
  );
  console.log(`[build-resonanzen-index] wrote ${entries.length} entries to ${OUTPUT}`);
}

main();
