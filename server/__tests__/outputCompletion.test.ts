import { describe, expect, it } from "vitest";
import { endsComplete, outputTokenBudget, spliceContinuation } from "../lib/geminiText.js";

describe("outputTokenBudget", () => {
  it("legt ein Denk-Budget auf das sichtbare Ausgabe-Budget", () => {
    expect(outputTokenBudget(4000, 512)).toBe(4512);
  });

  it("lässt das Budget unverändert, wenn nicht gedacht wird", () => {
    expect(outputTokenBudget(8192, 0)).toBe(8192);
    expect(outputTokenBudget(250, undefined)).toBe(250);
  });
});

describe("endsComplete", () => {
  it("erkennt Satzschluss auch in Markdown-Hüllen", () => {
    expect(endsComplete("ein Gedanke.")).toBe(true);
    expect(endsComplete("*war das nicht neu?*")).toBe(true);
    expect(endsComplete("Es ist kein")).toBe(false);
    expect(endsComplete("durch Irrational")).toBe(false);
  });
});

describe("spliceContinuation", () => {
  it("führt ein abgebrochenes Wort ohne Leerzeichen weiter", () => {
    expect(spliceContinuation("Sie wird nicht durch Irrational", "ität ersetzt, sondern erweitert.")).toBe(
      "Sie wird nicht durch Irrationalität ersetzt, sondern erweitert.",
    );
  });

  it("entfernt eine wiederholte Abbruchstelle", () => {
    const partial = "Der Pfad endet im Zwischen. Es ist kein";
    const extra = "Der Pfad endet im Zwischen. Es ist kein starres System.";
    expect(spliceContinuation(partial, extra)).toBe("Der Pfad endet im Zwischen. Es ist kein starres System.");
  });

  it("hält ein öffnendes Anführungszeichen am Fragment", () => {
    expect(spliceContinuation('eine "', "Antwort ohne Intentionalität\".")).toBe(
      'eine "Antwort ohne Intentionalität".',
    );
  });
});
