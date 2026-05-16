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
import { C_DARK, C_LIGHT, MONO, RADIUS, TRACKED, ORNAMENT } from "@/lib/theme";

const FRAME_HEIGHT = 48;

interface NavItem { href: string; label: string; match: RegExp }

const NAV: NavItem[] = [
  { href: "/",             label: "Werk",         match: /^\/$/ },
  { href: "/resonanzen",   label: "Wissen",       match: /^\/resonanzen/ },
  { href: "/philosophie",  label: "Philosophie",  match: /^\/philosophie/ },
  { href: "/begriffsnetz", label: "Begriffsnetz", match: /^\/begriffsnetz/ },
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
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0 1rem",
          background: isDark ? "rgba(12,10,9,0.94)" : "rgba(250,250,249,0.94)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          // Doppel-Bordüre wie ein klassischer Buch-Kapitelkopf:
          // hairline + 1px-Hauptlinie. boxShadow-Trick statt zwei
          // border-Lines, weil border bei position:fixed wackeln kann.
          borderBottom: `1px solid ${C.border}`,
          boxShadow: `0 1px 0 ${isDark ? "rgba(245,158,11,0.08)" : "rgba(180,83,9,0.08)"}, 0 2px 4px rgba(0,0,0,0.04)`,
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        {/* Logo-Mark — Initial-Glyphe (Inkunabel-Geste) + gesperrter Werktitel.
            Das ❦ ersetzt den ◐, weil es als Aldus-Fleuron klassisch verankert ist
            und die typografische Tonart vorgibt. */}
        <Link
          href="/"
          aria-label="Zur Werk-Hauptseite"
          style={{
            display: "flex", alignItems: "baseline", gap: "0.45rem",
            fontFamily: MONO, fontSize: "0.6rem",
            letterSpacing: TRACKED.classic,
            color: C.accent, textTransform: "uppercase",
            textDecoration: "none", flexShrink: 0,
            padding: "0.35rem 0.55rem", borderRadius: RADIUS.button,
            transition: "color 0.15s",
          }}
        >
          <span style={{ fontSize: "0.95rem", lineHeight: 1, transform: "translateY(0.04em)", display: "inline-block" }}>
            {ORNAMENT.leaf}
          </span>
          <span>Resonanzvernunft</span>
        </Link>

        {/* Vertikaler Hairline-Trenner zwischen Marke und Menü — klassische
            Spalten-Disziplin. */}
        <span aria-hidden="true" style={{
          width: 1, height: 22, background: C.border, opacity: 0.7, flexShrink: 0,
        }} />

        {/* Menüleiste */}
        <nav style={{ display: "flex", gap: "0.2rem", overflowX: "auto" }}>
          {NAV.map(item => {
            const active = item.match.test(location);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  position: "relative",
                  fontFamily: MONO, fontSize: "0.58rem",
                  letterSpacing: TRACKED.tight,
                  textTransform: "uppercase",
                  color: active ? C.accent : C.text,
                  background: "transparent",
                  padding: "0.4rem 0.7rem 0.3rem",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  transition: "color 0.15s, border-color 0.15s",
                  // Subtile aktive Unterstreichung statt Hintergrundfüllung
                  // — typografische Aktiv-Markierung im Buchsatz-Geist.
                  borderBottom: active ? `1.5px solid ${C.accent}` : "1.5px solid transparent",
                  borderRadius: 0,
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
