/**
 * bibtex.ts — Tier-1-3-Roadmap, Feature H (Zitierfähigkeit).
 *
 * Generiert BibTeX-Einträge für Resonanzen, Master-Syntheses und
 * Werk-Chunks. Verwendet die stabile Eintrag-ID (z.B. MPF4WM18) als
 * Cite-Key — bleibt konsistent über CI-Builds.
 */
import type { ResonanzEntry } from "./resonanzenIndex";
import { SITE_URL } from "./siteUrl";

const AUTHOR = "Oehring, Markus";
const WORK_TITLE = "Resonanzvernunft – Digitale Transformation";
const SITE_BASE = SITE_URL;

function escapeBibtex(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/[{}]/g, "")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/\^/g, "\\^{}")
    .replace(/~/g, "\\~{}");
}

/** Kürzt einen Text auf max. N Wörter (für Title/Abstract). */
function abbreviate(text: string, words = 12): string {
  const ws = text.split(/\s+/).slice(0, words);
  const out = ws.join(" ");
  return text.split(/\s+/).length > words ? out + " …" : out;
}

export function toBibtex(entry: ResonanzEntry): string {
  const year = new Date(entry.ts).getFullYear();
  const titleSource = entry.is_master
    ? `Synthese: ${entry.anchor}`
    : (entry.prompt || entry.anchor || entry.id);
  const title = abbreviate(titleSource, 14);
  const url = `${SITE_BASE}/resonanz/${entry.id}`;
  const type = entry.is_master ? "@incollection" : "@misc";
  const noteType = entry.is_master
    ? "Master-Synthese im Werk"
    : entry.endpoint === "passage"
      ? "Passagen-Resonanz im Werk"
      : `${entry.endpoint}-Resonanz im Werk`;

  return [
    `${type}{${entry.id},`,
    `  author = {${escapeBibtex(AUTHOR)}},`,
    `  title = {${escapeBibtex(title)}},`,
    `  year = {${year}},`,
    `  date = {${entry.ts.slice(0, 10)}},`,
    `  url = {${url}},`,
    `  booktitle = {${escapeBibtex(WORK_TITLE)}},`,
    `  note = {${escapeBibtex(noteType)} (ID ${entry.id})}`,
    `}`,
  ].join("\n");
}

/** JSON-LD Schema.org-Markup für SEO + akademische Aggregatoren (Google Scholar). */
export function toJsonLd(entry: ResonanzEntry): object {
  return {
    "@context": "https://schema.org",
    "@type": "ScholarlyArticle",
    "headline": abbreviate(entry.prompt || entry.anchor || entry.id, 20),
    "author": { "@type": "Person", "name": AUTHOR },
    "datePublished": entry.ts.slice(0, 10),
    "identifier": entry.id,
    "url": `${SITE_BASE}/resonanz/${entry.id}`,
    "isPartOf": {
      "@type": "Book",
      "name": WORK_TITLE,
      "url": SITE_BASE,
    },
    "abstract": abbreviate(entry.response, 50),
    "inLanguage": "de",
    "keywords": entry.nodeIds.join(", "),
  };
}
