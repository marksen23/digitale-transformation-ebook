/**
 * SiteFooter — einheitlicher Seitenfuß für alle Doc-Seiten.
 *
 * Hintergrund: die Unterseiten „brachen unten ab" (kein Abschluss). Da das
 * App-Scroll-Modell jede Seite in einen eigenen position:fixed-Scroll-Container
 * legt (index.css setzt html/body/#root auf overflow:hidden), kann der Footer
 * NICHT global in AppFrame stehen — er wird ans Content-Ende jedes
 * Scroll-Containers gerendert.
 *
 * Zwei Varianten:
 *   - "full" (default): voller Footer mit Link-Gruppen (Doc-Seiten).
 *   - "bar": schlanke einzeilige Leiste für Vollbild-Canvas (Begriffsnetz),
 *     wo kein voller Footer passt — definiert den unteren Rand.
 *
 * Verwendung:  <SiteFooter c={C} />   bzw.  <SiteFooter c={C} variant="bar" />
 */
import { Link } from "wouter";
import type { Palette } from "@/lib/theme";
import { MONO, SERIF } from "@/lib/theme";

const REPO_URL = "https://github.com/marksen23/digitale-transformation-ebook";

interface FooterLink { label: string; href: string; external?: boolean }

const GROUPS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Werk",
    links: [
      { label: "Projektbeschreibung", href: "/projekt" },
      { label: "Live", href: "/live" },
      { label: "Blog", href: "/blog" },
      { label: "Statistik", href: "/statistik" },
    ],
  },
  {
    title: "Service",
    links: [
      { label: "Status", href: "/status" },
      { label: "Health", href: "/admin/health" },
      { label: "Adminbereich", href: "/admin" },
      { label: "Quellcode", href: REPO_URL, external: true },
    ],
  },
  {
    title: "Rechtliches",
    links: [
      { label: "Impressum", href: "/impressum" },
      { label: "Kontakt", href: "/kontakt" },
      { label: "Nutzungsbedingungen", href: "/nutzungsbedingungen" },
      { label: "Lizenz", href: "/lizenz" },
    ],
  },
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
  const linkStyle: React.CSSProperties = {
    fontFamily: SERIF, fontSize: "0.82rem", color: c.textDim,
    textDecoration: "none", lineHeight: 1.9, display: "block",
    transition: "color 0.15s",
  };
  const onEnter = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = c.accentText; };
  const onLeave = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = c.textDim; };

  if (variant === "bar") {
    const barLink: React.CSSProperties = {
      fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.05em", color: c.muted,
      textDecoration: "none", whiteSpace: "nowrap",
    };
    return (
      <footer
        role="contentinfo"
        style={{
          flexShrink: 0, zIndex: 200,
          borderTop: `1px solid ${c.border}`, background: c.void,
          padding: "0.4rem 1rem", display: "flex", flexWrap: "wrap", gap: "0.3rem 0.9rem",
          alignItems: "center", justifyContent: "center",
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

  return (
    <footer
      role="contentinfo"
      style={{
        marginTop: "3rem", paddingTop: "1.6rem", paddingBottom: "2.5rem",
        borderTop: `1px solid ${c.border}`,
        display: "flex", flexWrap: "wrap", gap: "2.5rem", justifyContent: "space-between",
      }}
    >
      {GROUPS.map(g => (
        <nav key={g.title} aria-label={g.title} style={{ minWidth: 130 }}>
          <div style={{
            fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em",
            textTransform: "uppercase", color: c.muted, marginBottom: "0.6rem",
          }}>{g.title}</div>
          {g.links.map(l => l.external ? (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
               style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>{l.label} ↗</a>
          ) : (
            <Link key={l.label} href={l.href} style={linkStyle}
                  onMouseEnter={onEnter} onMouseLeave={onLeave}>{l.label}</Link>
          ))}
        </nav>
      ))}

      <div style={{
        flexBasis: "100%", marginTop: "1.5rem", paddingTop: "1rem",
        borderTop: `1px solid ${c.border}`,
        fontFamily: MONO, fontSize: "0.6rem", color: c.muted,
        display: "flex", flexWrap: "wrap", gap: "0.6rem", alignItems: "center",
      }}>
        <span style={{ color: c.accentText }}>❦</span>
        <span>Resonanzvernunft — Die Digitale Transformation</span>
        <span style={{ opacity: 0.6 }}>· Markus Oehring · © 2026</span>
      </div>
    </footer>
  );
}
