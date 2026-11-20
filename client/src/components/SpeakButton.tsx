/**
 * Abspielen und Pause über die Web Speech API. Eine Stimme für die ganze Seite.
 */
import { useEffect, useState } from "react";
import { createSpeechController, type SpeechPhase, type SpeechState, type SpeechSynth } from "@/lib/speechControl";
import { plainSpeechText } from "@/lib/speechText";

const listeners = new Set<(state: SpeechState) => void>();
let controller: ReturnType<typeof createSpeechController> | null = null;
let unsupported = false;

function browserSynth(): SpeechSynth | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const synth = window.speechSynthesis;
  return {
    speak(text, handlers) {
      const utterance = new SpeechSynthesisUtterance(plainSpeechText(text));
      utterance.lang = "de-DE";
      utterance.rate = 0.95;
      const voice = synth.getVoices().find(v => v.lang.toLowerCase().startsWith("de"));
      if (voice) utterance.voice = voice;
      utterance.onend = () => handlers.onend?.();
      utterance.onerror = () => handlers.onerror?.();
      synth.speak(utterance);
    },
    cancel() { synth.cancel(); },
    pause() { synth.pause(); },
    resume() { synth.resume(); },
  };
}

function shared() {
  if (unsupported) return null;
  if (controller) return controller;
  const synth = browserSynth();
  if (!synth) {
    unsupported = true;
    return null;
  }
  controller = createSpeechController(synth, state => listeners.forEach(fn => fn(state)));
  return controller;
}

const LABEL: Record<SpeechPhase, string> = {
  idle: "Hören",
  playing: "Pause",
  paused: "Weiter",
};

export default function SpeakButton({ id, text, light = false, color }: { id: string; text: string; light?: boolean; color?: string }) {
  const [state, setState] = useState<SpeechState>({ id: null, phase: "idle" });
  const [ok, setOk] = useState(true);

  useEffect(() => {
    if (!shared()) {
      setOk(false);
      return;
    }
    const fn = (next: SpeechState) => setState(next);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  if (!ok || !text.trim()) return null;
  const phase: SpeechPhase = state.id === id ? state.phase : "idle";
  return (
    <button
      type="button"
      aria-pressed={phase === "playing"}
      onClick={() => shared()?.toggle(id, text)}
      style={{
        fontFamily: "ui-monospace, monospace",
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: color ?? (light ? "#fbbf24" : "inherit"),
        background: "none",
        border: `1px solid ${color ?? (light ? "rgba(245,158,11,0.45)" : "currentColor")}`,
        borderRadius: 4,
        padding: "0.25rem 0.45rem",
        cursor: "pointer",
        minHeight: 28,
      }}
    >
      {LABEL[phase]}
    </button>
  );
}
