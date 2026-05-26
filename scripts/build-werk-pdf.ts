/**
 * build-werk-pdf.ts — Tier-1-3-Roadmap, Feature G (PDF-Export).
 *
 * Generiert client/public/exports/resonanzvernunft.pdf aus
 * ebook_structured.json + (optional) published-Resonanzen aus dem
 * resonanzen-index.json als Anhang.
 *
 * Bewusst pragmatisch: pdf-lib (already installed) mit TimesRoman.
 * Eine Spalte, A4. Kein perfektes Typesetting — aber zitierfähige
 * Offline-Version des Werks + kuratierter Korpus-Anhang.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const EBOOK_PATH = path.join(ROOT, "client/public/ebook_structured.json");
const INDEX_PATH = path.join(ROOT, "client/public/resonanzen-index.json");
const OUT_DIR = path.join(ROOT, "client/public/exports");
const OUT_PATH = path.join(OUT_DIR, "resonanzvernunft.pdf");

const PAGE_W = 595.28;  // A4
const PAGE_H = 841.89;
const MARGIN_X = 60;
const MARGIN_Y = 60;
const LINE_HEIGHT = 14;
const HEADING_SIZE = 16;
const TITLE_SIZE = 24;
const BODY_SIZE = 10;

interface Chapter {
  id: string; title: string; subtitle: string | null;
  chapter: number | null; part: string; partTitle: string;
  content: string;
}

interface Entry {
  id: string; ts: string; endpoint: string; status: string;
  prompt: string; response: string;
}

/** Bricht text in zeilen die in `maxWidth` (font, size) passen. */
function wrapLines(text: string, font: import("pdf-lib").PDFFont, size: number, maxWidth: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const trial = line ? line + " " + w : w;
    const width = font.widthOfTextAtSize(trial, size);
    if (width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Strippt Zeichen die WinAnsi nicht abbilden kann (em-dash etc.) zu ASCII-Ersatz. */
function sanitize(text: string): string {
  return text
    .replace(/[–—]/g, "-")  // en/em dash
    .replace(/[‘’]/g, "'")  // smart quotes
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x00-\xff]/g, "?");   // alles non-WinAnsi → "?"
}

async function main() {
  if (!fs.existsSync(EBOOK_PATH)) {
    console.warn("[build-werk-pdf] ebook_structured.json fehlt — skip");
    return;
  }

  const ebook = JSON.parse(fs.readFileSync(EBOOK_PATH, "utf-8")) as {
    meta: { title: string; subtitle: string; author: string; date: string };
    chapters: Chapter[];
  };

  let publishedEntries: Entry[] = [];
  if (fs.existsSync(INDEX_PATH)) {
    try {
      const idx = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as { entries: Entry[] };
      publishedEntries = idx.entries.filter(e => e.status === "published").sort((a, b) => a.ts.localeCompare(b.ts));
    } catch {}
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle(ebook.meta.title);
  pdf.setAuthor(ebook.meta.author);
  pdf.setCreator("resonanzvernunft.netlify.app · build-werk-pdf.ts");

  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  const contentWidth = PAGE_W - 2 * MARGIN_X;

  // ─── Cover ────────────────────────────────────────────────
  {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const t = sanitize(ebook.meta.title);
    const sub = sanitize(ebook.meta.subtitle ?? "");
    page.drawText(t, {
      x: MARGIN_X, y: PAGE_H - 200,
      size: TITLE_SIZE + 6, font: serifBold, color: rgb(0.1, 0.1, 0.1),
    });
    const subLines = wrapLines(sub, serifItalic, 13, contentWidth);
    let y = PAGE_H - 240;
    for (const l of subLines) {
      page.drawText(l, { x: MARGIN_X, y, size: 13, font: serifItalic, color: rgb(0.3, 0.3, 0.3) });
      y -= 18;
    }
    page.drawText(sanitize(ebook.meta.author), { x: MARGIN_X, y: 120, size: 13, font: serif });
    page.drawText(sanitize(ebook.meta.date ?? ""), { x: MARGIN_X, y: 100, size: 11, font: serif, color: rgb(0.4, 0.4, 0.4) });
  }

  // ─── Kapitel ───────────────────────────────────────────────
  const chaptersWithContent = ebook.chapters.filter(c => c.content && c.content.length >= 200);

  for (const ch of chaptersWithContent) {
    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN_Y;

    // Part-Label
    page.drawText(sanitize(ch.partTitle).toUpperCase(), {
      x: MARGIN_X, y, size: 8, font: serif, color: rgb(0.5, 0.5, 0.5),
    });
    y -= 18;

    // Title
    const titleLines = wrapLines(sanitize(ch.title), serifBold, HEADING_SIZE, contentWidth);
    for (const l of titleLines) {
      page.drawText(l, { x: MARGIN_X, y, size: HEADING_SIZE, font: serifBold });
      y -= HEADING_SIZE + 4;
    }
    if (ch.subtitle) {
      const subLines = wrapLines(sanitize(ch.subtitle), serifItalic, 11, contentWidth);
      for (const l of subLines) {
        page.drawText(l, { x: MARGIN_X, y, size: 11, font: serifItalic, color: rgb(0.4, 0.4, 0.4) });
        y -= 14;
      }
    }
    y -= 12;

    // Body — Absatz für Absatz, mit Page-Break wenn nötig
    const paragraphs = ch.content.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().split(/\n\s*\n/);
    for (const para of paragraphs) {
      const clean = sanitize(para.replace(/\s+/g, " ").trim());
      if (clean.length < 5) continue;
      const lines = wrapLines(clean, serif, BODY_SIZE, contentWidth);
      // Check ob Absatz noch passt
      const needed = lines.length * LINE_HEIGHT;
      if (y - needed < MARGIN_Y) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN_Y;
      }
      for (const l of lines) {
        if (y < MARGIN_Y) {
          page = pdf.addPage([PAGE_W, PAGE_H]);
          y = PAGE_H - MARGIN_Y;
        }
        page.drawText(l, { x: MARGIN_X, y, size: BODY_SIZE, font: serif });
        y -= LINE_HEIGHT;
      }
      y -= 6;  // Absatz-Abstand
    }
  }

  // ─── Anhang: Published-Resonanzen ───────────────────────────
  if (publishedEntries.length > 0) {
    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN_Y;
    page.drawText("ANHANG · KURATIERTE RESONANZEN", {
      x: MARGIN_X, y, size: TITLE_SIZE - 4, font: serifBold,
    });
    y -= TITLE_SIZE + 10;
    page.drawText(`${publishedEntries.length} Einträge, status=published`, {
      x: MARGIN_X, y, size: 10, font: serifItalic, color: rgb(0.4, 0.4, 0.4),
    });
    y -= 20;

    for (const e of publishedEntries) {
      const header = `[${e.id}] ${e.endpoint} · ${e.ts.slice(0, 10)}`;
      const promptLines = wrapLines(sanitize("Frage: " + e.prompt), serifItalic, BODY_SIZE, contentWidth);
      const responseLines = wrapLines(sanitize("Antwort: " + e.response), serif, BODY_SIZE, contentWidth);
      const needed = (3 + promptLines.length + responseLines.length) * LINE_HEIGHT;
      if (y - needed < MARGIN_Y) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN_Y;
      }
      page.drawText(sanitize(header), { x: MARGIN_X, y, size: 8, font: serifBold, color: rgb(0.3, 0.3, 0.3) });
      y -= 12;
      for (const l of promptLines) {
        if (y < MARGIN_Y) { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN_Y; }
        page.drawText(l, { x: MARGIN_X, y, size: BODY_SIZE, font: serifItalic, color: rgb(0.3, 0.3, 0.3) });
        y -= LINE_HEIGHT;
      }
      y -= 4;
      for (const l of responseLines) {
        if (y < MARGIN_Y) { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN_Y; }
        page.drawText(l, { x: MARGIN_X, y, size: BODY_SIZE, font: serif });
        y -= LINE_HEIGHT;
      }
      y -= 12;
    }
  }

  // ─── Footer mit Page-Numbers ────────────────────────────────
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    if (i === 0) return;  // Cover ohne Nummer
    page.drawText(`${i + 1} / ${pages.length}`, {
      x: PAGE_W / 2 - 15, y: 30, size: 8, font: serif, color: rgb(0.5, 0.5, 0.5),
    });
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const bytes = await pdf.save();
  fs.writeFileSync(OUT_PATH, bytes);
  console.log(`[build-werk-pdf] OK — ${pages.length} pages, ${Math.round(bytes.length / 1024)} KB → ${OUT_PATH}`);
}

main().catch(err => {
  console.error(`[build-werk-pdf] FAILED: ${err instanceof Error ? err.stack : err}`);
  process.exit(0);
});
