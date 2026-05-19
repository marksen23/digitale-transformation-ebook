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
 *
 * Mobile-Verhalten (<641px): Inline-Nav wird durch ein Hamburger-Icon
 * ersetzt, das ein Drawer-Panel unter dem Frame öffnet. Die Nav-Items
 * stehen dort vertikal mit 44px-Tap-Targets.
 */
import { useEffect, useState } from "react";
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Drawer schließt automatisch nach Navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [location]);

  // Escape-Key schließt den Drawer
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const headerBg = isDark ? "rgba(12,10,9,0.94)" : "rgba(250,250,249,0.94)";
  const backdropColor = isDark ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.15)";

  return (
    <>
      <header
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 300,
          height: FRAME_HEIGHT,
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0 1rem",
          background: headerBg,
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
          className="appframe-tap"
          style={{
            display: "flex", alignItems: "center", gap: "0.45rem",
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
            Spalten-Disziplin. Nur auf Desktop sichtbar. */}
        <span
          aria-hidden="true"
          className="appframe-hairline"
          style={{
            width: 1, height: 22, background: C.border, opacity: 0.7, flexShrink: 0,
          }}
        />

        {/* Inline-Menüleiste — Desktop only. Auf Mobile via CSS ausgeblendet. */}
        <nav className="appframe-nav-inline" style={{ display: "flex", gap: "0.2rem" }}>
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
            className="appframe-tap"
            style={{
              fontFamily: MONO, fontSize: "0.65rem",
              color: location.startsWith("/admin") ? C.accent : C.muted,
              padding: "0.35rem 0.55rem",
              borderRadius: RADIUS.button,
              textDecoration: "none",
              transition: "color 0.15s",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >⚙</Link>
          <button
            onClick={() => toggleGlobalTheme()}
            aria-label={isDark ? "Hell-Modus" : "Dunkel-Modus"}
            title={isDark ? "Hell-Modus" : "Dunkel-Modus"}
            className="appframe-tap"
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

          {/* Hamburger — Mobile only. Per CSS rechts neben dem Theme-Toggle
              eingeblendet, weil das die schnellste Daumen-Reichweite ist. */}
          <button
            type="button"
            className="appframe-burger appframe-tap"
            aria-label="Menü"
            aria-expanded={drawerOpen}
            aria-controls="appframe-drawer"
            onClick={() => setDrawerOpen(v => !v)}
            style={{
              fontFamily: MONO, fontSize: "1.1rem",
              color: drawerOpen ? C.accent : C.text,
              background: "transparent",
              border: `1px solid ${drawerOpen ? C.accent : C.border}`,
              width: 36, height: 36,
              cursor: "pointer", padding: 0,
              borderRadius: RADIUS.button,
              transition: "all 0.15s",
              alignItems: "center", justifyContent: "center",
              lineHeight: 1,
            }}
          >{drawerOpen ? "×" : "≡"}</button>
        </div>
      </header>

      {/* Mobile Drawer — slidet von oben unter dem Frame ein. Inline-Nav
          ist auf Mobile via CSS versteckt, der Drawer übernimmt die
          Navigation. Auf Desktop CSS-versteckt (display: none). */}
      <div
        id="appframe-drawer"
        className="appframe-drawer"
        role="dialog"
        aria-label="Hauptnavigation"
        aria-hidden={!drawerOpen}
        style={{
          position: "fixed",
          top: `calc(${FRAME_HEIGHT}px + env(safe-area-inset-top, 0px))`,
          left: 0, right: 0, zIndex: 295,
          background: headerBg,
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          borderBottom: `1px solid ${C.border}`,
          boxShadow: drawerOpen ? "0 8px 24px rgba(0,0,0,0.18)" : "none",
          transform: drawerOpen ? "translateY(0)" : "translateY(-105%)",
          transition: "transform 0.22s ease, box-shadow 0.22s ease",
          padding: "0.5rem 0",
        }}
      >
        {NAV.map(item => {
          const active = item.match.test(location);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                fontFamily: MONO, fontSize: "0.85rem",
                letterSpacing: TRACKED.tight,
                textTransform: "uppercase",
                color: active ? C.accent : C.text,
                padding: "0.85rem 1.25rem",
                textDecoration: "none",
                borderLeft: active ? `3px solid ${C.accent}` : "3px solid transparent",
                background: active ? (isDark ? "rgba(245,158,11,0.06)" : "rgba(180,83,9,0.04)") : "transparent",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Backdrop unter dem Drawer — schließt bei Tap. Liegt zwischen
          Drawer (295) und Frame (300), damit der Header tappable bleibt. */}
      <div
        className="appframe-drawer-backdrop"
        aria-hidden="true"
        onClick={() => setDrawerOpen(false)}
        style={{
          position: "fixed",
          top: `calc(${FRAME_HEIGHT}px + env(safe-area-inset-top, 0px))`,
          left: 0, right: 0, bottom: 0,
          zIndex: 290,
          background: backdropColor,
          opacity: drawerOpen ? 1 : 0,
          pointerEvents: drawerOpen ? "auto" : "none",
          transition: "opacity 0.22s ease",
        }}
      />

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

      {/* CSS-Switch zwischen Mobile (Hamburger + Drawer) und Desktop (Inline-Nav).
          640px-Breakpoint folgt dem Tailwind-`sm:`-Default und matched mit den
          übrigen Mobile-Pattern im Begriffsnetz. */}
      <style>{`
        .appframe-burger { display: inline-flex; }
        .appframe-nav-inline { display: none !important; }
        .appframe-hairline { display: none; }
        /* Touch-Targets — Topbar-Primitives mindestens 44×44 px auf Mobile.
           Folgt iOS Human Interface Guidelines (44pt) und Android Material
           Design (48dp Empfehlung, 44 als untere Schranke akzeptabel). Die
           inline width/height-Werte bleiben als visuelle Größe; min-height
           und min-width wirken als Floor und vergrößern die Tap-Fläche. */
        @media (max-width: 640px) {
          .appframe-tap {
            min-height: 44px;
            min-width: 44px;
          }
        }
        @media (min-width: 641px) {
          .appframe-burger { display: none; }
          .appframe-nav-inline { display: flex !important; }
          .appframe-hairline { display: inline-block; }
          .appframe-drawer { display: none; }
          .appframe-drawer-backdrop { display: none; }
        }
      `}</style>
    </>
  );
}

export const APP_FRAME_HEIGHT = FRAME_HEIGHT;
