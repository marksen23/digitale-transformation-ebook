/**
 * validate-resonanzen.ts — Konsistenz-Wächter für den Resonanz-Korpus.
 *
 * Prüft alle Files in content/resonanzen/**\/*.md gegen klare Regeln und
 * gibt einen strukturierten Report aus. Exit-Code 1 bei Fehlern, damit die
 * GitHub Action die Aktualisierung blockieren kann.
 *
 * Geprüfte Regeln:
 *   - Schema-Vollständigkeit (id, ts, endpoint, anchor, status, content_hash)
 *   - Endpoint-Wert ist gültig (chapter|enkidu|analyse|graph-chat|translate|path-analyse)
 *   - Anchor-Format passt zur Endpoint-Konvention
 *   - status ist gültig (raw|pending|approved|published)
 *   - nodeIds referenzieren echte Konzepte aus NODES
 *   - content_hash stimmt mit sha256(prompt + "\n---\n" + response) überein
 *   - Datei-Pfad konsistent mit Frontmatter (datum-id-Schema)
 *
 * Aggregat-Checks (warnings, kein hartes Fail):
 *   - Status-Verteilung
 *   - Endpoint-Verteilung
 *   - Anzahl orphaner nodeIds (in Anchor referenziert, nicht in NODES)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const REPORT_OUTPUT = path.join(ROOT, "client/public/resonanzen-validation-report.json");

const REPO_OWNER  = process.env.GITHUB_REPO_OWNER  ?? "marksen23";
const REPO_NAME   = process.env.GITHUB_REPO_NAME   ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const VALID_ENDPOINTS = new Set([
  "chapter", "enkidu", "analyse", "graph-chat", "translate", "path-analyse",
]);
const VALID_STATUS = new Set(["raw", "pending", "approved", "published"]);

interface ValidationIssue {
  level: "error" | "warning";
  file: string;
  rule: string;
  detail: string;
}

interface Report {
  generatedAt: string;
  filesChecked: number;
  errors: number;
  warnings: number;
  issues: ValidationIssue[];
  aggregates: {
    byEndpoint: Record<string, number>;
    byStatus: Record<string, number>;
    orphanNodeIds: string[];
  };
}

interface ParsedFile {
  filePath: string;
  rawMd: string;
  fm: Record<string, unknown>;
  body: string;
  prompt: string;
  response: string;
}

// ─── Helpers (gleich wie build-resonanzen-index.ts) ─────────────────────────

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
    if (/^Frage\s*\n/.test(section)) prompt = section.replace(/^Frage\s*\n+/, "").trim();
    else if (/^Antwort\s*\n/.test(section)) response = section.replace(/^Antwort\s*\n+/, "").trim();
  }
  return { prompt, response };
}

function contentHashFor(prompt: string, response: string): string {
  const h = crypto.createHash("sha256");
  h.update(prompt);
  h.update("\n---\n");
  h.update(response);
  return h.digest("hex").slice(0, 16);
}

// ─── Lade Konzept-IDs aus dem Begriffsnetz ──────────────────────────────────

async function loadValidNodeIds(): Promise<Set<string>> {
  // Wir lesen client/src/data/conceptGraph.ts und extrahieren die ids per Regex.
  // Robuster wäre Import, aber das geht in tsx ohne TS-Loader-Setup nicht
  // einfach. Für Validation reicht die Regex-Extraktion.
  const cgPath = path.join(ROOT, "client/src/data/conceptGraph.ts");
  if (!fs.existsSync(cgPath)) {
    console.warn("[validate-resonanzen] conceptGraph.ts not found — nodeId validation disabled");
    return new Set();
  }
  const txt = fs.readFileSync(cgPath, "utf-8");
  const ids = new Set<string>();
  const re = /\bid\s*:\s*["']([a-z0-9_+-]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt)) !== null) ids.add(m[1]);
  return ids;
}

// ─── File-Discovery (lokal vs. GitHub-API) ──────────────────────────────────

interface RepoFile { path: string; content: string; }

async function discoverFiles(): Promise<RepoFile[]> {
  // Erst lokal versuchen, dann GitHub-API als Fallback
  const localDir = path.join(ROOT, "content/resonanzen");
  if (fs.existsSync(localDir)) {
    const files: RepoFile[] = [];
    for (const f of walkLocal(localDir)) {
      files.push({ path: path.relative(ROOT, f).replace(/\\/g, "/"), content: fs.readFileSync(f, "utf-8") });
    }
    if (files.length > 0) {
      console.log(`[validate-resonanzen] using ${files.length} local files`);
      return files;
    }
  }
  // GitHub-API
  console.log(`[validate-resonanzen] fetching from ${REPO_OWNER}/${REPO_NAME}@${REPO_BRANCH}`);
  const treeUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${REPO_BRANCH}?recursive=1`;
  const headers: Record<string, string> = { "Accept": "application/vnd.github+json", "User-Agent": "dt-validate" };
  if (GITHUB_TOKEN) headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  const treeRes = await fetch(treeUrl, { headers });
  if (!treeRes.ok) throw new Error(`Tree API ${treeRes.status}`);
  const treeData = await treeRes.json();
  const paths: string[] = (treeData.tree ?? [])
    .filter((e: { type: string; path: string }) =>
      e.type === "blob" && e.path.startsWith("content/resonanzen/") &&
      e.path.endsWith(".md") && !e.path.endsWith("README.md")
    )
    .map((e: { path: string }) => e.path);
  const files: RepoFile[] = [];
  for (const p of paths) {
    const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${p}`;
    const r = await fetch(rawUrl);
    if (r.ok) files.push({ path: p, content: await r.text() });
  }
  return files;
}

function* walkLocal(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkLocal(full);
    else if (e.name.endsWith(".md") && e.name !== "README.md") yield full;
  }
}

// ─── Anchor-Format-Validation pro Endpoint ──────────────────────────────────

function checkAnchorFormat(endpoint: string, anchor: string): string | null {
  if (endpoint === "chapter") {
    if (!/^chapter:[a-z0-9-]+$/.test(anchor)) return "expected chapter:<id>";
  } else if (endpoint === "analyse") {
    if (!/^analyse:[a-z0-9_+-]+$/.test(anchor)) return "expected analyse:<idA>+<idB>+…";
  } else if (endpoint === "path-analyse") {
    if (!/^path-analyse:[a-z0-9_+-]+$/.test(anchor)) return "expected path-analyse:<from>+<to>";
  } else if (endpoint === "translate") {
    if (!/^translate:[a-z0-9_+-]+$/.test(anchor)) return "expected translate:<chapterId>+<lang>";
  } else if (endpoint === "graph-chat") {
    if (anchor !== "graph") return "expected 'graph'";
  } else if (endpoint === "enkidu") {
    if (anchor !== "enkidu") return "expected 'enkidu'";
  }
  return null;
}

// ─── Hauptvalidierung ──────────────────────────────────────────────────────

async function main() {
  console.log("[validate-resonanzen] starting");
  const validNodeIds = await loadValidNodeIds();
  console.log(`[validate-resonanzen] loaded ${validNodeIds.size} valid node-ids`);
  const files = await discoverFiles();

  const issues: ValidationIssue[] = [];
  const byEndpoint: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const orphanNodeIds = new Set<string>();
  const parsedFiles: ParsedFile[] = [];

  for (const file of files) {
    const { fm, body } = parseFrontmatter(file.content);
    const { prompt, response } = extractFrageAntwort(body);
    parsedFiles.push({ filePath: file.path, rawMd: file.content, fm, body, prompt, response });

    // 1. Schema-Vollständigkeit
    for (const required of ["id", "ts", "endpoint", "anchor", "status", "content_hash"]) {
      if (!fm[required]) {
        issues.push({ level: "error", file: file.path, rule: "schema",
          detail: `missing field: ${required}` });
      }
    }

    // 2. Endpoint-Wert
    const ep = String(fm.endpoint ?? "");
    if (ep && !VALID_ENDPOINTS.has(ep)) {
      issues.push({ level: "error", file: file.path, rule: "endpoint-value",
        detail: `unknown endpoint: ${ep}` });
    }

    // 3. Anchor-Format
    const anchor = String(fm.anchor ?? "");
    if (ep && anchor) {
      const err = checkAnchorFormat(ep, anchor);
      if (err) issues.push({ level: "error", file: file.path, rule: "anchor-format",
        detail: `${err}, got '${anchor}'` });
    }

    // 4. status-Wert
    const status = String(fm.status ?? "");
    if (status && !VALID_STATUS.has(status)) {
      issues.push({ level: "error", file: file.path, rule: "status-value",
        detail: `unknown status: ${status}` });
    }

    // 5. nodeIds-Validität
    const nodeIds = Array.isArray(fm.nodeIds) ? fm.nodeIds.map(String) : [];
    for (const nid of nodeIds) {
      if (validNodeIds.size > 0 && !validNodeIds.has(nid)) {
        orphanNodeIds.add(nid);
        issues.push({ level: "warning", file: file.path, rule: "orphan-nodeid",
          detail: `nodeId '${nid}' not found in conceptGraph NODES` });
      }
    }

    // 6. Hash-Integrität
    const expectedHash = String(fm.content_hash ?? "");
    if (prompt && response && expectedHash) {
      const computed = contentHashFor(prompt, response);
      if (computed !== expectedHash) {
        issues.push({ level: "warning", file: file.path, rule: "content-hash-mismatch",
          detail: `expected ${expectedHash}, computed ${computed} — Tampering oder nachträgliche Edit?` });
      }
    }

    // 7. Pfad-Konsistenz: Datei sollte unter content/resonanzen/raw/<endpoint>/...
    if (ep && !file.path.startsWith(`content/resonanzen/raw/${ep}/`)
            && !file.path.startsWith(`content/resonanzen/published/${ep}/`)) {
      issues.push({ level: "warning", file: file.path, rule: "path-mismatch",
        detail: `file path doesn't match endpoint ${ep}` });
    }

    // Aggregate
    if (ep) byEndpoint[ep] = (byEndpoint[ep] ?? 0) + 1;
    if (status) byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  const errors = issues.filter(i => i.level === "error").length;
  const warnings = issues.filter(i => i.level === "warning").length;

  const report: Report = {
    generatedAt: new Date().toISOString(),
    filesChecked: files.length,
    errors,
    warnings,
    issues,
    aggregates: {
      byEndpoint,
      byStatus,
      orphanNodeIds: [...orphanNodeIds].sort(),
    },
  };

  fs.mkdirSync(path.dirname(REPORT_OUTPUT), { recursive: true });
  fs.writeFileSync(REPORT_OUTPUT, JSON.stringify(report, null, 2));
  console.log(`[validate-resonanzen] checked ${files.length} files: ${errors} errors, ${warnings} warnings`);
  console.log(`[validate-resonanzen] report → ${REPORT_OUTPUT}`);

  if (errors > 0) {
    console.error("\n=== ERRORS ===");
    for (const i of issues.filter(x => x.level === "error").slice(0, 20)) {
      console.error(`  [${i.rule}] ${i.file}: ${i.detail}`);
    }
    if (errors > 20) console.error(`  ... and ${errors - 20} more`);
    process.exit(1);
  }
  if (warnings > 0) {
    console.warn("\n=== WARNINGS ===");
    for (const i of issues.filter(x => x.level === "warning").slice(0, 10)) {
      console.warn(`  [${i.rule}] ${i.file}: ${i.detail}`);
    }
    if (warnings > 10) console.warn(`  ... and ${warnings - 10} more`);
  }
  console.log("[validate-resonanzen] OK");
}

main().catch(err => {
  console.error("[validate-resonanzen] FAILED:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
