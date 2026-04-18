import { useState, useRef, useCallback, useEffect } from 'react';

// Speech API constructor types are not always on `window` at compile time.
// We access them dynamically via `any` to handle both the standard and
// webkit-prefixed variants across all browsers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySRConstructor = new () => any;

function getSRConstructor(): AnySRConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null) as AnySRConstructor | null;
}

// ─── Speech Recognition (STT) ──────────────────────────────────────────────

export function useSpeechRecognition(
  onResult: (text: string) => void,
  lang = 'de-DE',
) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    setSupported(!!getSRConstructor());
  }, []);

  const start = useCallback(() => {
    const SR = getSRConstructor();
    if (!SR) return;
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = String(e.results[0][0].transcript);
      onResultRef.current(transcript);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [lang]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop(); else start();
  }, [listening, start, stop]);

  return { listening, supported, start, stop, toggle };
}

// ─── Speech Synthesis (TTS) ────────────────────────────────────────────────

export function useSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const getVoice = useCallback((lang: string): SpeechSynthesisVoice | null => {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find(v => v.lang === lang) ??
      voices.find(v => v.lang.startsWith(lang.slice(0, 2))) ??
      null
    );
  }, []);

  const speak = useCallback((text: string, lang = 'de-DE') => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    // Strip markdown syntax for clean audio
    const clean = text
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/^>\s*/gm, '')
      .trim();

    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = lang;
    utt.rate = 0.92;
    utt.pitch = 1;

    const applyVoice = () => {
      const voice = getVoice(lang);
      if (voice) utt.voice = voice;
    };
    applyVoice();
    // Voices may still be loading — retry when they become available
    if (!utt.voice) {
      window.speechSynthesis.onvoiceschanged = () => {
        applyVoice();
        window.speechSynthesis.onvoiceschanged = null;
      };
    }

    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utt);
  }, [getVoice]);

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return { speaking, supported, speak, stop };
}
