/**
 * Dieselbe Admin-Prüfung wie in den bestehenden /api/admin-Routen.
 * SHA-256 beider Seiten, damit timingSafeEqual keine Länge verrät.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type express from "express";

export function isAdminRequest(req: express.Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const auth = req.headers.authorization ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/);
  if (m === null) return false;
  const a = createHash("sha256").update(m[1]).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
