import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { HEAVY_PUBLIC_JSON, isHeavyPublicJson } from "./shared/heavyAssets.ts";
import { umamiScript } from "./vite/indexHtmlAnalytics.ts";

/**
 * Umami nur, wenn BEIDE Vite-Variablen gesetzt sind. Sonst kein Script —
 * ein literales `%VITE_ANALYTICS_…%` im HTML erzeugt sonst einen 400er.
 * Prozess-Env gewinnt über .env-Dateien (Render setzt die Variablen dort).
 */
function analyticsHtmlPlugin(): Plugin {
  let endpoint = "";
  let websiteId = "";
  return {
    name: "umami-analytics",
    configResolved(config) {
      const fromFiles = loadEnv(config.mode, config.envDir, "VITE_");
      endpoint = process.env.VITE_ANALYTICS_ENDPOINT || fromFiles.VITE_ANALYTICS_ENDPOINT || "";
      websiteId = process.env.VITE_ANALYTICS_WEBSITE_ID || fromFiles.VITE_ANALYTICS_WEBSITE_ID || "";
    },
    transformIndexHtml() {
      const tag = umamiScript(endpoint, websiteId);
      if (!tag) return;
      return [
        {
          tag: "script",
          attrs: {
            defer: true,
            src: tag.src,
            "data-website-id": tag.websiteId,
          },
          injectTo: "body",
        },
      ];
    },
  };
}

/** Embedding-Blobs bleiben im Repo (Build/RAG), gehören aber nicht ins
 *  Frontend-Bundle. express.static würde sie sonst ausliefern. */
function omitHeavyPublicJson(): Plugin {
  return {
    name: "omit-heavy-public-json",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (!isHeavyPublicJson(url)) { next(); return; }
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.end(JSON.stringify({ error: "Nicht gefunden." }));
      });
    },
    closeBundle: {
      order: "post",
      handler() {
        const outDir = path.resolve(import.meta.dirname, "dist/public");
        for (const name of HEAVY_PUBLIC_JSON) {
          fs.rmSync(path.join(outDir, name), { force: true });
        }
      },
    },
  };
}

const plugins = [
  react(),
  tailwindcss(),
  analyticsHtmlPlugin(),
  omitHeavyPublicJson(),
  VitePWA({
    registerType: "autoUpdate",
    includeAssets: ["icons/*.png", "favicon.ico"],
    manifest: {
      // `id` ist Chrome's eindeutiger App-Identifier — bleibt stabil
      // auch wenn start_url sich später ändert. Empfohlen von Google,
      // damit der Browser eine bereits installierte Instanz wiederfindet
      // statt eine zweite Kopie zu installieren.
      id: "/?source=pwa",
      name: "Resonanzvernunft — Digitale Transformation",
      short_name: "Resonanzvernunft",
      description:
        "Ebook-Trilogie zur digitalen Transformation: offline lesbar, mit Glossar, Übersetzung und Q&A.",
      lang: "de",
      start_url: "/?source=pwa",
      scope: "/",
      display: "standalone",
      // display_override: "window-controls-overlay" stand hier früher an
      // erster Stelle (gedacht für ein natives Desktop-Gefühl), aber dieser
      // Modus lässt den Browser eine eigene Titlebar-Overlay-Zone (inkl. u.U.
      // einem "⋮"-App-Menü) OBEN INS VIEWPORT zeichnen — die App muss dafür
      // mit env(titlebar-area-*) eigens Platz lassen. Das gibt es hier nicht,
      // also überlappte das Overlay unsere fixe Nav-Leiste (gefunden
      // 2026-09-02: "Dreipunkte-Menü oben links überlappt Hell/Dunkel-
      // Umschalter u.a."). "standalone" zeichnet keinerlei Browser-Chrome ins
      // Content-Viewport — genau das native App-Fenster-Gefühl, ohne die
      // Overlay-Zone bauen zu müssen.
      display_override: ["standalone", "minimal-ui"],
      orientation: "portrait",
      background_color: "#0c0a09",
      theme_color: "#b45309",
      categories: ["books", "education"],
      icons: [
        // Chrome braucht mindestens ein 192px-Icon mit purpose="any" für
        // Installierbarkeit. Beide PNGs explizit als "any" markiert, plus
        // eine maskable-Variante für Android-Adaptive-Icons.
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        {
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    workbox: {
      globPatterns: ["**/*.{js,css,html,woff2,svg,png,ico,md}"],
      navigateFallback: "/index.html",
      navigateFallbackDenylist: [/^\/api\//],
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: "google-fonts-stylesheets",
            expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
          },
        },
        {
          urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: "google-fonts-webfonts",
            expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: "cdn-assets",
            expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          urlPattern: /\/ebook_content\.md$/i,
          handler: "StaleWhileRevalidate",
          options: {
            cacheName: "ebook-content",
            expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 },
          },
        },
        {
          urlPattern: /^\/api\//,
          handler: "NetworkOnly",
        },
      ],
    },
    devOptions: {
      // PWA-Install im Dev-Modus aktivieren — so feuert
      // beforeinstallprompt auch auf localhost, und der Ein-Klick-
      // Install-Pfad lässt sich vor Deploy lokal verifizieren.
      // Workbox-Caching im Dev kann gelegentlich stale Assets liefern;
      // bei Bedarf Service Worker in DevTools unregistrieren.
      enabled: true,
      type: "module",
    },
  }),
];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 3000,
    strictPort: false,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
