import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  applyAnswerOverrides, loadAnswerOverrides, type AnswerOverrideEntry,
  collectQuestions, foldMasterQuestions, isSelfAnswer, questionTextSimilarity,
  type QuestionSourceEntry,
  isEditorialEntry, isFollowUpQuestion, summarizeQuestions, EDITORIAL_ORIGIN,
  type FollowUpSourceEntry,
} from "../lib/questionAnswers.js";
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
      expect(fm.status).toBe("approved");
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

// ─── Scheinfragen: rejected-Quellen und Master-Dubletten ──────────────────
// Echte Fragetexte aus dem Korpus (Stand 2026-11-20).
const Q_PAUSE_VARIANT = "Was würde sich an einer Antwort ändern, wenn sie nicht nur die Wörter, sondern die Pause hörte, aus der sie gesprochen wurden?";
const Q_PAUSE_MASTER = "Was würde sich an einer Antwort ändern, wenn sie nicht nur die Wörter hörte, sondern die Pause, aus der sie gesprochen wurden?";
const Q_SCHOCK_VARIANT = "Wie lässt sich das Erschrecken der Einsicht als konstitutiver Teil einer Resonanzvernunft verstehen, die sich dem kontinuierlichen Fluss der Verwandlung verschreibt?";
const Q_SCHOCK_MASTER = "Unter welchen Bedingungen gerinnt der Schock der Einsicht nicht zur Erstarrung, sondern wird zum Quellpunkt einer neu gefalteten Weltbeziehung?";

type E = QuestionSourceEntry & { q: string };
const ent = (id: string, ts: string, q: string, extra: Partial<E> = {}): E =>
  ({ id, ts, q, endpoint: "chapter", anchor: "chapter:x", nodeIds: [], status: "raw", ...extra });

describe("collectQuestions", () => {
  it("überspringt Schlussfragen aus rejected-Einträgen", () => {
    const { questions, skippedRejected } = collectQuestions([
      ent("REJ", "2026-05-01", "Wie unterscheidet sich eine Wiederholung von einer, die die Stille mitträgt?", { status: "rejected" }),
      ent("OK", "2026-05-02", "Was bleibt vom Selbst, wenn die Maschine zu antworten beginnt?"),
    ], e => e.q);
    expect(questions.map(q => q.sourceId)).toEqual(["OK"]);
    expect(skippedRejected).toBe(1);
  });

  it("macht bei gleicher Frage den ältesten NICHT-abgelehnten Eintrag zur Quelle", () => {
    const { questions } = collectQuestions([
      ent("REJ", "2026-05-01", "Gleiche Frage nach der Stille?", { status: "rejected" }),
      ent("B", "2026-05-03", "gleiche  frage nach der Stille?"),
      ent("A", "2026-05-02", "Gleiche Frage nach der Stille?"),
    ], e => e.q);
    expect(questions).toHaveLength(1);
    expect(questions[0].sourceId).toBe("A");
    expect(questions[0].dupIds).toEqual(["B"]);
  });
});

describe("foldMasterQuestions", () => {
  const variant = ent("MPUFECMA-7E85D8E2", "2026-05-31", Q_PAUSE_VARIANT, { status: "published" });
  const master = ent("MASTER-63686170", "2026-11-06", Q_PAUSE_MASTER, {
    status: "published", is_master: true, master_of: ["MPUFECMA-7E85D8E2", "MPUFFZZO-69A41658"],
  });
  const schockVariant = ent("MQ5WUD1G-0976C016", "2026-06-09", Q_SCHOCK_VARIANT, { status: "published" });
  const schockMaster = ent("MASTER-31CE5C0B", "2026-11-06", Q_SCHOCK_MASTER, {
    status: "published", is_master: true, master_of: ["MQ5WUD1G-0976C016"],
  });
  const all = [variant, master, schockVariant, schockMaster];
  const byId = new Map<string, QuestionSourceEntry>(all.map(e => [e.id, e]));

  it("faltet eine Master-Frage, die die Variante wortgleich übernimmt, auf die Variante", () => {
    expect(questionTextSimilarity(Q_PAUSE_MASTER, Q_PAUSE_VARIANT)).toBeGreaterThan(0.9);
    const { questions } = collectQuestions(all, e => e.q);
    const { questions: out, folded } = foldMasterQuestions(questions, byId);
    expect(folded).toEqual([{ masterId: "MASTER-63686170", intoId: "MPUFECMA-7E85D8E2" }]);
    expect(out.map(q => q.sourceId)).not.toContain("MASTER-63686170");
    expect(out.find(q => q.sourceId === "MPUFECMA-7E85D8E2")!.dupIds).toContain("MASTER-63686170");
  });

  it("lässt thematisch nahe, aber eigenständige Master-Fragen stehen", () => {
    const { questions } = collectQuestions(all, e => e.q);
    const { questions: out } = foldMasterQuestions(questions, byId);
    expect(out.map(q => q.sourceId)).toContain("MASTER-31CE5C0B");
  });

  it("nutzt Cosine als zweites Signal, aber nur oberhalb der strengen Schwelle", () => {
    const { questions } = collectQuestions([schockVariant, schockMaster], e => e.q);
    const high = foldMasterQuestions(questions.map(q => ({ ...q, dupIds: [...q.dupIds] })), byId, { cosine: () => 0.95 });
    expect(high.folded).toHaveLength(1);
    const mid = foldMasterQuestions(questions.map(q => ({ ...q, dupIds: [...q.dupIds] })), byId, { cosine: () => 0.8 });
    expect(mid.folded).toHaveLength(0);
  });

  it("faltet nicht auf Varianten außerhalb von master_of", () => {
    const stranger = ent("OTHER", "2026-05-01", Q_PAUSE_VARIANT.replace("Antwort", "Rückfrage"));
    const lone = ent("MASTER-X", "2026-11-06", Q_PAUSE_MASTER, { is_master: true, master_of: ["NOPE"] });
    const m = new Map<string, QuestionSourceEntry>([[stranger.id, stranger], [lone.id, lone]]);
    const { questions } = collectQuestions([stranger, lone], e => e.q);
    expect(foldMasterQuestions(questions, m).folded).toEqual([]);
  });
});

describe("isSelfAnswer", () => {
  const q = { sourceId: "MV9NMWL2-5669B857", dupIds: ["DUP"] };
  it("verbietet den eigenen Master als Antwort auf seine Variante", () => {
    expect(isSelfAnswer(q, { id: "MASTER-53BE22D7", is_master: true, master_of: ["MTNB6SUG-2922AE66", "MV9NMWL2-5669B857"] })).toBe(true);
  });
  it("verbietet Einträge, die dieselbe Frage tragen", () => {
    expect(isSelfAnswer(q, { id: "DUP" })).toBe(true);
    expect(isSelfAnswer(q, { id: "MV9NMWL2-5669B857" })).toBe(true);
  });
  it("erlaubt fremde Master und gewöhnliche Antworten", () => {
    expect(isSelfAnswer(q, { id: "MASTER-OTHER", is_master: true, master_of: ["ZZZ"] })).toBe(false);
    expect(isSelfAnswer(q, { id: "MWP7PHLX-B52303F9" })).toBe(false);
  });
  it("filtert eigene Master aus Cosine-Treffern und Pins in applyAnswerOverrides", () => {
    const corpus = entries([["MASTER-53BE22D7", "published"], ["MWP7PHLX-B52303F9", "raw"]]);
    const isSelf = (id: string) => id === "MASTER-53BE22D7";
    const viaCosine = applyAnswerOverrides({
      sourceId: q.sourceId, cosine: [{ id: "MASTER-53BE22D7", score: 0.99 }], rule: undefined, entriesById: corpus, isSelf,
    });
    expect(viaCosine.answeredBy).toEqual([]);
    const viaPin = applyAnswerOverrides({
      sourceId: q.sourceId, cosine: [], entriesById: corpus, isSelf,
      rule: { sourceId: q.sourceId, pin: ["MASTER-53BE22D7", "MWP7PHLX-B52303F9"] },
    });
    expect(viaPin.answeredBy.map(a => a.id)).toEqual(["MWP7PHLX-B52303F9"]);
    expect(viaPin.warnings.join(" ")).toMatch(/dieselbe Frage/);
  });
});

// ─── Anschlussfragen (seit 2026-11-20 eigene Kategorie, nicht „offen“) ────

describe("isFollowUpQuestion", () => {
  const byId = new Map<string, FollowUpSourceEntry>([
    ["ED1", { contextMeta: { origin: EDITORIAL_ORIGIN } }],
    ["ED2", { contextMeta: { origin: EDITORIAL_ORIGIN } }],
    ["LIVE", { contextMeta: { nodeA: "x" } }],
    ["NOMETA", {}],
    ["MASTER", { is_master: true, contextMeta: {} }],
  ]);

  it("redaktionelle Quelle → Anschlussfrage", () => {
    expect(isFollowUpQuestion({ sourceId: "ED1", dupIds: [] }, byId)).toBe(true);
  });

  it("Live-Quelle oder Eintrag ohne Marker → echte Frage", () => {
    expect(isFollowUpQuestion({ sourceId: "LIVE", dupIds: [] }, byId)).toBe(false);
    expect(isFollowUpQuestion({ sourceId: "NOMETA", dupIds: [] }, byId)).toBe(false);
    expect(isFollowUpQuestion({ sourceId: "UNKNOWN", dupIds: [] }, byId)).toBe(false);
  });

  it("dieselbe Frage auch aus einer Live-Quelle → echte Frage", () => {
    expect(isFollowUpQuestion({ sourceId: "ED1", dupIds: ["LIVE"] }, byId)).toBe(false);
  });

  it("redaktionelle Dubletten und gefaltete Master ändern nichts", () => {
    expect(isFollowUpQuestion({ sourceId: "ED1", dupIds: ["ED2", "MASTER"] }, byId)).toBe(true);
  });

  it("nur der exakte Marker zählt", () => {
    expect(isEditorialEntry({ contextMeta: { origin: "Editorial " } })).toBe(false);
    expect(isEditorialEntry(undefined)).toBe(false);
  });
});

describe("summarizeQuestions", () => {
  it("zählt unbeantwortete Anschlussfragen nicht als offen", () => {
    const s = summarizeQuestions([
      { answered: false },                  // echte offene Frage
      { answered: false, followUp: true },  // offene Anschlussfrage
      { answered: true, followUp: true },   // beantwortete Anschlussfrage
      { answered: true },
    ]);
    expect(s).toEqual({ total: 4, answered: 2, open: 1, followUp: 2, followUpOpen: 1 });
  });

  it("hält die Invariante total = answered + open + followUpOpen", () => {
    const qs = Array.from({ length: 50 }, (_, i) => ({ answered: i % 3 === 0, followUp: i % 4 === 0 }));
    const s = summarizeQuestions(qs);
    expect(s.answered + s.open + s.followUpOpen).toBe(s.total);
  });
});

describe("Korpus: redaktionelle Antworten tragen den Herkunfts-Marker", () => {
  // Jede redaktionelle Antwort-Resonanz endet mit „Offene Anschlussfrage“.
  // Fehlt der Marker, würde ihre Schlussfrage still wieder als „offen“ zählen.
  const rawDir = path.join(ROOT, "content/resonanzen/raw");
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith(".md")) files.push(p);
    }
  };
  if (fs.existsSync(rawDir)) walk(rawDir);

  it("model: editorial ⇒ context_meta.origin: editorial (und Antwort-Struktur)", () => {
    const editorial = files
      .map(f => ({ f, ...parseFrontmatter(fs.readFileSync(f, "utf-8")) }))
      .filter(x => x.fm.model === "editorial");
    expect(editorial.length).toBeGreaterThan(0);
    for (const x of editorial) {
      const ctx = (x.fm.context_meta ?? {}) as Record<string, unknown>;
      expect({ file: path.relative(ROOT, x.f), origin: ctx.origin })
        .toEqual({ file: path.relative(ROOT, x.f), origin: EDITORIAL_ORIGIN });
    }
  });
});
