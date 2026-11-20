/**
 * Versand hinter NEWSLETTER_PROVIDER. Ohne fertige Konfiguration wird
 * nichts verschickt — nur eine Log-Zeile, ohne Link und ohne vollen Empfänger.
 * Unter Vitest geht ohne injizierten Transport ebenfalls nichts ins Netz.
 */
import type { OutboundMail } from "./newsletterMessages.js";

export type { OutboundMail } from "./newsletterMessages.js";

export type ProviderName = "log" | "resend" | "brevo" | "smtp";

export interface DeliveryResult {
  delivered: boolean;
  mode: ProviderName;
  failed: boolean;
}

export interface DeliveryDeps {
  fetchImpl?: typeof fetch;
  smtpSend?: (mail: OutboundMail) => Promise<void>;
}

export function siteUrl(): string {
  return (process.env.SITE_URL ?? "https://digitale-transformation-ebook.de").replace(/\/+$/, "");
}

export interface ParsedFrom {
  name: string;
  email: string;
  header: string;
}

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function parseFrom(raw: string): ParsedFrom | null {
  const value = raw.trim();
  if (!value || /[\r\n]/.test(value)) return null;
  const wrapped = value.match(/^(.*)<([^<>]+)>$/);
  const email = (wrapped ? wrapped[2] : value).trim();
  const name = wrapped ? wrapped[1].trim().replace(/^"|"$/g, "") : "";
  if (!EMAIL.test(email) || /[\r\n]/.test(name)) return null;
  const header = name ? `${encodeHeader(name)} <${email}>` : email;
  return { name, email, header };
}

export function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const b64 = Buffer.from(value, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

export function resolveDelivery(): { mode: ProviderName; ready: boolean } {
  const raw = (process.env.NEWSLETTER_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "resend" || raw === "brevo") {
    const key = (process.env.NEWSLETTER_API_KEY ?? "").trim();
    const from = parseFrom(process.env.NEWSLETTER_FROM ?? "");
    return { mode: raw, ready: Boolean(key && from) };
  }
  if (raw === "smtp") {
    const host = (process.env.NEWSLETTER_SMTP_HOST ?? "").trim();
    const from = parseFrom(process.env.NEWSLETTER_FROM ?? "");
    return { mode: "smtp", ready: Boolean(host && from) };
  }
  return { mode: "log", ready: false };
}

function redact(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

function logOnly(mail: OutboundMail, mode: ProviderName): DeliveryResult {
  console.info(`[newsletter] nicht gesendet (${mode}) an=${redact(mail.to)} betreff=${mail.subject}`);
  return { delivered: false, mode: mode === "log" ? "log" : mode, failed: false };
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, fetchImpl: typeof fetch): Promise<boolean> {
  const res = await fetchImpl(url, {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.info(`[newsletter] Anbieter antwortete mit HTTP ${res.status}`);
    return false;
  }
  return true;
}

export async function deliverMail(mail: OutboundMail, deps: DeliveryDeps = {}): Promise<DeliveryResult> {
  const resolved = resolveDelivery();
  const underTest = Boolean(process.env.VITEST);
  if (!resolved.ready || (underTest && !deps.fetchImpl && !deps.smtpSend)) {
    return logOnly(mail, resolved.ready ? resolved.mode : "log");
  }
  const from = parseFrom(process.env.NEWSLETTER_FROM ?? "");
  if (!from) return logOnly(mail, "log");
  try {
    if (resolved.mode === "resend") {
      const ok = await postJson(
        "https://api.resend.com/emails",
        { authorization: `Bearer ${process.env.NEWSLETTER_API_KEY}` },
        {
          from: process.env.NEWSLETTER_FROM,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          headers: { "List-Unsubscribe": `<${mail.unsubscribeUrl}>` },
        },
        deps.fetchImpl ?? fetch,
      );
      return { delivered: ok, mode: "resend", failed: !ok };
    }
    if (resolved.mode === "brevo") {
      const ok = await postJson(
        "https://api.brevo.com/v3/smtp/email",
        { "api-key": process.env.NEWSLETTER_API_KEY ?? "" },
        {
          sender: { email: from.email, name: from.name || from.email },
          to: [{ email: mail.to }],
          subject: mail.subject,
          textContent: mail.text,
          htmlContent: mail.html,
          headers: { "List-Unsubscribe": `<${mail.unsubscribeUrl}>` },
        },
        deps.fetchImpl ?? fetch,
      );
      return { delivered: ok, mode: "brevo", failed: !ok };
    }
    const send = deps.smtpSend;
    if (!send) {
      const { smtpSend } = await import("./newsletterSmtp.js");
      await smtpSend(mail, from);
    } else {
      await send(mail);
    }
    return { delivered: true, mode: "smtp", failed: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unbekannt";
    console.info(`[newsletter] Versand fehlgeschlagen (${resolved.mode}): ${message.slice(0, 180)}`);
    return { delivered: false, mode: resolved.mode, failed: true };
  }
}
