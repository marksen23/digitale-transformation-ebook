/**
 * seo.ts — Server-seitige SEO/GEO-Aufbereitung für den SPA-Fallback.
 *
 * Die App ist ein Client-SPA: ohne diese Schicht sehen Crawler/KI-Agenten, die
 * kein JS ausführen (viele LLM-Crawler), KEINEN Inhalt und nur ein generisches
 * <title>. Diese Modul injiziert beim Ausliefern von index.html PRO ROUTE:
 *   - korrektes <title> + <meta description>
 *   - Open-Graph + Twitter-Card + canonical + hreflang
 *   - JSON-LD (schema.org) — WebSite/Book (Home), ScholarlyArticle (Resonanz)
 *   - einen sichtbaren Text-Snapshot in #root (von React beim Mount ersetzt) —
 *     so lesen JS-lose Crawler/Agenten den realen Inhalt
 *
 * Datenquelle: loadIndex() (live GitHub-Index, hier mit kurzem TTL gecacht) —
 * neue Resonanzen erscheinen ohne Redeploy. Server-Pendant zu client/src/lib/
 * siteUrl.ts. Markerbasiert (<!--SEO-HEAD-->, <!--SEO-BODY--> in index.html) —
 * robust gegen Reformatierung des Templates.
 */
import { loadIndex, type IndexEntry } from "./indexUpdater.js";

export const SITE_URL = (
  process.env.SITE_URL ?? "https://digitale-transformation-ebook.de"
).replace(/\/+$/, "");

const AUTHOR = "Markus Oehring";
const WORK_TITLE = "Resonanzvernunft – Digitale Transformation";
const DEFAULT_DESC =
  "Eine poetisch-philosophische Trilogie über Resonanzvernunft, das Mensch-Maschine-Verhältnis und digitale Existenz — mit interaktivem Begriffsnetz, semantisch durchsuchbarem Korpus und KI-gestütztem Dialog.";
// PNG (nicht SVG): Facebook/X/LinkedIn-Scraper rendern SVG-og:images nicht.
// Aus og-default.svg via sharp gerendert + committet (statisches Asset).
const OG_IMAGE = `${SITE_URL}/og-default.png`;

// ─── Escaping ────────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
function clip(s: string, n: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

// ─── Index-Cache (TTL) ───────────────────────────────────────────────────
let _idxCache: { entries: IndexEntry[]; at: number } | null = null;
const IDX_TTL = 5 * 60 * 1000;
async function cachedIndex(): Promise<IndexEntry[]> {
  const now = Date.now();
  if (_idxCache && now - _idxCache.at < IDX_TTL) return _idxCache.entries;
  const entries = await loadIndex();
  if (entries) {
    _idxCache = { entries, at: now };
    return entries;
  }
  return _idxCache?.entries ?? [];
}
async function findEntry(id: string): Promise<IndexEntry | null> {
  const entries = await cachedIndex();
  return entries.find((e) => e.id === id) ?? null;
}

// ─── Route-Meta ──────────────────────────────────────────────────────────
interface Meta {
  title: string;
  description: string;
}
const ROUTE_META: Record<string, Meta> = {
  "/": { title: `${WORK_TITLE} — ${AUTHOR}`, description: DEFAULT_DESC },
  "/werk": {
    title: `Das Werk lesen — ${WORK_TITLE}`,
    description:
      "Die vollständige philosophische Trilogie als Lesetext — drei Kritiken, poetisch-theoretisch, mit verankerten Resonanzen an jeder Anschlussstelle.",
  },
  "/begriffsnetz": {
    title: `Begriffsnetz — Die Begriffe des Werks · ${WORK_TITLE}`,
    description:
      "Das interaktive Begriffsnetz: die zentralen Konzepte der Resonanzvernunft und ihre feldübergreifenden Verbindungen, dialogisch erkundbar.",
  },
  "/philosophie": {
    title: `Philosophie — Die Denker hinter der Resonanzvernunft · ${WORK_TITLE}`,
    description:
      "Die philosophische Genealogie des Werks: Denker, Linien und Bezüge, aus denen die Resonanzvernunft erwächst.",
  },
  "/resonanzen": {
    title: `Wissen — Korpus-Browser · ${WORK_TITLE}`,
    description:
      "Der durchsuchbare Korpus: kuratierte KI-Resonanzen am Werktext — semantisch verlinkt, zitierfähig, wachsend.",
  },
  "/fragen": {
    title: `Offene Fragen — ${WORK_TITLE}`,
    description:
      "Die offenen Schlussfragen aller Resonanzen, gesammelt: woran das Werk weiterdenkt — und welche Fragen der Korpus schon selbst beantwortet.",
  },
  "/erkenntnisse": {
    title: `Erkenntnisse — ${WORK_TITLE}`,
    description:
      "Destillierte Erkenntnisse: neuwertige Einsichten, die aus der Beantwortung offener Fragen entstanden sind, mit Entstehungsanalyse.",
  },
  "/landkarte": {
    title: `Wissens-Landkarte — ${WORK_TITLE}`,
    description:
      "Begriffsnetz × Korpus: die Landkarte des wachsenden Werks — Begriffe, Korpus-Gravitation und werdende Verbindungen.",
  },
  "/live": {
    title: `Live — ${WORK_TITLE}`,
    description: "Der lebendige Strom: die jüngsten Resonanzen des Werks in Echtzeit.",
  },
  "/blog": {
    title: `Bereiche & Master-Synthesen — ${WORK_TITLE}`,
    description: "Thematische Bereiche und die Master-Synthesen des Werks.",
  },
  "/projekt": {
    title: `Das Projekt — ${WORK_TITLE}`,
    description: "Idee, Mechanik und Ambition des wachsenden Werks.",
  },
  "/statistik": {
    title: `Statistik — ${WORK_TITLE}`,
    description: "Kennzahlen des wachsenden Korpus.",
  },
  "/impressum": { title: `Impressum — ${WORK_TITLE}`, description: "Impressum und Anbieterkennzeichnung." },
  "/kontakt": { title: `Kontakt — ${WORK_TITLE}`, description: "Kontakt zum Autor." },
  "/nutzungsbedingungen": {
    title: `Nutzungsbedingungen — ${WORK_TITLE}`,
    description: "Nutzungsbedingungen des Werks.",
  },
  "/lizenz": { title: `Lizenz — ${WORK_TITLE}`, description: "Lizenz und Nutzungsrechte." },
  "/status": { title: `Status — ${WORK_TITLE}`, description: "Betriebs- und Korpus-Status." },
};

function routeMeta(path: string): Meta {
  const base = path.startsWith("/en/") ? path.slice(3) : path === "/en" ? "/" : path;
  return ROUTE_META[base] ?? ROUTE_META["/"];
}

function normalizePath(p: string): string {
  let s = (p || "/").split("?")[0].split("#")[0];
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s || "/";
}

// ─── JSON-LD ─────────────────────────────────────────────────────────────
function websiteJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: WORK_TITLE,
    url: `${SITE_URL}/`,
    inLanguage: "de",
    author: { "@type": "Person", name: AUTHOR },
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/resonanzen?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
function workJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "Book",
    name: WORK_TITLE,
    author: { "@type": "Person", name: AUTHOR },
    inLanguage: "de",
    url: `${SITE_URL}/`,
    genre: "Philosophie",
    description: DEFAULT_DESC,
  };
}
/** schema.org ScholarlyArticle pro Resonanz — portiert aus client/src/lib/bibtex.ts:toJsonLd. */
function resonanzJsonLd(e: IndexEntry): object {
  return {
    "@context": "https://schema.org",
    "@type": "ScholarlyArticle",
    headline: clip(e.prompt || e.anchor || e.id, 110),
    author: { "@type": "Person", name: AUTHOR },
    datePublished: (e.ts || "").slice(0, 10),
    identifier: e.id,
    url: `${SITE_URL}/resonanz/${e.id}`,
    isPartOf: { "@type": "Book", name: WORK_TITLE, url: `${SITE_URL}/` },
    abstract: clip(e.response, 300),
    inLanguage: "de",
    keywords: (e.nodeIds ?? []).join(", "),
  };
}
function breadcrumbJsonLd(items: { name: string; url: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

// ─── Head-Tags ───────────────────────────────────────────────────────────
function headTags(opts: {
  canonical: string;
  title: string;
  description: string;
  type?: string;
  jsonLd: object[];
}): string {
  const { canonical, title, description, type = "website", jsonLd } = opts;
  const lines = [
    `<link rel="canonical" href="${escapeAttr(canonical)}" />`,
    `<link rel="alternate" hreflang="de" href="${SITE_URL}/" />`,
    `<link rel="alternate" hreflang="en" href="${SITE_URL}/en" />`,
    `<link rel="alternate" hreflang="x-default" href="${SITE_URL}/" />`,
    `<meta property="og:site_name" content="${escapeAttr(WORK_TITLE)}" />`,
    `<meta property="og:locale" content="de_DE" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:url" content="${escapeAttr(canonical)}" />`,
    `<meta property="og:image" content="${escapeAttr(OG_IMAGE)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(OG_IMAGE)}" />`,
  ];
  for (const ld of jsonLd) {
    // </script> + < in JSON unschädlich machen (XSS-/Parser-Schutz im <script>-Kontext)
    const json = JSON.stringify(ld).replace(/</g, "\\u003c");
    lines.push(`<script type="application/ld+json">${json}</script>`);
  }
  return lines.join("\n    ");
}

// ─── Body-Snapshots (für JS-lose Crawler/Agenten) ────────────────────────
const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/werk", label: "Das Werk lesen" },
  { href: "/begriffsnetz", label: "Begriffsnetz" },
  { href: "/philosophie", label: "Philosophie" },
  { href: "/resonanzen", label: "Wissen (Korpus)" },
  { href: "/fragen", label: "Offene Fragen" },
  { href: "/erkenntnisse", label: "Erkenntnisse" },
  { href: "/landkarte", label: "Wissens-Landkarte" },
];
function navSnapshot(): string {
  const items = NAV_LINKS.map(
    (l) => `<li><a href="${l.href}">${escapeHtml(l.label)}</a></li>`,
  ).join("");
  return `<nav aria-label="Hauptbereiche"><ul>${items}</ul></nav>`;
}
function pageSnapshot(meta: Meta): string {
  const heading = meta.title.split(" — ")[0].split(" · ")[0];
  return `<article><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(
    meta.description,
  )}</p>${navSnapshot()}</article>`;
}
function resonanzSnapshot(e: IndexEntry): string {
  const date = (e.ts || "").slice(0, 10);
  const paras = (e.response || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
  const prompt = e.prompt ? `<p><strong>Impuls:</strong> ${escapeHtml(e.prompt)}</p>` : "";
  return `<article><h1>${escapeHtml(
    clip(e.prompt || e.anchor || e.id, 160),
  )}</h1><p><time datetime="${escapeAttr(date)}">${escapeHtml(
    date,
  )}</time> · Resonanz im Werk „${escapeHtml(WORK_TITLE)}" (ID ${escapeHtml(
    e.id,
  )})</p>${prompt}${paras}${navSnapshot()}</article>`;
}

// ─── Haupt-Render ────────────────────────────────────────────────────────
/** Injiziert pro Route Meta + JSON-LD + Snapshot in das index.html-Template. */
export async function renderSeoHtml(template: string, rawPath: string): Promise<string> {
  const path = normalizePath(rawPath);
  let meta: Meta;
  let type = "website";
  let jsonLd: object[];
  let snapshot: string;
  const canonical = `${SITE_URL}${path === "/" ? "/" : path}`;

  const m = path.match(/^\/resonanz\/([A-Za-z0-9-]+)$/);
  if (m) {
    const e = await findEntry(m[1]);
    if (e) {
      meta = {
        title: `${clip(e.prompt || e.anchor || e.id, 70)} — Resonanz · ${WORK_TITLE}`,
        description: clip(e.response, 160),
      };
      type = "article";
      jsonLd = [
        resonanzJsonLd(e),
        breadcrumbJsonLd([
          { name: "Wissen", url: `${SITE_URL}/resonanzen` },
          { name: e.id, url: canonical },
        ]),
      ];
      snapshot = resonanzSnapshot(e);
    } else {
      meta = routeMeta("/");
      jsonLd = [websiteJsonLd()];
      snapshot = pageSnapshot(meta);
    }
  } else {
    meta = routeMeta(path);
    jsonLd = path === "/" || path === "/en" ? [websiteJsonLd(), workJsonLd()] : [websiteJsonLd()];
    snapshot = pageSnapshot(meta);
  }

  const head = headTags({ canonical, title: meta.title, description: meta.description, type, jsonLd });
  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
    .replace(
      /<meta\s+name="description"[^>]*>/,
      `<meta name="description" content="${escapeAttr(meta.description)}" />`,
    )
    .replace("<!--SEO-HEAD-->", head)
    .replace("<!--SEO-BODY-->", snapshot);
}

// ─── llms-full.txt (GEO: kuratierter Volltext-Dump für KI-Agenten) ───────
/**
 * llmstxt.org-Konvention: llms-full.txt = die Inhalte selbst (nicht nur Links).
 * Dynamisch aus dem Live-Index — NUR kuratierte Einträge (approved/published),
 * dieselbe Qualitätsschwelle wie die RAG-Rückkopplung. Agenten/Chat-Clients
 * bekommen so den ganzen kuratierten Korpus in einem Request, immer frisch.
 */
export async function buildLlmsFullText(): Promise<string> {
  const entries = await cachedIndex();
  const curated = entries
    .filter((e) => e.status === "approved" || e.status === "published")
    .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
  const head = [
    `# ${WORK_TITLE} — kuratierter Korpus (Volltext)`,
    ``,
    `> ${DEFAULT_DESC}`,
    `> Autor: ${AUTHOR}. Sprache: Deutsch. Stand: ${new Date().toISOString().slice(0, 10)}.`,
    `> ${curated.length} kuratierte Resonanzen. Permalink-Schema: ${SITE_URL}/resonanz/{id}`,
    `> Struktur/Navigation: ${SITE_URL}/llms.txt · Maschinenlesbar: ${SITE_URL}/resonanzen-index.json`,
    ``,
  ];
  const blocks = curated.map((e) => {
    const title = clip(e.prompt || e.anchor || e.id, 160);
    return [
      `## ${title}`,
      ``,
      `- ID: ${e.id} · Datum: ${(e.ts || "").slice(0, 10)} · Quelle: ${SITE_URL}/resonanz/${e.id}`,
      e.nodeIds?.length ? `- Begriffe: ${e.nodeIds.join(", ")}` : ``,
      ``,
      (e.response || "").trim(),
      ``,
    ].filter((l) => l !== ``).join("\n") + "\n";
  });
  return head.join("\n") + "\n" + blocks.join("\n");
}

// ─── Sitemap ─────────────────────────────────────────────────────────────
const SITEMAP_STATIC = [
  "/",
  "/werk",
  "/begriffsnetz",
  "/philosophie",
  "/resonanzen",
  "/fragen",
  "/erkenntnisse",
  "/landkarte",
  "/live",
  "/blog",
  "/projekt",
  "/statistik",
  "/impressum",
  "/kontakt",
  "/nutzungsbedingungen",
  "/lizenz",
];
/** Dynamische sitemap.xml aus dem Live-Index (alle nicht-rejected Resonanzen). */
export async function buildSitemap(): Promise<string> {
  const entries = await cachedIndex();
  const urls: { loc: string; lastmod?: string; priority: string }[] = SITEMAP_STATIC.map((r) => ({
    loc: `${SITE_URL}${r === "/" ? "/" : r}`,
    priority: r === "/" ? "1.0" : "0.7",
  }));
  for (const e of entries) {
    if (e.status === "rejected") continue;
    urls.push({
      loc: `${SITE_URL}/resonanz/${e.id}`,
      lastmod: (e.ts || "").slice(0, 10) || undefined,
      priority: "0.5",
    });
  }
  const body = urls
    .map(
      (u) =>
        `  <url><loc>${escapeHtml(u.loc)}</loc>${
          u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""
        }<priority>${u.priority}</priority></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// ─── Host-Redirect (Launch, ENV-gated) ───────────────────────────────────
/**
 * 301 von *.onrender.com / *.netlify.app auf die kanonische de-Domain.
 * ENV-gated (CANONICAL_REDIRECT=1), damit es ERST nach dem DNS-Flip scharf
 * wird — sonst würde onrender.com auf eine noch nicht live geschaltete Domain
 * umleiten. Bei Launch im Render-Dashboard CANONICAL_REDIRECT=1 setzen.
 */
export function canonicalHostRedirect(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  if (process.env.CANONICAL_REDIRECT !== "1") return next();
  const host = (req.headers.host ?? "").toLowerCase();
  const canonicalHost = new URL(SITE_URL).host.toLowerCase();
  if (host && host !== canonicalHost && (host.endsWith(".onrender.com") || host.endsWith(".netlify.app"))) {
    res.redirect(301, `${SITE_URL}${req.originalUrl}`);
    return;
  }
  next();
}
