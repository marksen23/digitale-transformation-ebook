/**
 * Newsletter: Double-Opt-in, kein Netzversand ohne Anbieter, Digest nur
 * an bestätigte Adressen, Admin bleibt token-geschützt.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { buildErkenntnisFeedXml, renderDailyFeedXml } from "../lib/erkenntnisFeed.js";
import { deliverMail } from "../lib/newsletterMail.js";
import { parseFeedEntries, selectDigestSnippets } from "../lib/newsletterMessages.js";
import { sendDigest } from "../lib/newsletterDigest.js";
import { buildMime, dotStuff, smtpTransaction } from "../lib/newsletterSmtp.js";
import { defaultNewsletterStorePath } from "../lib/newsletterStore.js";
import { createNewsletterRouter } from "../routes/newsletter.js";
import type { OutboundMail } from "../lib/newsletterMessages.js";

const ENV = [
  "NEWSLETTER_STORE_PATH",
  "NEWSLETTER_PROVIDER",
  "NEWSLETTER_API_KEY",
  "NEWSLETTER_FROM",
  "NEWSLETTER_SMTP_HOST",
  "NEWSLETTER_SMTP_PORT",
  "NEWSLETTER_SMTP_USER",
  "NEWSLETTER_SMTP_PASS",
  "ADMIN_TOKEN",
  "SITE_URL",
] as const;

const saved: Partial<Record<(typeof ENV)[number], string | undefined>> = {};
let dir = "";
let ip = 10;

function sampleMail(over: Partial<OutboundMail> = {}): OutboundMail {
  return {
    to: "ada@example.test",
    subject: "Erkenntnis des Tages — 2026-11-20",
    text: "Ein Satz.",
    html: "<p>Ein Satz.</p>",
    unsubscribeUrl: "https://example.test/api/newsletter/unsubscribe?token=abc",
    ...over,
  };
}

beforeEach(() => {
  for (const key of ENV) saved[key] = process.env[key];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "newsletter-"));
  process.env.NEWSLETTER_STORE_PATH = path.join(dir, "subscribers.json");
  process.env.SITE_URL = "https://example.test";
  delete process.env.NEWSLETTER_PROVIDER;
  delete process.env.NEWSLETTER_API_KEY;
  delete process.env.NEWSLETTER_FROM;
  delete process.env.NEWSLETTER_SMTP_HOST;
  delete process.env.ADMIN_TOKEN;
});

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

function storeJson(): { subscribers: Array<Record<string, string>> } {
  return JSON.parse(fs.readFileSync(process.env.NEWSLETTER_STORE_PATH as string, "utf8"));
}

async function withApp(
  app: express.Express,
  fn: (call: (method: string, url: string, body?: string, headers?: Record<string, string>) => Promise<{ status: number; body: string }>) => Promise<void>,
) {
  app.set("trust proxy", 1);
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  try {
    await fn((method, url, body, headers = {}) => new Promise((resolve, reject) => {
      const reqHeaders = { ...headers, "x-forwarded-for": headers["x-forwarded-for"] ?? `203.0.113.${ip}` };
      if (!headers["x-forwarded-for"]) ip += 1;
      if (body !== undefined) {
        reqHeaders["content-type"] = "application/json";
        reqHeaders["content-length"] = String(Buffer.byteLength(body));
      }
      const req = http.request({ hostname: "127.0.0.1", port, method, path: url, headers: reqHeaders }, res => {
        const chunks: Buffer[] = [];
        res.on("data", c => chunks.push(c as Buffer));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      });
      req.on("error", reject);
      if (body !== undefined) req.write(body);
      req.end();
    }));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

describe("Newsletter-Versand", () => {
  it("liegt außerhalb des öffentlichen Korpus", () => {
    const file = defaultNewsletterStorePath();
    expect(file.includes(`${path.sep}client${path.sep}public`)).toBe(false);
    expect(file.includes(`${path.sep}content${path.sep}resonanzen`)).toBe(false);
    expect(file.endsWith(path.join("data", "newsletter", "subscribers.json"))).toBe(true);
    expect(fs.readFileSync(path.join(process.cwd(), ".gitignore"), "utf8")).toContain("data/newsletter/");
  });

  it("ruft ohne Anbieter kein Netz auf", async () => {
    let called = false;
    const result = await deliverMail(sampleMail(), {
      fetchImpl: async () => {
        called = true;
        throw new Error("Netz darf nicht gerufen werden");
      },
    });
    expect(called).toBe(false);
    expect(result).toEqual({ delivered: false, mode: "log", failed: false });
  });

  it("lässt einen gesetzten Anbieter ohne Key ebenfalls liegen", async () => {
    process.env.NEWSLETTER_PROVIDER = "resend";
    process.env.NEWSLETTER_FROM = "News <news@example.test>";
    let called = false;
    const result = await deliverMail(sampleMail(), {
      fetchImpl: async () => { called = true; return new Response("no"); },
    });
    expect(called).toBe(false);
    expect(result.delivered).toBe(false);
  });

  it("baut den Resend- und den Brevo-Aufruf, ohne ihn abzusetzen", async () => {
    process.env.NEWSLETTER_FROM = "Resonanzvernunft <news@example.test>";
    process.env.NEWSLETTER_API_KEY = "test-key";
    const seen: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const headers = init?.headers as Record<string, string>;
      seen.push({ url: String(url), headers, body: JSON.parse(String(init?.body)) });
      return new Response("{}", { status: 200 });
    };
    process.env.NEWSLETTER_PROVIDER = "resend";
    expect((await deliverMail(sampleMail(), { fetchImpl })).delivered).toBe(true);
    process.env.NEWSLETTER_PROVIDER = "brevo";
    expect((await deliverMail(sampleMail(), { fetchImpl })).delivered).toBe(true);
    expect(seen[0].url).toBe("https://api.resend.com/emails");
    expect(seen[0].headers.authorization).toBe("Bearer test-key");
    expect(seen[0].body.to).toEqual(["ada@example.test"]);
    expect(String((seen[0].body.headers as Record<string, string>)["List-Unsubscribe"])).toContain("unsubscribe?token=");
    expect(seen[1].url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(seen[1].headers["api-key"]).toBe("test-key");
    expect(seen.map(s => s.url).some(url => url.startsWith("https://api.resend.com") || url.startsWith("https://api.brevo.com"))).toBe(true);
  });

  it("verweigert einen Zeilenumbruch im SMTP-Header und stopft den Punkt", () => {
    expect(() => buildMime(sampleMail({ to: "ada@example.test\nBcc: x@y.test" }), "news@example.test")).toThrow(/Zeilenumbruch/);
    expect(dotStuff(".geheim\nweiter")).toBe("..geheim\r\nweiter\r\n");
  });

  it("spricht SMTP als Dialog, ohne eine Verbindung zu öffnen", async () => {
    const replies = ["220 bereit", "250-PIPELINING", "250 ok", "334 VXNlcm5hbWU6", "334 UGFzc3dvcmQ6", "235 ok", "250 ok", "250 ok", "354 weiter", "250 gesendet"];
    const written: string[] = [];
    const raw: string[] = [];
    await smtpTransaction({
      readLine: async () => {
        const next = replies.shift();
        if (!next) throw new Error("Antwort fehlt");
        return next;
      },
      writeLine: line => written.push(line),
      writeRaw: chunk => raw.push(chunk),
    }, {
      from: "news@example.test",
      to: "ada@example.test",
      data: "Subject: Hallo\r\n\r\nText",
      user: "user",
      pass: "secret",
    });
    expect(written[0]).toBe("EHLO resonanzvernunft");
    expect(written).toContain("MAIL FROM:<news@example.test>");
    expect(written).toContain("RCPT TO:<ada@example.test>");
    expect(written.at(-1)).toBe("QUIT");
    expect(raw[0].endsWith("\r\n.\r\n")).toBe(true);
    expect(replies).toHaveLength(0);
  });
});

describe("Newsletter-Routen", () => {
  it("speichert pending, bestätigt per Token und löscht über den Abmeldelink", async () => {
    const sent: OutboundMail[] = [];
    process.env.NEWSLETTER_PROVIDER = "smtp";
    process.env.NEWSLETTER_SMTP_HOST = "127.0.0.1";
    process.env.NEWSLETTER_FROM = "News <news@example.test>";
    const app = express();
    app.use(express.json());
    app.use(createNewsletterRouter({
      smtpSend: async mail => { sent.push(mail); },
    }));
    await withApp(app, async call => {
      const denied = await call("POST", "/api/newsletter/subscribe", JSON.stringify({ email: "ada@example.test", cadence: "weekly", consent: false }));
      expect(denied.status).toBe(400);
      expect(fs.existsSync(process.env.NEWSLETTER_STORE_PATH as string)).toBe(false);

      const pending = await call("POST", "/api/newsletter/subscribe", JSON.stringify({ email: "Ada@Example.test", cadence: "daily", consent: true }));
      expect(pending.status).toBe(200);
      const pendingBody = JSON.parse(pending.body);
      expect(pendingBody.state).toBe("pending");
      expect(pendingBody.delivery).toBe("sent");
      expect(pendingBody.message).toContain("Bitte bestätige");
      expect(pending.body).not.toContain("confirmToken");
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe("ada@example.test");
      expect(sent[0].text).toContain("/api/newsletter/confirm?token=");
      expect(sent[0].text).toContain("/api/newsletter/unsubscribe?token=");
      const confirm = sent[0].text.match(/confirm\?token=([a-f0-9]{64})/)?.[1] ?? "";
      const unsub = sent[0].text.match(/unsubscribe\?token=([a-f0-9]{64})/)?.[1] ?? "";
      expect(confirm).not.toBe(unsub);

      const again = await call("POST", "/api/newsletter/subscribe", JSON.stringify({ email: "ada@example.test", cadence: "daily", consent: true }));
      expect(JSON.parse(again.body).state).toBe("pending");

      const ok = await call("GET", `/api/newsletter/confirm?token=${confirm}`);
      expect(ok.status).toBe(404);

      const fresh = sent.at(-1)?.text.match(/confirm\?token=([a-f0-9]{64})/)?.[1] ?? "";
      const confirmed = await call("GET", `/api/newsletter/confirm?token=${fresh}`);
      expect(confirmed.status).toBe(200);
      expect(confirmed.body).toContain("Anmeldung bestätigt");
      expect(storeJson().subscribers[0].status).toBe("confirmed");

      const bye = await call("GET", `/api/newsletter/unsubscribe?token=${unsub}`);
      expect(bye.status).toBe(200);
      expect(bye.body).toContain("Abgemeldet");
      expect(storeJson().subscribers).toHaveLength(0);
    });
  });

  it("sagt ohne Anbieter, dass keine Mail hinausgeht", async () => {
    const app = express();
    app.use(express.json());
    app.use(createNewsletterRouter());
    await withApp(app, async call => {
      const status = await call("GET", "/api/newsletter/status");
      expect(JSON.parse(status.body).delivery).toBe("log");
      const res = await call("POST", "/api/newsletter/subscribe", JSON.stringify({ email: "ada@example.test", consent: true }));
      const body = JSON.parse(res.body);
      expect(body.delivery).toBe("log");
      expect(body.message).toContain("keine E-Mail");
      expect(storeJson().subscribers[0].status).toBe("pending");
    });
  });

  it("begrenzt die Anmeldung", async () => {
    const app = express();
    app.use(express.json());
    app.use(createNewsletterRouter());
    await withApp(app, async call => {
      const headers = { "x-forwarded-for": "198.51.100.20" };
      for (let i = 0; i < 5; i++) {
        const hit = await call("POST", "/api/newsletter/subscribe", JSON.stringify({ email: `a${i}@example.test`, consent: true }), headers);
        expect(hit.status).toBe(200);
      }
      const blocked = await call("POST", "/api/newsletter/subscribe", JSON.stringify({ email: "voll@example.test", consent: true }), headers);
      expect(blocked.status).toBe(429);
    });
  });

  it("zeigt dem Admin die Anzahl und keine Tokens, und löscht auf Wunsch", async () => {
    process.env.ADMIN_TOKEN = "admin-secret";
    const app = express();
    app.use(express.json());
    app.use(createNewsletterRouter());
    await withApp(app, async call => {
      await call("POST", "/api/newsletter/subscribe", JSON.stringify({ email: "ada@example.test", consent: true }));
      const hidden = await call("GET", "/api/admin/newsletter");
      expect(hidden.status).toBe(401);
      const wrong = await call("GET", "/api/admin/newsletter", undefined, { authorization: "Bearer falsch" });
      expect(wrong.status).toBe(401);
      const list = await call("GET", "/api/admin/newsletter", undefined, { authorization: "Bearer admin-secret" });
      expect(list.status).toBe(200);
      const overview = JSON.parse(list.body);
      expect(overview.counts).toEqual({ pending: 1, confirmed: 0 });
      expect(overview.subscribers[0].email).toBe("ada@example.test");
      expect(list.body).not.toContain("confirmToken");
      expect(list.body).not.toContain("unsubscribeToken");
      const removed = await call("POST", "/api/admin/newsletter/delete", JSON.stringify({ email: "ada@example.test" }), { authorization: "Bearer admin-secret" });
      expect(removed.status).toBe(200);
      expect(storeJson().subscribers).toHaveLength(0);
    });
  });

  it("nimmt in den Digest nur bestätigte Adressen und den Feed-Satz", async () => {
    const now = new Date("2026-11-20T12:00:00Z");
    const xml = buildErkenntnisFeedXml([
      { id: "A", kernsatz: "Der Tag trägt einen Satz.", answerId: "a1", conceptAnchor: "freiheit", createdAt: "2026-01-01" },
    ], [], now, "https://example.test");
    const snippet = selectDigestSnippets(parseFeedEntries(xml), "daily", now)[0];
    expect(snippet.summary).toBe("Der Tag trägt einen Satz.");
    expect(snippet.link).toContain("/landkarte?begriff=freiheit");
    expect(selectDigestSnippets(parseFeedEntries(xml), "weekly", now)).toHaveLength(7);

    process.env.NEWSLETTER_PROVIDER = "smtp";
    process.env.NEWSLETTER_SMTP_HOST = "127.0.0.1";
    process.env.NEWSLETTER_FROM = "News <news@example.test>";
    const sent: OutboundMail[] = [];
    const app = express();
    app.use(express.json());
    app.use(createNewsletterRouter({ smtpSend: async mail => { sent.push(mail); } }));
    await withApp(app, async call => {
      await call("POST", "/api/newsletter/subscribe", JSON.stringify({ email: "offen@example.test", cadence: "daily", consent: true }));
      await call("POST", "/api/newsletter/subscribe", JSON.stringify({ email: "fest@example.test", cadence: "daily", consent: true }));
      const token = sent.at(-1)?.text.match(/confirm\?token=([a-f0-9]{64})/)?.[1] ?? "";
      await call("GET", `/api/newsletter/confirm?token=${token}`);
      sent.length = 0;
      process.env.ADMIN_TOKEN = "admin-secret";
      const live = selectDigestSnippets(parseFeedEntries(renderDailyFeedXml(new Date())), "daily", new Date())[0];
      const digest = await call(
        "POST",
        "/api/admin/newsletter/digest",
        JSON.stringify({ cadence: "daily" }),
        { authorization: "Bearer admin-secret" },
      );
      expect(digest.status).toBe(200);
      const report = JSON.parse(digest.body).report;
      expect(report.recipients).toBe(1);
      expect(report.delivered).toBe(1);
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe("fest@example.test");
      expect(live?.summary.length).toBeGreaterThan(0);
      expect(sent[0].text).toContain(live.summary);
      expect(sent[0].unsubscribeUrl).toContain("/api/newsletter/unsubscribe?token=");
    });

    const logged = await sendDigest("daily", { now, force: true });
    expect(logged.logged).toBeGreaterThan(0);
    expect(logged.delivered).toBe(0);
  });
});
