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
import InstallButton from "@/components/InstallButton";
import OnboardingHint from "@/components/OnboardingHint";
import { useT, useLocale, switchLocaleHref } from "@/i18n";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { useIsMobile } from "@/hooks/useMobile";

const FRAME_HEIGHT_TOOL = 48;
const FRAME_HEIGHT_READING = 40;

/** Routen mit eigenem, vollflächigem Mobile-Screen (Reader-first-Design) —
 *  diese besitzen ihre eigene ‹-Kopfzeile/Fußzeile und brauchen daher
 *  AppFrames Header/Drawer auf dem Telefon nicht. Wächst mit jedem
 *  Mobile-Screen, der dazukommt. */
const MOBILE_FULLSCREEN_PREFIXES = [
  "/werk", "/en/werk",
  "/philosophie", "/en/philosophie",
  "/landkarte", "/en/landkarte",
  "/fragen", "/erkenntnisse", "/mein-werk", "/projekt",
  "/admin", "/status",
];

/** Erkennt Lesemodi anhand der URL (D2). Reading-Modi haben kompakteren
 *  Frame + geringeren Opacity-Konflikt mit dem Buchtext. */
function isReadingPath(path: string): boolean {
  if (path === "/" || path === "/en") return true;
  if (path.startsWith("/werk")) return true;
  if (path.startsWith("/en/werk")) return true;
  if (path.startsWith("/resonanz/")) return true;
  return false;
}

interface NavItem { href: string; i18nKey: string; match: RegExp }
interface NavCluster { key: string; i18nKey: string; items: NavItem[] }

// Vier Absichten statt neun Namen (Redesign Phase 1): Navigation gruppiert
// sich danach, was die Leserin vorhat, statt nach Feature-Namen. Jeder
// bisherige Nav-Punkt bleibt erreichbar — nur die Zuordnung ist neu. Betrieb
// (Kuration/Metrics/Health) taucht hier bewusst nicht mehr auf; wer den
// Admin-Token hat, geht über /admin?token=… wie schon bisher.
const CLUSTERS: NavCluster[] = [
  {
    key: "lesen", i18nKey: "nav.read",
    items: [
      { href: "/",        i18nKey: "nav.werk",    match: /^\/$/ },
      { href: "/projekt",  i18nKey: "nav.projekt", match: /^\/projekt/ },
    ],
  },
  {
    key: "erkunden", i18nKey: "nav.cluster.erkunden",
    items: [
      { href: "/begriffsnetz", i18nKey: "nav.begriffsnetz", match: /^\/begriffsnetz/ },
      { href: "/landkarte",    i18nKey: "nav.landkarte",    match: /^\/landkarte/ },
      { href: "/philosophie",  i18nKey: "nav.philosophie",  match: /^\/philosophie/ },
    ],
  },
  {
    key: "mitdenken", i18nKey: "nav.cluster.mitdenken",
    items: [
      { href: "/fragen",       i18nKey: "nav.fragen",       match: /^\/fragen/ },
      { href: "/erkenntnisse", i18nKey: "nav.erkenntnisse", match: /^\/erkenntnisse/ },
      { href: "/resonanzen",   i18nKey: "nav.resonanzen",   match: /^\/resonanzen/ },
      { href: "/live",         i18nKey: "nav.live",         match: /^\/live/ },
      { href: "/statistik",    i18nKey: "nav.statistik",    match: /^\/statistik/ },
    ],
  },
  {
    key: "meins", i18nKey: "nav.cluster.meins",
    items: [
      { href: "/mein-werk", i18nKey: "nav.meinwerk", match: /^\/mein-werk/ },
      { href: "/blog",      i18nKey: "nav.blog",      match: /^\/blog/ },
    ],
  },
];

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const isDark = useEbookTheme();
  const C = isDark ? C_DARK : C_LIGHT;
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Welches der vier Desktop-Nav-Cluster gerade sein Dropdown zeigt (null = keins).
  const [openCluster, setOpenCluster] = useState<string | null>(null);
  const t = useT();
  const locale = useLocale();
  const isReading = isReadingPath(location);
  const FRAME_HEIGHT = isReading ? FRAME_HEIGHT_READING : FRAME_HEIGHT_TOOL;
  // Reader-first-Kern (Mobile-Design): der Werk-Reader übernimmt auf dem
  // Telefon selbst die volle Fläche (kein Header, eigene schmale Fußzeile
  // mit Inhalt/Suche/Aa) — MobileReader (in WerkPage) ersetzt Header +
  // Drawer komplett. Andere Reading-Pfade (Home "/", Resonanz-Detail)
  // behalten ihr bestehendes Mobile-Verhalten.
  const isMobile = useIsMobile();
  const suppressChrome = isMobile && MOBILE_FULLSCREEN_PREFIXES.some(p => location.startsWith(p));

  // Drawer + offenes Cluster-Dropdown schließen automatisch nach Navigation
  useEffect(() => {
    setDrawerOpen(false);
    setOpenCluster(null);
  }, [location]);

  // Cluster-Dropdown schließt bei Klick außerhalb der Nav
  useEffect(() => {
    if (!openCluster) return;
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".appframe-nav-inline")) setOpenCluster(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [openCluster]);

  // Escape-Key schließt Drawer + Cluster-Dropdown
  useEffect(() => {
    if (!drawerOpen && !openCluster) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDrawerOpen(false); setOpenCluster(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, openCluster]);

  // D2: Reading-Modi bekommen leicht zurückgenommenen Header (mehr Lese-Ruhe),
  // Tool-Modi bleiben opak. Backdrop-Filter sorgt für lesbaren Kontrast.
  const headerBg = isDark
    ? (isReading ? "rgba(12,10,9,0.82)" : "rgba(12,10,9,0.94)")
    : (isReading ? "rgba(250,250,249,0.82)" : "rgba(250,250,249,0.94)");
  const backdropColor = isDark ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.15)";

  if (suppressChrome) {
    return <>{children}</>;
  }

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
            color: C.accentText, textTransform: "uppercase",
            textDecoration: "none", flexShrink: 0,
            padding: "0.35rem 0.55rem", borderRadius: RADIUS.button,
            transition: "color 0.15s",
          }}
        >
          <span style={{ fontSize: "0.95rem", lineHeight: 1, transform: "translateY(0.04em)", display: "inline-block" }}>
            {ORNAMENT.leaf}
          </span>
          <span className="appframe-wordmark">Resonanzvernunft</span>
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

        {/* Inline-Menüleiste — Desktop only. Auf Mobile via CSS ausgeblendet.
            Vier Absichts-Cluster statt neun Feature-Namen (Redesign Phase 1):
            Klick öffnet ein schmales Dropdown mit den echten Unterseiten,
            dieselbe „subtile Disclosure"-Geste wie WerkPage's Werkzeuge-Menü. */}
        <nav className="appframe-nav-inline" style={{ display: "flex", gap: "0.1rem", position: "relative" }}>
          {CLUSTERS.map(cluster => {
            const clusterActive = cluster.items.some(item => item.match.test(location));
            const open = openCluster === cluster.key;
            return (
              <div key={cluster.key} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setOpenCluster(o => (o === cluster.key ? null : cluster.key))}
                  aria-expanded={open}
                  style={{
                    position: "relative",
                    fontFamily: MONO, fontSize: "0.58rem",
                    letterSpacing: TRACKED.tight,
                    textTransform: "uppercase",
                    color: (clusterActive || open) ? C.accentText : C.text,
                    background: "transparent", border: "none", cursor: "pointer",
                    padding: "0.4rem 0.7rem 0.3rem",
                    whiteSpace: "nowrap",
                    transition: "color 0.15s, border-color 0.15s",
                    borderBottom: (clusterActive || open) ? `1.5px solid ${C.accent}` : "1.5px solid transparent",
                    borderRadius: 0,
                  }}
                >
                  {t(cluster.i18nKey)} <span style={{ fontSize: "0.85em", opacity: 0.6 }}>{open ? "▴" : "▾"}</span>
                </button>
                {open && (
                  <div
                    role="menu"
                    style={{
                      position: "absolute", top: "100%", left: 0, marginTop: "0.3rem",
                      minWidth: "11rem", zIndex: 310,
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: RADIUS.panel,
                      boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
                      padding: "0.35rem",
                      display: "flex", flexDirection: "column", gap: "0.05rem",
                    }}
                  >
                    {cluster.items.map(item => {
                      const active = item.match.test(location);
                      const href = locale === "en" ? (item.href === "/" ? "/en" : `/en${item.href}`) : item.href;
                      return (
                        <Link
                          key={item.href}
                          href={href}
                          role="menuitem"
                          style={{
                            fontFamily: MONO, fontSize: "0.62rem",
                            letterSpacing: TRACKED.tight,
                            textTransform: "uppercase",
                            color: active ? C.accentText : C.text,
                            textDecoration: "none",
                            padding: "0.5rem 0.6rem",
                            borderRadius: RADIUS.button,
                            background: active ? (isDark ? "rgba(245,158,11,0.08)" : "rgba(180,83,9,0.06)") : "transparent",
                          }}
                        >
                          {t(item.i18nKey)}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Symbolleiste rechts */}
        <div style={{ display: "flex", gap: "0.3rem", marginLeft: "auto", alignItems: "center" }}>
          {/* Locale-Switcher D3: visuell entrümpelt — keine Border, kein Pill,
              kein Mono-Caps. Nur ein dezenter Italic-Mini-Link rechts. */}
          <a
            className="appframe-locale"
            href={switchLocaleHref(locale === "en" ? "de" : "en")}
            aria-label={locale === "en" ? "Sprache wechseln zu Deutsch" : "Switch to English"}
            title={locale === "en" ? "Deutsch" : "English"}
            style={{
              fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.05em",
              color: C.muted,
              padding: "0.35rem 0.4rem",
              textDecoration: "none",
              opacity: 0.55,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "0.55")}
          >
            {locale === "en" ? "DE" : "EN"}
          </a>
          <InstallButton variant="icon" />
          {/* Kein ⚙-Admin-Link mehr hier (Redesign Phase 1): Betrieb ist token-
              gated Operator-Werkzeug, kein Publikums-Bereich — wer den Token
              hat, geht über /admin?token=…, wie schon bisher. */}
          <button
            onClick={() => toggleGlobalTheme()}
            aria-label={isDark ? "Hell-Modus" : "Dunkel-Modus"}
            title={isDark ? "Hell-Modus" : "Dunkel-Modus"}
            className="appframe-tap"
            style={{
              fontFamily: MONO, fontSize: "0.85rem",
              color: C.accentText, background: "transparent",
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
              color: drawerOpen ? C.accentText : C.text,
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
        {/* Vier Absichts-Cluster (Redesign Phase 1) statt einer flachen Liste —
            dieselbe Gruppierung wie im Desktop-Dropdown, hier als aufgeklappte
            Sektionen mit MONO-Zwischenüberschrift. */}
        {CLUSTERS.map(cluster => (
          <div key={cluster.key} style={{ marginBottom: "0.3rem" }}>
            <div style={{
              fontFamily: MONO, fontSize: "0.6rem", letterSpacing: TRACKED.open,
              textTransform: "uppercase", color: C.muted,
              padding: "0.6rem 1.25rem 0.2rem",
            }}>
              {t(cluster.i18nKey)}
            </div>
            {cluster.items.map(item => {
              const active = item.match.test(location);
              const href = locale === "en" ? (item.href === "/" ? "/en" : `/en${item.href}`) : item.href;
              return (
                <Link
                  key={item.href}
                  href={href}
                  style={{
                    display: "block",
                    fontFamily: MONO, fontSize: "0.85rem",
                    letterSpacing: TRACKED.tight,
                    textTransform: "uppercase",
                    color: active ? C.accentText : C.text,
                    padding: "0.85rem 1.25rem",
                    textDecoration: "none",
                    borderLeft: active ? `3px solid ${C.accent}` : "3px solid transparent",
                    background: active ? (isDark ? "rgba(245,158,11,0.06)" : "rgba(180,83,9,0.04)") : "transparent",
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  {t(item.i18nKey)}
                </Link>
              );
            })}
          </div>
        ))}
        {/* Sekundär-/Footer-Links — auch auf Vollbild-Seiten (Begriffsnetz)
            über das Menü erreichbar, wo kein angehängter Footer passt. */}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: "0.4rem", paddingTop: "0.4rem" }}>
          {[
            { label: "Status", href: "/status" },
            { label: "Impressum", href: "/impressum" },
            { label: "Kontakt", href: "/kontakt" },
            { label: "Nutzungsbedingungen", href: "/nutzungsbedingungen" },
            { label: "Lizenz", href: "/lizenz" },
          ].map(l => (
            <Link
              key={l.href}
              href={l.href}
              style={{
                display: "block", fontFamily: MONO, fontSize: "0.72rem",
                letterSpacing: TRACKED.tight, color: C.muted,
                padding: "0.55rem 1.25rem", textDecoration: "none",
              }}
            >
              {l.label}
            </Link>
          ))}
        </div>
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
      {/* A11y (Phase 6): Skip-to-content — erstes fokussierbares Element,
          nur bei Tastatur-Fokus sichtbar (siehe .skip-link in index.css). */}
      <a href="#main" className="skip-link">Zum Inhalt springen</a>
      <main
        id="main"
        style={{
          paddingTop: `calc(${FRAME_HEIGHT}px + env(safe-area-inset-top, 0px))`,
          minHeight: "100dvh",
          ["--app-frame-h" as string]: `calc(${FRAME_HEIGHT}px + env(safe-area-inset-top, 0px))`,
        }}
      >
        <OnboardingHint />
        {children}
      </main>

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
          /* Wortmarke ausblenden — das ❦-Fleuron bleibt als Home-Button.
             Sonst drängt der lange Schriftzug + die 44px-Touch-Targets der
             Symbolleiste den Hamburger aus dem 375px-Viewport. */
          .appframe-wordmark { display: none; }
        }
        @media (max-width: 360px) {
          /* sehr schmale Geräte: Locale-Mini-Link weicht in den Drawer */
          .appframe-locale { display: none; }
        }
        @media (min-width: 641px) {
          .appframe-burger { display: none; }
          .appframe-nav-inline { display: flex !important; }
          .appframe-hairline { display: inline-block; }
          .appframe-drawer { display: none; }
          .appframe-drawer-backdrop { display: none; }
        }
      `}</style>

      {/* M7: Globale Cmd/Ctrl+K-Suche — durchsucht Werk-Kapitel, Begriffe,
          Philosophen. "/" als Browser-konfliktfreier Fallback. Esc schließt. */}
      <GlobalSearch />
    </>
  );
}

// Konsumenten, die sticky/anchor-offset brauchen, kalkulieren mit dem
// Tool-Frame-Maximum — sonst springt das Layout zwischen Pages.
export const APP_FRAME_HEIGHT = FRAME_HEIGHT_TOOL;
