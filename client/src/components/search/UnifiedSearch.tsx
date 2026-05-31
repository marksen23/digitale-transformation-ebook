/**
 * UnifiedSearch — Hauptkomponente.
 *
 * Bringt ChipBuilder + SearchDropdown + useHybridSearch zusammen. Eine
 * Komponente, zwei Scopes:
 *   - scope="page": pro-Seite eingebettet, eine oder mehrere Sources.
 *   - scope="global": Cmd-K-Overlay, alle Sources gleichzeitig.
 *
 * Tastatur:
 *   - ↑ / ↓ navigiert Cursor durch Treffer
 *   - Enter wählt aktuellen Treffer (ruft onSelect)
 *   - Esc ruft onEscape (Parent entscheidet — schließt oder leert)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChipBuilder } from "./ChipBuilder";
import { SearchDropdown } from "./SearchDropdown";
import { useHybridSearch } from "@/hooks/useHybridSearch";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import type {
  ActiveFilters,
  FilterGroup,
  SearchHit,
  SearchScope,
  SearchSource,
} from "@/lib/search/types";

interface UnifiedSearchProps {
  scope: SearchScope;
  /** Eindeutige Scope-ID für Historie (z.B. 'reader', 'resonanzen', 'global') */
  scopeId: string;
  sources: SearchSource[];
  filterGroups?: FilterGroup[];
  initialFilters?: ActiveFilters;
  onFiltersChange?: (next: ActiveFilters) => void;
  onSelect: (hit: SearchHit) => void;
  onEscape?: () => void;
  placeholder?: string;
  enableSemantic?: boolean;
  hideTextInput?: boolean;
  autoFocus?: boolean;
  /** Limit pro Source */
  limit?: number;
  /** Wenn true: Dropdown immer rendern (auch ohne Eingabe — z.B. History) */
  alwaysOpen?: boolean;
  locale?: string;
  /** Externes Ref auf das Input-Element (zum Fokussieren aus dem Parent) */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Wird auf jeden Query-Change aufgerufen — z.B. um Graph-Färbung zu steuern. */
  onQueryChange?: (q: string) => void;
}

export function UnifiedSearch({
  scope,
  scopeId,
  sources,
  filterGroups = [],
  initialFilters = {},
  onFiltersChange,
  onSelect,
  onEscape,
  placeholder,
  enableSemantic = false,
  hideTextInput = false,
  autoFocus = false,
  limit = 5,
  alwaysOpen = false,
  locale,
  inputRef: externalInputRef,
  onQueryChange,
}: UnifiedSearchProps) {
  const [query, _setQuery] = useState("");
  const setQuery = useCallback((q: string) => {
    _setQuery(q);
    onQueryChange?.(q);
  }, [onQueryChange]);
  const [filters, setFilters] = useState<ActiveFilters>(initialFilters);
  const [cursor, setCursor] = useState(0);
  const localInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? localInputRef;

  const history = useSearchHistory(scopeId);

  const handleFiltersChange = useCallback((next: ActiveFilters) => {
    setFilters(next);
    onFiltersChange?.(next);
  }, [onFiltersChange]);

  const { hits, loading, semanticPending } = useHybridSearch({
    query,
    sources,
    filters,
    limit,
    enableSemantic,
    locale,
  });

  // Cursor zurücksetzen wenn Treffer-Set sich ändert
  useEffect(() => {
    setCursor(0);
  }, [hits.length]);

  const handleSelect = useCallback((hit: SearchHit) => {
    history.push(query);
    onSelect(hit);
  }, [history, query, onSelect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Nur reagieren, wenn das Suchfeld fokussiert ist
      if (document.activeElement !== inputRef.current && !inputRef.current?.contains(document.activeElement)) {
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor(c => Math.min(c + 1, Math.max(0, hits.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor(c => Math.max(0, c - 1));
      } else if (e.key === "Enter") {
        if (hits[cursor]) {
          e.preventDefault();
          handleSelect(hits[cursor]);
        }
      } else if (e.key === "Escape") {
        if (query) {
          e.preventDefault();
          setQuery("");
        } else {
          onEscape?.();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hits, cursor, handleSelect, query, onEscape]);

  return (
    <div className={scope === "global" ? "w-full" : "w-full max-w-2xl mx-auto"}>
      <ChipBuilder
        query={query}
        onQueryChange={setQuery}
        filterGroups={filterGroups}
        activeFilters={filters}
        onFiltersChange={handleFiltersChange}
        placeholder={placeholder}
        hideTextInput={hideTextInput}
        autoFocus={autoFocus}
        inputRef={inputRef}
      />
      {(query.trim() || alwaysOpen) && (
        <SearchDropdown
          hits={hits}
          query={query}
          cursor={cursor}
          onSelect={handleSelect}
          onCursorChange={setCursor}
          sources={sources}
          loading={loading}
          semanticPending={semanticPending}
        />
      )}
      {!query.trim() && alwaysOpen && history.history.length > 0 && (
        <div className="mt-2 px-1">
          <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
            Zuletzt
          </div>
          <div className="flex flex-wrap gap-1">
            {history.history.slice(0, 8).map(e => (
              <button
                key={e.query}
                onClick={() => setQuery(e.query)}
                className="text-[11px] px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
              >
                {e.query}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
