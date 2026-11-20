/**
 * Gemeinsame Standort-Navigation — eine Quelle für AppFrame (Desktop-
 * Dropdown + schmaler Drawer) und das mobile Inhaltsverzeichnis
 * (MobileIndexOverlay). Ohne diese Liste drifteten beide Menüs auseinander:
 * Enkidu war nur als Overlay in der Desktop-Lese-UI erreichbar und fehlte
 * auf dem Telefon komplett.
 *
 * Status bleibt bewusst nur im Mobile-Index (und als Footer-Link im
 * AppFrame-Drawer) — öffentliche Ecke, aber kein Cluster-Eintrag auf dem
 * Desktop, wie bisher.
 */
export type NavSurface = "appFrame" | "mobileIndex";

export interface SiteNavItem {
  href: string;
  /** Kurzer deutscher Name (Mobile-Index, globale Suche). */
  label: string;
  i18nKey: string;
  match: RegExp;
  /** Rechte Mono-Spalte im Mobile-Index, Fallback wenn kein Zähler da ist. */
  mobileSub?: string;
  /** Fehlt die Angabe, erscheint der Eintrag auf beiden Flächen. */
  surfaces?: NavSurface[];
}

export interface SiteNavCluster {
  key: string;
  label: string;
  i18nKey: string;
  items: SiteNavItem[];
}

export const SITE_NAV_CLUSTERS: SiteNavCluster[] = [
  {
    key: "lesen",
    label: "Lesen",
    i18nKey: "nav.read",
    items: [
      { href: "/",       label: "Werk",    i18nKey: "nav.werk",    match: /^\/$/ },
      { href: "/projekt", label: "Projekt", i18nKey: "nav.projekt", match: /^\/projekt/, mobileSub: "BESCHREIBUNG" },
    ],
  },
  {
    key: "erkunden",
    label: "Erkunden",
    i18nKey: "nav.cluster.erkunden",
    items: [
      { href: "/erkunden",     label: "Übersicht",    i18nKey: "nav.erkunden.overview", match: /^\/erkunden/,     mobileSub: "DREI LINSEN" },
      { href: "/begriffsnetz", label: "Begriffsnetz", i18nKey: "nav.begriffsnetz",      match: /^\/begriffsnetz/, mobileSub: "KARTE" },
      { href: "/landkarte",    label: "Landkarte",    i18nKey: "nav.landkarte",         match: /^\/landkarte/,    mobileSub: "WISSEN" },
      { href: "/philosophie",  label: "Philosophie",  i18nKey: "nav.philosophie",       match: /^\/philosophie/,  mobileSub: "VERORTUNG" },
    ],
  },
  {
    key: "mitdenken",
    label: "Mitdenken",
    i18nKey: "nav.cluster.mitdenken",
    items: [
      { href: "/enkidu",       label: "Enkidu",       i18nKey: "nav.enkidu",       match: /^\/enkidu/,       mobileSub: "BEGEGNUNG" },
      { href: "/fragen",       label: "Fragen",       i18nKey: "nav.fragen",       match: /^\/fragen/,       mobileSub: "OFFEN" },
      { href: "/erkenntnisse", label: "Erkenntnisse", i18nKey: "nav.erkenntnisse", match: /^\/erkenntnisse/ },
      { href: "/resonanzen",   label: "Wissen",       i18nKey: "nav.resonanzen",   match: /^\/resonanzen/,   mobileSub: "BEGEGNUNGEN" },
      { href: "/live",         label: "Live",         i18nKey: "nav.live",         match: /^\/live/,         mobileSub: "STROM" },
      { href: "/statistik",    label: "Statistik",    i18nKey: "nav.statistik",    match: /^\/statistik/,    mobileSub: "ZAHLEN" },
      { href: "/status",       label: "Status",       i18nKey: "nav.status",       match: /^\/status/,       mobileSub: "ÖFFENTLICH", surfaces: ["mobileIndex"] },
    ],
  },
  {
    key: "meins",
    label: "Meins",
    i18nKey: "nav.cluster.meins",
    items: [
      { href: "/mein-werk", label: "Mein Werk", i18nKey: "nav.meinwerk", match: /^\/mein-werk/, mobileSub: "TRAJEKTORIE" },
      { href: "/blog",      label: "Blog",      i18nKey: "nav.blog",     match: /^\/blog/ },
    ],
  },
];

export function navClustersFor(surface: NavSurface): SiteNavCluster[] {
  return SITE_NAV_CLUSTERS
    .map(cluster => ({
      ...cluster,
      items: cluster.items.filter(item => !item.surfaces || item.surfaces.includes(surface)),
    }))
    .filter(cluster => cluster.items.length > 0);
}

export function navItemsFor(surface: NavSurface): SiteNavItem[] {
  return navClustersFor(surface).flatMap(cluster => cluster.items);
}
