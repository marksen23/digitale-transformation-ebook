/**
 * Pure utility functions shared between validate-resonanzen.ts and tests.
 * No side effects, no I/O — safe to import anywhere.
 */
import crypto from "node:crypto";

export const VALID_ENDPOINTS = new Set([
  "chapter", "enkidu", "analyse", "graph-chat", "translate", "path-analyse",
]);

export const VALID_STATUS = new Set(["raw", "pending", "approved", "published"]);

export function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

export function parseFrontmatter(md: string): { fm: Record<string, unknown>; body: string } {
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

export function extractFrageAntwort(body: string): { prompt: string; response: string } {
  const sections = body.split(/^##\s+/m);
  let prompt = "", response = "";
  for (const section of sections) {
    if (/^Frage\s*\n/.test(section)) prompt = section.replace(/^Frage\s*\n+/, "").trim();
    else if (/^Antwort\s*\n/.test(section)) response = section.replace(/^Antwort\s*\n+/, "").trim();
  }
  return { prompt, response };
}

export function contentHashFor(prompt: string, response: string): string {
  const h = crypto.createHash("sha256");
  h.update(prompt);
  h.update("\n---\n");
  h.update(response);
  return h.digest("hex").slice(0, 16);
}

export function checkAnchorFormat(endpoint: string, anchor: string): string | null {
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
  }
  return null;
}
