import crypto from "node:crypto";

export type ResonanzEndpoint = "chapter" | "analyse" | "graph-chat" | "enkidu" | "translate" | "path-analyse" | "passage" | "dialog";

export interface ResonanzEntryLike {
  endpoint: ResonanzEndpoint;
  prompt: string;
  response: string;
}

export function passesSpamFilter(entry: ResonanzEntryLike): boolean {
  if (!entry.prompt || entry.prompt.trim().length < 2) return false;
  if (!entry.response || entry.response.trim().length < 10) return false;
  if (entry.response.toLowerCase().includes("keine antwort erhalten")) return false;
  return true;
}

const YAML_PLAIN = /^[a-zA-Z0-9_:.+/-]+$/;
const YAML_BOOLISH = /^(true|false|yes|no|null|on|off|~)$/i;

/** Eine Zeile, damit ein Zeilenumbruch im Wert kein neues Frontmatter-Feld öffnet. */
export function yamlString(s: string): string {
  if (YAML_PLAIN.test(s) && !YAML_BOOLISH.test(s)) return s;
  const escaped = s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

export function contentHash(prompt: string, response: string): string {
  const h = crypto.createHash("sha256");
  h.update(prompt);
  h.update("\n---\n");
  h.update(response);
  return h.digest("hex").slice(0, 16);
}

export function buildPath(entryId: string, endpoint: ResonanzEndpoint, anchor: string, ts: string): string {
  const dateRaw = ts.slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : "undated";
  const safeId = entryId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "entry";
  const colonIdx = anchor.indexOf(":");
  const subdir = colonIdx > 0 ? anchor.slice(colonIdx + 1) : "";
  const safeSubdir = subdir.replace(/[^a-zA-Z0-9+_-]/g, "_").replace(/\.\./g, "_");
  const dirPath = safeSubdir
    ? `content/resonanzen/raw/${endpoint}/${safeSubdir}`
    : `content/resonanzen/raw/${endpoint}`;
  return `${dirPath}/${date}-${safeId}.md`;
}
