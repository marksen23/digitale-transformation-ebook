/**
 * siteUrl.ts — EINZIGE Quelle für die kanonische Site-URL im Client.
 *
 * Server-Pendant: server/lib/seo.ts (`SITE_URL`). Beide defaulten auf die
 * Produktiv-Domain und sind per ENV überschreibbar (Client: VITE_SITE_URL,
 * Server: SITE_URL) — z.B. für Staging/Preview. Vorher war die Domain in
 * bibtex.ts und ResonanzDetailPage.tsx hartcodiert (onrender bzw. netlify).
 */
export const SITE_URL = (
  import.meta.env.VITE_SITE_URL ?? "https://digitale-transformation-ebook.de"
).replace(/\/+$/, "");
