/**
 * Zitierzeilen und das Teilen-Bild einer Erkenntnis.
 * Der Wortlaut bleibt der deutsche Kernsatz.
 */

export const CITE_AUTHOR_APA = "Oehring, M.";
export const CITE_WORK = "Resonanzvernunft – Digitale Transformation";

export interface CitableErkenntnis {
  id: string;
  text: string;
  createdAt: string;
}

export function citeYear(createdAt: string): string {
  const match = createdAt.match(/^(\d{4})/);
  return match ? match[1] : "o. J.";
}

export function erkenntnisUrl(id: string, siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/erkenntnisse/${encodeURIComponent(id)}`;
}

export function citePlain(item: CitableErkenntnis, siteUrl: string): string {
  return `${CITE_AUTHOR_APA.replace("M.", "Markus")} (${citeYear(item.createdAt)}). ${item.text.trim()} ${CITE_WORK}. ${erkenntnisUrl(item.id, siteUrl)}`;
}

export function citeApa(item: CitableErkenntnis, siteUrl: string): string {
  return `${CITE_AUTHOR_APA} (${citeYear(item.createdAt)}). ${item.text.trim()} ${CITE_WORK}. ${erkenntnisUrl(item.id, siteUrl)}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function wrapCiteLines(text: string, width = 42, maxLines = 7): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/…$/, "")}…`;
  }
  return lines;
}

export function erkenntnisOgSvg(text: string): string {
  const lines = wrapCiteLines(text).map(escapeXml);
  const tspans = lines.map((line, index) => `<tspan x="80" dy="${index === 0 ? 0 : 54}">${line}</tspan>`).join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">`,
    `<rect width="1200" height="630" fill="#1c1917"/>`,
    `<text x="80" y="120" fill="#f59e0b" font-family="Georgia, serif" font-size="28" letter-spacing="4">ERKENNTNIS</text>`,
    `<text x="80" y="210" fill="#fafaf9" font-family="Georgia, serif" font-size="40">${tspans}</text>`,
    `<text x="80" y="560" fill="#a8a29e" font-family="Georgia, serif" font-size="24">Markus Oehring · Resonanzvernunft</text>`,
    `</svg>`,
  ].join("");
}
