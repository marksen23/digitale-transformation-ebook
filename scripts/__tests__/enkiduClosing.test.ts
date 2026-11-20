import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { hasEnkiduClosing, stripEnkiduClosing } from "../lib/enkiduClosing.js";
import { appendAuditEvent } from "../strip-enkidu-closing.js";
import { parseFrontmatter, extractFrageAntwort } from "../lib/frontmatter.js";
import { contentHashFor } from "../lib/resonanzen-utils.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const FORMEL = "Nach diesem Gespräch warten drei kurze Fragen auf dich — nicht über mich, sondern über dich.";

describe("Enkidu-Abschlussformel", () => {
  it("erkennt beide Strichvarianten und Hervorhebung", () => {
    expect(hasEnkiduClosing(FORMEL)).toBe(true);
    expect(hasEnkiduClosing(FORMEL.replace("—", "–"))).toBe(true);
    expect(hasEnkiduClosing(`*${FORMEL}*`)).toBe(true);
    expect(hasEnkiduClosing("Drei Fragen können diese Praxis tragen.")).toBe(false);
  });

  it("entfernt nur den Formel-Absatz, alles andere bleibt Wort für Wort", () => {
    const text = `Erster Absatz.\n\nWas bleibt?\n\n${FORMEL}\n`;
    expect(stripEnkiduClosing(text)).toEqual({ text: "Erster Absatz.\n\nWas bleibt?\n", changed: true });
  });

  it("lässt Absätze unangetastet, in denen die Formel nur ein Teil ist", () => {
    const text = `Ein Satz. ${FORMEL}`;
    expect(stripEnkiduClosing(text)).toEqual({ text, changed: false });
  });

  it("hängt das Audit-Ereignis ans Ende der audit_trail-Liste", () => {
    const fm = "id: X\naudit_trail:\n  - event: created\n    ts: t0\ncontext_meta:\n  turnCount: 1";
    expect(appendAuditEvent(fm, ["  - event: content-edited"]))
      .toBe("id: X\naudit_trail:\n  - event: created\n    ts: t0\n  - event: content-edited\ncontext_meta:\n  turnCount: 1");
  });
});

describe("Korpus: keine Enkidu-Abschlussformel mehr", () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith(".md")) files.push(p);
    }
  };
  walk(path.join(ROOT, "content/resonanzen"));

  it("kein Text (raw/approved/published/rejected) enthält die Formel", () => {
    expect(files.length).toBeGreaterThan(0);
    const hits = files.filter(f => hasEnkiduClosing(fs.readFileSync(f, "utf-8"))).map(f => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });

  it("bereinigte Texte tragen passenden content_hash und Audit-Eintrag", () => {
    const edited = files
      .map(f => ({ f, raw: fs.readFileSync(f, "utf-8") }))
      .filter(x => /reason: Enkidu-Abschlussformel/.test(x.raw));
    expect(edited.length).toBeGreaterThan(0); // 55 bei der Bereinigung 2026-11-20
    for (const { f, raw } of edited) {
      const { fm, body } = parseFrontmatter(raw);
      const { prompt, response } = extractFrageAntwort(body);
      expect({ f: path.relative(ROOT, f), hash: fm.content_hash })
        .toEqual({ f: path.relative(ROOT, f), hash: contentHashFor(prompt, response) });
    }
  });
});
