/**
 * Highlight + Snippet-Helper für die Such-UI.
 *
 * extractSnippet: nimmt einen Text + Query und liefert einen ausgeschnittenen
 *   Bereich um den ersten Match herum (mit "…" Marker).
 *
 * highlightTokens: tokenisiert die Query und liefert React-Nodes mit
 *   <mark>-Wraps für jeden Token-Match.
 *
 * Beide sind aus client/src/pages/Home.tsx Z. 1299 extrahiert + erweitert.
 */
import { Fragment, type ReactNode } from "react";

const CONTEXT_CHARS = 60;

export function extractSnippet(text: string, query: string, contextChars = CONTEXT_CHARS): string {
  if (!query) return text.slice(0, contextChars * 2);
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, contextChars * 2);
  const start = Math.max(0, idx - contextChars);
  const end = Math.min(text.length, idx + query.length + contextChars);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

/**
 * Liefert React-Nodes — Token-Treffer in der Query werden als <mark> gewrappt.
 * Tokens werden case-insensitive verglichen, Sub-Tokens (>1 Zeichen) gewählt.
 */
export function highlightTokens(text: string, query: string): ReactNode {
  if (!query?.trim()) return text;
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  if (tokens.length === 0) return text;

  const pattern = new RegExp(
    `(${tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );
  const parts = text.split(pattern);
  return parts.map((p, i) =>
    pattern.test(p)
      ? <mark key={i} className="bg-amber-300/40 text-inherit rounded-sm px-0.5">{p}</mark>
      : <Fragment key={i}>{p}</Fragment>
  );
}
