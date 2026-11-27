import { describe, expect, it } from "vitest";
import { createSpeechController, type SpeechSynth } from "@/lib/speechControl";
import {
  audibleChapterImpulses,
  audibleKernsaetze,
  chapterImpulse,
  isVolumeOrTitlePage,
  plainSpeechText,
} from "@/lib/speechText";

function fakeSynth() {
  const calls: string[] = [];
  let end: (() => void) | undefined;
  const synth: SpeechSynth = {
    speak(_text, handlers) { calls.push("speak"); end = handlers.onend; },
    cancel() { calls.push("cancel"); },
    pause() { calls.push("pause"); },
    resume() { calls.push("resume"); },
  };
  return { synth, calls, finish: () => end?.() };
}

function chapter(
  id: string,
  title: string,
  content: string,
  partTitle = "Einleitung",
) {
  return { id, title, partTitle, content };
}

describe("Hörfassung", () => {
  it("kürzt Kapitel auf zwei Sätze und lässt Zurückgenommenes weg", () => {
    expect(plainSpeechText("**Hallo** [Werk](https://x.test).")).toBe("Hallo Werk.");
    const impulse = chapterImpulse("Erster Satz der Einleitung ist lang genug. Zweiter Satz folgt hier. Dritter nicht.");
    expect(impulse).toBe("Erster Satz der Einleitung ist lang genug. Zweiter Satz folgt hier.");
    expect(chapterImpulse("Zu kurz.")).toBe("");
    const kept = audibleKernsaetze([
      { kernsatz: "Ein Satz.", answerId: "a" },
      { kernsatz: "Weg.", answerId: "b" },
      { kernsatz: "   ", answerId: "c" },
    ], ["b"]);
    expect(kept.map(k => k.answerId)).toEqual(["a"]);
  });

  it("schaltet Abspielen, Pause und einen anderen Text", () => {
    const fake = fakeSynth();
    const seen: string[] = [];
    const control = createSpeechController(fake.synth, s => seen.push(s.phase));
    control.toggle("eins", "Erster Kernsatz.");
    expect(control.state).toEqual({ id: "eins", phase: "playing" });
    control.toggle("eins", "Erster Kernsatz.");
    expect(control.state.phase).toBe("paused");
    control.toggle("eins", "Erster Kernsatz.");
    expect(control.state.phase).toBe("playing");
    control.toggle("zwei", "Zweiter.");
    expect(control.state).toEqual({ id: "zwei", phase: "playing" });
    expect(fake.calls).toEqual(["cancel", "speak", "pause", "resume", "cancel", "speak"]);
    fake.finish();
    expect(control.state).toEqual({ id: null, phase: "idle" });
    expect(seen.at(-1)).toBe("idle");
  });
});

describe("Kapitelimpulse: Titelseiten und Lesereihenfolge", () => {
  const overview =
    "TEIL IV: DIE ARCHITEKTUR DER LEITMOTIVE TEIL V: RESONANZVERNUNFT — Erste Kritik TEIL VI: PRAKTISCHE RESONANZVERNUNFT";
  const vorwortText =
    "Dieses Werk entstand in einer Zeit, in der die Frage nach dem Verhältnis von Mensch und Maschine aufgehört hat, eine akademische Frage zu sein. Sie ist zur existenziellen Frage geworden.";
  const praeambelText =
    "In drei Gesängen erzählt diese Trilogie vom Menschen im digitalen Zeitalter. Nicht als Warnung, nicht als Utopie.";
  const prologText =
    "Gesang von Uruk und der Maschine, aus Stein und Lehm in Strom und Licht. Die Überführung der alten Sage beginnt hier.";
  const reflexionLong =
    "Die Überführung ist Arbeit am Mythos, nicht dessen Abschaffung. Der erste Band prüft, was bleibt, wenn die Sage den Code betritt.";
  const reflexionShort =
    "Eine kürzere Zweitfassung der Reflexion, die nicht an die Stelle der ersten treten darf. Sonst würde die Lesereihenfolge brechen.";

  it("erkennt Band-Titelseiten und Teil-Übersichten ohne Prosasätze", () => {
    expect(isVolumeOrTitlePage(chapter("band3-intro", "Band III: Die Rückbindung", overview))).toBe(true);
    expect(isVolumeOrTitlePage(chapter("band1-intro", "Band I: Die Überführung", "Code und Künstlicher Intelligenz"))).toBe(true);
    expect(isVolumeOrTitlePage(chapter("band2-intro", "Band II: Der Ausgang", ""))).toBe(true);
    expect(isVolumeOrTitlePage(chapter("vorwort", "Vorwort", vorwortText))).toBe(false);
    expect(isVolumeOrTitlePage(chapter("band3-prolog", "Prolog: Die Stille zwischen den Signalen", prologText))).toBe(false);
    expect(isVolumeOrTitlePage(chapter(
      "teil4",
      "Teil IV: Die Architektur der Leitmotive",
      "Die fünf Leitmotive sind die tragenden Säulen des Werks. Sie prüfen die Mündigkeit, statt sie abzuschaffen.",
    ))).toBe(false);
  });

  it("lässt die Band-III-Übersicht aus und beginnt mit dem Vorwort", () => {
    const chapters = [
      chapter("vorwort", "Vorwort", ""),
      chapter("praeambel", "Präambel zur Trilogie", ""),
      chapter("band1-intro", "Band I: Die Überführung", ""),
      chapter("band2-intro", "Band II: Der Ausgang", ""),
      chapter("band3-intro", "Band III: Die Rückbindung", overview),
      chapter("schlussreflexion", "Schlussreflexion", ""),
      chapter("glossar", "Glossar der philosophischen Begriffe", ""),
      chapter("vorwort", "Vorwort", vorwortText),
      chapter("praeambel", "Präambel zur Trilogie", praeambelText),
      chapter("band1-intro", "Band I: Die Überführung", "Code und Künstlicher Intelligenz"),
      chapter("band1-prolog", "Prolog: Die Überführung beginnt", prologText, "Band I: Die Überführung"),
    ];
    const impulses = audibleChapterImpulses(chapters);
    expect(impulses.map(item => item.chapter.id)).toEqual(["vorwort", "praeambel", "band1-prolog"]);
    expect(impulses[0].chapter.title).toBe("Vorwort");
    expect(impulses[0].text.startsWith("Dieses Werk entstand")).toBe(true);
    expect(impulses.some(item => item.chapter.id === "band3-intro" || item.chapter.title.startsWith("Band III"))).toBe(false);
  });

  it("überspringt leere stubs, behält den ersten inhaltlichen Eintrag und keine späteren Duplikate", () => {
    const chapters = [
      chapter("band1-reflexion", "Reflexion zu Band I", reflexionLong, "Band I: Die Überführung"),
      chapter("band2-epilog", "Epilog: Ein neuer Ausgang", "Nach der Prüfung der Vernunft bleibt der Mut zur Imperfektion. Ein neuer Ausgang öffnet sich."),
      chapter("band1-reflexion", "Reflexion zu Band I", reflexionShort, "Band I: Die Überführung"),
      chapter("band3-intro", "Band III: Die Rückbindung", ""),
    ];
    const impulses = audibleChapterImpulses(chapters);
    expect(impulses.map(item => item.chapter.id)).toEqual(["band1-reflexion", "band2-epilog"]);
    expect(impulses[0].text.startsWith("Die Überführung ist Arbeit am Mythos")).toBe(true);
  });
});
