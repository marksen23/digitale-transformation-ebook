/**
 * sync-corpus.ts — explizite Abgleichung von lokal vs GitHub.
 *
 * Hintergrund:
 *   Frische KI-Antworten landen via GitHub Contents API direkt auf main
 *   (siehe server/lib/resonanzLog.ts). Branches und lokale Working-Trees
 *   sehen diese Files erst nach `git pull` — und der lokale Index
 *   client/public/resonanzen-index.json ist dann immer noch stale, bis
 *   er manuell neu gebaut wird.
 *
 *   Dieses Script schließt beide Lücken in einem Schritt:
 *     1. GitHub-Tree lesen (content/resonanzen/raw/**.md)
 *     2. Mit lokalem Working-Tree vergleichen
 *     3. Remote-only Files downloaden (lokal anlegen)
 *     4. Local-only Files warnen (uncommitted oder gelöscht auf main?)
 *     5. resonanzen-index.json neu bauen
 *
 * Nutzung:
 *   pnpm sync:corpus              # mit lokalem Write
 *   pnpm sync:corpus --dry-run    # nur Diff zeigen, nichts schreiben
 *   pnpm sync:corpus --no-index   # nur raw/ syncen, Index nicht bauen
 *
 * Konfiguration via env vars:
 *   GITHUB_REPO_OWNER   (default: marksen23)
 *   GITHUB_REPO_NAME    (default: digitale-transformation-ebook)
 *   GITHUB_REPO_BRANCH  (default: main)
 *   GITHUB_TOKEN        (optional — anonyme API hat 60 calls/h Rate-Limit)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, "..");
const RAW_DIR    = path.join(ROOT, "content/resonanzen/raw");

const REPO_OWNER  = process.env.GITHUB_REPO_OWNER  ?? "marksen23";
const REPO_NAME   = process.env.GITHUB_REPO_NAME   ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const args = process.argv.slice(2);
const DRY_RUN  = args.includes("--dry-run");
const NO_INDEX = args.includes("--no-index");

// ──────────────────────────────────────────────────────────────────────────

interface TreeEntry { path: string; type: string; sha: string; size?: number }

async function fetchTree(): Promise<TreeEntry[]> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${REPO_BRANCH}?recursive=1`;
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "dt-corpus-sync",
  };
  if (GITHUB_TOKEN) headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Tree fetch ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (data.truncated) {
    console.warn(`[sync-corpus] Warning: GitHub tree was truncated (>100k entries). Some files may be missing.`);
  }
  return (data.tree as TreeEntry[]).filter(
    e => e.type === "blob" && e.path.startsWith("content/resonanzen/raw/") && e.path.endsWith(".md")
  );
}

async function fetchRaw(repoPath: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${repoPath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Raw fetch ${res.status} for ${repoPath}`);
  }
  return res.text();
}

function listLocal(): Set<string> {
  if (!fs.existsSync(RAW_DIR)) return new Set();
  const out = new Set<string>();
  function walk(dir: string) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.endsWith(".md")) {
        // Relative repo-Pfad, mit forward-slashes
        const rel = path.relative(ROOT, full).split(path.sep).join("/");
        out.add(rel);
      }
    }
  }
  walk(RAW_DIR);
  return out;
}

async function downloadInBatches(paths: string[], batchSize = 10): Promise<{ written: number; failed: string[] }> {
  let written = 0;
  const failed: string[] = [];
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    await Promise.all(batch.map(async p => {
      try {
        const content = await fetchRaw(p);
        const full = path.join(ROOT, p);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, "utf-8");
        written++;
      } catch (err) {
        failed.push(`${p}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }));
    if ((i + batchSize) % 50 === 0 || i + batchSize >= paths.length) {
      console.log(`  … ${Math.min(i + batchSize, paths.length)}/${paths.length}`);
    }
  }
  return { written, failed };
}

function runIndexBuild(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["tsx", "scripts/build-resonanzen-index.ts"], {
      cwd: ROOT, stdio: "inherit", shell: process.platform === "win32",
      env: { ...process.env },
    });
    child.on("exit", code => {
      if (code === 0) resolve();
      else reject(new Error(`build-resonanzen-index exited ${code}`));
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[sync-corpus] Mode: ${DRY_RUN ? "DRY-RUN" : "WRITE"}${NO_INDEX ? " (no-index)" : ""}`);
  console.log(`[sync-corpus] Source: ${REPO_OWNER}/${REPO_NAME}@${REPO_BRANCH}`);
  console.log(`[sync-corpus] Target: ${RAW_DIR}`);
  console.log("");

  const t0 = Date.now();
  console.log("[1/4] Fetching GitHub tree …");
  const tree = await fetchTree();
  console.log(`      ${tree.length} .md files on remote`);

  console.log("[2/4] Listing local raw/ …");
  const local = listLocal();
  console.log(`      ${local.size} .md files on disk`);

  const remoteSet = new Set(tree.map(e => e.path));
  const remoteOnly = [...remoteSet].filter(p => !local.has(p)).sort();
  const localOnly  = [...local].filter(p => !remoteSet.has(p)).sort();
  const both       = [...remoteSet].filter(p => local.has(p));

  console.log("");
  console.log("[3/4] Diff:");
  console.log(`      ✓ in both:        ${both.length}`);
  console.log(`      ↓ remote-only:    ${remoteOnly.length}  (würden lokal angelegt)`);
  console.log(`      ↑ local-only:     ${localOnly.length}  (nicht auf remote — uncommitted oder gelöscht?)`);

  if (remoteOnly.length > 0) {
    console.log("");
    console.log("Remote-only Files (Auswahl):");
    remoteOnly.slice(0, 10).forEach(p => console.log(`  + ${p}`));
    if (remoteOnly.length > 10) console.log(`  … (+${remoteOnly.length - 10} weitere)`);
  }
  if (localOnly.length > 0) {
    console.log("");
    console.log("Local-only Files (Auswahl):");
    localOnly.slice(0, 10).forEach(p => console.log(`  - ${p}`));
    if (localOnly.length > 10) console.log(`  … (+${localOnly.length - 10} weitere)`);
    console.log("");
    console.log("⚠ Local-only Files werden NIE automatisch entfernt. Wenn sie auf");
    console.log("  remote bewusst gelöscht wurden, manuell entfernen:");
    console.log(`  rm ${localOnly[0]}`);
  }

  if (DRY_RUN) {
    console.log("");
    console.log(`[sync-corpus] DRY-RUN beendet — keine Schreibvorgänge. (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    process.exit(0);
  }

  if (remoteOnly.length === 0) {
    console.log("");
    console.log("[4/4] Nichts zu downloaden — lokale raw/ ist aktuell.");
  } else {
    console.log("");
    console.log(`[4/4] Downloading ${remoteOnly.length} files …`);
    const { written, failed } = await downloadInBatches(remoteOnly);
    console.log(`      ✓ ${written} files geschrieben`);
    if (failed.length > 0) {
      console.error(`      ✗ ${failed.length} fehlgeschlagen:`);
      failed.slice(0, 5).forEach(f => console.error(`        ${f}`));
      if (failed.length > 5) console.error(`        … (+${failed.length - 5} weitere)`);
    }
  }

  if (!NO_INDEX) {
    console.log("");
    console.log("[index] Rebuild resonanzen-index.json …");
    await runIndexBuild();
  }

  console.log("");
  console.log(`[sync-corpus] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch(err => {
  console.error(`[sync-corpus] FAILED: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
