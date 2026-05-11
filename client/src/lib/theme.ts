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

/**
 * Gemeinsame Font-Stacks für alle Sub-Pages.
 *
 * SERIF — bisher 'EB Garamond italic' (literarisch-warm). Jetzt 'Inter'
 *   (clean, modern, corporate-technich). Ergibt im Italic auch noch eine
 *   leichte Cursive-Anmutung, aber deutlich nüchterner als Garamond.
 *
 * MONO — unverändert für technische Labels (Timestamps, IDs, Status).
 *
 * SERIF_BODY — wenn echtes Lese-Serif gebraucht wird (Detail-Panel-Prose
 *   in Philosophie, Antwort-Texte in Wissen), kommt Lora zum Einsatz —
 *   gleiche Wahl wie Home.tsx's Reading-Font.
 */
export const SERIF      = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
export const MONO       = "'Courier Prime', 'Courier New', monospace";
export const SERIF_BODY = "'Lora', Georgia, serif";

/**
 * Geometrie-Tokens — angeglichen an Home.tsx's Tailwind-Werte
 * (rounded-md / rounded-lg). Damit fühlen sich Sub-Page-Karten und
 * -Buttons wie eine Fortsetzung der Werk-Hauptseite an.
 */
export const RADIUS = {
  button: "4px",   // rounded
  card: "6px",     // rounded-md
  panel: "8px",    // rounded-lg
} as const;

export const TRANSITION = "all 0.15s ease";

/** Subtile Schatten — leichter als Material, eher Notion-style. */
export const SHADOW = {
  card: "0 1px 2px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.04)",
  panel: "0 2px 6px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.05)",
  hover: "0 2px 8px rgba(0,0,0,0.08), 0 6px 16px rgba(0,0,0,0.06)",
} as const;

/**
 * Klassische Setzer-Vokabeln — die Sprache, in der die alten Traditionen
 * gedruckt wurden, übergeführt in die digitale Oberfläche. Nicht als
 * nostalgische Verzierung, sondern als typografische Wahrhaftigkeit:
 * Kapitälchen-Sperrung, Fleuron-Trenner, Inkunabel-Initialen.
 *
 * Verwendung in AppFrame, Detail-Panels, Section-Trennungen.
 */

/** Sperrung für Versalien — "S P I N O Z A" statt "SPINOZA". */
export const TRACKED = {
  /** 0.18em — App-Header, Section-Labels (z.B. "DAS WERK") */
  tight: "0.18em",
  /** 0.28em — Caption-Labels, MONO-Mini-Bezeichnungen */
  open: "0.28em",
  /** 0.45em — sehr offene Klassik-Sperrung für H1-Versalien */
  classic: "0.45em",
} as const;

/** Fleuron-Glyphen für ornamentale Trennungen. Aus Unicode-Repertoire,
 *  keine externen Fonts nötig — funktioniert in jedem Sans/Serif-Fallback. */
export const ORNAMENT = {
  /** ❦ — Aldus leaf, das klassische Buch-Fleuron */
  leaf: "❦",
  /** ❧ — gewendetes Aldus-Blatt, für invertierte Trenner */
  leafReversed: "❧",
  /** ⁂ — Asterism, drei sterne als Sektions-Bruch */
  asterism: "⁂",
  /** ◈ — Romboid, modernerer Akzent in klassischem Rhythmus */
  rhombus: "◈",
  /** · — Middle dot, dezenter inline-Trenner */
  middot: "·",
} as const;

/**
 * Pergament-warme Hintergrund-Variante für klassisch-buchhafte Sektionen
 * (z.B. Buch-Sicht in Philosophie, Detail-Panels mit Originalzitat).
 * Niemals als App-default — nur dort, wo der Buchcharakter den
 * Vordergrund tragen soll.
 */
export const PAPER = {
  warmLight: "#f7f1e3",  // alter Pergament-Ton, hell
  warmDark:  "#1a1612",  // gegraute Vellum-Variante, dunkel
  inkLight:  "#3a3530",  // dunkle Tinte auf hellem Papier
  inkDark:   "#c8c2b4",  // helle Tinte auf dunklem Vellum
} as const;
