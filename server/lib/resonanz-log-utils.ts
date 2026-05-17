/**
 * Pure utility functions extracted from resonanzLog.ts for testability.
 * No side effects, no I/O, no module-level state.
 */
import crypto from "node:crypto";
import type { ResonanzEndpoint } from "./resonanzLog.js";

export interface ResonanzEntryLike {
  endpoint: ResonanzEndpoint;
  prompt: string;
  response: string;
}

/** Spam-Filter: minimal bar so junk doesn't reach the corpus. */
export function passesSpamFilter(entry: ResonanzEntryLike): boolean {
  if (!entry.prompt || entry.prompt.trim().length < 2)    return false;
  if (!entry.response || entry.response.trim().length < 10) return false;
  if (entry.response.toLowerCase().includes("keine antwort erhalten")) return false;
  return true;
}

/** YAML-safe quoting — only simple strings. */
export function yamlString(s: string): string {
  if (/^[a-zA-Z0-9_:.+/-]+$/.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** SHA-256 hash over prompt + separator + response (16-char hex prefix). */
export function contentHash(prompt: string, response: string): string {
  const h = crypto.createHash("sha256");
  h.update(prompt);
  h.update("\n---\n");
  h.update(response);
  return h.digest("hex").slice(0, 16);
}

/**
 * Constructs the repo file path for a resonanz entry.
 *
 * Path convention:
 *   chapter:<id>          → raw/chapter/<id>/<date>-<entryId>.md
 *   analyse:<a>+<b>       → raw/analyse/<a>+<b>/<date>-<entryId>.md
 *   path-analyse:<a>+<b>  → raw/path-analyse/<a>+<b>/<date>-<entryId>.md
 *   translate:<c>+<lang>  → raw/translate/<c>+<lang>/<date>-<entryId>.md
 *   graph-chat (anchor=graph)  → raw/graph-chat/<date>-<entryId>.md
 *   enkidu (anchor=enkidu)     → raw/enkidu/<date>-<entryId>.md
 */
export function buildPath(
  entryId: string,
  endpoint: ResonanzEndpoint,
  anchor: string,
  ts: string,
): string {
  const date = ts.slice(0, 10);
  const colonIdx = anchor.indexOf(":");
  const subdir = colonIdx > 0 ? anchor.slice(colonIdx + 1) : "";
  const safeSubdir = subdir.replace(/[^a-zA-Z0-9+_-]/g, "_");
  const dirPath = safeSubdir
    ? `content/resonanzen/raw/${endpoint}/${safeSubdir}`
    : `content/resonanzen/raw/${endpoint}`;
  return `${dirPath}/${date}-${entryId}.md`;
}
