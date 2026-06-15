/**
 * frontmatter.ts — geteilter Frontmatter-/Body-Parser für die Korpus-Scripts.
 *
 * Vorher lagen `parseFrontmatter` / `stripQuotes` / `extractFrageAntwort`
 * 1:1 dupliziert in build-resonanzen-index.ts UND validate-resonanzen.ts.
 * Jede Divergenz hätte zu still abweichendem Parsing (Hashes, nodeIds,
 * Anchors) geführt. Jetzt: EINE Quelle.
 *
 * KRITISCH — CRLF-Normalisierung: die Regexe matchen `\n` (`/^---\n/`,
 * `split("\n")`). Auf einem Windows-Checkout bekommen die Korpus-MDs CRLF
 * (`.gitattributes` pinnt jetzt zwar `*.md` auf LF, aber bereits ausgecheckte
 * Files oder Fremd-Tools können CRLF einschleppen). Ohne Normalisierung
 * schlägt der Frontmatter-Match fehl → Fake-„missing field"-Fehler, oder der
 * content_hash wird CRLF-basiert berechnet und weicht vom LF-basierten
 * Server-Hash ab. Darum normalisieren wir an jeder Eingangsstelle.
 */

/** Wandelt CRLF/CR in LF um — Voraussetzung für die `\n`-basierten Regexe. */
export function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, "\n");
}

export function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

export function parseFrontmatter(mdRaw: string): { fm: Record<string, unknown>; body: string } {
  const md = normalizeNewlines(mdRaw);
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

export function extractFrageAntwort(bodyRaw: string): { prompt: string; response: string } {
  const body = normalizeNewlines(bodyRaw);
  const sections = body.split(/^##\s+/m);
  let prompt = "", response = "";
  for (const section of sections) {
    if (/^Frage\s*\n/.test(section)) prompt = section.replace(/^Frage\s*\n+/, "").trim();
    else if (/^Antwort\s*\n/.test(section)) response = section.replace(/^Antwort\s*\n+/, "").trim();
  }
  return { prompt, response };
}
