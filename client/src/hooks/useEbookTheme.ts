import { useState, useEffect } from "react";

/**
 * Observes the `dark` class on <html> — set by Home.tsx's dark mode toggle.
 * Works for same-tab toggles, keyboard shortcuts, and cross-tab storage changes.
 */
export function useEbookTheme(): boolean {
  const [isDark, setIsDark] = useState<boolean>(
    () => document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
