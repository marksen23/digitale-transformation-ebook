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
 */

import { useRef, useState, useEffect, useCallback } from 'react';

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
  voice: VoiceGender;
  setVoice: (v: VoiceGender) => void;
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

// ─── Hook ─────────────────────────────────────────────────────

export function useAudioPlayer(
  chapterId: string | null,
  initialVoice: VoiceGender = 'female',
  opts: UseAudioPlayerOptions = {},
): AudioPlayerAPI {
  const { plainParagraphs, onParaChange } = opts;

  const [voice, setVoiceState] = useState<VoiceGender>(initialVoice);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);
  const [hasTimestamps, setHasTimestamps] = useState(false);
  const [loading, setLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const timestampsRef = useRef<WordTimestamp[]>([]);
  const wordToParaRef = useRef<number[]>([]);
  const currentWordIdxRef = useRef(-1);
  const currentParaIdxRef = useRef(-1);
  const frameCountRef = useRef(0);

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

  // Wenn sich plainParagraphs ändert, Wort→Para-Map neu bauen
  useEffect(() => {
    if (plainParagraphs?.length) {
      wordToParaRef.current = buildWordToParaMap(plainParagraphs);
    }
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
    timestampsRef.current = [];
    frameCountRef.current = 0;

    // Altes Audio sauber aufräumen
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    const audioUrl = `/audio/${voice}/${chapterId}.mp3`;

    // Existiert die Datei?
    fetch(audioUrl, { method: 'HEAD' })
      .then(res => {
        if (!res.ok) { setLoading(false); return; }

        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.preload = 'metadata';

        audio.addEventListener('loadedmetadata', () => {
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
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, voice]);

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
    audioRef.current?.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    if (!audioRef.current || !hasAudio) return;
    if (audioRef.current.paused) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, [hasAudio]);

  const seek = useCallback((seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const seekFraction = useCallback((fraction: number) => {
    if (!audioRef.current) return;
    const t = fraction * (audioRef.current.duration || 0);
    audioRef.current.currentTime = t;
    setCurrentTime(t);
  }, []);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return {
    playing, currentTime, duration, progress,
    hasAudio, hasTimestamps, loading,
    voice, setVoice,
    toggle, play, pause, seek, seekFraction,
  };
}
