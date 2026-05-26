/**
 * i18n/index.ts — Tier-1-3-Roadmap, Feature F (Englische Schicht).
 *
 * Minimaler i18n-Hook ohne fremde Library. useT(key) liest aus
 * client/src/i18n/{de,en}.json. Locale wird aus dem URL-Prefix
 * /en/* ermittelt — Default ist 'de'. Persistiert NICHT — die
 * URL ist die Wahrheit.
 *
 * Schema: flache key-value Map, key in dot-notation
 * (z.B. "nav.werk", "page.werk.tocLabel").
 */
import { useEffect, useState } from "react";
import de from "./de.json";
import en from "./en.json";

export type Locale = "de" | "en";

type Dict = Record<string, string>;
const dicts: Record<Locale, Dict> = { de, en };

/** Ermittelt aktuelle Locale aus dem URL-Pfad. SSR-safe (default 'de'). */
export function getLocale(): Locale {
  if (typeof window === "undefined") return "de";
  return window.location.pathname.startsWith("/en/") || window.location.pathname === "/en"
    ? "en" : "de";
}

/** Reaktiver Hook — reagiert auf Location-Changes. */
export function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>(getLocale());
  useEffect(() => {
    function update() { setLocale(getLocale()); }
    window.addEventListener("popstate", update);
    // Wouter mutiert history.pushState — wir poll-detecten kurz
    const interval = setInterval(update, 800);
    return () => {
      window.removeEventListener("popstate", update);
      clearInterval(interval);
    };
  }, []);
  return locale;
}

/** Lookup einer Übersetzung. Fallback: Key selbst. */
export function t(key: string, locale: Locale = getLocale()): string {
  return dicts[locale]?.[key] ?? dicts.de[key] ?? key;
}

/** Reaktiver Hook für Konsumenten in React-Components. */
export function useT(): (key: string) => string {
  const locale = useLocale();
  return (key: string) => t(key, locale);
}

/** Switcht zur anderen Locale unter Beibehaltung des aktuellen Pfads. */
export function switchLocaleHref(target: Locale): string {
  const cur = window.location.pathname;
  if (target === "en") {
    if (cur.startsWith("/en")) return cur;
    return "/en" + (cur === "/" ? "" : cur);
  }
  // → de
  if (cur.startsWith("/en")) return cur.slice(3) || "/";
  return cur;
}
