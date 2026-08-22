/**
 * MobileSearchOverlay — vollflächige Suche für den mobilen Reader-first-Kern.
 * Reuses dieselben Sources wie GlobalSearch (Cmd-K auf Desktop), aber als
 * eigener Vollbild-Screen statt zentriertem Modal, mit einer Kapitel-Route,
 * die in den neuen Mobile-Reader (/werk/:id) statt in Home.tsx führt.
 */
import { useMemo } from "react";
import { MONO, type Palette } from "@/lib/theme";
import { UnifiedSearch } from "@/components/search/UnifiedSearch";
import { useEbook } from "@/hooks/useEbook";
import { createChaptersSource, conceptsSource, philosophersSource, resonanzenSource } from "@/lib/search/sources";
import type { SearchHit, SearchSource } from "@/lib/search/types";

interface Props {
  C: Palette;
  onClose: () => void;
  navigate: (to: string) => void;
}

export default function MobileSearchOverlay({ C, onClose, navigate }: Props) {
  const ebook = useEbook();
  const sources = useMemo<SearchSource[]>(
    () => [createChaptersSource(ebook), conceptsSource, philosophersSource, resonanzenSource],
    [ebook],
  );

  function handleSelect(hit: SearchHit) {
    onClose();
    if (hit.type === "chapter") navigate(`/werk/${encodeURIComponent(hit.id)}`);
    else if (hit.type === "concept") navigate(`/begriffsnetz?node=${encodeURIComponent(hit.id)}`);
    else if (hit.type === "philosopher") navigate(`/philosophie?id=${encodeURIComponent(hit.id)}`);
    else if (hit.type === "resonanz") navigate(`/resonanzen?id=${encodeURIComponent(hit.id)}`);
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 500, display: "flex", flexDirection: "column",
        background: C.void, paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div style={{ padding: "16px 18px 10px", display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button" onClick={onClose} aria-label="Zurück"
          style={{ minWidth: 44, minHeight: 44, background: "none", border: "none", color: C.textDim, fontFamily: MONO, fontSize: 16, cursor: "pointer" }}
        >‹</button>
        <div style={{ flex: 1, fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.28em", textTransform: "uppercase", color: C.accentText }}>Suche</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 18px 20px" }}>
        <UnifiedSearch
          scope="global"
          scopeId="mobile-reader"
          sources={sources}
          onSelect={handleSelect}
          onEscape={onClose}
          placeholder="Begriff, Kapitel, Resonanz …"
          enableSemantic
          autoFocus
          alwaysOpen
        />
      </div>
    </div>
  );
}
