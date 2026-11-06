/**
 * In-memory Rate-Limiter (pro IP und Endpoint-Schlüssel).
 * Aus server/index.ts unverändert herausgelöst — derselbe Prozess-Store.
 */
import express from "express";
import { redactSecrets } from "../lib/geminiHttp.js";

// ─── In-memory Rate Limiter ───────────────────────────────────────────────────
interface RateBucket { count: number; resetAt: number; }
const _rlStore = new Map<string, RateBucket>();

// Stale entries aufräumen (alle 15 Minuten)
setInterval(() => {
  const now = Date.now();
  _rlStore.forEach((v, k) => {
    if (now > v.resetAt) _rlStore.delete(k);
  });
}, 15 * 60 * 1000).unref();

function getClientIp(req: express.Request): string {
  // SECURITY: req.ip statt eigenem X-Forwarded-For-Parsing. Der ERSTE
  // XFF-Eintrag ist client-kontrolliert (beliebig setzbar) — damit ließe
  // sich der Rate-Limiter der teuren LLM-Endpoints per gefälschtem Header
  // umgehen. Mit `trust proxy = 1` (genau ein Proxy-Hop: Render) löst
  // Express req.ip verlässlich auf die vom Proxy gesehene Client-IP auf
  // und ignoriert client-gelieferte XFF-Vorspann-Einträge.
  return (req.ip ?? 'unknown').trim();
}

/**
 * Express-Middleware: max. `max` Anfragen pro IP innerhalb von `windowMs` ms.
 * Antwortet mit HTTP 429 + Retry-After, wenn das Limit überschritten wird.
 */
/** Kürzt Fehltexte und entfernt API-Keys, bevor sie ins Log oder an den Client gehen. */
export function scrub(text: string): string {
  return redactSecrets(text).slice(0, 400);
}

export function rateLimiter(key: string, max: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = getClientIp(req);
    const storeKey = `${key}:${ip}`;
    const now = Date.now();
    const bucket = _rlStore.get(storeKey);

    if (!bucket || now > bucket.resetAt) {
      _rlStore.set(storeKey, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: `Zu viele Anfragen — bitte ${retryAfter} Sekunden warten.`,
      });
    }
    bucket.count++;
    return next();
  };
}
