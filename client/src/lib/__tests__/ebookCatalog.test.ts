import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coverEbook, parseEbookMarkdown } from "@/lib/parseEbook";

describe("Cover ohne Volltext", () => {
  it("nennt dieselben Kapitel wie der Buchtext und lässt den Inhalt leer", () => {
    const raw = fs.readFileSync(path.resolve(import.meta.dirname, "../../../public/ebook_content.md"), "utf8");
    const full = parseEbookMarkdown(raw);
    const cover = coverEbook();
    expect(cover.chapters.map(chapter => chapter.id)).toEqual(full.chapters.map(chapter => chapter.id));
    expect(cover.chapters.every(chapter => chapter.content === "")).toBe(true);
    expect(cover.meta.title).toBe(full.meta.title);
  });
});
