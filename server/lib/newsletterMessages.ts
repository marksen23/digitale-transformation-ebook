/**
 * Mailtexte. Der Digest liest dieselben Atom-Einträge wie /feed/erkenntnisse.xml.
 */
import { addUtcDays, utcDateString } from "../../shared/dailyErkenntnis.js";
import type { Cadence, Subscriber } from "./newsletterStore.js";

export interface OutboundMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  unsubscribeUrl: string;
}

export interface FeedSnippet {
  date: string;
  title: string;
  summary: string;
  link: string;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&");
}

function textOf(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : "";
}

export function parseFeedEntries(xml: string): FeedSnippet[] {
  const out: FeedSnippet[] = [];
  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const block = match[1];
    const title = unescapeXml(textOf(block, "title"));
    const summary = unescapeXml(textOf(block, "summary"));
    const updated = textOf(block, "updated");
    const linkMatch = block.match(/<link\s+href="([^"]+)"/);
    const date = (updated || title).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !summary) continue;
    out.push({ date, title, summary, link: linkMatch ? unescapeXml(linkMatch[1]) : "" });
  }
  return out;
}

export function selectDigestSnippets(entries: FeedSnippet[], cadence: Cadence, now: Date): FeedSnippet[] {
  const today = utcDateString(now);
  if (cadence === "daily") return entries.filter(e => e.date === today).slice(0, 1);
  const start = utcDateString(addUtcDays(now, -6));
  return entries.filter(e => e.date <= today && e.date >= start);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cadenceLabel(cadence: Cadence): string {
  return cadence === "daily" ? "täglich" : "einmal die Woche";
}

export function confirmationMail(sub: Subscriber, site: string): OutboundMail {
  const confirm = `${site}/api/newsletter/confirm?token=${sub.confirmToken}`;
  const unsub = `${site}/api/newsletter/unsubscribe?token=${sub.unsubscribeToken}`;
  const subject = "Bitte bestätige deine Anmeldung — Erkenntnis des Tages";
  const text = [
    `Du hast den Newsletter „Erkenntnis des Tages" bestellt (${cadenceLabel(sub.cadence)}).`,
    "",
    "Bitte bestätige die Anmeldung. Ohne diesen Schritt geht nichts hinaus:",
    confirm,
    "",
    "Abmelden — auch schon vor der Bestätigung — geht hier:",
    unsub,
    "",
    `Impressum: ${site}/impressum`,
    `Datenschutz: ${site}/datenschutz`,
  ].join("\n");
  const html = [
    `<p>Du hast den Newsletter „Erkenntnis des Tages" bestellt (${cadenceLabel(sub.cadence)}).</p>`,
    `<p><a href="${escapeHtml(confirm)}">Anmeldung bestätigen</a>. Ohne diesen Schritt geht nichts hinaus.</p>`,
    `<p><a href="${escapeHtml(unsub)}">Abmelden</a></p>`,
    `<p><a href="${escapeHtml(site)}/impressum">Impressum</a> · <a href="${escapeHtml(site)}/datenschutz">Datenschutz</a></p>`,
  ].join("");
  return { to: sub.email, subject, text, html, unsubscribeUrl: unsub };
}

export function digestMail(sub: Subscriber, snippets: FeedSnippet[], cadence: Cadence, site: string): OutboundMail | null {
  if (snippets.length === 0) return null;
  const unsub = `${site}/api/newsletter/unsubscribe?token=${sub.unsubscribeToken}`;
  const subject = cadence === "daily"
    ? snippets[0].title || `Erkenntnis des Tages — ${snippets[0].date}`
    : "Erkenntnisse der Woche";
  const textParts = snippets.map(s => [s.title, "", s.summary, s.link ? `\n${s.link}` : ""].filter(Boolean).join("\n"));
  const text = [
    ...textParts,
    "",
    "Abmelden:",
    unsub,
    "",
    `Impressum: ${site}/impressum`,
    `Datenschutz: ${site}/datenschutz`,
  ].join("\n\n");
  const htmlParts = snippets.map(s => {
    const link = s.link ? ` <a href="${escapeHtml(s.link)}">Zum Begriff</a>` : "";
    return `<h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.summary)}</p><p>${link}</p>`;
  });
  const html = [
    ...htmlParts,
    `<p><a href="${escapeHtml(unsub)}">Abmelden</a></p>`,
    `<p><a href="${escapeHtml(site)}/impressum">Impressum</a> · <a href="${escapeHtml(site)}/datenschutz">Datenschutz</a></p>`,
  ].join("");
  return { to: sub.email, subject, text, html, unsubscribeUrl: unsub };
}
