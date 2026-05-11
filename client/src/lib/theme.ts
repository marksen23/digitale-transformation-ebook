/**
 * theme.ts — zentraler Wahrheits-Quell für die Sub-Pages-Palette.
 *
 * Bisher gab es C_DARK/C_LIGHT in fünf+ Files copy-pasted. Mit dieser
 * Datei sind Farbänderungen genau ein Edit weit weg.
 *
 * Werte sind aktuell die bisherigen "Ebook-Gold"-Farben. Sie ähneln
 * Home.tsx's stone+amber-Palette stilistisch, sind aber bewusst etwas
 * wärmer (Cream statt Stone, Gold #c4a882 statt Amber #f59e0b).
 *
 * Phase-2 dieser Design-Iteration wird die Werte anpassen — die
 * Konsumenten bleiben unverändert.
 */

export interface Palette {
  void: string;        // page background
  deep: string;        // surface alternative (cards behind cards)
  surface: string;     // primary card background
  border: string;      // borders, dividers
  muted: string;       // secondary text, disabled
  textDim: string;     // text hierarchy mid
  text: string;        // body text
  textBright: string;  // strongest text (H1, hover)
  accent: string;      // primary accent (buttons, links, highlights)
  accentDim: string;   // accent at lower opacity (borders, halos)
}

export const C_DARK: Palette = {
  void: "#080808",
  deep: "#0f0f0f",
  surface: "#161616",
  border: "#2a2a2a",
  muted: "#444",
  textDim: "#888",
  text: "#c8c2b4",
  textBright: "#e8e2d4",
  accent: "#c4a882",
  accentDim: "#7a6a52",
};

export const C_LIGHT: Palette = {
  void: "#fafaf9",
  deep: "#f0ece4",
  surface: "#ffffff",
  border: "#d8d2c8",
  muted: "#a8a29e",
  textDim: "#78716c",
  text: "#3a3530",
  textBright: "#1c1917",
  accent: "#c4a882",
  accentDim: "#7a6a52",
};

/** Gemeinsame Font-Stacks für alle Sub-Pages. */
export const SERIF = "'EB Garamond', Georgia, serif";
export const MONO  = "'Courier Prime', 'Courier New', monospace";
