/**
 * Abspielen und Pause für einen Text. Die Browser-Stimme wird von außen
 * hineingereicht, damit der Zustandswechsel ohne SpeechSynthesis testbar ist.
 */

export type SpeechPhase = "idle" | "playing" | "paused";

export interface SpeechState {
  id: string | null;
  phase: SpeechPhase;
}

export interface SpeechSynth {
  speak(text: string, handlers: { onend?: () => void; onerror?: () => void }): void;
  cancel(): void;
  pause(): void;
  resume(): void;
}

export function createSpeechController(synth: SpeechSynth, onChange: (state: SpeechState) => void) {
  let state: SpeechState = { id: null, phase: "idle" };
  const set = (next: SpeechState) => {
    state = next;
    onChange(state);
  };
  return {
    get state() {
      return state;
    },
    toggle(id: string, text: string) {
      const spoken = text.trim();
      if (!spoken) return;
      if (state.id === id && state.phase === "playing") {
        synth.pause();
        set({ id, phase: "paused" });
        return;
      }
      if (state.id === id && state.phase === "paused") {
        synth.resume();
        set({ id, phase: "playing" });
        return;
      }
      synth.cancel();
      set({ id, phase: "playing" });
      synth.speak(spoken, {
        onend: () => { if (state.id === id && state.phase !== "paused") set({ id: null, phase: "idle" }); },
        onerror: () => { if (state.id === id) set({ id: null, phase: "idle" }); },
      });
    },
  };
}
