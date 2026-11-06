import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractFrageAntwort, parseFrontmatter } from "../lib/frontmatter.js";
import { cleanKernsatz, contentHashFor, renderMasterMarkdown, voiceViolations } from "../lib/insightRegen.js";

describe("cleanKernsatz", () => {
  it("nimmt den Satz und streift Anführungszeichen", () => {
    expect(cleanKernsatz("„Freiheit ist Bindung an das Unvollkommene.“")).toBe(
      "Freiheit ist Bindung an das Unvollkommene.",
    );
  });

  it("verwirft einen zweiten Absatz, wenn der erste schon schließt", () => {
    expect(cleanKernsatz("Der Kern steht hier.\n\nUnd noch ein Nachsatz.")).toBe("Der Kern steht hier.");
  });
});

describe("voiceViolations", () => {
  it("lässt einen geschlossenen Satz durch", () => {
    expect(voiceViolations("Die Grenze wird erst im Sprung sichtbar.")).toEqual([]);
  });

  it("meldet Autorname, Floskel und Abbruch", () => {
    expect(voiceViolations("Markus Oehring denkt den Begriffsraum tiefgründig")).toEqual(
      expect.arrayContaining(["Oehring", "Markus", "Begriffsraum", "tiefgründig", "unvollständig"]),
    );
    expect(voiceViolations("So schreibt der Autor den Satz zu Ende.")).toContain("Autor");
  });
});

describe("renderMasterMarkdown", () => {
  it("behält die id und der content_hash deckt die ganze Antwort", () => {
    const fm = [
      "id: MASTER-ABCDEF01",
      "ts: 2026-01-01T00:00:00.000Z",
      "created_at: 2026-01-01T00:00:00.000Z",
      "endpoint: dialog",
      "anchor: dialog:erkenntnis+werden",
      "is_master: true",
      "master_of: [A, B]",
      "variant_count: 2",
      "nodeIds: [erkenntnis, werden]",
      "status: published",
      "content_hash: 0000000000000000",
      "llm: gemini-2.5-pro",
      "audit_trail:",
      "  - event: synthesized",
      "    ts: 2026-01-01T00:00:00.000Z",
      "    actor: admin",
      "    source_ids: [A, B]",
    ].join("\n");
    const synthesis = "## Synthese\n\nEin geschlossener Gedanke.\n\n## Offene Frage\n\nWas folgt daraus?";
    const md = renderMasterMarkdown({
      fmRaw: fm,
      now: "2026-11-06T22:00:00.000Z",
      variantIds: ["A", "B"],
      synthesisText: synthesis,
      model: "gemini-2.5-pro",
    });
    expect(md).toContain("id: MASTER-ABCDEF01");
    expect(md).toContain("event: re-synthesized");
    expect(md).toContain("actor: regenerate-erkenntnisse");
    const { fm: parsed, body } = parseFrontmatter(md);
    const { prompt, response } = extractFrageAntwort(body);
    expect(response).toContain("Ein geschlossener Gedanke.");
    expect(response.trimEnd().endsWith("Was folgt daraus?")).toBe(true);
    expect(parsed.content_hash).toBe(contentHashFor(prompt, response));
  });
});

describe("bestehende Master", () => {
  it("der content_hash deckt die Antwort inklusive Synthese-Abschnitte", () => {
    const dir = path.resolve("content/resonanzen/master");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const abs = path.join(d, ent.name);
        if (ent.isDirectory()) walk(abs);
        else if (ent.name.endsWith(".md")) files.push(abs);
      }
    };
    walk(dir);
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const file of files) {
      const raw = fs.readFileSync(file, "utf-8");
      const { fm, body } = parseFrontmatter(raw);
      const { prompt, response } = extractFrageAntwort(body);
      expect(response.length, file).toBeGreaterThan(400);
      const hash = crypto.createHash("sha256").update(prompt).update("\n---\n").update(response).digest("hex").slice(0, 16);
      expect(hash, file).toBe(fm.content_hash);
      expect(voiceViolations(response), file).toEqual([]);
    }
  });
});
