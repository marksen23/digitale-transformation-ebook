import { describe, expect, it } from "vitest";
import { buildSitemap, renderSeoHtml, SITE_URL } from "../lib/seo.js";

const TEMPLATE =
  '<!doctype html><html><head><title>raw</title><meta name="description" content="raw" /><!--SEO-HEAD--></head><body><div id="root"><!--SEO-BODY--></div></body></html>';

const HOME_TITLE = "Resonanzvernunft – Digitale Transformation — Markus Oehring";

function titleOf(html: string): string {
  return html.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
}
function descriptionOf(html: string): string {
  return html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
}
function canonicalOf(html: string): string {
  return html.match(/rel="canonical" href="([^"]+)"/)?.[1] ?? "";
}

describe("SEO-Route-Meta", () => {
  it("gibt /datenschutz einen eigenen deutschen Titel, Beschreibung und Canonical", async () => {
    const html = await renderSeoHtml(TEMPLATE, "/datenschutz");
    expect(titleOf(html)).toBe(`Datenschutz — ${HOME_TITLE.split(" — ")[0]}`);
    expect(titleOf(html)).not.toBe(HOME_TITLE);
    expect(descriptionOf(html)).toContain("Datenschutzerklärung");
    expect(descriptionOf(html)).not.toContain("poetisch-philosophische Trilogie");
    expect(canonicalOf(html)).toBe(`${SITE_URL}/datenschutz`);
    expect(html).toContain("<h1>Datenschutz</h1>");
  });

  it("füllt die öffentlichen Routen, die vorher auf die Startseite zurückfielen", async () => {
    const cases: { path: string; title: string; canonical?: string }[] = [
      { path: "/erkunden", title: "Erkunden — Ein Begriffsraum, drei Linsen · Resonanzvernunft – Digitale Transformation" },
      { path: "/en/erkunden", title: "Erkunden — Ein Begriffsraum, drei Linsen · Resonanzvernunft – Digitale Transformation", canonical: `${SITE_URL}/en/erkunden` },
      { path: "/mein-werk", title: "Mein Werk — Resonanzvernunft – Digitale Transformation" },
      { path: "/werk/band1-intro", title: "Das Werk lesen — Resonanzvernunft – Digitale Transformation", canonical: `${SITE_URL}/werk/band1-intro` },
      { path: "/404", title: "Seite nicht gefunden — Resonanzvernunft – Digitale Transformation" },
      { path: "/status", title: "Status — Resonanzvernunft – Digitale Transformation" },
    ];
    for (const c of cases) {
      const html = await renderSeoHtml(TEMPLATE, c.path);
      expect(titleOf(html), c.path).toBe(c.title);
      expect(titleOf(html), c.path).not.toBe(HOME_TITLE);
      expect(canonicalOf(html), c.path).toBe(c.canonical ?? `${SITE_URL}${c.path}`);
    }
  });

  it("lässt unbekannte Adressen bei der Startseiten-Meta und nimmt Query-Strings aus dem Canonical", async () => {
    const unknown = await renderSeoHtml(TEMPLATE, "/gibt-es-nicht");
    expect(titleOf(unknown)).toBe(HOME_TITLE);
    const queried = await renderSeoHtml(TEMPLATE, "/datenschutz?x=1");
    expect(canonicalOf(queried)).toBe(`${SITE_URL}/datenschutz`);
    expect(titleOf(queried)).toContain("Datenschutz");
  });

  it("indexiert /admin und /dev nicht mit der Startseiten-Beschreibung", async () => {
    for (const path of ["/admin", "/admin/health", "/dev/search"]) {
      const html = await renderSeoHtml(TEMPLATE, path);
      expect(titleOf(html), path).toBe("Intern — Resonanzvernunft – Digitale Transformation");
      expect(html, path).toContain('name="robots" content="noindex, nofollow"');
      expect(descriptionOf(html), path).not.toContain("poetisch-philosophische Trilogie");
      expect(canonicalOf(html), path).toBe(`${SITE_URL}${path}`);
    }
  });

  it("nimmt die neuen öffentlichen Routen in die Sitemap auf, die Fehlerseite nicht", async () => {
    const xml = await buildSitemap();
    for (const route of ["/datenschutz", "/erkunden", "/mein-werk", "/status", "/impressum"]) {
      expect(xml).toContain(`${SITE_URL}${route}`);
    }
    expect(xml).not.toContain(`${SITE_URL}/404`);
    expect(xml).not.toContain(`${SITE_URL}/admin`);
  });
});
