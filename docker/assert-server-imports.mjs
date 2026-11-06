/**
 * Bricht den Image-Build ab, wenn das Server-Bundle ein Package importiert,
 * das docker/prune-runtime-deps.mjs nicht behält. esbuild lässt mit
 * --packages=external jedes bare import stehen.
 */
import { readFileSync } from "node:fs";

const builtin = new Set(["crypto", "fs", "http", "path", "url"]);
const expected = ["@anthropic-ai/sdk", "express", "pdf-lib"];
const src = readFileSync("dist/index.js", "utf8");
const mods = [...src.matchAll(/from "([^"]+)"/g)]
  .map((m) => m[1])
  .filter((s) => !s.startsWith("node:") && !builtin.has(s));
const uniq = [...new Set(mods)].sort();
if (uniq.join(",") !== expected.join(",")) {
  console.error("Unerwartete externe Server-Imports:", uniq.join(", "));
  console.error("docker/prune-runtime-deps.mjs und diese Liste anpassen.");
  process.exit(1);
}
console.log("server imports:", uniq.join(", "));
