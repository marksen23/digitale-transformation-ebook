import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractFrageAntwort, parseFrontmatter } from "../lib/frontmatter.js";
import {
  cleanKernsatz,
  contentHashFor,
  freshMasterFm,
  masterIdForAnchor,
  masterRelPath,
  planKernsatzCandidates,
  planMaster,
  renderMasterMarkdown,
  voiceViolations,
} from "../lib/insightRegen.js";

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

describe("planMaster", () => {
  it("legt einen Master erst ab zwei Varianten an", () => {
    expect(planMaster({
      endpoint: "dialog",
      anchor: "dialog:freiheit",
      variantIds: ["a"],
      masterOf: null,
    }).action).toBe("skip");
    const created = planMaster({
      endpoint: "dialog",
      anchor: "dialog:freiheit+werden",
      variantIds: ["a", "b"],
      masterOf: null,
    });
    expect(created.action).toBe("create");
    expect(created.newIds).toEqual(["a", "b"]);
  });

  it("schreibt einen bestehenden Master nur bei genug neuen Varianten neu", () => {
    expect(planMaster({
      endpoint: "analyse",
      anchor: "analyse:echo+werden",
      variantIds: ["a", "b", "c"],
      masterOf: ["a", "b"],
    })).toMatchObject({ action: "skip", reason: "unchanged", newIds: ["c"] });
    const updated = planMaster({
      endpoint: "analyse",
      anchor: "analyse:echo+werden",
      variantIds: ["a", "b", "c", "d"],
      masterOf: ["a", "b"],
    });
    expect(updated.action).toBe("update");
    expect(updated.newIds).toEqual(["c", "d"]);
    expect(updated.variantIds).toEqual(["a", "b", "c", "d"]);
  });

  it("lässt Sammel-Anker ohne Begriffspaar aus", () => {
    expect(planMaster({
      endpoint: "enkidu",
      anchor: "enkidu",
      variantIds: ["a", "b", "c"],
      masterOf: null,
    }).reason).toBe("skipped-endpoint");
    expect(planMaster({
      endpoint: "graph-chat",
      anchor: "graph",
      variantIds: ["a", "b"],
      masterOf: null,
    }).reason).toBe("skipped-endpoint");
  });
});

describe("planKernsatzCandidates", () => {
  const candidates = [
    { id: "ERK-1", answerId: "A", questionSourceId: "Q", conceptAnchor: "freiheit", distinctness: 0.3 },
    { id: "ERK-2", answerId: "B", questionSourceId: "Q", conceptAnchor: null, distinctness: 0.2 },
    { id: "ERK-3", answerId: "C", questionSourceId: "Q", conceptAnchor: null, distinctness: 0.2 },
  ];
  const hashes = new Map([["A", "ha"], ["B", "hb"], ["C", "hc"]]);

  it("nimmt nur Kandidaten ohne Bestätigung und ohne gleichen Entwurf", () => {
    const picked = planKernsatzCandidates({
      candidates,
      confirmedAnswerIds: ["A"],
      drafts: [{ answerId: "B", sourceHash: "hb" }],
      answerHashById: hashes,
    });
    expect(picked.map(c => c.answerId)).toEqual(["C"]);
  });

  it("destilliert einen Entwurf neu, wenn die Antwort sich geändert hat", () => {
    const picked = planKernsatzCandidates({
      candidates,
      confirmedAnswerIds: [],
      drafts: [{ answerId: "A", sourceHash: "alt" }],
      answerHashById: hashes,
      limit: 1,
    });
    expect(picked.map(c => c.answerId)).toEqual(["A"]);
  });
});

describe("neuer Master", () => {
  it("behält eine stabile Id zum Anker", () => {
    expect(masterIdForAnchor("dialog:freiheit+werden")).toBe(masterIdForAnchor("dialog:freiheit+werden"));
    expect(masterRelPath("dialog", "dialog:freiheit+werden")).toBe(
      "content/resonanzen/master/dialog/dialog_freiheit-werden.md",
    );
    const fm = freshMasterFm({ endpoint: "dialog", anchor: "dialog:freiheit+werden", now: "2026-11-11T00:00:00.000Z" });
    expect(fm).toContain("status: raw");
    expect(fm).toContain("is_master: true");
  });
});

describe("Workflow Erkenntnisse neu erzeugen", () => {
  it("läuft sonntags, über die Trigger-Datei, und pusht direkt nach main", () => {
    const yml = fs.readFileSync(".github/workflows/regenerate-erkenntnisse.yml", "utf8");
    expect(yml).toMatch(/cron:\s*'0 5 \* \* 0'/);
    expect(yml).toContain(".github/triggers/regenerate-erkenntnisse");
    expect(yml).toContain("git push origin HEAD:main");
    expect(yml).toContain("scripts/validate-resonanzen.ts");
    expect(yml).toContain("insightVoice.test.ts");
    expect(yml).not.toContain("gh pr create");
    expect(fs.existsSync(".github/triggers/regenerate-erkenntnisse")).toBe(true);
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
