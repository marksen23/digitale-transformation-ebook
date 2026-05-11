/**
 * PageNav — globales Floating-Widget für Sub-Seiten (Wissen, Philosophie,
 * Admin). Stellt vier Werkzeuge bereit, die auf jeder Page erreichbar sind:
 *
 *   ☉ / ☾ — Hell-/Dunkel-Modus umschalten (global persistiert)
 *   ↑    — Nach oben scrollen (erscheint nur wenn weit unten)
 *   ←    — Browser-Back
 *   →    — Browser-Forward
 *
 * Positioniert unten rechts, respektiert iOS safe-area-insets.
 * Bei mobile: kompakter, größere Touch-Targets.
 */
import { useEffect, useState } from "react";
import { useEbookTheme } from "@/hooks/useEbookTheme";
import { toggleGlobalTheme, syncGlobalTheme } from "@/lib/globalTheme";
import { MONO, C_DARK, C_LIGHT, type Palette } from "@/lib/theme";

interface PageNavProps {
  /** Optionaler Scroll-Container — z.B. das data-scroll-Element der Sub-Page.
   *  Wenn null/undefined: nutzt window-Scroll. */
  scrollContainer?: HTMLElement | null;
}

export default function PageNav({ scrollContainer }: PageNavProps = {}) {
  const isDark = useEbookTheme();
  const C = isDark ? C_DARK : C_LIGHT;
  const [scrolled, setScrolled] = useState(false);

  // Beim Mount Theme aus localStorage syncen (für direkte Anfahrt auf Sub-URL)
  useEffect(() => { syncGlobalTheme(); }, []);

  // Scroll-Position beobachten, um den ↑-Button erst weit unten einzublenden
  useEffect(() => {
    if (typeof window === "undefined") return;
    const target = scrollContainer ?? window;
    const getScrollTop = () => {
      if (scrollContainer) return scrollContainer.scrollTop;
      return window.scrollY ?? document.documentElement.scrollTop;
    };
    const handler = () => setScrolled(getScrollTop() > 300);
    handler();
    target.addEventListener("scroll", handler, { passive: true });
    return () => target.removeEventListener("scroll", handler);
  }, [scrollContainer]);

  function scrollToTop() {
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <nav
      aria-label="Seiten-Werkzeuge"
      style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
        right: "calc(env(safe-area-inset-right, 0px) + 1rem)",
        zIndex: 90,
        display: "flex",
        flexDirection: "column",
        gap: "0.3rem",
      }}
    >
      <PageNavBtn label="↑" title="Nach oben" onClick={scrollToTop} c={C} fade={!scrolled} />
      <PageNavBtn label={isDark ? "☉" : "☾"} title={isDark ? "Hell-Modus" : "Dunkel-Modus"} onClick={() => toggleGlobalTheme()} c={C} />
      <PageNavBtn label="←" title="Zurück" onClick={() => window.history.back()} c={C} />
      <PageNavBtn label="→" title="Vor" onClick={() => window.history.forward()} c={C} />
    </nav>
  );
}

function PageNavBtn({ label, title, onClick, c, fade }: { label: string; title: string; onClick: () => void; c: Palette; fade?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: 38, height: 38,
        background: c.surface,
        color: c.text,
        border: `1px solid ${c.border}`,
        fontFamily: MONO, fontSize: "0.9rem", fontWeight: 500,
        cursor: "pointer",
        opacity: fade ? 0 : 0.85,
        transition: "opacity 0.25s ease, background 0.15s, color 0.15s",
        pointerEvents: fade ? "none" : "auto",
        boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = c.accent; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = fade ? "0" : "0.85"; e.currentTarget.style.color = c.text; }}
    >{label}</button>
  );
}
