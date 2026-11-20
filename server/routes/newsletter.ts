/**
 * Newsletter „Erkenntnis des Tages".
 * Double-Opt-in, Abmeldelink, Admin-Zählung. Kein Versand ohne Anbieter.
 */
import express, { Router } from "express";
import { isAdminRequest } from "../lib/adminToken.js";
import { recordAdminAction } from "../lib/adminActionLog.js";
import { deliverMail, resolveDelivery, siteUrl, type DeliveryDeps } from "../lib/newsletterMail.js";
import { confirmationMail } from "../lib/newsletterMessages.js";
import { sendDigest, sendPendingConfirmations } from "../lib/newsletterDigest.js";
import { rateLimiter } from "../middleware/rateLimit.js";
import {
  confirmSubscriber,
  deleteSubscriber,
  publicSubscriber,
  subscriberCounts,
  unsubscribeSubscriber,
  upsertSubscriber,
  withNewsletterState,
  type Cadence,
} from "../lib/newsletterStore.js";

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || /[\r\n]/.test(email) || !EMAIL.test(email)) return null;
  return email;
}

function cadenceOf(value: unknown): Cadence {
  return value === "daily" ? "daily" : "weekly";
}

function page(title: string, text: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:Georgia,serif;background:#1c1917;color:#e7e5e4;max-width:36rem;margin:3rem auto;padding:0 1rem"><h1>${title}</h1><p>${text}</p><p><a style="color:#f59e0b" href="/">Zur Startseite</a></p></body></html>`;
}

function sendPage(res: express.Response, status: number, title: string, text: string): void {
  res.status(status).setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.send(page(title, text));
}

function tokenOf(value: unknown): string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : "";
}

export function createNewsletterRouter(deps: DeliveryDeps = {}): Router {
  const router = Router();

  router.post("/api/newsletter/subscribe", rateLimiter("newsletter-subscribe", 5, 60 * 60_000), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.body?.consent !== true) {
      return res.status(400).json({ ok: false, error: "Bitte die Einwilligung bestätigen." });
    }
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben." });
    const cadence = cadenceOf(req.body?.cadence);
    try {
      const outcome = await withNewsletterState(state => upsertSubscriber(state, {
        email,
        cadence,
        now: new Date().toISOString(),
      }));
      if (outcome.kind === "confirmed") {
        const rhythm = outcome.cadenceChanged
          ? ` Der Rhythmus ist jetzt ${cadence === "daily" ? "täglich" : "wöchentlich"}.`
          : "";
        return res.json({
          ok: true,
          state: "confirmed",
          delivery: "none",
          message: `Diese Adresse ist bereits angemeldet.${rhythm}`,
        });
      }
      const result = await deliverMail(confirmationMail(outcome.subscriber, siteUrl()), deps);
      const delivery = result.delivered ? "sent" : result.failed ? "failed" : "log";
      const message = delivery === "sent"
        ? "Bitte bestätige die Anmeldung über den Link in der E-Mail. Ohne Bestätigung geht nichts hinaus."
        : delivery === "failed"
          ? "Die Anmeldung ist gespeichert, die Bestätigungsmail konnte nicht zugestellt werden."
          : "Die Anmeldung ist gespeichert. Der Versand ist noch nicht eingerichtet — es wird keine E-Mail verschickt. Sobald der Versand aktiv ist, kann die Bestätigung nachgeholt werden.";
      return res.json({ ok: true, state: "pending", delivery, message });
    } catch (err) {
      console.info(`[newsletter] Anmeldung nicht gespeichert: ${err instanceof Error ? err.message : "unbekannt"}`);
      return res.status(500).json({ ok: false, error: "Die Anmeldung konnte nicht gespeichert werden." });
    }
  });

  router.get("/api/newsletter/confirm", rateLimiter("newsletter-confirm", 30, 60 * 60_000), async (req, res) => {
    const token = tokenOf(req.query.token);
    if (!token) return sendPage(res, 400, "Link ungültig", "Dieser Bestätigungslink ist unvollständig.");
    try {
      const result = await withNewsletterState(state => confirmSubscriber(state, token, new Date().toISOString()));
      if (result === "invalid") return sendPage(res, 404, "Link ungültig", "Dieser Bestätigungslink ist ungültig oder gehört zu einer schon gelöschten Anmeldung.");
      if (result === "already") return sendPage(res, 200, "Schon bestätigt", "Diese Anmeldung war bereits bestätigt.");
      return sendPage(res, 200, "Anmeldung bestätigt", "Ab jetzt kommt die Erkenntnis des Tages in dem Rhythmus, den du gewählt hast. Abmelden geht über den Link in jeder Mail.");
    } catch {
      return sendPage(res, 500, "Gerade nicht möglich", "Die Bestätigung konnte nicht gespeichert werden.");
    }
  });

  router.get("/api/newsletter/unsubscribe", rateLimiter("newsletter-unsubscribe", 30, 60 * 60_000), async (req, res) => {
    const token = tokenOf(req.query.token);
    if (!token) return sendPage(res, 400, "Link ungültig", "Dieser Abmeldelink ist unvollständig.");
    try {
      const result = await withNewsletterState(state => unsubscribeSubscriber(state, token));
      if (result === "invalid") {
        return sendPage(res, 404, "Link ungültig", "Dieser Abmeldelink ist ungültig. Wenn noch Mails kommen, schreib an die im Impressum genannte Stelle.");
      }
      return sendPage(res, 200, "Abgemeldet", "Die Adresse ist gelöscht. Es geht keine weitere Ausgabe hinaus.");
    } catch {
      return sendPage(res, 500, "Gerade nicht möglich", "Die Abmeldung konnte nicht gespeichert werden.");
    }
  });

  router.get("/api/newsletter/status", (_req, res) => {
    const ready = resolveDelivery().ready;
    res.setHeader("Cache-Control", "no-store");
    res.json({
      delivery: ready ? "ready" : "log",
      note: ready ? null : "Der Versand ist noch nicht eingerichtet. Anmeldungen werden gespeichert, es geht aber keine E-Mail hinaus.",
    });
  });

  router.get("/api/admin/newsletter", async (req, res) => {
    if (!isAdminRequest(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    try {
      const data = await withNewsletterState(state => ({
        counts: subscriberCounts(state),
        subscribers: state.subscribers.map(publicSubscriber),
      }));
      const delivery = resolveDelivery();
      return res.json({ ...data, provider: delivery.mode, delivery: delivery.ready ? "ready" : "log" });
    } catch {
      return res.status(500).json({ error: "Newsletter-Speicher nicht lesbar" });
    }
  });

  router.post("/api/admin/newsletter/delete", async (req, res) => {
    if (!isAdminRequest(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "E-Mail fehlt" });
    try {
      const removed = await withNewsletterState(state => deleteSubscriber(state, email));
      recordAdminAction({ type: "newsletter-delete", actor: "admin", targetId: email, ok: removed });
      if (!removed) return res.status(404).json({ error: "Adresse nicht gefunden" });
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "Löschen fehlgeschlagen" });
    }
  });

  router.post("/api/admin/newsletter/digest", rateLimiter("newsletter-digest", 10, 60 * 60_000), async (req, res) => {
    if (!isAdminRequest(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    const cadence = req.body?.cadence === "weekly" ? "weekly" : req.body?.cadence === "daily" ? "daily" : null;
    if (!cadence) return res.status(400).json({ error: "Rhythmus daily oder weekly fehlt" });
    try {
      const report = await sendDigest(cadence, { force: req.body?.force === true, deliverDeps: deps });
      recordAdminAction({
        type: "newsletter-digest",
        actor: "admin",
        ok: report.failed === 0,
        targetCount: report.delivered + report.logged,
        reason: report.skipped ?? undefined,
      });
      return res.json({ ok: true, report });
    } catch {
      return res.status(500).json({ error: "Digest fehlgeschlagen" });
    }
  });

  router.post("/api/admin/newsletter/resend-confirm", rateLimiter("newsletter-resend", 5, 60 * 60_000), async (req, res) => {
    if (!isAdminRequest(req)) return res.status(401).json({ error: "Nicht autorisiert" });
    try {
      const result = await sendPendingConfirmations(deps);
      recordAdminAction({ type: "newsletter-resend", actor: "admin", ok: result.failed === 0, targetCount: result.pending });
      return res.json({ ok: true, ...result });
    } catch {
      return res.status(500).json({ error: "Bestätigungen fehlgeschlagen" });
    }
  });

  return router;
}
