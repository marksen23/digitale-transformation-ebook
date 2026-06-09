/**
 * readingSettings.ts — Lese-Komfort für den Werk-Reader (Roadmap „Das
 * wachsende Werk", Phase 6).
 *
 * Klassische eBook-Regler: Schriftgröße, Zeilenbreite (measure), Serif/Sans.
 * Rein clientseitig (localStorage), kein Server. Der Pergament-Hintergrund ist
 * bereits Default des Readers — hier geht es um die Typografie der Lesespalte.
 */
import { useState } from "react";
import { SERIF, SERIF_BODY } from "@/lib/theme";

export interface ReadingSettings {
  /** Skaliert die Absatz-Schriftgröße (Basis 1.05rem). */
  fontScale: number;
  /** Breite der Lesespalte in rem (klassischer Buchsatz ~36). */
  measure: number;
  /** true = Lese-Serife (Lora), false = Sans (Inter). */
  serifBody: boolean;
}

export const READING_DEFAULTS: ReadingSettings = { fontScale: 1, measure: 36, serifBody: true };

export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.5;
export const MEASURE_MIN = 30;
export const MEASURE_MAX = 46;

const KEY = "resonanzvernunft.reading";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function loadReadingSettings(): ReadingSettings {
  if (typeof localStorage === "undefined") return { ...READING_DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...READING_DEFAULTS };
    const p = JSON.parse(raw) as Partial<ReadingSettings>;
    return {
      fontScale: clamp(typeof p.fontScale === "number" ? p.fontScale : 1, FONT_SCALE_MIN, FONT_SCALE_MAX),
      measure: clamp(typeof p.measure === "number" ? p.measure : 36, MEASURE_MIN, MEASURE_MAX),
      serifBody: typeof p.serifBody === "boolean" ? p.serifBody : true,
    };
  } catch {
    return { ...READING_DEFAULTS };
  }
}

function saveReadingSettings(s: ReadingSettings): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota/private */ }
}

/** Hook: Settings + partial-Update mit Persistenz. */
export function useReadingSettings(): {
  settings: ReadingSettings;
  update: (patch: Partial<ReadingSettings>) => void;
  reset: () => void;
} {
  const [settings, setSettings] = useState<ReadingSettings>(loadReadingSettings);
  const update = (patch: Partial<ReadingSettings>) =>
    setSettings(s => { const next = { ...s, ...patch }; saveReadingSettings(next); return next; });
  const reset = () => { saveReadingSettings(READING_DEFAULTS); setSettings({ ...READING_DEFAULTS }); };
  return { settings, update, reset };
}

/** Aufgelöster Font-Stack für die Absätze. */
export function bodyFont(s: ReadingSettings): string {
  return s.serifBody ? SERIF_BODY : SERIF;
}
