import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  // Initial-State: existierende `dark`-Klasse hat Vorrang vor defaultTheme,
  // weil main.tsx via syncGlobalTheme() den persistierten Modus schon
  // angewendet hat. Sonst würde der useEffect unten die User-Wahl
  // beim ersten Render zurücksetzen (klassischer Theme-Flash-Bug).
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
      return "dark";
    }
    if (switchable) {
      const stored = localStorage.getItem("theme");
      return (stored as Theme) || defaultTheme;
    }
    return defaultTheme;
  });

  // Spiegelt das `theme`-State auf das <html data-class="dark">. Wenn
  // switchable=false, lassen wir globalTheme die Wahrheit verwalten und
  // synchronisieren stattdessen unser State *vom* DOM (bidirektional).
  useEffect(() => {
    if (!switchable) {
      // Beobachte externe Class-Änderungen (z.B. via toggleGlobalTheme von
      // PageNav oder Home.tsx) und halte unseren State in Sync.
      const observer = new MutationObserver(() => {
        const isDark = document.documentElement.classList.contains("dark");
        setTheme(prev => (prev === (isDark ? "dark" : "light") ? prev : (isDark ? "dark" : "light")));
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    }
    // switchable: traditionelles Pattern — Provider treibt die Klasse.
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme, switchable]);

  const toggleTheme = switchable
    ? () => {
        setTheme(prev => (prev === "light" ? "dark" : "light"));
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
