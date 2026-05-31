/**
 * Such-Vereinheitlichung — gemeinsame Typen für alle Such-Komponenten.
 *
 * Eine Source ist eine Such-Quelle (z.B. werk, resonanzen, concepts).
 * Sie liefert Hits — typisierte Suchergebnisse mit Titel, Snippet, Score.
 * Optional kann eine Source semantische Suche anbieten (Embedding-basiert).
 */

export type SearchHitType =
  | "chapter"      // Werk-Kapitel oder Werk-Chunk
  | "resonanz"    // Kuratierter Resonanz-Eintrag
  | "concept"     // Konzept-Knoten aus dem Begriffsnetz
  | "philosopher" // Philosoph aus der Tradition-Liste
  | "curation";   // Item in /admin/curation (nur AdminCuration)

export interface SearchHit {
  /** Stabile ID innerhalb des Typs */
  id: string;
  type: SearchHitType;
  /** Anzeigetitel (Kapitel, Resonanz-Frage, Knoten-Label, …) */
  title: string;
  /** Vorschau-Snippet (mit Highlight-Markern möglich) */
  snippet: string;
  /** Score 0..1 — gemeinsame Skala über alle Sources */
  score: number;
  /** Typ-spezifische Daten, die onSelect zurückbekommt */
  payload?: unknown;
  /** Optionaler Sprung-Anker (z.B. URL-Pfad oder Kapitel-ID) */
  anchor?: string;
  /** Modus: 'lex' (Substring) oder 'sem' (Embedding) — für Badge-Anzeige */
  mode?: "lex" | "sem";
  /**
   * Tier:
   *   primary  = passt direkt zur aktiven Page (z.B. concepts im Begriffsnetz)
   *   extended = weiterführende Treffer aus anderen Quellen (z.B. Werk-Kapitel,
   *              die den Begriff erwähnen). Erscheinen unter "Weiterführend".
   * Default: primary.
   */
  tier?: "primary" | "extended";
}

export interface SearchSource {
  /** Eindeutige ID der Source (z.B. 'chapters', 'resonanzen') */
  id: string;
  type: SearchHitType;
  /** Anzeigename im Dropdown-Sektion-Header */
  label: string;
  /** Lexikalische (Substring-)Suche — läuft sofort. */
  search(q: string, ctx: SearchContext): Promise<SearchHit[]> | SearchHit[];
  /**
   * Semantische Suche — optional. Wird debounced aufgerufen.
   * Wenn nicht definiert, läuft nur die lex-Suche.
   */
  semanticSearch?(q: string, ctx: SearchContext): Promise<SearchHit[]>;
  /** Tier-Marker — wird in useHybridSearch auf die Hits propagiert. */
  tier?: "primary" | "extended";
}

export interface SearchContext {
  /** Aktive Filter — Source kann sie nutzen oder ignorieren */
  filters: ActiveFilters;
  /** Maximale Trefferzahl pro Source */
  limit: number;
  /** Locale 'de' oder 'en' (für künftige Englische-Schicht-Integration) */
  locale?: string;
}

export interface FilterOption {
  value: string;
  label: string;
  /** Optionaler Treffer-Count, der hinter dem Label gezeigt wird */
  count?: number;
}

export interface FilterGroup {
  id: string;
  label: string;
  options: FilterOption[];
  multi: boolean;
}

/** Aktive Filter-Auswahl als Map<groupId, Set<value>> */
export type ActiveFilters = Record<string, string[]>;

export interface ChipDescriptor {
  groupId: string;
  groupLabel: string;
  value: string;
  valueLabel: string;
}

export type SearchScope = "page" | "global";
