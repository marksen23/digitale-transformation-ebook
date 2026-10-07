import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { applyAnswerOverrides, loadAnswerOverrides, type AnswerOverrideEntry } from "../lib/questionAnswers.js";
import { parseFrontmatter, extractFrageAntwort } from "../lib/frontmatter.js";
import { contentHashFor } from "../lib/resonanzen-utils.js";

const ROOT = path.resolve(import.meta.dirname, "../..");

function entries(ids: Array<[string, string]>): Map<string, AnswerOverrideEntry> {
  return new Map(ids.map(([id, status]) => [id, { id, status }]));
}

describe("applyAnswerOverrides", () => {
  const corpus = entries([
    ["A1", "raw"],
    ["A2", "raw"],
    ["MTNBX-00000000", "published"],
    ["C1", "raw"],
    ["C2", "raw"],
    ["C3", "raw"],
    ["REJ", "rejected"],
  ]);

  it("behält ohne Regel die drei stärksten Cosine-Treffer", () => {
    const cosine = [
      { id: "C3", score: 0.9 },
      { id: "C2", score: 0.8 },
      { id: "C1", score: 0.75 },
      { id: "A1", score: 0.73 },
    ];
    const { answeredBy, warnings } = applyAnswerOverrides({
      sourceId: "Q", cosine, rule: undefined, entriesById: corpus,
    });
    expect(answeredBy.map(a => a.id)).toEqual(["C3", "C2", "C1"]);
    expect(answeredBy.every(a => !a.manual)).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("setzt Pins vor die Cosine-Füller und hält sie in der sichtbaren Liste", () => {
    const cosine = [
      { id: "C3", score: 0.9 },
      { id: "C2", score: 0.8 },
      { id: "C1", score: 0.75 },
    ];
    const { answeredBy } = applyAnswerOverrides({
      sourceId: "Q",
      cosine,
      rule: { sourceId: "Q", pin: ["A1", "A2"] },
      entriesById: corpus,
      scoreOf: (id) => (id === "A1" ? 0.41 : null),
    });
    expect(answeredBy.map(a => a.id)).toEqual(["A1", "A2", "C3"]);
    expect(answeredBy[0]).toMatchObject({ manual: true, score: 0.41 });
    expect(answeredBy[1]).toMatchObject({ manual: true, score: null });
  });

  it("verdrängt Präfix-Ausschlüsse, auch wenn sie die Cosine anführen", () => {
    const { answeredBy } = applyAnswerOverrides({
      sourceId: "Q",
      cosine: [
        { id: "MTNBX-00000000", score: 0.99 },
        { id: "C1", score: 0.8 },
      ],
      rule: { sourceId: "Q", pin: ["A1"], excludePrefixes: ["MTNB"] },
      entriesById: corpus,
    });
    expect(answeredBy.map(a => a.id)).toEqual(["A1", "C1"]);
  });

  it("lässt einen Pin einen Ausschluss nicht überstimmen", () => {
    const { answeredBy, warnings } = applyAnswerOverrides({
      sourceId: "Q",
      cosine: [{ id: "MTNBX-00000000", score: 0.9 }],
      rule: { sourceId: "Q", pin: ["MTNBX-00000000"], excludePrefixes: ["MTNB"] },
      entriesById: corpus,
    });
    expect(answeredBy).toEqual([]);
    expect(warnings.some(w => w.includes("MTNBX-00000000"))).toBe(true);
  });

  it("überspringt fehlende und rejected Pins", () => {
    const { answeredBy, warnings } = applyAnswerOverrides({
      sourceId: "Q",
      cosine: [],
      rule: { sourceId: "Q", pin: ["NOPE", "REJ", "A1"] },
      entriesById: corpus,
    });
    expect(answeredBy.map(a => a.id)).toEqual(["A1"]);
    expect(warnings).toHaveLength(2);
  });

  it("verdoppelt einen Pin nicht, den die Cosine schon gewählt hat", () => {
    const { answeredBy } = applyAnswerOverrides({
      sourceId: "Q",
      cosine: [
        { id: "A1", score: 0.8 },
        { id: "C1", score: 0.73 },
      ],
      rule: { sourceId: "Q", pin: ["A1"] },
      entriesById: corpus,
    });
    expect(answeredBy.map(a => a.id)).toEqual(["A1", "C1"]);
    expect(answeredBy[0]).toMatchObject({ manual: true, score: 0.8 });
  });
});

const NEW_IDS = [
  "MUY7RXCI-D36BB4D6",
  "MUY7RXCI-012FC8A7",
  "MUY7RXCI-E899056E",
  "MUY7RXCI-C4CF7B92",
] as const;

function closingQuestion(text: string): string {
  const paras = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  for (let i = paras.length - 1; i >= 0; i--) {
    if (paras[i].endsWith("?")) return paras[i];
  }
  return "";
}

describe("question-answer-overrides.json und neue Resonanzen", () => {
  const overrides = loadAnswerOverrides(path.join(ROOT, "content/resonanzen/question-answer-overrides.json"));

  it("verknüpft die drei bestehenden Fragen und die vier neuen Antworten", () => {
    expect(overrides.get("MQXDVN1C-CAA3081A")?.pin).toEqual([
      "MTNBAIUZ-299AC7D8",
      "MUAD2ZEF-BF1C7E18",
    ]);
    expect(overrides.get("MPUSCM19-FD1196BD")?.pin).toEqual(["MPUSGXKN-78839F4E"]);
    expect(overrides.get("MQ67R74M-A1AA4B53")?.pin).toEqual([
      "MTNB6SUG-2922AE66",
      "MTNB68RF-CFF570D9",
      "MTNB85LB-7C1F15DE",
    ]);
    expect(overrides.get("MOHVDNEU-D3F7EEB5")?.pin).toEqual(["MUY7RXCI-D36BB4D6"]);
    expect(overrides.get("MPUSJLQF-F4BBBDD9")?.pin).toEqual(["MUY7RXCI-012FC8A7"]);
    expect(overrides.get("MQ66ZWYC-52DE2DF2")?.pin).toEqual(["MUY7RXCI-E899056E"]);
    expect(overrides.get("MQASO35V-115DA081")?.pin).toEqual(["MUY7RXCI-C4CF7B92"]);
  });

  it("bucht den September-Logos-Cluster nicht auf Stimme oder Judikative", () => {
    for (const sourceId of ["MOHVDNEU-D3F7EEB5", "MPUSJLQF-F4BBBDD9"]) {
      const rule = overrides.get(sourceId);
      expect(rule?.excludePrefixes).toContain("MTNB");
      for (const pin of rule?.pin ?? []) expect(pin.startsWith("MTNB")).toBe(false);
    }
    const sprache = overrides.get("MQ67R74M-A1AA4B53");
    expect(sprache?.excludePrefixes ?? []).not.toContain("MTNB");
  });

  it("führt jede neue Resonanz mit gültigem Hash und ohne Platzhalter", () => {
    const files = fs.readdirSync(path.join(ROOT, "content/resonanzen"), { recursive: true })
      .map(String)
      .filter(p => p.endsWith(".md"));
    const byId = new Map<string, string>();
    for (const rel of files) {
      const full = path.join(ROOT, "content/resonanzen", rel);
      const md = fs.readFileSync(full, "utf8");
      const id = md.match(/^id:\s*(\S+)/m)?.[1];
      if (id) byId.set(id, full);
    }

    for (const id of NEW_IDS) {
      const full = byId.get(id);
      expect(full, id).toBeTruthy();
      const md = fs.readFileSync(full!, "utf8");
      expect(md).not.toContain("{{");
      expect(md).not.toMatch(/MOUA3PLK(?!-[A-F0-9]{8})/);
      const { fm, body } = parseFrontmatter(md);
      const { prompt, response } = extractFrageAntwort(body);
      expect(fm.id).toBe(id);
      expect(fm.status).toBe("raw");
      expect(fm.ts).toBe("2026-10-07T14:39:50.418Z");
      expect(prompt.length).toBeGreaterThan(12);
      expect(contentHashFor(prompt, response)).toBe(fm.content_hash);
      const closing = closingQuestion(response);
      expect(closing.endsWith("?")).toBe(true);
      expect(closing.startsWith("Offene Anschlussfrage")).toBe(false);
      expect(closing.startsWith("1.")).toBe(false);
    }

    const stimme = fs.readFileSync(byId.get("MUY7RXCI-D36BB4D6")!, "utf8");
    expect(stimme).toContain("MOUA3PLK-548F1A0A");
    const pause = fs.readFileSync(byId.get("MUY7RXCI-E899056E")!, "utf8");
    expect(pause).toContain("MUY7RXCI-D36BB4D6");
    const echtheit = fs.readFileSync(byId.get("MUY7RXCI-C4CF7B92")!, "utf8");
    expect(echtheit).toContain("MUY7RXCI-012FC8A7");
  });
});
