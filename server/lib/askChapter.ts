/**
 * Kapitelquelle für /api/ask.
 *
 * Der Leser schickt bisher Kapiteltext mit. Damit war der Endpoint innerhalb
 * des Rate-Limits ein allgemeiner Gemini-Proxy: beliebiger Text landete als
 * „Kapitel“ im Prompt. Liegt das Werk vor, gilt nur der Server-Text zum
 * chapterId. Der Client-Text ist der Notnagel, wenn die Datei fehlt.
 */

import { parseEbookMarkdown } from "../../client/src/lib/parseEbook.js";

export const ASK_CHAPTER_CONTENT_MAX = 4000;
export const ASK_CHAPTER_TITLE_MAX = 300;

export interface AskChapterSource {
  id: string;
  title: string;
  content: string;
}

export type AskChapterResolution =
  | { ok: true; title: string; content: string; source: "server" | "client" }
  | { ok: false; status: 400; error: string };

/** Baut die Kapitel-Tabelle aus ebook_content.md. Leere Map = Datei ohne Kapitel. */
export function chaptersFromEbook(raw: string): Map<string, AskChapterSource> {
  const data = parseEbookMarkdown(raw);
  const map = new Map<string, AskChapterSource>();
  for (const ch of data.chapters) {
    map.set(ch.id, { id: ch.id, title: ch.title, content: ch.content });
  }
  return map;
}

/**
 * `chapters === null`: Werkdatei nicht ladbar, begrenzter Client-Fallback.
 * Gesetzte Map (auch leer): nur bekannte Kapitel, Client-Text wird verworfen.
 */
export function resolveAskChapter(input: {
  chapterId: string;
  clientTitle: string;
  clientContent: string;
  chapters: Map<string, AskChapterSource> | null;
}): AskChapterResolution {
  if (input.chapters) {
    const ch = input.chapterId ? input.chapters.get(input.chapterId) : undefined;
    if (!ch) return { ok: false, status: 400, error: "Unbekanntes Kapitel." };
    const title = ch.title.trim().slice(0, ASK_CHAPTER_TITLE_MAX) || "unbekannt";
    const content = ch.content.trim().slice(0, ASK_CHAPTER_CONTENT_MAX) || title;
    return { ok: true, title, content, source: "server" };
  }

  const content = input.clientContent.trim().slice(0, ASK_CHAPTER_CONTENT_MAX);
  if (!content) {
    return { ok: false, status: 400, error: "Frage und Kapitelinhalt sind erforderlich." };
  }
  const title = input.clientTitle.trim().slice(0, ASK_CHAPTER_TITLE_MAX);
  return { ok: true, title, content, source: "client" };
}
