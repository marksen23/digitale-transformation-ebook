/**
 * GlobalSearchOverlay — Cmd-K/Ctrl-K Modal mit globaler Suche.
 *
 * Mountet als fullscreen-Overlay. Nutzt UnifiedSearch mit scope="global"
 * und allen verfügbaren Sources. Esc schließt.
 *
 * Hotkey wird im Parent registriert (typischerweise AppFrame).
 */
import { useEffect } from "react";
import { X } from "lucide-react";
import { UnifiedSearch } from "./UnifiedSearch";
import type { SearchHit, SearchSource } from "@/lib/search/types";

interface GlobalSearchOverlayProps {
  open: boolean;
  onClose: () => void;
  sources: SearchSource[];
  onSelect: (hit: SearchHit) => void;
  enableSemantic?: boolean;
}

export function GlobalSearchOverlay({
  open,
  onClose,
  sources,
  onSelect,
  enableSemantic = false,
}: GlobalSearchOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = orig; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[10dvh] px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Globale Suche"
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-stone-900 rounded-xl shadow-2xl p-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Globale Suche
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>
        <UnifiedSearch
          scope="global"
          scopeId="global"
          sources={sources}
          onSelect={hit => { onSelect(hit); onClose(); }}
          onEscape={onClose}
          placeholder="Werk, Resonanzen, Begriffe, Philosophen durchsuchen …"
          enableSemantic={enableSemantic}
          autoFocus
          alwaysOpen
        />
        <p className="mt-3 text-[10px] text-stone-400 dark:text-stone-500">
          ↑ ↓ navigiert · Enter wählt · Esc schließt
        </p>
      </div>
    </div>
  );
}
