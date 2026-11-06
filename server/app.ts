/**
 * Express-App: Middleware und Router in derselben Reihenfolge wie zuvor
 * in server/index.ts. Hört nicht selbst — das bleibt der Entry-Point.
 *
 * Neue Router (zum Beispiel Auslieferung von Embeddings oder Chunks) vor
 * createSeoRouter einhängen. Der SPA-Catch-all muss zuletzt bleiben.
 */
import express from "express";
import { createServer, type Server } from "http";
import path from "path";
import type { Express } from "express";
import { blockHeavyAssets } from "./lib/blockHeavyAssets.js";
import { compressResponses } from "./lib/compressResponses.js";
import { createEbookLoader } from "./lib/ebookContent.js";
import { rawAssetMiddleware } from "./lib/rawAssets.js";
import { canonicalHostRedirect } from "./lib/seo.js";
import { securityHeaders, staticCacheControl } from "./lib/securityHeaders.js";
import { createAdminRouter } from "./routes/admin.js";
import { createCorpusReadRouter } from "./routes/corpusRead.js";
import { createAnalyseRouter } from "./routes/analyse.js";
import { createAskRouter } from "./routes/ask.js";
import { createDialogRouter } from "./routes/dialog.js";
import { createEmbedRouter } from "./routes/embed.js";
import { createEnkiduRouter } from "./routes/enkidu.js";
import { createHealthRouter } from "./routes/health.js";
import { createPassageRouter } from "./routes/passage.js";
import { createPdfRouter } from "./routes/pdf.js";
import { createSeoRouter } from "./routes/seo.js";
import { createTranslateRouter } from "./routes/translate.js";

export function createApp(serverDir: string): { app: Express; server: Server } {
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");

  // Render terminiert TLS und sitzt als GENAU EIN Proxy vor dem Server.
  // trust proxy = 1 → req.ip = die vom Proxy angehängte echte Client-IP;
  // weiter vorn stehende (client-gefälschte) XFF-Einträge zählen nicht.
  // Wichtig für den Rate-Limiter (getClientIp). Lokal ohne Proxy harmlos.
  app.set("trust proxy", 1);

  app.use(securityHeaders);
  app.use(express.json());

  // Launch-Schalter: 301 von *.onrender.com / *.netlify.app auf die kanonische
  // de-Domain. ENV-gated (CANONICAL_REDIRECT=1) — inert bis zum DNS-Flip, danach
  // bündelt es alle SEO-Signale auf eine Domain. Muss ganz vorne stehen.
  app.use(canonicalHostRedirect);

  // Brotli/gzip für Text. Embedding-Blobs (werk-chunks, *-embeddings) bleiben
  // serverseitig — der Browser bekommt sie weder über Raw noch über static.
  app.use(compressResponses);
  app.use(blockHeavyAssets);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(serverDir, "public")
      : path.resolve(serverDir, "..", "dist", "public");

  // Render-only: die zwischen Server-Deploys wachsenden Korpus-JSONs (resonanzen-*,
  // Embeddings, concept-edges/nodes, werk-chunks) LIVE aus GitHub-Raw servieren —
  // frisch ohne Redeploy, ohne Netlify. Muss VOR express.static stehen; fällt bei
  // GitHub-Ausfall auf die eingebackene Kopie zurück (next()).
  app.use(rawAssetMiddleware);

  // index: false — sonst würde express.static das ROHE index.html für "/"
  // ausliefern (Auto-Index) und den SEO-Handler umgehen. So fällt "/" durch
  // zum Catch-all mit Meta-/JSON-LD-/Snapshot-Injektion.
  app.use(express.static(staticPath, {
    index: false,
    setHeaders(res, filePath) {
      const cache = staticCacheControl(staticPath, filePath);
      if (cache) res.setHeader("Cache-Control", cache);
    },
  }));

  const ebook = createEbookLoader(staticPath, serverDir);
  app.use(createHealthRouter());
  app.use(createEnkiduRouter(ebook.getEbookContent));
  app.use(createAskRouter(ebook.getAskChapters));
  app.use(createTranslateRouter());
  app.use(createAnalyseRouter());
  app.use(createDialogRouter());
  app.use(createPassageRouter());
  app.use(createAdminRouter());
  app.use(createEmbedRouter());
  app.use(createPdfRouter(staticPath));
  // Kapiteltext und Ähnlichkeitssuche: kleine Antworten, Vektoren bleiben hier.
  // Vor dem SEO-Catch-all, sonst schluckt GET * die neuen Pfade.
  app.use(createCorpusReadRouter());
  app.use(createSeoRouter(staticPath));

  return { app, server };
}
