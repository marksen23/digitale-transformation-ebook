/**
 * shared.ts — gemeinsame Konstanten, Types und Helpers für alle
 * Visualisierungs-Sichten der Philosophischen Karte.
 */
import {
  RESONANZVERNUNFT_PFAD, TRADITIONS,
  type TraditionId,
} from "@/data/philosophyMap";

export const SERIF = "'EB Garamond', Georgia, serif";
export const MONO  = "'Courier Prime', 'Courier New', monospace";

export interface Palette {
  void: string; deep: string; surface: string; border: string;
  muted: string; textDim: string; text: string; textBright: string;
  accent: string; accentDim: string;
}

export const TIMELINE_FROM = 1620;
export const TIMELINE_TO = 2030;
export const PFAD_SET = new Set(RESONANZVERNUNFT_PFAD);

/** Chronologisch nach Tradition-Spanne sortierte Traditionen. */
export const TRADITIONS_ORDERED = [...TRADITIONS].sort((a, b) => a.spanFrom - b.spanFrom);

/** Schneller Index Tradition → Spalten-Index. */
export const TRADITION_INDEX: Record<TraditionId, number> = {} as Record<TraditionId, number>;
TRADITIONS_ORDERED.forEach((t, i) => { TRADITION_INDEX[t.id] = i; });

/** y-Position auf der Zeitstrahl-Skala 0–100% nach Jahreszahl. */
export function yearToY(year: number): number {
  return ((year - TIMELINE_FROM) / (TIMELINE_TO - TIMELINE_FROM)) * 100;
}

/** Punkt auf einer kubischen Bezier — für RootsView und RiverView. */
export function pointOnCubicBezier(
  fromX: number, fromY: number,
  cp1x: number, cp1y: number,
  cp2x: number, cp2y: number,
  toX: number, toY: number,
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  const x = u * u * u * fromX + 3 * u * u * t * cp1x + 3 * u * t * t * cp2x + t * t * t * toX;
  const y = u * u * u * fromY + 3 * u * u * t * cp1y + 3 * u * t * t * cp2y + t * t * t * toY;
  return { x, y };
}

/** Seeded RNG (mulberry32) — für deterministische Layout-Streuung. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
