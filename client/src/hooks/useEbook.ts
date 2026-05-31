/**
 * useEbook — Lazy-Loader + Modul-Cache für ebook_content.md.
 *
 * Wird vom GlobalSearchOverlay (AppFrame-mounted) genutzt, damit die
 * globale Cmd-K-Suche auch Werk-Kapitel durchsuchen kann ohne Home.tsx
 * zu mounten.
 *
 * Home.tsx behält seinen eigenen Loader (unverändert wegen Risiko).
 */
import { useEffect, useState } from "react";
import { parseEbookMarkdown, type EbookData } from "@/lib/parseEbook";

let ebookCache: EbookData | null = null;
let ebookPromise: Promise<EbookData> | null = null;

async function loadEbook(): Promise<EbookData> {
  if (ebookCache) return ebookCache;
  if (ebookPromise) return ebookPromise;
  ebookPromise = fetch("/ebook_content.md")
    .then(r => r.text())
    .then(text => {
      const data = parseEbookMarkdown(text);
      ebookCache = data;
      return data;
    });
  return ebookPromise;
}

export function useEbook(): EbookData | null {
  const [data, setData] = useState<EbookData | null>(ebookCache);
  useEffect(() => {
    if (data) return;
    let cancelled = false;
    loadEbook()
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { /* ignore — Cmd-K bleibt ohne Werk-Treffer */ });
    return () => { cancelled = true; };
  }, [data]);
  return data;
}
