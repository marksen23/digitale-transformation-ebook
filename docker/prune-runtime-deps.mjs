/**
 * Entfernt nach `pnpm install --prod` alles, was das Server-Bundle nicht
 * lädt. esbuild lässt mit `--packages=external` nur express, pdf-lib und
 * @anthropic-ai/sdk als bare imports stehen.
 *
 * Die Hülle folgt den Symlinks in den pnpm-Store-Ordnern, nicht nur den
 * dependencies-Feldern: manche Pakete verlangen Module, die pnpm daneben
 * linkt, ohne dass ein naives package.json-Walking sie findet.
 */
import { existsSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = [
  path.join("node_modules", "express"),
  path.join("node_modules", "pdf-lib"),
  path.join("node_modules", "@anthropic-ai", "sdk"),
];

const nm = path.resolve("node_modules");
const pnpnm = path.join(nm, ".pnpm");
const keptStores = new Set();

function storeOf(realPath) {
  const rel = path.relative(pnpnm, realPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const store = rel.split(path.sep)[0];
  return store || null;
}

function considerLink(linkPath) {
  if (!existsSync(linkPath)) return;
  let real;
  try {
    real = realpathSync(linkPath);
  } catch {
    return;
  }
  const store = storeOf(real);
  if (!store || keptStores.has(store)) return;
  keptStores.add(store);
  const siblings = path.join(pnpnm, store, "node_modules");
  if (!existsSync(siblings)) return;
  for (const entry of readdirSync(siblings)) {
    const full = path.join(siblings, entry);
    if (entry.startsWith(".")) continue;
    if (entry.startsWith("@")) {
      for (const sub of readdirSync(full)) considerLink(path.join(full, sub));
      continue;
    }
    considerLink(full);
  }
}

for (const root of ROOTS) considerLink(path.resolve(root));

if (keptStores.size < ROOTS.length) {
  console.error(`prune: nur ${keptStores.size} Store-Einträge, erwartet mindestens ${ROOTS.length}`);
  process.exit(1);
}

for (const entry of readdirSync(pnpnm)) {
  if (entry === "lock.yaml" || entry === "node_modules") continue;
  const full = path.join(pnpnm, entry);
  let isDir = false;
  try { isDir = statSync(full).isDirectory(); } catch { continue; }
  if (isDir && !keptStores.has(entry)) rmSync(full, { recursive: true, force: true });
}

for (const entry of readdirSync(nm)) {
  if (entry === ".pnpm" || entry.startsWith(".")) continue;
  if (entry !== "express" && entry !== "pdf-lib" && entry !== "@anthropic-ai") {
    rmSync(path.join(nm, entry), { recursive: true, force: true });
  }
}

const scope = path.join(nm, "@anthropic-ai");
if (existsSync(scope)) {
  for (const entry of readdirSync(scope)) {
    if (entry !== "sdk") rmSync(path.join(scope, entry), { recursive: true, force: true });
  }
}

console.log(`prune: ${keptStores.size} Store-Einträge behalten`);
