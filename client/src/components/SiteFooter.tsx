/**
 * SiteFooter — einheitlicher Seitenfuß für alle Doc-Seiten.
 *
 * Hintergrund: die Unterseiten „brachen unten ab" (kein Abschluss). Da das
 * App-Scroll-Modell jede Seite in einen eigenen position:fixed-Scroll-Container
 * legt (index.css setzt html/body/#root auf overflow:hidden), kann der Footer
 * NICHT global in AppFrame stehen — er wird ans Content-Ende jedes
 * Scroll-Containers gerendert.
 *
 * Zwei Varianten, beide bewusst schmal (Redesign Phase 4) — die Nav deckt
 * die Werk-Bereiche längst ab, der Footer trägt nur noch, was sonst
 * nirgends hinführt:
 *   - "full" (default): eine Zeile Identität + eine Zeile flach umbrechende
 *     Links (Doc-Seiten).
 *   - "bar": schlanke einzeilige Leiste für Vollbild-Canvas (Begriffsnetz),
 *     wo kein voller Footer passt — definiert den unteren Rand.
 *
 * Verwendung:  <SiteFooter c={C} />   bzw.  <SiteFooter c={C} variant="bar" />
 */
import { Link } from "wouter";
import type { Palette } from "@/lib/theme";
import { MONO } from "@/lib/theme";

const REPO_URL = "https://github.com/marksen23/digitale-transformation-ebook";

interface FooterLink { label: string; href: string; external?: boolean }

// Redesign Phase 4: seit die "Werk"-Spalte raus ist (1:1 Nav-Duplikat),
// blieben nur noch 6 Links übrig — für die lohnt sich kein mehrspaltiges
// Grid mit Sektions-Überschriften mehr (wirkte wie eine leere dritte
// Spalte). Eine flache, einzeilig umbrechende Liste statt Gruppen.
// Health/Adminbereich bleibt bewusst draußen — token-gated Operator-
// Werkzeug, kein Publikums-Link (siehe AppFrame.tsx). Wer den Admin-
// Token hat, geht über /admin?token=…, wie schon bisher.
const ALL_LINKS: FooterLink[] = [
  { label: "Status", href: "/status" },
  { label: "Quellcode", href: REPO_URL, external: true },
  { label: "Impressum", href: "/impressum" },
  { label: "Kontakt", href: "/kontakt" },
  { label: "Nutzungsbedingungen", href: "/nutzungsbedingungen" },
  { label: "Lizenz", href: "/lizenz" },
];

// Schlanke Leiste (Begriffsnetz): kompakte Auswahl der wichtigsten Links.
const BAR_LINKS: FooterLink[] = [
  { label: "Projekt", href: "/projekt" },
  { label: "Statistik", href: "/statistik" },
  { label: "Blog", href: "/blog" },
  { label: "Impressum", href: "/impressum" },
  { label: "Kontakt", href: "/kontakt" },
  { label: "Nutzungsbedingungen", href: "/nutzungsbedingungen" },
  { label: "Lizenz", href: "/lizenz" },
];

export default function SiteFooter({ c, variant = "full" }: { c: Palette; variant?: "full" | "bar" }) {
  const onEnter = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = c.accentText; };
  const onLeave = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = c.muted; };

  if (variant === "bar") {
    const barLink: React.CSSProperties = {
      fontFamily: MONO, fontSize: "0.62rem", letterSpacing: "0.05em", color: c.muted,
      textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
      padding: "0.35rem 0.45rem", borderRadius: 4,
    };
    return (
      <footer
        role="contentinfo"
        style={{
          flexShrink: 0, zIndex: 200,
          borderTop: `1px solid ${c.border}`, background: c.void,
          padding: "0.3rem 0.8rem", display: "flex", flexWrap: "nowrap", overflowX: "auto",
          gap: "0.15rem", alignItems: "center", WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
      >
        <span style={{ ...barLink, color: c.accentText }}>❦</span>
        {BAR_LINKS.map(l => (
          <Link key={l.href} href={l.href} style={barLink}
                onMouseEnter={onEnter as never} onMouseLeave={onLeave as never}>{l.label}</Link>
        ))}
      </footer>
    );
  }

  const flatLinkStyle: React.CSSProperties = {
    fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.04em", color: c.muted,
    textDecoration: "none", whiteSpace: "nowrap", transition: "color 0.15s",
  };

  return (
    <footer
      role="contentinfo"
      style={{
        marginTop: "2rem", paddingTop: "0.9rem", paddingBottom: "1.1rem",
        borderTop: `1px solid ${c.border}`,
        display: "flex", flexWrap: "wrap", rowGap: "0.5rem", columnGap: "1.5rem",
        alignItems: "center", justifyContent: "space-between",
        fontFamily: MONO, fontSize: "0.6rem", color: c.muted,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <span style={{ color: c.accentText }}>❦</span>
        <span>Resonanzvernunft · Markus Oehring · © 2026</span>
      </div>
      <nav aria-label="Footer" style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem 0.9rem" }}>
        {ALL_LINKS.map(l => l.external ? (
          <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
             style={flatLinkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>{l.label} ↗</a>
        ) : (
          <Link key={l.label} href={l.href} style={flatLinkStyle}
                onMouseEnter={onEnter} onMouseLeave={onLeave}>{l.label}</Link>
        ))}
      </nav>
    </footer>
  );
}
