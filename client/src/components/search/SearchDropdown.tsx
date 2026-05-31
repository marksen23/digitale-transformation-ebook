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
  // hits sind bereits tier-first sortiert (siehe useHybridSearch / mergeHits),
  // also genügt ein Single-Pass: jedes Mal wenn (tier, type) wechselt,
  // hängen wir einen Header (und ggf. die "Weiterführend"-Trennlinie) an.
  // sources-Prop bleibt drin als Anker, falls TYPE_LABELS später per-Source
  // angepasst wird.
  void sources;
  const flatRender = useMemo(() => {
    const rows: Array<
      | { type: "header"; label: string }
      | { type: "tierDivider" }
      | { type: "hit"; hit: SearchHit; idx: number }
    > = [];
    let flatIdx = 0;
    let lastTier: "primary" | "extended" | null = null;
    let lastType: SearchHitType | null = null;
    for (const h of hits) {
      const tier = h.tier ?? "primary";
      if (tier === "extended" && lastTier !== "extended") {
        rows.push({ type: "tierDivider" });
      }
      if (h.type !== lastType || tier !== lastTier) {
        rows.push({ type: "header", label: TYPE_LABELS[h.type] });
      }
      rows.push({ type: "hit", hit: h, idx: flatIdx++ });
      lastTier = tier;
      lastType = h.type;
    }
    return rows;
  }, [hits]);

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
          if (row.type === "tierDivider") {
            return (
              <div key={`d-${ri}`} className="flex items-center gap-2 px-2 pt-3 pb-1">
                <span className="flex-1 h-px bg-stone-200 dark:bg-stone-700" aria-hidden />
                <span className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500">
                  Weiterführend
                </span>
                <span className="flex-1 h-px bg-stone-200 dark:bg-stone-700" aria-hidden />
              </div>
            );
          }
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
