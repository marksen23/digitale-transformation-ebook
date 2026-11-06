/**
 * blockHeavyAssets.ts — verhindert, dass der Browser die Multi-MB-
 * Embedding-Dateien lädt. RAG und Ähnlichkeitssuche lesen dieselben
 * Dateien serverseitig von Platte bzw. GitHub-Raw, nicht über diese URL.
 */
import type { NextFunction, Request, Response } from "express";
import { isHeavyPublicJson } from "../../shared/heavyAssets.js";

export function blockHeavyAssets(req: Request, res: Response, next: NextFunction): void {
  if (!isHeavyPublicJson(req.path)) {
    next();
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.status(404).json({ error: "Nicht gefunden." });
}
