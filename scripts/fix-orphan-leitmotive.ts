/**
 * fix-orphan-leitmotive.ts — repariert Resonanz-Files mit Leitmotiv-IDs
 * ohne `lm-`-Prefix.
 *
 * Geschieht idempotent: liest aktuelle Files via Tree-API, mappt orphan
 * IDs (z.B. 'begegnung' → 'lm-begegnung'), aktualisiert nodeIds + anchor
 * und verschiebt den File auf den neuen alphabetisch korrekten Pfad
 * (DELETE old + CREATE new).
 *
 * Mapping-Tabelle wird automatisch aus client/src/data/conceptGraph.ts
 * generiert — alle `lm-*`-IDs gelten als reparierbare Ziele für ihre
 * unprefixierte Variante.
 *
 * Usage (lokal):
 *   GITHUB_TOKEN=ghp_… pnpm tsx scripts/fix-orphan-leitmotive.ts
 *   GITHUB_TOKEN=ghp_… pnpm tsx scripts/fix-orphan-leitmotive.ts --dry-run
 *
 * In CI (GitHub Action): workflow_dispatch → läuft mit GITHUB_TOKEN.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const REPO_OWNER  = process.env.GITHUB_REPO_OWNER  ?? "marksen23";
const REPO_NAME   = process.env.GITHUB_REPO_NAME   ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");

if (!GITHUB_TOKEN) {
  console.error("[fix-orphan-leitmotive] GITHUB_TOKEN env var ist erforderlich");
  process.exit(1);
}

interface TreeBlob { type: string; path: string }
interface FileContent { content: string; sha: string }

const ghHeaders = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "dt-fix-orphans",
  "X-GitHub-Api-Version": "2022-11-28",
};

// ─── 1. Mapping-Tabelle aus conceptGraph.ts extrahieren ────────────────────

function loadLeitmotivIdMap(): Map<string, string> {
  const cgPath = path.join(ROOT, "client/src/data/conceptGraph.ts");
  if (!fs.existsSync(cgPath)) {
    throw new Error("conceptGraph.ts nicht gefunden");
  }
  const txt = fs.readFileSync(cgPath, "utf-8");
  const lmIds: string[] = [];
  const re = /\bid:\s*"(lm-[a-z0-9-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt)) !== null) lmIds.push(m[1]);
  // Mapping: 'begegnung' → 'lm-begegnung', etc.
  const map = new Map<string, string>();
  for (const lm of lmIds) {
    const orphan = lm.replace(/^lm-/, "");
    map.set(orphan, lm);
  }
  return map;
}

// ─── 2. GitHub Tree-API + raw download ─────────────────────────────────────

async function fetchTree(): Promise<TreeBlob[]> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${REPO_BRANCH}?recursive=1`;
  const r = await fetch(url, { headers: ghHeaders });
  if (!r.ok) throw new Error(`Tree API ${r.status}`);
  const data = await r.json();
  return (data.tree ?? []) as TreeBlob[];
}

async function fetchFileContent(p: string): Promise<FileContent | null> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${p}?ref=${REPO_BRANCH}`;
  const r = await fetch(url, { headers: ghHeaders });
  if (!r.ok) return null;
  const data = await r.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { content, sha: data.sha };
}

async function putFile(p: string, content: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${p}`;
  const r = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      message, branch: REPO_BRANCH,
      content: Buffer.from(content, "utf-8").toString("base64"),
    }),
  });
  if (!r.ok) return { ok: false, error: `${r.status}: ${(await r.text()).slice(0, 200)}` };
  return { ok: true };
}

async function deleteFile(p: string, sha: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${p}`;
  const r = await fetch(url, {
    method: "DELETE",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha, branch: REPO_BRANCH }),
  });
  if (!r.ok) return { ok: false, error: `${r.status}: ${(await r.text()).slice(0, 200)}` };
  return { ok: true };
}

// ─── 3. Frontmatter mutieren + Pfad neu berechnen ──────────────────────────

interface FixPlan {
  oldPath: string;
  newPath: string;
  oldSha: string;
  newContent: string;
  oldNodeIds: string[];
  newNodeIds: string[];
  oldAnchor: string;
  newAnchor: string;
}

function planFix(
  filePath: string, fileContent: string, sha: string,
  idMap: Map<string, string>,
): FixPlan | null {
  const fmMatch = fileContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) return null;
  const doc = yaml.parseDocument(fmMatch[1]);
  const nodeIdsNode = doc.get("nodeIds") as { items?: Array<{ value: string }> } | undefined;
  if (!nodeIdsNode?.items) return null;
  const oldNodeIds = nodeIdsNode.items.map(item => String(item.value));

  // Hat dieses File überhaupt orphans?
  const orphans = oldNodeIds.filter(id => idMap.has(id));
  if (orphans.length === 0) return null;

  // Mappe IDs
  const newNodeIds = oldNodeIds.map(id => idMap.get(id) ?? id);

  // anchor neu berechnen (für analyse: + path-analyse:)
  const oldAnchor = String(doc.get("anchor") ?? "");
  let newAnchor = oldAnchor;
  if (oldAnchor.startsWith("analyse:")) {
    newAnchor = "analyse:" + [...newNodeIds].sort().join("+");
  } else if (oldAnchor.startsWith("path-analyse:")) {
    // Bei path-analyse ist der Anchor `<from>+<to>` der Endpunkte.
    // Map endpoints if needed.
    const parts = oldAnchor.replace(/^path-analyse:/, "").split("+");
    const newParts = parts.map(p => idMap.get(p) ?? p);
    newAnchor = "path-analyse:" + [...newParts].sort().join("+");
  }

  // Frontmatter aktualisieren
  doc.set("nodeIds", newNodeIds);
  doc.set("anchor", newAnchor);

  // Audit-Trail erweitern
  const trail = doc.get("audit_trail") as { add?: (item: unknown) => void } | undefined;
  const auditEvent = {
    event: "fix-orphan-leitmotive",
    ts: new Date().toISOString(),
    actor: "fix-script",
    from: { nodeIds: oldNodeIds, anchor: oldAnchor },
    to: { nodeIds: newNodeIds, anchor: newAnchor },
  };
  if (trail && typeof trail.add === "function") trail.add(auditEvent);
  else doc.set("audit_trail", [auditEvent]);

  // Neuen Pfad berechnen — gleiche Pfad-Konvention wie resonanzLog.ts
  const oldDir = filePath.substring(0, filePath.lastIndexOf("/"));
  const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
  const colonIdx = newAnchor.indexOf(":");
  const subdir = colonIdx > 0 ? newAnchor.slice(colonIdx + 1) : "";
  const safeSubdir = subdir.replace(/[^a-zA-Z0-9+_-]/g, "_");
  // endpoint ist im alten Pfad: content/resonanzen/raw/<endpoint>/...
  const m = oldDir.match(/^(content\/resonanzen\/raw)\/([^/]+)/);
  if (!m) return null;
  const baseDir = `${m[1]}/${m[2]}`;
  const newPath = safeSubdir ? `${baseDir}/${safeSubdir}/${fileName}` : `${baseDir}/${fileName}`;

  const newContent = `---\n${doc.toString().trimEnd()}\n---\n${fmMatch[2]}`;

  return {
    oldPath: filePath,
    newPath,
    oldSha: sha,
    newContent,
    oldNodeIds, newNodeIds,
    oldAnchor, newAnchor,
  };
}

// ─── 4. Hauptlauf ──────────────────────────────────────────────────────────

async function main() {
  console.log("[fix-orphan-leitmotive] starting" + (DRY_RUN ? " (DRY RUN)" : ""));
  const idMap = loadLeitmotivIdMap();
  console.log(`[fix-orphan-leitmotive] mapping table: ${idMap.size} Leitmotiv-IDs`);
  for (const [orphan, lm] of idMap) console.log(`  ${orphan} → ${lm}`);

  const tree = await fetchTree();
  const mdFiles = tree.filter(e =>
    e.type === "blob" && e.path.startsWith("content/resonanzen/") &&
    e.path.endsWith(".md") && !e.path.endsWith("README.md")
  );
  console.log(`[fix-orphan-leitmotive] scanning ${mdFiles.length} markdown files`);

  const plans: FixPlan[] = [];
  for (const f of mdFiles) {
    const fc = await fetchFileContent(f.path);
    if (!fc) continue;
    const plan = planFix(f.path, fc.content, fc.sha, idMap);
    if (plan) plans.push(plan);
  }

  if (plans.length === 0) {
    console.log("[fix-orphan-leitmotive] keine orphan-Files gefunden — alles sauber");
    return;
  }

  console.log(`\n[fix-orphan-leitmotive] ${plans.length} Files zu reparieren:\n`);
  for (const p of plans) {
    console.log(`  ${p.oldPath}`);
    console.log(`    nodeIds: ${p.oldNodeIds.join(",")} → ${p.newNodeIds.join(",")}`);
    console.log(`    anchor:  ${p.oldAnchor} → ${p.newAnchor}`);
    if (p.oldPath !== p.newPath) console.log(`    move to: ${p.newPath}`);
  }

  if (DRY_RUN) {
    console.log("\n[fix-orphan-leitmotive] DRY RUN — keine Änderungen geschrieben");
    return;
  }

  console.log("\n[fix-orphan-leitmotive] schreibe Änderungen ...");
  let ok = 0, failed = 0;
  for (const p of plans) {
    // 1. Neuen File schreiben (überschreibt falls am gleichen Pfad)
    const putRes = await putFile(p.newPath, p.newContent,
      `fix(orphan-leitmotive): ${p.oldNodeIds.join(",")} → ${p.newNodeIds.join(",")}`);
    if (!putRes.ok) {
      console.error(`  ✕ ${p.oldPath}: PUT ${p.newPath} fehlgeschlagen — ${putRes.error}`);
      failed++;
      continue;
    }
    // 2. Wenn Pfad sich geändert hat: alten löschen
    if (p.oldPath !== p.newPath) {
      const delRes = await deleteFile(p.oldPath, p.oldSha,
        `fix(orphan-leitmotive): remove old path after move`);
      if (!delRes.ok) {
        console.error(`  ⚠ ${p.oldPath}: DELETE alt fehlgeschlagen (neuer File ist da, alter bleibt) — ${delRes.error}`);
        // weiter — neuer File ist OK, alter wird nächstes Mal gelöscht oder manuell
      }
    }
    console.log(`  ✓ ${p.oldPath}`);
    ok++;
  }
  console.log(`\n[fix-orphan-leitmotive] ${ok} repariert, ${failed} fehlgeschlagen`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error("[fix-orphan-leitmotive] FAILED:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
