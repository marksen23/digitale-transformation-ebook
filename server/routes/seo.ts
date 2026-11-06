/**
 * sitemap.xml, llms-full.txt und der SPA-Catch-all mit SEO-Injektion.
 * Muss als letzter Router montiert werden.
 */
import fs from "fs";
import path from "path";
import { Router } from "express";
import { HTML_CACHE_CONTROL } from "../lib/securityHeaders.js";
import { buildLlmsFullText, buildSitemap, renderSeoHtml } from "../lib/seo.js";

export function createSeoRouter(staticPath: string): Router {
  const router = Router();
  // Dynamische sitemap.xml aus dem Live-Index (alle nicht-rejected Resonanzen +
  // Haupt-Routen). Frisch ohne Build — neue Resonanzen erscheinen automatisch.
  router.get("/sitemap.xml", async (_req, res) => {
    try {
      const xml = await buildSitemap();
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(xml);
    } catch (err) {
      console.error("[sitemap] failed:", err);
      res.status(500).send("sitemap error");
    }
  });

  // GEO: kuratierter Volltext-Dump für KI-Agenten (llmstxt.org-Konvention).
  // Dynamisch aus dem Live-Index — muss VOR dem SPA-Catch-all stehen; das
  // statische llms.txt (Navigation) liefert express.static.
  router.get("/llms-full.txt", async (_req, res) => {
    try {
      const text = await buildLlmsFullText();
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(text);
    } catch (err) {
      console.error("[llms-full] failed:", err);
      res.status(500).send("llms-full error");
    }
  });

  // Handle client-side routing — serve index.html for all routes, ABER mit
  // server-injizierter SEO/GEO-Aufbereitung (Meta + JSON-LD + Text-Snapshot pro
  // Route, server/lib/seo.ts). Template einmal gecacht (prod-statisch). Bei
  // jedem Fehler → roher sendFile-Fallback, damit die SPA nie ausfällt.
  const indexHtmlPath = path.join(staticPath, "index.html");
  let _indexTemplate: string | null = null;
  const getTemplate = (): string => {
    if (_indexTemplate == null) _indexTemplate = fs.readFileSync(indexHtmlPath, "utf-8");
    return _indexTemplate;
  };
  router.get("*", async (req, res) => {
    try {
      const html = await renderSeoHtml(getTemplate(), req.path);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", HTML_CACHE_CONTROL);
      res.send(html);
    } catch (err) {
      console.error("[seo] render failed, serving raw index.html:", err);
      res.setHeader("Cache-Control", HTML_CACHE_CONTROL);
      res.sendFile(indexHtmlPath);
    }
  });
  return router;
}
