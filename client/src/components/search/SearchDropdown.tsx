/**
 * SearchDropdown — typisierte Live-Ergebnis-Liste.
 *
 * Gruppiert nach SearchHitType. Tastatur-Navigation (↑ ↓ Enter Esc).
 * Highlight via highlightTokens. Cursor-Position wird vom parent gesteuert.
 */
import { useMemo } from "react";
import type { SearchHit, SearchHitType, SearchSource } from "@/lib/search/types";
import { highlightTokens } from "@/lib/search/highlight";

interface SearchDropdownProps {
  hits: SearchHit[];
  query: string;
  cursor: number;
  onSelect: (hit: SearchHit, index: number) => void;
  onCursorChange?: (i: number) => void;
  sources: SearchSource[];
  loading?: boolean;
  semanticPending?: boolean;
  emptyMessage?: string;
}

const TYPE_LABELS: Record<SearchHitType, string> = {
  chapter: "Werk",
  resonanz: "Resonanzen",
  concept: "Begriffe",
  philosopher: "Philosophen",
  curation: "Kuratierung",
};

export function SearchDropdown({
  hits,
  query,
  cursor,
  onSelect,
  onCursorChange,
  sources,
  loading,
  semanticPending,
  emptyMessage = "Keine Ergebnisse",
}: SearchDropdownProps) {
  const grouped = useMemo(() => {
    const out: Record<SearchHitType, SearchHit[]> = {
      chapter: [], resonanz: [], concept: [], philosopher: [], curation: [],
    };
    for (const h of hits) out[h.type].push(h);
    return out;
  }, [hits]);

  // Source-Reihenfolge für Sektion-Display
  const orderedTypes = useMemo(() => {
    const seen = new Set<SearchHitType>();
    const ordered: SearchHitType[] = [];
    for (const s of sources) {
      if (!seen.has(s.type) && grouped[s.type].length > 0) {
        seen.add(s.type);
        ordered.push(s.type);
      }
    }
    return ordered;
  }, [sources, grouped]);

  // Flat-Index berechnen für Cursor
  let flatIdx = 0;
  const flatRender: Array<{ type: "header"; label: string } | { type: "hit"; hit: SearchHit; idx: number }> = [];
  for (const t of orderedTypes) {
    flatRender.push({ type: "header", label: TYPE_LABELS[t] });
    for (const h of grouped[t]) {
      flatRender.push({ type: "hit", hit: h, idx: flatIdx++ });
    }
  }

  if (!query.trim()) {
    return null;
  }

  return (
    <div className="mt-2 max-h-[60dvh] overflow-y-auto space-y-2">
      {loading && hits.length === 0 ? (
        <p className="text-xs text-stone-500 px-2 py-1">Suche läuft …</p>
      ) : hits.length === 0 ? (
        <p className="text-xs text-stone-500 px-2 py-1">{emptyMessage}</p>
      ) : (
        flatRender.map((row, ri) => {
          if (row.type === "header") {
            return (
              <div key={`h-${ri}`} className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 px-2 pt-1">
                {row.label}
              </div>
            );
          }
          const { hit, idx } = row;
          const isActive = idx === cursor;
          return (
            <button
              key={`${hit.type}::${hit.id}`}
              onClick={() => onSelect(hit, idx)}
              onMouseEnter={() => onCursorChange?.(idx)}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                isActive
                  ? "bg-amber-500/15 dark:bg-amber-400/15 text-amber-900 dark:text-amber-200"
                  : "hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300"
              }`}
            >
              <span className="font-medium block">
                {highlightTokens(hit.title, query)}
              </span>
              {hit.snippet && (
                <span className="block mt-0.5 text-stone-500 dark:text-stone-400 line-clamp-2">
                  {highlightTokens(hit.snippet, query)}
                </span>
              )}
              {hit.mode === "sem" && (
                <span className="inline-block mt-1 text-[9px] uppercase tracking-wider text-amber-700/60 dark:text-amber-400/60">
                  ↺ semantisch
                </span>
              )}
            </button>
          );
        })
      )}
      {semanticPending && hits.length > 0 && (
        <p className="text-[10px] text-stone-400 italic px-2">…semantisch lädt nach</p>
      )}
      {hits.length > 0 && (
        <p className="text-xs text-stone-500 px-2">{hits.length} Treffer</p>
      )}
    </div>
  );
}
