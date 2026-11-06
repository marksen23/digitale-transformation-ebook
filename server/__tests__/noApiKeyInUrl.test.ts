/**
 * Regressionstest: kein API-Key im Query-String.
 *
 * Gemini-Keys gehören in den Header `x-goog-api-key` (siehe
 * server/lib/geminiHttp.ts). Ein `?key=`/`&key=` in der URL landet über
 * fetch-Fehlermeldungen in Logs und Client-Antworten. Dieser Test durchsucht
 * den Quellcode und schlägt fehl, sobald wieder jemand einen Key an eine URL
 * hängt.
 *
 * Ausgenommen: Testdateien (__tests__, *.test.*) und reine Kommentarzeilen.
 * Bewusst ohne Allowlist: jeder Treffer ist ein Fehler.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["server", "scripts", "client/src", "shared"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", "__tests__", "dist"]);

/** Literal `?key=` oder `&key=` – also ein Key, der an eine URL gehängt wird. */
const KEY_IN_URL = /[?&]key=/i;

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function findKeyInUrl(source: string): number[] {
  const hits: number[] = [];
  source.split("\n").forEach((line, i) => {
    if (!isCommentLine(line) && KEY_IN_URL.test(line)) hits.push(i + 1);
  });
  return hits;
}

function collectFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collectFiles(full, out);
    } else if (
      EXTENSIONS.has(path.extname(entry.name)) &&
      !/\.test\.[cm]?[jt]sx?$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("kein API-Key in URLs", () => {
  it("erkennt die verbotenen Muster (Selbsttest)", () => {
    expect(
      findKeyInUrl("const url = `${base}:embedContent?key=${KEY}`;")
    ).toEqual([1]);
    expect(findKeyInUrl("fetch(`${u}?alt=sse&key=${k}`)")).toEqual([1]);
    expect(
      findKeyInUrl(" * früher lag der Key im Query-String (`?key=`)")
    ).toEqual([]);
    expect(findKeyInUrl("const re = /([?&]key=)[^&]+/;")).toEqual([]);
    expect(findKeyInUrl('headers: { "x-goog-api-key": key }')).toEqual([]);
  });

  it("server/, scripts/, client/src/ und shared/ hängen keinen Key an eine URL", () => {
    const files = SCAN_DIRS.flatMap(d => collectFiles(path.join(ROOT, d)));
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.flatMap(file =>
      findKeyInUrl(fs.readFileSync(file, "utf-8")).map(
        line => `${path.relative(ROOT, file)}:${line}`
      )
    );
    expect(
      offenders,
      "Key per Header x-goog-api-key senden (geminiAuthHeaders)"
    ).toEqual([]);
  });
});
