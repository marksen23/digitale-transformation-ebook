/**
 * Sicherheits-Header und Cache-Policy für den Express-Server.
 *
 * CSP ist absichtlich mit 'unsafe-inline' für Skripte und Styles: die SPA
 * nutzt durchgängig Inline-Styles, und server/lib/seo.ts injiziert JSON-LD
 * als Inline-Script. Eine strikte Nonce-Policy würde die Seite brechen.
 * Die Policy blockiert trotzdem fremde Script-Origins, Plugins und Framing.
 * Gemini wird vom Server aufgerufen, nicht vom Browser; die Google-Origin
 * steht in connect-src, damit ein direkter Client-Call nicht an der Policy
 * scheitert. Analytics-Origin nur, wenn VITE_ANALYTICS_ENDPOINT gesetzt ist.
 */
import type { NextFunction, Request, Response } from "express";
import path from "path";

const HSTS = "max-age=31536000; includeSubDomains";

export function analyticsOrigin(endpoint = process.env.VITE_ANALYTICS_ENDPOINT): string | null {
  const raw = (endpoint ?? "").trim();
  if (!raw || raw.includes("%")) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(): string {
  const analytics = analyticsOrigin();
  const scriptSrc = ["'self'", "'unsafe-inline'"];
  // connect-src gilt auch für <link rel="preconnect">. Schriften selbst
  // laufen über style-src/font-src; die Hosts stehen hier, damit der
  // Preconnect nicht an der Policy scheitert.
  const connectSrc = [
    "'self'",
    "https://generativelanguage.googleapis.com",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "https://fonts.cdnfonts.com",
  ];
  const imgSrc = ["'self'", "data:", "blob:"];
  if (analytics) {
    scriptSrc.push(analytics);
    connectSrc.push(analytics);
    imgSrc.push(analytics);
  }
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.cdnfonts.com",
    "font-src 'self' data: https://fonts.gstatic.com https://fonts.cdnfonts.com",
    `img-src ${imgSrc.join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Content-Security-Policy", buildContentSecurityPolicy());
  // HSTS wirkt nur über HTTPS. Lokal (HTTP, NODE_ENV≠production) nicht setzen,
  // damit ein Dev-Browser localhost nicht pinnt.
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", HSTS);
  }
  next();
}

/** Cache-Control für Dateien aus express.static. null = Express-Default. */
export function staticCacheControl(staticRoot: string, filePath: string): string | null {
  const rel = path.relative(staticRoot, filePath).split(path.sep).join("/");
  if (rel === "index.html") return "no-cache";
  if (rel.startsWith("assets/")) return "public, max-age=31536000, immutable";
  return null;
}

export const HTML_CACHE_CONTROL = "no-cache";
