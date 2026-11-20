/**
 * Atom-Feed der Erkenntnis des Tages. Kein Versand — nur eine abrufbare
 * Liste der letzten Tage, deterministisch aus den veröffentlichten Sätzen.
 */
import fs from "node:fs";
import path from "node:path";
import { recentDailyErkenntnisse, type DailyErkenntnis } from "../../shared/dailyErkenntnis.js";

function defaultSiteUrl(): string {
  return (process.env.SITE_URL ?? "https://digitale-transformation-ebook.de").replace(/\/+$/, "");
}

const FEED_DAYS = 14;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildErkenntnisFeedXml(
  items: DailyErkenntnis[],
  withdrawnAnswerIds: string[],
  now = new Date(),
  siteUrl = defaultSiteUrl(),
): string {
  const days = recentDailyErkenntnisse(items, now, FEED_DAYS, withdrawnAnswerIds);
  const self = `${siteUrl}/feed/erkenntnisse.xml`;
  const updated = days[0] ? `${days[0].date}T00:00:00Z` : now.toISOString();
  const entries = days.map(({ date, item }) => {
    const landkarte = item.conceptAnchor
      ? `${siteUrl}/landkarte?begriff=${encodeURIComponent(item.conceptAnchor)}`
      : `${siteUrl}/erkenntnisse`;
    return [
      "  <entry>",
      `    <title>Erkenntnis des Tages — ${date}</title>`,
      `    <id>${escapeXml(self)}#${date}</id>`,
      `    <updated>${date}T00:00:00Z</updated>`,
      `    <link href="${escapeXml(landkarte)}"/>`,
      `    <summary>${escapeXml(item.kernsatz)}</summary>`,
      "  </entry>",
    ].join("\n");
  }).join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom">`,
    `  <title>Erkenntnis des Tages — Resonanzvernunft</title>`,
    `  <subtitle>Ein veröffentlichter Kernsatz pro Tag.</subtitle>`,
    `  <id>${escapeXml(self)}</id>`,
    `  <link href="${escapeXml(self)}" rel="self"/>`,
    `  <link href="${escapeXml(siteUrl)}/"/>`,
    `  <updated>${updated}</updated>`,
    entries,
    `</feed>`,
    "",
  ].filter(line => line !== undefined).join("\n");
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

/** Liest die committeten JSONs. Fehlen sie (Test-Static), bleibt der Feed leer. */
export function loadDailyFeedSources(root = process.cwd()): { items: DailyErkenntnis[]; withdrawn: string[] } {
  const dir = path.join(root, "client/public");
  const erk = readJson(path.join(dir, "resonanzen-erkenntnisse.json")) as { erkenntnisse?: DailyErkenntnis[] } | null;
  const held = readJson(path.join(dir, "resonanzen-erkenntnis-withdrawn.json")) as { answerIds?: string[] } | null;
  return {
    items: Array.isArray(erk?.erkenntnisse) ? erk.erkenntnisse : [],
    withdrawn: Array.isArray(held?.answerIds) ? held.answerIds : [],
  };
}

export function renderDailyFeedXml(now = new Date()): string {
  const { items, withdrawn } = loadDailyFeedSources();
  return buildErkenntnisFeedXml(items, withdrawn, now);
}
