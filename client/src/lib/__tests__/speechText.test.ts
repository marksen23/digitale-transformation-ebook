import { describe, expect, it } from "vitest";
import { createSpeechController, type SpeechSynth } from "@/lib/speechControl";
import { audibleKernsaetze, chapterImpulse, plainSpeechText } from "@/lib/speechText";

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
