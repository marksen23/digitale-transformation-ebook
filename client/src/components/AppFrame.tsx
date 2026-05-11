/**
 * AppFrame — globaler Rahmen für alle Sub-Seiten.
 *
 * Eine durchgehende Menüleiste oben mit Logo + Nav-Links zwischen den
 * Werkzeugen (Werk · Wissen · Philosophie · Begriffsnetz) und einer
 * Symbolleiste rechts (Hell/Dunkel-Toggle).
 *
 * Die Sub-Seiten rendern darunter und behalten ihre eigene
 * Werkzeug-Toolbar (View-Switcher, Filter etc.). So entsteht das
 * konsistente "Main-Frame"-Gefühl: Navigation oben, Inhalt unten.
 *
 * Home (/) hat seine eigene reading-orientierte UI und wird nicht
 * eingerahmt.
 */
import { Link, useLocation } from "wouter";
import { useEbookTheme } from "@/hooks/useEbookTheme";
import { toggleGlobalTheme } from "@/lib/globalTheme";
import { C_DARK, C_LIGHT, MONO, RADIUS } from "@/lib/theme";

const FRAME_HEIGHT = 44;

interface NavItem { href: string; label: string; match: RegExp }

const NAV: NavItem[] = [
  { href: "/",            label: "Werk",        match: /^\/$/ },
  { href: "/resonanzen",  label: "Wissen",      match: /^\/resonanzen/ },
  { href: "/philosophie", label: "Philosophie", match: /^\/philosophie/ },
];

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const isDark = useEbookTheme();
  const C = isDark ? C_DARK : C_LIGHT;
  const [location] = useLocation();

  return (
    <>
      <header
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 300,
          height: FRAME_HEIGHT,
          display: "flex", alignItems: "center", gap: "0.4rem",
          padding: "0 0.8rem",
          background: isDark ? "rgba(12,10,9,0.92)" : "rgba(250,250,249,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: `1px solid ${C.border}`,
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        {/* Logo-Mark — verlinkt zur Hauptseite */}
        <Link
          href="/"
          aria-label="Zur Werk-Hauptseite"
          style={{
            fontFamily: MONO, fontSize: "0.62rem", letterSpacing: "0.22em",
            color: C.accent, textTransform: "uppercase",
            textDecoration: "none", flexShrink: 0,
            padding: "0.3rem 0.5rem", borderRadius: RADIUS.button,
          }}
        >
          ◐ Resonanzvernunft
        </Link>

        {/* Menüleiste */}
        <nav style={{ display: "flex", gap: "0.15rem", marginLeft: "0.4rem", overflowX: "auto" }}>
          {NAV.map(item => {
            const active = item.match.test(location);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  fontFamily: MONO, fontSize: "0.58rem", letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: active ? "#080808" : C.text,
                  background: active ? C.accent : "transparent",
                  padding: "0.35rem 0.7rem",
                  borderRadius: RADIUS.button,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Symbolleiste rechts */}
        <div style={{ display: "flex", gap: "0.3rem", marginLeft: "auto", alignItems: "center" }}>
          <Link
            href="/admin"
            aria-label="Admin"
            title="Admin / Kuration"
            style={{
              fontFamily: MONO, fontSize: "0.65rem",
              color: location.startsWith("/admin") ? C.accent : C.muted,
              padding: "0.35rem 0.55rem",
              borderRadius: RADIUS.button,
              textDecoration: "none",
              transition: "color 0.15s",
            }}
          >⚙</Link>
          <button
            onClick={() => toggleGlobalTheme()}
            aria-label={isDark ? "Hell-Modus" : "Dunkel-Modus"}
            title={isDark ? "Hell-Modus" : "Dunkel-Modus"}
            style={{
              fontFamily: MONO, fontSize: "0.85rem",
              color: C.accent, background: "transparent",
              border: `1px solid ${C.border}`,
              width: 30, height: 30,
              cursor: "pointer", padding: 0,
              borderRadius: RADIUS.button,
              transition: "all 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center",
              lineHeight: 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = C.accent)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
          >{isDark ? "☉" : "☾"}</button>
        </div>
      </header>

      {/* Inhalt — Padding-top schafft Platz für den fixierten Rahmen.
          Wird via CSS-Variable verfügbar gemacht, damit Sub-Seiten mit
          eigenem position:fixed-Container (PhilosophyPage, ResonanzenPage,
          ConceptGraphPage) das berücksichtigen können. */}
      <div
        style={{
          paddingTop: `calc(${FRAME_HEIGHT}px + env(safe-area-inset-top, 0px))`,
          minHeight: "100dvh",
          ["--app-frame-h" as string]: `calc(${FRAME_HEIGHT}px + env(safe-area-inset-top, 0px))`,
        }}
      >
        {children}
      </div>
    </>
  );
}

export const APP_FRAME_HEIGHT = FRAME_HEIGHT;
