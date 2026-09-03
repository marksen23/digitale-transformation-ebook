/**
 * useAudioPlayer
 *
 * Verwaltet die Wiedergabe von vorproduzierten MP3-Audiodateien
 * (männliche / weibliche Stimme) pro Kapitel.
 *
 * Audio-Dateien:  /audio/male/{chapterId}.mp3
 *                 /audio/female/{chapterId}.mp3
 * Timestamps:     /audio/timestamps/{chapterId}.json
 *                 Format: [{w:"Wort", s:0.0, e:0.35}, …]
 *
 * Wort-Highlighting läuft über direkte DOM-Klassenänderungen (kein React-
 * State-Update pro Frame), damit der RAF-Loop keine Renderer-Kaskade auslöst.
 * Paragraphen-Highlighting wird über den `onParaChange`-Callback nach außen
 * gegeben (≤ 30fps Aktualisierung).
 *
 * Fallback (Browser-TTS): solange keine produzierte MP3 existiert — aktuell
 * durchgängig der Fall, client/public/audio/{male,female,timestamps} sind
 * leer —, wird stattdessen die SpeechSynthesis-API des Browsers genutzt, ein
 * Utterance pro Absatz (chapterDisplay), verkettet über onend. Absatzweise
 * statt ein langes Utterance, weil pause()/resume() der Web-Speech-API auf
 * vielen Geräten (v.a. Android) unzuverlässig ist — Pause bricht hier den
 * aktuellen Absatz sauber ab und merkt sich die Stelle zum Fortsetzen.
 * `onParaChange` feuert exakt bei jedem Utterance-Start, kein charIndex-
 * Mapping nötig. Voice-Auswahl nutzt dieselben Heuristiken wie useSpeech.ts.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { guessVoiceGender } from './useSpeech';

// ─── Types ────────────────────────────────────────────────────

export type VoiceGender = 'male' | 'female';

export interface WordTimestamp {
  w: string;   // Wort
  s: number;   // Start in Sekunden
  e: number;   // End in Sekunden
}

interface UseAudioPlayerOptions {
  /** Paragraphen-Klartexte (markdown entfernt) zur Word→Para-Zuordnung */
  plainParagraphs?: string[];
  /** Callback wenn sich das aktive Wort ändert (para-Index, word-Index im Para) */
  onParaChange?: (paraIdx: number) => void;
}

export interface AudioPlayerAPI {
  playing: boolean;
  currentTime: number;
  duration: number;
  /** Fortschritt 0–100 */
  progress: number;
  hasAudio: boolean;
  hasTimestamps: boolean;
  loading: boolean;
  /**
   * Gesetzt, wenn der Browser-TTS-Fallback speak() zwar aufruft, aber kein
   * onstart-Event kommt (z.B. installierte PWA ohne erreichbare Plattform-
   * TTS-Bridge — bekanntes Chromium/WebView-Verhalten). Ohne diese Erkennung
   * sah der Play-Button "aktiv" aus, ohne dass je etwas hörbar wurde.
   */
  ttsUnavailable: boolean;
  voice: VoiceGender;
  setVoice: (v: VoiceGender) => void;
  rate: number;
  setRate: (r: number) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  seekFraction: (fraction: number) => void;
}

// ─── Helpers ─────────────────────────────────────────────────

/** Binärsuche: gibt den Index des Timestamps zurück, das zum Zeitpunkt t aktiv ist. */
function findWordIdx(timestamps: WordTimestamp[], t: number): number {
  if (!timestamps.length) return -1;
  let lo = 0, hi = timestamps.length - 1, result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timestamps[mid].s <= t) { result = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  // Prüfe ob t noch innerhalb des End-Zeitstempels liegt
  if (result >= 0 && t > timestamps[result].e + 0.08) return -1;
  return result;
}

/** Gibt Wortanzahl des Klartexts zurück. */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Baut ein Array das für jeden globalen Wort-Index den Paragraphen-Index enthält.
 * Z. B. para 0 hat 15 Wörter, para 1 hat 20 → wordToParaMap[0..14]=0, [15..34]=1 …
 */
function buildWordToParaMap(plainParas: string[]): number[] {
  const map: number[] = [];
  plainParas.forEach((para, i) => {
    const n = countWords(para);
    for (let k = 0; k < n; k++) map.push(i);
  });
  return map;
}

/** Restliche Markdown-Reste vor dem Vorlesen entfernen (Absätze sind i. d. R. bereits reine Prosa). */
function cleanForSpeech(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^>\s*/gm, '')
    .trim();
}

/** Beste verfügbare Stimme für die gewünschte Geschlechts-Präferenz, bevorzugt Deutsch. */
function pickTtsVoice(gender: VoiceGender): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
  const all = window.speechSynthesis.getVoices();
  if (all.length === 0) return undefined;
  const de = all.filter(v => v.lang.toLowerCase().startsWith('de'));
  const pool = de.length > 0 ? de : all;
  return pool.find(v => guessVoiceGender(v.name) === gender) ?? pool[0];
}

// ─── Hook ─────────────────────────────────────────────────────

export function useAudioPlayer(
  chapterId: string | null,
  initialVoice: VoiceGender = 'female',
  opts: UseAudioPlayerOptions = {},
): AudioPlayerAPI {
  const { plainParagraphs, onParaChange } = opts;

  const [voice, setVoiceState] = useState<VoiceGender>(initialVoice);
  const [rate, setRateState] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);
  const [hasTimestamps, setHasTimestamps] = useState(false);
  const [loading, setLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rateRef = useRef(1);
  const rafRef = useRef<number>(0);
  const timestampsRef = useRef<WordTimestamp[]>([]);
  const wordToParaRef = useRef<number[]>([]);
  const currentWordIdxRef = useRef(-1);
  const currentParaIdxRef = useRef(-1);
  const frameCountRef = useRef(0);

  // ─── Browser-TTS-Fallback (keine produzierte MP3 gefunden) ───────────────
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [ttsParaIdx, setTtsParaIdx] = useState(-1);
  const audioSourceRef = useRef<'mp3' | 'tts' | null>(null);
  const plainParagraphsRef = useRef<string[]>([]);
  const ttsActiveRef = useRef(false);
  const ttsParaIdxRef = useRef(0);
  const ttsUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const ttsWatchdogRef = useRef<number | undefined>(undefined);
  const ttsKeepAliveRef = useRef<number | undefined>(undefined);
  const [ttsUnavailable, setTtsUnavailable] = useState(false);

  // Chrome (v.a. Desktop/Android) legt eine laufende SpeechSynthesis nach
  // ~15s Inaktivität in einen internen Pause-Zustand, aus dem sie sich nie
  // wieder erholt (langjähriger Chromium-Bug, crbug.com/679437) — bei
  // längeren Absätzen bricht das Vorlesen dann mitten im Satz lautlos ab.
  // Standard-Workaround: alle paar Sekunden pause()+resume() erzwingen,
  // solange aktiv vorgelesen wird.
  const startTtsKeepAlive = useCallback(() => {
    if (ttsKeepAliveRef.current !== undefined) return;
    ttsKeepAliveRef.current = window.setInterval(() => {
      if (!ttsActiveRef.current || !window.speechSynthesis.speaking) return;
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }, 8000);
  }, []);
  const stopTtsKeepAlive = useCallback(() => {
    if (ttsKeepAliveRef.current !== undefined) {
      window.clearInterval(ttsKeepAliveRef.current);
      ttsKeepAliveRef.current = undefined;
    }
  }, []);

  // Browser lädt Stimmen asynchron nach — früh anstoßen, damit pickTtsVoice()
  // beim ersten Abspielen schon eine gefüllte Liste vorfindet.
  useEffect(() => {
    if (!ttsSupported) return;
    const warm = () => { window.speechSynthesis.getVoices(); };
    warm();
    window.speechSynthesis.addEventListener('voiceschanged', warm);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', warm);
  }, [ttsSupported]);

  // RAF-Loop: läuft nur wenn Audio abspielt
  const rafLoop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;

    const t = audio.currentTime;
    const stamps = timestampsRef.current;

    // Wort-Highlighting (DOM-direkt, kein React-State)
    if (stamps.length > 0) {
      const idx = findWordIdx(stamps, t);
      if (idx !== currentWordIdxRef.current) {
        // Altes Wort ausheben
        const prev = document.querySelector<HTMLElement>('[data-wi].audio-word-active');
        if (prev) prev.classList.remove('audio-word-active');
        // Neues Wort hervorheben
        if (idx >= 0) {
          const next = document.querySelector<HTMLElement>(`[data-wi="${idx}"]`);
          if (next) next.classList.add('audio-word-active');
        }
        currentWordIdxRef.current = idx;

        // Paragraphen-Wechsel (max 30fps via frameCount)
        frameCountRef.current++;
        if (frameCountRef.current % 2 === 0 && onParaChange) {
          const paraIdx = idx >= 0 ? (wordToParaRef.current[idx] ?? -1) : -1;
          if (paraIdx !== currentParaIdxRef.current) {
            currentParaIdxRef.current = paraIdx;
            onParaChange(paraIdx);
          }
        }
      }
    }

    // Fortschritt-Update (~15fps)
    frameCountRef.current++;
    if (frameCountRef.current % 4 === 0) {
      setCurrentTime(t);
    }

    rafRef.current = requestAnimationFrame(rafLoop);
  }, [onParaChange]);

  const stopRaf = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
  }, []);

  const cleanHighlight = () => {
    const prev = document.querySelector<HTMLElement>('[data-wi].audio-word-active');
    if (prev) prev.classList.remove('audio-word-active');
    currentWordIdxRef.current = -1;
    currentParaIdxRef.current = -1;
  };

  // Wenn sich plainParagraphs ändert, Wort→Para-Map neu bauen + Absätze für
  // den TTS-Fallback vormerken (dieselben Absätze, andere Verwendung).
  useEffect(() => {
    if (plainParagraphs?.length) {
      wordToParaRef.current = buildWordToParaMap(plainParagraphs);
    }
    plainParagraphsRef.current = plainParagraphs ?? [];
  }, [plainParagraphs]);

  // Audio + Timestamps laden wenn chapterId oder voice wechselt
  useEffect(() => {
    if (!chapterId) return;
    stopRaf();
    cleanHighlight();

    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setHasAudio(false);
    setHasTimestamps(false);
    setLoading(true);
    setTtsUnavailable(false);
    timestampsRef.current = [];
    frameCountRef.current = 0;
    if (ttsWatchdogRef.current !== undefined) {
      window.clearTimeout(ttsWatchdogRef.current);
      ttsWatchdogRef.current = undefined;
    }
    stopTtsKeepAlive();

    // Altes Audio sauber aufräumen
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    // Alten TTS-Lauf sauber aufräumen
    audioSourceRef.current = null;
    ttsActiveRef.current = false;
    ttsParaIdxRef.current = 0;
    ttsUtteranceRef.current = null;
    setTtsParaIdx(-1);
    if (ttsSupported) window.speechSynthesis.cancel();

    const audioUrl = `/audio/${voice}/${chapterId}.mp3`;

    // Existiert die Datei? Content-Type prüfen, nicht nur res.ok — manche
    // Dev-/Static-Server (z. B. Vites SPA-Fallback) antworten auf jeden
    // unbekannten Pfad mit 200 + index.html statt mit einem echten 404.
    fetch(audioUrl, { method: 'HEAD' })
      .then(res => {
        const isAudio = res.ok && (res.headers.get('content-type') ?? '').startsWith('audio/');
        if (!isAudio) {
          setLoading(false);
          // Keine produzierte MP3 — auf Browser-TTS ausweichen, sofern der
          // Browser SpeechSynthesis unterstützt und Absätze vorliegen.
          if (ttsSupported && plainParagraphsRef.current.length > 0) {
            audioSourceRef.current = 'tts';
            setHasAudio(true);
          }
          return;
        }

        audioSourceRef.current = 'mp3';
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.preload = 'metadata';

        audio.addEventListener('loadedmetadata', () => {
          audio.playbackRate = rateRef.current;
          setDuration(audio.duration);
          setLoading(false);
          setHasAudio(true);
        });

        audio.addEventListener('play', () => {
          setPlaying(true);
          frameCountRef.current = 0;
          rafRef.current = requestAnimationFrame(rafLoop);
        });

        audio.addEventListener('pause', () => {
          setPlaying(false);
          stopRaf();
        });

        audio.addEventListener('ended', () => {
          setPlaying(false);
          stopRaf();
          cleanHighlight();
          setCurrentTime(0);
          if (audioRef.current) audioRef.current.currentTime = 0;
          if (onParaChange) onParaChange(-1);
        });

        audio.addEventListener('error', () => {
          setLoading(false);
          setHasAudio(false);
        });

        audio.load();
      })
      .catch(() => setLoading(false));

    // Timestamps laden
    fetch(`/audio/timestamps/${chapterId}.json`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          timestampsRef.current = data;
          setHasTimestamps(true);
        }
      })
      .catch(() => { /* Timestamps optional */ });

    return () => {
      stopRaf();
      cleanHighlight();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      ttsActiveRef.current = false;
      if (ttsSupported) window.speechSynthesis.cancel();
      if (ttsWatchdogRef.current !== undefined) {
        window.clearTimeout(ttsWatchdogRef.current);
        ttsWatchdogRef.current = undefined;
      }
      stopTtsKeepAlive();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, voice]);

  // Absatzweise Verkettung fürs Browser-TTS: ein Utterance je Absatz, per
  // onend zum nächsten. `ttsUtteranceRef`-Identitätscheck verhindert, dass
  // ein durch cancel()+Neustart (Tempo-Wechsel) verworfenes Utterance seine
  // eigene onend/onerror-Callback noch die Kette fortsetzen lässt.
  const speakParagraph = useCallback((idx: number, watchdogMs = 2500) => {
    if (!ttsSupported) return;
    const paras = plainParagraphsRef.current;
    if (idx < 0 || idx >= paras.length) {
      ttsActiveRef.current = false;
      ttsParaIdxRef.current = 0;
      currentParaIdxRef.current = -1;
      setPlaying(false);
      setTtsParaIdx(-1);
      stopTtsKeepAlive();
      if (onParaChange) onParaChange(-1);
      return;
    }
    const text = cleanForSpeech(paras[idx]);
    if (!text) { speakParagraph(idx + 1, watchdogMs); return; }

    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = rateRef.current;
    utt.pitch = 1;
    const pickedVoice = pickTtsVoice(voice);
    if (pickedVoice) {
      utt.voice = pickedVoice;
      // Der Stimme ihre eigene lang zuweisen statt pauschal 'de-DE' — manche
      // Engines lehnen speak() still ab, wenn utt.lang und utt.voice.lang
      // nicht exakt übereinstimmen.
      utt.lang = pickedVoice.lang;
    } else {
      utt.lang = 'de-DE';
    }

    const clearWatchdog = () => {
      if (ttsWatchdogRef.current !== undefined) {
        window.clearTimeout(ttsWatchdogRef.current);
        ttsWatchdogRef.current = undefined;
      }
    };

    utt.onstart = () => {
      clearWatchdog();
      setTtsUnavailable(false);
      ttsParaIdxRef.current = idx;
      currentParaIdxRef.current = idx;
      setTtsParaIdx(idx);
      if (onParaChange) onParaChange(idx);
    };
    utt.onend = () => {
      clearWatchdog();
      if (!ttsActiveRef.current) return;
      if (ttsUtteranceRef.current !== utt) return;
      // Ab hier ist die Engine erwiesenermaßen warm (dieser Absatz hat
      // tatsächlich gesprochen) — der nächste Absatz braucht keine lange
      // Kaltstart-Kulanz mehr.
      speakParagraph(idx + 1, 2500);
    };
    utt.onerror = (event) => {
      clearWatchdog();
      if (ttsUtteranceRef.current !== utt) return;
      ttsActiveRef.current = false;
      setPlaying(false);
      stopTtsKeepAlive();
      // "canceled"/"interrupted" sind KEINE echten Fehler — sie feuern
      // genau dann, wenn WIR selbst speechSynthesis.cancel() aufrufen
      // (Pause-Klick in pause(), oder ein neuer play()-Versuch löst den
      // vorigen Utterance ab). Ohne diese Unterscheidung zeigte ein ganz
      // normaler Pause-Klick fälschlich "Sprachausgabe nicht verfügbar",
      // obwohl die Wiedergabe bis dahin einwandfrei lief (gemeldet: iOS,
      // Audio spielt hörbar, Meldung erscheint erst bei Pause). Nur andere
      // Fehlertypen (z.B. "synthesis-failed", "voice-unavailable",
      // "audio-busy") bedeuten eine tatsächlich kaputte TTS-Bridge.
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        setTtsUnavailable(true);
      }
    };

    ttsUtteranceRef.current = utt;
    // Watchdog: speak() ruft onstart in einigen installierten-PWA-Kontexten
    // nie auf (Plattform-TTS-Bridge nicht erreichbar, kein onerror entweder
    // — reiner stiller Abbruch). Ohne diese Erkennung blieb der Play-Button
    // dauerhaft im "spielt"-Zustand, ohne dass je etwas hörbar wurde. Beim
    // allerersten Absatz einer Play-Session (Kaltstart, ggf. noch Stimmen
    // am Laden) etwas großzügiger als bei bereits laufender Wiedergabe.
    clearWatchdog();
    ttsWatchdogRef.current = window.setTimeout(() => {
      if (ttsUtteranceRef.current !== utt) return;
      window.speechSynthesis.cancel();
      ttsActiveRef.current = false;
      setPlaying(false);
      setTtsUnavailable(true);
      stopTtsKeepAlive();
    }, watchdogMs);
    window.speechSynthesis.speak(utt);
  }, [onParaChange, voice, ttsSupported, stopTtsKeepAlive]);

  // Stimme wechseln
  const setVoice = useCallback((v: VoiceGender) => {
    const wasPlaying = audioRef.current && !audioRef.current.paused;
    const savedTime = audioRef.current?.currentTime ?? 0;
    setVoiceState(v);
    // Nach Stimm-Wechsel: Zeit merken und nach dem Reload wieder setzen
    // (wird durch useEffect-Neustart erledigt; Zeit-Wiederherstellung optional)
    void wasPlaying; void savedTime;
  }, []);

  const play = useCallback(() => {
    if (audioSourceRef.current === 'tts') {
      if (!ttsSupported) return;
      ttsActiveRef.current = true;
      setPlaying(true);
      setTtsUnavailable(false); // erneuter Versuch — vorigen Fehlschlag nicht stehen lassen
      // Bewusst KEIN await/setTimeout vor dem ersten speak() dieser Session:
      // manche Engines (v.a. iOS Safari) verlangen, dass speak() noch
      // innerhalb derselben Nutzer-Geste (dieser Klick-Handler) synchron
      // aufgerufen wird — jede Verzögerung würde dort die Berechtigung
      // wieder verlieren. cancel() davor ist ein No-Op, wenn nichts hängt,
      // räumt aber eine ggf. hängengebliebene Queue von einem vorigen
      // Versuch synchron auf, ohne die Geste zu unterbrechen.
      window.speechSynthesis.cancel();
      startTtsKeepAlive();
      // Wenn beim Klick noch keine Stimmen geladen sind (kalter Start),
      // dem Engine mehr Zeit geben, bevor der Watchdog eingreift.
      const voicesReady = window.speechSynthesis.getVoices().length > 0;
      speakParagraph(ttsParaIdxRef.current, voicesReady ? 2500 : 4000);
      return;
    }
    audioRef.current?.play().catch(() => {});
  }, [speakParagraph, ttsSupported, startTtsKeepAlive]);

  const pause = useCallback(() => {
    if (audioSourceRef.current === 'tts') {
      ttsActiveRef.current = false;
      if (ttsSupported) window.speechSynthesis.cancel();
      setPlaying(false);
      stopTtsKeepAlive();
      return;
    }
    audioRef.current?.pause();
  }, [ttsSupported, stopTtsKeepAlive]);

  const toggle = useCallback(() => {
    if (audioSourceRef.current === 'tts') {
      if (playing) pause(); else play();
      return;
    }
    if (!audioRef.current || !hasAudio) return;
    if (audioRef.current.paused) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, [hasAudio, playing, play, pause]);

  const seek = useCallback((seconds: number) => {
    // Für den TTS-Fallback gibt es keine echte Zeitachse — nur seekFraction ist sinnvoll.
    if (audioSourceRef.current === 'tts') return;
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const seekFraction = useCallback((fraction: number) => {
    if (audioSourceRef.current === 'tts') {
      const total = plainParagraphsRef.current.length;
      if (total === 0) return;
      const idx = Math.min(total - 1, Math.max(0, Math.floor(fraction * total)));
      ttsParaIdxRef.current = idx;
      if (ttsActiveRef.current && ttsSupported) {
        window.speechSynthesis.cancel();
        speakParagraph(idx);
      } else {
        currentParaIdxRef.current = idx;
        setTtsParaIdx(idx);
        if (onParaChange) onParaChange(idx);
      }
      return;
    }
    if (!audioRef.current) return;
    const t = fraction * (audioRef.current.duration || 0);
    audioRef.current.currentTime = t;
    setCurrentTime(t);
  }, [speakParagraph, ttsSupported, onParaChange]);

  const setRate = useCallback((r: number) => {
    rateRef.current = r;
    setRateState(r);
    if (audioSourceRef.current === 'tts') {
      // Web-Speech-API erlaubt keine Live-Änderung der Rate eines laufenden
      // Utterance — laufenden Absatz mit neuem Tempo neu starten.
      if (ttsActiveRef.current && ttsSupported) {
        window.speechSynthesis.cancel();
        speakParagraph(ttsParaIdxRef.current);
      }
      return;
    }
    if (audioRef.current) audioRef.current.playbackRate = r;
  }, [speakParagraph, ttsSupported]);

  const progress = audioSourceRef.current === 'tts'
    ? (plainParagraphsRef.current.length > 0
      ? Math.min(100, ((ttsParaIdx + 1) / plainParagraphsRef.current.length) * 100)
      : 0)
    : (duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0);

  return {
    playing, currentTime, duration, progress,
    hasAudio, hasTimestamps, loading, ttsUnavailable,
    voice, setVoice, rate, setRate,
    toggle, play, pause, seek, seekFraction,
  };
}
