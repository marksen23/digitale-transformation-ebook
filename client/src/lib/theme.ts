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

// Werte folgen Tailwind's stone-Palette (Home.tsx-Sprache) und ergänzen
// den Akzent durch amber-500/700 — damit Werk-Hauptseite und Sub-Pages
// dieselbe visuelle Stimme sprechen.

export const C_DARK: Palette = {
  void: "#0c0a09",       // stone-950
  deep: "#1c1917",       // stone-900
  surface: "#292524",    // stone-800
  border: "#44403c",     // stone-700
  muted: "#57534e",      // stone-600
  textDim: "#a8a29e",    // stone-400
  text: "#e7e5e4",       // stone-200
  textBright: "#fafaf9", // stone-50
  accent: "#f59e0b",     // amber-500
  accentDim: "#b45309",  // amber-700
};

export const C_LIGHT: Palette = {
  void: "#fafaf9",       // stone-50
  deep: "#f5f5f4",       // stone-100
  surface: "#ffffff",
  border: "#d6d3d1",     // stone-300
  muted: "#a8a29e",      // stone-400
  textDim: "#78716c",    // stone-500
  text: "#292524",       // stone-800
  textBright: "#1c1917", // stone-900
  accent: "#f59e0b",     // amber-500
  accentDim: "#b45309",  // amber-700
};

/** Gemeinsame Font-Stacks für alle Sub-Pages. */
export const SERIF = "'EB Garamond', Georgia, serif";
export const MONO  = "'Courier Prime', 'Courier New', monospace";
