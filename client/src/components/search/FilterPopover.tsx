/**
 * FilterPopover — Multi-Select-Checkboxen pro Filter-Gruppe.
 *
 * Auf Mobile (<480px) als bottom-sheet, sonst als Dropdown unter dem
 * öffnenden Element.
 */
import { useEffect, useRef } from "react";
import type { ActiveFilters, FilterGroup } from "@/lib/search/types";

interface FilterPopoverProps {
  groups: FilterGroup[];
  active: ActiveFilters;
  onChange: (next: ActiveFilters) => void;
  onClose: () => void;
  anchorRect?: DOMRect | null;
}

export function FilterPopover({ groups, active, onChange, onClose, anchorRect }: FilterPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 480;

  // Klick außerhalb schließt
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  function toggle(groupId: string, value: string, multi: boolean) {
    const current = active[groupId] ?? [];
    let next: string[];
    if (multi) {
      next = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
    } else {
      next = current.includes(value) ? [] : [value];
    }
    onChange({ ...active, [groupId]: next });
  }

  const positionStyle = isMobile
    ? {
        position: "fixed" as const,
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: "70dvh",
        borderRadius: "16px 16px 0 0",
      }
    : anchorRect
      ? {
          position: "fixed" as const,
          top: anchorRect.bottom + 4,
          left: Math.max(8, Math.min(window.innerWidth - 320, anchorRect.left)),
          minWidth: 280,
          maxHeight: "60dvh",
          borderRadius: "8px",
        }
      : { position: "fixed" as const, top: 60, left: 16, minWidth: 280, borderRadius: "8px" };

  return (
    <>
      {isMobile && (
        <div
          className="fixed inset-0 bg-black/40 z-[80]"
          onClick={onClose}
          aria-hidden
        />
      )}
      <div
        ref={ref}
        style={positionStyle}
        className="z-[81] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-xl overflow-y-auto p-3"
        role="dialog"
        aria-label="Filter wählen"
      >
        {groups.length === 0 ? (
          <p className="text-xs text-stone-500 px-2 py-3">Keine Filter verfügbar.</p>
        ) : (
          groups.map(group => (
            <div key={group.id} className="mb-3 last:mb-0">
              <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1 px-1">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.options.map(opt => {
                  const checked = (active[group.id] ?? []).includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-800 text-sm"
                    >
                      <input
                        type={group.multi ? "checkbox" : "radio"}
                        name={group.id}
                        checked={checked}
                        onChange={() => toggle(group.id, opt.value, group.multi)}
                        className="accent-amber-600"
                      />
                      <span className="flex-1 text-stone-700 dark:text-stone-200">{opt.label}</span>
                      {opt.count != null && (
                        <span className="text-[10px] text-stone-400 tabular-nums">{opt.count}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))
        )}
        <div className="flex justify-between pt-2 border-t border-stone-100 dark:border-stone-800 mt-2">
          <button
            type="button"
            onClick={() => onChange({})}
            className="text-[11px] text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
          >
            Alle zurücksetzen
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-medium text-amber-700 dark:text-amber-400"
          >
            Schließen
          </button>
        </div>
      </div>
    </>
  );
}
