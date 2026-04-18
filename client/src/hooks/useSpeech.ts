import { useState, useRef, useCallback, useEffect } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface VoiceInfo {
  uri: string;
  name: string;
  lang: string;
  localService: boolean;
}

export interface SpeakOptions {
  lang?: string;
  rate?: number;
  voiceURI?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

// Speech API constructor types are not always on `window` at compile time.
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
  // charIndex from onboundary events — used to track which paragraph is spoken
  const [currentCharIndex, setCurrentCharIndex] = useState<number>(-1);
  // Available voices loaded from the browser
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Load voices — they are loaded asynchronously in most browsers
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const load = () => {
      setVoices(
        window.speechSynthesis.getVoices().map(v => ({
          uri: v.voiceURI,
          name: v.name,
          lang: v.lang,
          localService: v.localService,
        })),
      );
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const speak = useCallback((text: string, options: SpeakOptions = {}) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    setCurrentCharIndex(-1);

    // Strip markdown syntax for clean audio
    const clean = text
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/^>\s*/gm, '')
      .trim();

    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = options.lang ?? 'de-DE';
    utt.rate = options.rate ?? 1;
    utt.pitch = 1;

    // Select voice
    const availableVoices = window.speechSynthesis.getVoices();
    if (options.voiceURI) {
      const v = availableVoices.find(v => v.voiceURI === options.voiceURI);
      if (v) utt.voice = v;
    }
    // Fallback: first voice matching language prefix
    if (!utt.voice) {
      const langPrefix = utt.lang.slice(0, 2);
      const v = availableVoices.find(v => v.lang.startsWith(langPrefix));
      if (v) utt.voice = v;
    }
    // If voices not yet loaded, retry once they arrive
    if (!utt.voice) {
      const retry = () => {
        const v = window.speechSynthesis.getVoices().find(
          v => v.voiceURI === options.voiceURI || v.lang.startsWith(utt.lang.slice(0, 2))
        );
        if (v) utt.voice = v;
        window.speechSynthesis.removeEventListener('voiceschanged', retry);
      };
      window.speechSynthesis.addEventListener('voiceschanged', retry);
    }

    // Track character position for paragraph highlighting
    utt.onboundary = (e: SpeechSynthesisEvent) => {
      if (e.name === 'word' || e.name === 'sentence') {
        setCurrentCharIndex(e.charIndex);
      }
    };
    utt.onstart = () => setSpeaking(true);
    utt.onend = () => { setSpeaking(false); setCurrentCharIndex(-1); };
    utt.onerror = () => { setSpeaking(false); setCurrentCharIndex(-1); };

    window.speechSynthesis.speak(utt);
  }, []);

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    setCurrentCharIndex(-1);
  }, []);

  return { speaking, supported, speak, stop, currentCharIndex, voices };
}

// ─── Voice utilities ───────────────────────────────────────────────────────

/** Returns voices matching a language prefix, e.g. 'de' */
export function filterVoicesByLang(voices: VoiceInfo[], lang: string): VoiceInfo[] {
  return voices.filter(v => v.lang.startsWith(lang));
}

/** Heuristic gender detection from voice name */
export function guessVoiceGender(name: string): 'female' | 'male' | null {
  const lower = name.toLowerCase();
  const female = ['anna', 'petra', 'katja', 'hedda', 'zuzana', 'laura', 'marie',
    'hannah', 'sara', 'julia', 'female', 'frau', 'samantha', 'victoria',
    'karen', 'moira', 'tessa', 'fiona', 'alice', 'amelie', 'paulina'];
  const male = ['stefan', 'thomas', 'markus', 'hans', 'yannick', 'daniel',
    'felix', 'male', 'herr', 'jorge', 'diego', 'carlos', 'luca', 'reed',
    'albert', 'fred', 'ralph', 'junior'];
  if (female.some(f => lower.includes(f))) return 'female';
  if (male.some(m => lower.includes(m))) return 'male';
  return null;
}

/** Build an array of paragraph start positions in the TTS-cleaned text.
 *  Used to map `charIndex` from onboundary back to the original paragraph index. */
export function buildParaStarts(content: string): number[] {
  const paras = content
    .split('\n\n')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p =>
      p.replace(/^#{1,6}\s+/, '')
       .replace(/^>\s*/gm, '')
       .replace(/\*\*(.+?)\*\*/g, '$1')
       .replace(/\*(.+?)\*/g, '$1')
    );

  const starts: number[] = [];
  let pos = 0;
  for (const p of paras) {
    starts.push(pos);
    pos += p.length + 1; // +1 for the space separator in joined text
  }
  return starts;
}
