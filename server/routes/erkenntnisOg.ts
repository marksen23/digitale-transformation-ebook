/**
 * Teilen-Bild einer Erkenntnis. SVG, und PNG wenn sharp da ist.
 */
import { Router } from "express";
import { erkenntnisOgSvg } from "../../shared/erkenntnisCite.js";
import { findPublicErkenntnis } from "../lib/erkenntnisPublic.js";

export function createErkenntnisOgRouter(): Router {
  const router = Router();
  router.get("/api/og/erkenntnis/:id", async (req, res) => {
    const item = findPublicErkenntnis(String(req.params.id || ""));
    if (!item) return res.status(404).type("text/plain").send("Erkenntnis nicht gefunden");
    const svg = erkenntnisOgSvg(item.text);
    res.setHeader("Cache-Control", "public, max-age=3600");
    try {
      const sharp = (await import("sharp")).default;
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      res.setHeader("Content-Type", "image/png");
      return res.send(png);
    } catch {
      res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
      return res.send(svg);
    }
  });
  return router;
}
