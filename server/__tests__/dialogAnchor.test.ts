import { describe, expect, it } from "vitest";
import {
  DIALOG_PERSIST_PROMPT_MAX,
  DIALOG_PERSIST_RESPONSE_MAX,
  normalizeDialogAnchor,
  prepareCorpusAnchor,
  prepareDialogPersist,
  resolveDialogAnchor,
} from "../lib/dialogAnchor.js";
import { checkAnchorFormat } from "../../scripts/lib/resonanzen-utils.js";

const ANSWER = "Eine ausreichend lange Modell-Antwort für den Korpus.";

function persistBody(overrides: Record<string, unknown> = {}) {
  return {
    turns: [
      { role: "user", text: "Was folgt aus dieser Triade?" },
      { role: "model", text: ANSWER },
    ],
    ...overrides,
  };
}

describe("normalizeDialogAnchor", () => {
  it("bildet Freitext auf Begriffs-IDs ab", () => {
    expect(normalizeDialogAnchor("Entfremdung und Resonanzimperativ", ["entfremdung", "resonanzimperativ"]))
      .toEqual({
        anchor: "dialog:entfremdung+resonanzimperativ",
        nodeIds: ["entfremdung", "resonanzimperativ"],
      });
    expect(normalizeDialogAnchor("Freiheit, Gelassenheit, Werden", ["freiheit", "gelassenheit", "werden"])?.anchor)
      .toBe("dialog:freiheit+gelassenheit+werden");
    expect(normalizeDialogAnchor("Moment und Scheitern", ["moment", "lm-scheitern"])?.anchor)
      .toBe("dialog:moment+lm-scheitern");
    expect(normalizeDialogAnchor("Schweigen und Scheitern", ["schweigen", "lm-scheitern"])?.anchor)
      .toBe("dialog:schweigen+lm-scheitern");
  });

  it("lässt den normalen Client-Fokus aus Begriffs-IDs stehen", () => {
    expect(normalizeDialogAnchor("freiheit+gelassenheit", ["freiheit", "gelassenheit"])?.anchor)
      .toBe("dialog:freiheit+gelassenheit");
    expect(normalizeDialogAnchor("dialog:weiterdenken", [])?.anchor).toBe("dialog:weiterdenken");
  });

  it("slugifiziert unbekannten Freitext und lehnt leere Reste ab", () => {
    expect(normalizeDialogAnchor("passage:0123abcd", [])?.anchor).toBe("dialog:passage-0123abcd");
    expect(normalizeDialogAnchor("???", [])).toBeNull();
  });

  it("nutzt bekannte nodeIds, wenn der focus sich nicht abbilden lässt", () => {
    expect(normalizeDialogAnchor("???", ["freiheit"])?.anchor).toBe("dialog:freiheit");
  });
});

describe("prepareCorpusAnchor", () => {
  it("liefert nur Anker, die der Validator akzeptiert", () => {
    const cases: Array<[string, string, string[]?]> = [
      ["dialog", "dialog:Freiheit, Gelassenheit, Werden", ["freiheit", "gelassenheit", "werden"]],
      ["chapter", "chapter:Band2-Kap5"],
      ["chapter", "chapter:band2_kap5"],
      ["analyse", "analyse:Echo-Kammer+Entfremdung"],
      ["path-analyse", "path-analyse:Antwort+Öffnung"],
      ["passage", "passage:ABCDEF12"],
      ["graph-chat", "graph"],
      ["enkidu", "enkidu"],
      ["translate", "translate:Vorwort+en"],
    ];
    for (const [endpoint, anchor, nodeIds] of cases) {
      const prepared = prepareCorpusAnchor(endpoint, anchor, nodeIds);
      expect(prepared, anchor).not.toBeNull();
      expect(checkAnchorFormat(endpoint, prepared!.anchor), prepared!.anchor).toBeNull();
    }
    expect(prepareCorpusAnchor("chapter", "chapter:Band2-Kap5")?.anchor).toBe("chapter:band2-kap5");
    expect(prepareCorpusAnchor("passage", "passage:nicht-hex")).toBeNull();
    expect(prepareCorpusAnchor("dialog", "dialog:???")).toBeNull();
  });
});

describe("prepareDialogPersist", () => {
  it("normalisiert focus und behält den Client-Verlauf", () => {
    const prepared = prepareDialogPersist(persistBody({
      focus: "Freiheit, Gelassenheit, Werden",
      focusedNodeIds: ["freiheit", "gelassenheit", "werden"],
      sessionId: "s1",
    }));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.anchor).toBe("dialog:freiheit+gelassenheit+werden");
    expect(prepared.value.nodeIds).toEqual(["freiheit", "gelassenheit", "werden"]);
    expect(prepared.value.prompt).toBe("Was folgt aus dieser Triade?");
    expect(prepared.value.response).toBe(ANSWER);
  });

  it("fällt ohne focus auf dialog:freier", () => {
    const prepared = prepareDialogPersist(persistBody());
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.anchor).toBe("dialog:freier");
  });

  it("lehnt Spam, Überlänge und unrettbaren focus ab", () => {
    expect(prepareDialogPersist(persistBody({
      turns: [{ role: "user", text: "x" }, { role: "model", text: "kurz" }],
    }))).toEqual({ ok: false, error: "Frage oder Antwort genügt dem Korpus-Filter nicht" });

    expect(prepareDialogPersist(persistBody({
      turns: [
        { role: "user", text: "a".repeat(DIALOG_PERSIST_PROMPT_MAX + 1) },
        { role: "model", text: ANSWER },
      ],
    }))).toEqual({ ok: false, error: "Frage zu lang" });

    expect(prepareDialogPersist(persistBody({
      turns: [
        { role: "user", text: "Was folgt?" },
        { role: "model", text: "a".repeat(DIALOG_PERSIST_RESPONSE_MAX + 1) },
      ],
    }))).toEqual({ ok: false, error: "Antwort zu lang" });

    const rejected = prepareDialogPersist(persistBody({ focus: "???" }));
    expect(rejected).toEqual({ ok: false, error: "focus ergibt keinen gültigen Anker" });
    expect(resolveDialogAnchor("???", [], "freier")).toBeNull();
  });

  it("behält die bisherigen Validierungsantworten", () => {
    expect(prepareDialogPersist({})).toEqual({
      ok: false,
      error: "Mindestens 2 Turns (1 User + 1 Antwort) nötig",
    });
    expect(prepareDialogPersist({
      turns: [{ role: "user", text: "hallo" }, { role: "user", text: "noch" }],
    })).toEqual({ ok: false, error: "Letzter Turn muss eine Model-Antwort sein" });
  });
});
