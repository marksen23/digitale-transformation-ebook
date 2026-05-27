/**
 * Global Hotkeys für die Such-UX.
 *
 * useGlobalHotkey: bindet eine Tastenkombination an einen Callback.
 *   - Filtert IME-Composition + Form-Inputs (außer wenn force=true)
 *   - Unterstützt Cmd+K (Mac) und Ctrl+K (Win/Linux) gleichwertig
 *
 * Verwendung:
 *   useGlobalHotkey("k", () => setOpen(true), { meta: true });   // Cmd+K
 *   useGlobalHotkey("/", () => setOpen(true));                   // Fallback
 *   useGlobalHotkey("Escape", () => setOpen(false), { force: true });
 */
import { useEffect } from "react";

interface HotkeyOpts {
  /** true verlangt Cmd (Mac) ODER Ctrl (Win/Linux) — Cross-OS */
  meta?: boolean;
  /** true verlangt Ctrl (immer, auch auf Mac) */
  ctrl?: boolean;
  /** true verlangt Shift */
  shift?: boolean;
  /** Wenn true: auch in Inputs / Textareas reagieren */
  force?: boolean;
  /** Wenn false: Handler ist inaktiv */
  enabled?: boolean;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function useGlobalHotkey(
  key: string,
  handler: (e: KeyboardEvent) => void,
  opts: HotkeyOpts = {}
): void {
  const { meta, ctrl, shift, force = false, enabled = true } = opts;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e as KeyboardEvent & { isComposing?: boolean }).isComposing) return;

      // Cross-OS meta: Cmd auf Mac, Ctrl sonst
      const metaPressed = meta ? (e.metaKey || e.ctrlKey) : true;
      const metaMatch = meta ? metaPressed : (!e.metaKey && !e.ctrlKey) || ctrl;
      const ctrlMatch = ctrl ? e.ctrlKey : true;
      const shiftMatch = shift ? e.shiftKey : !e.shiftKey;

      // Key-Vergleich case-insensitive
      const keyMatch = e.key.toLowerCase() === key.toLowerCase();
      if (!keyMatch || !metaMatch || !ctrlMatch || !shiftMatch) return;

      if (!force && isTypingTarget(e.target)) return;
      handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, handler, meta, ctrl, shift, force, enabled]);
}
