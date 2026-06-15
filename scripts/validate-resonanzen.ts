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
import { parseFrontmatter, extractFrageAntwort } from "./lib/frontmatter.js";

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
  // Tier-1-3-Roadmap: zwei neue Endpoint-Typen
  "passage",  // Feature A — In-Text-Resonanz aus Werkpassage
  "dialog",   // Feature B — Multi-Turn-Dialog Persist
]);
const VALID_STATUS = new Set(["raw", "pending", "approved", "published", "rejected"]);

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
    danglingLinks: number;
    redundantDuplicates: number;
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

// ─── Helpers ────────────────────────────────────────────────────────────────
// parseFrontmatter/stripQuotes/extractFrageAntwort kommen jetzt aus
// ./lib/frontmatter.ts (geteilt mit build-resonanzen-index.ts, CRLF-robust).

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
  const re = /\bid\s*:\s*["']([a-z0-9äöüß_+-]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt)) !== null) ids.add(m[1]);
  // Phase 5c: in den Kanon erhobene neue Begriffe (concept-nodes.json) als
  // gültige nodeIds anerkennen — sonst gälten Einträge, die sie referenzieren,
  // als „orphan".
  try {
    const dynPath = path.join(ROOT, "client/public/concept-nodes.json");
    if (fs.existsSync(dynPath)) {
      const dyn = JSON.parse(fs.readFileSync(dynPath, "utf-8")) as { nodes?: Array<{ id?: string }> };
      for (const n of dyn.nodes ?? []) if (n.id) ids.add(n.id);
    }
  } catch { /* fail-soft: dynamische Knoten optional */ }
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
  // Anchor-IDs dürfen deutsche Umlaute enthalten (öffnung, größe, …),
  // weil die zugrundeliegenden Konzept-Node-IDs auch Umlaute tragen.
  if (endpoint === "chapter") {
    if (!/^chapter:[a-z0-9äöüß-]+$/.test(anchor)) return "expected chapter:<id>";
  } else if (endpoint === "analyse") {
    if (!/^analyse:[a-z0-9äöüß_+-]+$/.test(anchor)) return "expected analyse:<idA>+<idB>+…";
  } else if (endpoint === "path-analyse") {
    if (!/^path-analyse:[a-z0-9äöüß_+-]+$/.test(anchor)) return "expected path-analyse:<from>+<to>";
  } else if (endpoint === "translate") {
    if (!/^translate:[a-z0-9äöüß_+-]+$/.test(anchor)) return "expected translate:<chapterId>+<lang>";
  } else if (endpoint === "graph-chat") {
    if (anchor !== "graph") return "expected 'graph'";
  } else if (endpoint === "enkidu") {
    if (anchor !== "enkidu") return "expected 'enkidu'";
  } else if (endpoint === "passage") {
    // Feature A: passage:<chunkId-8char-hex> (= erste 8 chars von sha1)
    if (!/^passage:[a-f0-9]{8}$/.test(anchor)) return "expected passage:<chunkId-8>";
  } else if (endpoint === "dialog") {
    // Feature B: dialog:<focus> oder dialog:freier — focus ist beliebig
    // (entweder Knoten-IDs joined mit '+', oder 'freier').
    if (!/^dialog:[a-zäöüß0-9_+-]+$/i.test(anchor)) return "expected dialog:<focus> or dialog:freier";
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

  // 8. Cross-Link-Integrität gegen den publizierten Index: related[] und
  //    nearDuplicates[] (build-time gesetzt, leben im Index, nicht im MD)
  //    müssen auf vorhandene, nicht-rejected Einträge zeigen. Der Build
  //    filtert sie inzwischen (computeCrossLinks) — dieser Check fängt
  //    Regressionen ab. Warning, kein harter Fail.
  let danglingLinks = 0;
  let redundantDuplicates = 0;
  try {
    const indexPath = path.join(ROOT, "client/public/resonanzen-index.json");
    if (fs.existsSync(indexPath)) {
      const idx = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as {
        entries?: Array<{ id: string; status?: string; related?: string[]; nearDuplicates?: string[];
          endpoint?: string; anchor?: string; prompt?: string }>;
      };
      const idxEntries = idx.entries ?? [];
      const statusById = new Map(idxEntries.map(e => [e.id, e.status ?? "raw"]));

      // 8b. Dubletten-Wächter: exakte Wiederholungen (gleicher endpoint+anchor+
      //     normalisierte Frage) sollten dank Ingest-Dedup (resonanzLog.ts) nicht
      //     mehr anwachsen. Dieser Check macht eine Regression sofort sichtbar.
      const norm = (s: string) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
      const dupGroups = new Map<string, string[]>();
      for (const e of idxEntries) {
        const k = `${e.endpoint ?? ""}|${e.anchor ?? ""}|${norm(e.prompt ?? "")}`;
        (dupGroups.get(k) ?? dupGroups.set(k, []).get(k)!).push(e.id);
      }
      for (const [, idsInGroup] of dupGroups) {
        if (idsInGroup.length > 1) {
          redundantDuplicates += idsInGroup.length - 1;
          issues.push({ level: "warning", file: `index:${idsInGroup[0]}`, rule: "duplicate-entries",
            detail: `${idsInGroup.length}× identische Begegnung (endpoint+anchor+Frage) — Bereinigung via dedup-corpus.ts` });
        }
      }

      for (const e of idxEntries) {
        for (const field of ["related", "nearDuplicates"] as const) {
          const arr = e[field];
          if (!Array.isArray(arr)) continue;
          for (const rid of arr) {
            const st = statusById.get(rid);
            if (st === undefined) {
              danglingLinks++;
              issues.push({ level: "warning", file: `index:${e.id}`, rule: "dangling-link",
                detail: `${field} → '${rid}' nicht im Index` });
            } else if (st === "rejected") {
              danglingLinks++;
              issues.push({ level: "warning", file: `index:${e.id}`, rule: "rejected-link",
                detail: `${field} → '${rid}' zeigt auf rejected Eintrag` });
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[validate-resonanzen] Index-Linkcheck übersprungen: ${err instanceof Error ? err.message : err}`);
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
      danglingLinks,
      redundantDuplicates,
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
