/**
 * GlobalSearch — Wrapper, der GlobalSearchOverlay mit konkreten Sources
 * + Routing-Logik verbindet. Wird einmal im AppFrame gemountet.
 *
 * Sources: chapters (via useEbook), concepts, philosophers.
 * Hotkeys: Cmd/Ctrl+K togglet, "/" als Fallback.
 *
 * Navigation auf Klick:
 *   chapter      → /?chapter=<id>     (Home.tsx liest Param, navigateTo)
 *   concept      → /begriffsnetz?node=<id>  (ConceptGraphPage liest Param)
 *   philosopher  → /philosophie?id=<id>     (PhilosophyPage hört das schon)
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { GlobalSearchOverlay } from "./GlobalSearchOverlay";
import { useGlobalHotkey } from "@/hooks/useGlobalHotkey";
import { useEbook } from "@/hooks/useEbook";
import { createChaptersSource, conceptsSource, philosophersSource, resonanzenSource } from "@/lib/search/sources";
import type { SearchHit, SearchSource } from "@/lib/search/types";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const ebook = useEbook();

  const sources = useMemo<SearchSource[]>(
    () => [createChaptersSource(ebook), conceptsSource, philosophersSource, resonanzenSource],
    [ebook]
  );

  useGlobalHotkey("k", e => { e.preventDefault(); setOpen(o => !o); }, { meta: true });
  useGlobalHotkey("/", e => { e.preventDefault(); setOpen(o => !o); });

  function handleSelect(hit: SearchHit) {
    if (hit.type === "chapter") {
      navigate(`/?chapter=${encodeURIComponent(hit.id)}`);
    } else if (hit.type === "concept") {
      navigate(`/begriffsnetz?node=${encodeURIComponent(hit.id)}`);
    } else if (hit.type === "philosopher") {
      navigate(`/philosophie?id=${encodeURIComponent(hit.id)}`);
    } else if (hit.type === "resonanz") {
      navigate(`/resonanzen?id=${encodeURIComponent(hit.id)}`);
    }
  }

  return (
    <GlobalSearchOverlay
      open={open}
      onClose={() => setOpen(false)}
      sources={sources}
      onSelect={handleSelect}
    />
  );
}
