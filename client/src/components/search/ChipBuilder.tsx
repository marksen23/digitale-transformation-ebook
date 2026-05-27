/**
 * ChipBuilder — Such-Input mit Inline-Filter-Chips.
 *
 * Layout: [Chip] [Chip] [+ Filter] <text-input>
 * - Klick auf [+] öffnet FilterPopover.
 * - Klick auf Chip-X entfernt ihn.
 * - Bei >3 Chips: Truncation "[+N mehr]"; FilterPopover zeigt alle aktiven.
 * - Backspace bei leerem Input löscht den letzten Chip.
 */
import { useMemo, useRef, useState } from "react";
import { Plus, X, Filter } from "lucide-react";
import type { ActiveFilters, ChipDescriptor, FilterGroup } from "@/lib/search/types";
import { FilterPopover } from "./FilterPopover";

interface ChipBuilderProps {
  query: string;
  onQueryChange: (q: string) => void;
  filterGroups: FilterGroup[];
  activeFilters: ActiveFilters;
  onFiltersChange: (next: ActiveFilters) => void;
  placeholder?: string;
  hideTextInput?: boolean;
  autoFocus?: boolean;
  /** Ref auf das Input-Element (zum Fokussieren von außen) */
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

const MAX_VISIBLE_CHIPS = 3;

export function ChipBuilder({
  query,
  onQueryChange,
  filterGroups,
  activeFilters,
  onFiltersChange,
  placeholder = "Suchen …",
  hideTextInput = false,
  autoFocus = false,
  inputRef,
}: ChipBuilderProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const chips = useMemo<ChipDescriptor[]>(() => {
    const out: ChipDescriptor[] = [];
    for (const group of filterGroups) {
      for (const value of activeFilters[group.id] ?? []) {
        const opt = group.options.find(o => o.value === value);
        out.push({
          groupId: group.id,
          groupLabel: group.label,
          value,
          valueLabel: opt?.label ?? value,
        });
      }
    }
    return out;
  }, [filterGroups, activeFilters]);

  const visibleChips = chips.slice(0, MAX_VISIBLE_CHIPS);
  const overflowCount = chips.length - visibleChips.length;

  function removeChip(c: ChipDescriptor) {
    const current = activeFilters[c.groupId] ?? [];
    onFiltersChange({ ...activeFilters, [c.groupId]: current.filter(v => v !== c.value) });
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && query === "" && chips.length > 0) {
      e.preventDefault();
      removeChip(chips[chips.length - 1]);
    }
  }

  function openPopover() {
    if (triggerRef.current) {
      setPopoverAnchor(triggerRef.current.getBoundingClientRect());
    }
  }

  return (
    <div className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/20 flex-wrap">
      {visibleChips.map(c => (
        <span
          key={`${c.groupId}::${c.value}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 max-w-[180px]"
          title={`${c.groupLabel}: ${c.valueLabel}`}
        >
          <span className="text-amber-700/70 dark:text-amber-300/70">{c.groupLabel}:</span>
          <span className="truncate">{c.valueLabel}</span>
          <button
            type="button"
            onClick={() => removeChip(c)}
            className="hover:bg-amber-200 dark:hover:bg-amber-800/40 rounded-sm"
            aria-label={`Filter ${c.valueLabel} entfernen`}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      {overflowCount > 0 && (
        <button
          type="button"
          onClick={openPopover}
          className="text-[11px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200"
        >
          +{overflowCount} mehr
        </button>
      )}
      {filterGroups.length > 0 && (
        <button
          ref={triggerRef}
          type="button"
          onClick={openPopover}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
          title="Filter hinzufügen"
        >
          {chips.length === 0 ? <Filter size={12} /> : <Plus size={12} />}
          <span className="hidden sm:inline">Filter</span>
        </button>
      )}
      {!hideTextInput && (
        <input
          ref={ref}
          type="text"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="flex-1 min-w-[100px] bg-transparent outline-none text-sm text-stone-800 dark:text-stone-200 placeholder:text-stone-400"
        />
      )}
      {popoverAnchor && (
        <FilterPopover
          groups={filterGroups}
          active={activeFilters}
          onChange={onFiltersChange}
          onClose={() => setPopoverAnchor(null)}
          anchorRect={popoverAnchor}
        />
      )}
    </div>
  );
}
