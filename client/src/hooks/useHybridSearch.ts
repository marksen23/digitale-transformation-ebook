/**
 * useHybridSearch — orchestriert lexikalische Sofort-Suche +
 * debouncten semantischen Stream.
 *
 * Datenfluss:
 *   1. query ändert sich → Lex-Suche läuft pro Source synchron, sofort.
 *      Hits werden gemerged und gesetzt → UI rendert Lex-Treffer.
 *   2. Nach 300ms Debounce: parallel semanticSearch pro Source aufrufen.
 *      Sem-Hits werden angehängt (kein Re-Sort, damit Liste nicht springt).
 *   3. Nach 800ms ohne weitere Eingabe: final-Sort über alle Hits.
 *
 * Returns:
 *   { hits, loading, semanticPending }
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ActiveFilters, SearchContext, SearchHit, SearchSource } from "@/lib/search/types";
import { mergeHits } from "@/lib/search/score";

interface UseHybridSearchOpts {
  query: string;
  sources: SearchSource[];
  filters?: ActiveFilters;
  limit?: number;
  enableSemantic?: boolean;
  /** Debounce vor dem semantischen Call (ms) — default 300 */
  semanticDebounceMs?: number;
  /** Pause nach der letzten Eingabe für Final-Sort (ms) — default 800 */
  finalSortPauseMs?: number;
  locale?: string;
}

interface UseHybridSearchResult {
  hits: SearchHit[];
  loading: boolean;
  semanticPending: boolean;
}

export function useHybridSearch(opts: UseHybridSearchOpts): UseHybridSearchResult {
  const {
    query,
    sources,
    filters = {},
    limit = 8,
    enableSemantic = false,
    semanticDebounceMs = 300,
    finalSortPauseMs = 800,
    locale,
  } = opts;

  const [hits, setHits] = useState<SearchHit[]>([]);
  const [semanticPending, setSemanticPending] = useState(false);
  const [loading, setLoading] = useState(false);

  const ctx = useMemo<SearchContext>(() => ({ filters, limit, locale }), [filters, limit, locale]);

  // Stable refs zum Cancellieren in-flight Calls
  const semTimerRef = useRef<number | null>(null);
  const sortTimerRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const reqId = ++reqIdRef.current;

    // Lex-Phase: synchron pro Source
    let cancelled = false;

    async function runLex() {
      setLoading(true);
      const allLex: SearchHit[] = [];
      for (const src of sources) {
        try {
          const r = await Promise.resolve(src.search(query, ctx));
          for (const h of r) allLex.push({ ...h, mode: "lex" as const });
        } catch { /* Source-Fehler ignoriert — andere Sources liefern weiter */ }
      }
      if (cancelled || reqId !== reqIdRef.current) return;
      // Pro Source-Type top-N
      allLex.sort((a, b) => b.score - a.score);
      setHits(allLex.slice(0, limit * sources.length));
      setLoading(false);
    }
    runLex();

    // Sem-Phase: debounced
    if (semTimerRef.current) window.clearTimeout(semTimerRef.current);
    if (sortTimerRef.current) window.clearTimeout(sortTimerRef.current);

    if (enableSemantic && query.trim().length >= 2) {
      setSemanticPending(true);
      semTimerRef.current = window.setTimeout(async () => {
        const allSem: SearchHit[] = [];
        for (const src of sources) {
          if (!src.semanticSearch) continue;
          try {
            const r = await src.semanticSearch(query, ctx);
            for (const h of r) allSem.push({ ...h, mode: "sem" as const });
          } catch { /* ignore */ }
        }
        if (cancelled || reqId !== reqIdRef.current) return;
        setHits(prev => mergeHits(prev, allSem, false));
        setSemanticPending(false);

        // Final-Sort nach Pause
        sortTimerRef.current = window.setTimeout(() => {
          if (cancelled || reqId !== reqIdRef.current) return;
          setHits(prev => mergeHits(prev, [], true));
        }, finalSortPauseMs);
      }, semanticDebounceMs);
    } else {
      setSemanticPending(false);
    }

    return () => {
      cancelled = true;
      if (semTimerRef.current) window.clearTimeout(semTimerRef.current);
      if (sortTimerRef.current) window.clearTimeout(sortTimerRef.current);
    };
  }, [query, sources, ctx, limit, enableSemantic, semanticDebounceMs, finalSortPauseMs]);

  return { hits, loading, semanticPending };
}
