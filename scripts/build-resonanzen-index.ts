/**
 * build-resonanzen-index.ts — generiert client/public/resonanzen-index.json
 * aus dem content/resonanzen/-Korpus für die FAQ-Ansicht.
 *
 * Holt die Files über GitHub-Tree-API + Raw-URLs (kein Filesystem-Lookup),
 * damit der Build in jedem Container-Layout funktioniert. Local + Netlify
 * + GitHub-Action arbeiten alle gleich.
 *
 * Konfiguration via env vars (alle optional, mit sinnvollen Defaults):
 *   GITHUB_REPO_OWNER  (default: marksen23)
 *   GITHUB_REPO_NAME   (default: digitale-transformation-ebook)
 *   GITHUB_REPO_BRANCH (default: main)
 *   GITHUB_TOKEN       (optional — anonyme API hat 60 calls/h Rate-Limit
 *                       für Tree-Call, raw URLs sind ungelimitiert)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "client/public/resonanzen-index.json");

const REPO_OWNER  = process.env.GITHUB_REPO_OWNER  ?? "marksen23";
const REPO_NAME   = process.env.GITHUB_REPO_NAME   ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // optional

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

interface TreeEntry { path: string; type: "blob" | "tree"; }

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

async function fetchTree(): Promise<TreeEntry[]> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${REPO_BRANCH}?recursive=1`;
  const headers: Record<string, string> = { "Accept": "application/vnd.github+json", "User-Agent": "dt-resonanzen-index" };
  if (GITHUB_TOKEN) headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Tree API ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return data.tree ?? [];
}

async function fetchRaw(filePath: string): Promise<string> {
  // raw.githubusercontent.com — kein Rate-Limit, schnell
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Raw fetch ${res.status} ${res.statusText} for ${filePath}`);
  }
  return res.text();
}

async function main() {
  console.log(`[build-resonanzen-index] Source: ${REPO_OWNER}/${REPO_NAME}@${REPO_BRANCH}`);
  console.log(`[build-resonanzen-index] OUTPUT: ${OUTPUT}`);

  let tree: TreeEntry[];
  try {
    tree = await fetchTree();
    console.log(`[build-resonanzen-index] Tree: ${tree.length} entries total`);
  } catch (err) {
    console.error(`[build-resonanzen-index] Tree fetch failed: ${err instanceof Error ? err.message : err}`);
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: 0, entries: [], error: String(err) }, null, 2));
    return;
  }

  // Filter auf Resonanz-MD-Files
  const mdPaths = tree
    .filter(e => e.type === "blob")
    .map(e => e.path)
    .filter(p => p.startsWith("content/resonanzen/") && p.endsWith(".md") && !p.endsWith("README.md"));

  console.log(`[build-resonanzen-index] Found ${mdPaths.length} resonance markdown files`);

  // Parallel fetch (Batch von 10, um Server nicht zu hämmern)
  const entries: ResonanzEntry[] = [];
  const BATCH = 10;
  for (let i = 0; i < mdPaths.length; i += BATCH) {
    const batch = mdPaths.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(async p => {
      const md = await fetchRaw(p);
      return { path: p, md };
    }));
    for (const result of results) {
      if (result.status !== "fulfilled") {
        console.warn(`[build-resonanzen-index] skip: ${result.reason}`);
        continue;
      }
      const { md } = result.value;
      const { fm, body } = parseFrontmatter(md);
      const { prompt, response } = extractFrageAntwort(body);
      if (!fm.id || !fm.ts || !fm.endpoint) continue;
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
    }
  }

  entries.sort((a, b) => b.ts.localeCompare(a.ts));

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(
    OUTPUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: entries.length, entries }, null, 2)
  );
  console.log(`[build-resonanzen-index] wrote ${entries.length} entries to ${OUTPUT}`);
}

main().catch(err => {
  console.error(`[build-resonanzen-index] FAILED: ${err instanceof Error ? err.stack : err}`);
  // Trotzdem leeren Index schreiben, damit Vite-Build nicht bricht
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: 0, entries: [], error: String(err) }, null, 2));
  process.exit(0);
});
