/**
 * Pro-Scope Such-Historie in localStorage.
 *
 * Generalisiert das Pattern aus ResonanzenPage. Jeder Scope (page-id /
 * 'global') hat eine eigene Historie mit max 20 Einträgen.
 */
import { useCallback, useEffect, useState } from "react";

const MAX_HISTORY = 20;
const STORAGE_PREFIX = "unifiedSearch.history.";

export interface HistoryEntry {
  query: string;
  ts: number;
}

export function useSearchHistory(scope: string): {
  history: HistoryEntry[];
  push: (query: string) => void;
  clear: () => void;
  remove: (query: string) => void;
} {
  const key = STORAGE_PREFIX + scope;
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed.slice(0, MAX_HISTORY));
      }
    } catch { /* ignore corrupt */ }
  }, [key]);

  const persist = useCallback((next: HistoryEntry[]) => {
    setHistory(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* quota */ }
  }, [key]);

  const push = useCallback((query: string) => {
    const q = query.trim();
    if (!q) return;
    const next = [
      { query: q, ts: Date.now() },
      ...history.filter(e => e.query !== q),
    ].slice(0, MAX_HISTORY);
    persist(next);
  }, [history, persist]);

  const clear = useCallback(() => persist([]), [persist]);
  const remove = useCallback((query: string) => {
    persist(history.filter(e => e.query !== query));
  }, [history, persist]);

  return { history, push, clear, remove };
}
