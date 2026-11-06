/**
 * Ebook-Text und Kapitelindex für /api/enkidu und /api/ask.
 * Dieselbe Kandidatenliste und derselbe Cache wie zuvor in server/index.ts.
 * `serverDir` ist das Verzeichnis von server/index.ts (gebündelt: dist/).
 */
import fs from "fs";
import path from "path";
import { chaptersFromEbook, type AskChapterSource } from "./askChapter.js";

export function createEbookLoader(staticPath: string, serverDir: string): {
  getEbookContent: () => string;
  getAskChapters: () => Map<string, AskChapterSource> | null;
} {
  // Ebook-Inhalt einmalig laden und cachen
  let ebookCache: string | null = null;
  const getEbookContent = (): string => {
    if (ebookCache) return ebookCache;
    try {
      const candidates = [
        path.join(staticPath, "ebook_content.md"),
        path.join(serverDir, "..", "ebook_content.md"),
        path.join(serverDir, "ebook_content.md"),
        path.join(serverDir, "..", "client", "public", "ebook_content.md"),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          ebookCache = fs.readFileSync(p, "utf-8");
          console.log(`Enkidu: Ebook geladen aus ${p} (${ebookCache.length} Zeichen)`);
          return ebookCache;
        }
      }
    } catch (e) {
      console.error("Enkidu: Ebook konnte nicht geladen werden:", e);
    }
    return "";
  };

  // Kapitelindex für /api/ask. null = Datei fehlt (Client-Fallback).
  // Eine gesetzte Map verwirft mitgeschickten Kapiteltext.
  let askChapters: Map<string, AskChapterSource> | null = null;
  const getAskChapters = (): Map<string, AskChapterSource> | null => {
    if (askChapters) return askChapters;
    const raw = getEbookContent();
    if (!raw) return null;
    try {
      askChapters = chaptersFromEbook(raw);
      return askChapters;
    } catch (e) {
      console.error("Ask: Kapitelindex fehlgeschlagen:", e);
      return null;
    }
  };

  return { getEbookContent, getAskChapters };
}
