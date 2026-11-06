/**
 * POST /api/passage-resonanz — Resonanz an einer markierten Werkstelle.
 * Aus server/index.ts unverändert herausgelöst.
 */
import { Router } from "express";
import { getKeys } from "../lib/embeddingClient.js";
import { generateFlashContent } from "../lib/geminiText.js";
import { PASSAGE_PROMPT_MAX, PASSAGE_SELECTION_MAX, selectionInSource } from "../lib/passageGuard.js";
import { flashErrorDetail, FLASH_THINKING_BUDGET } from "../lib/proseAssist.js";
import { UNTRUSTED_RULE, wrapUntrusted } from "../lib/promptSafety.js";
import { logResonanz } from "../lib/resonanzLog.js";
import { rateLimiter, scrub } from "../middleware/rateLimit.js";

export function createPassageRouter(): Router {
  const router = Router();
  // ─── Passage-Resonanz (Tier-1-3-Roadmap, Feature A) ────────────────────
  // Reader markiert eine Stelle im Werktext → erzeugt eine Resonanz die
  // explizit an diesen Chunk verankert ist. Resonanz landet als
  // endpoint="passage", anchor="passage:<chunkId8>" im Korpus.
  //
  // Im Unterschied zu /api/analyse-cluster etc. brauchen wir keinen
  // weiteren RAG-Pass — die Passage IST der Kontext.

  function buildPassagePrompt(passage: string, mode: "frage" | "analyse" | "frei", userPrompt: string | undefined, chapterTitle: string, neighbours: string[]): string {
    const neighbourBlock = neighbours.length > 0
      ? `\n\nKONTEXT-PASSAGEN (umliegender Werktext, zur Orientierung):\n${neighbours.map((t, i) => `(${i + 1}) ${t}`).join("\n")}\n`
      : "";
    const intro = `Du arbeitest als philosophischer Co-Autor am Werk "Die Digitale Transformation" — Resonanzvernunft, Mensch-Maschine, digitale Existenz. Ein Leser hat eine konkrete Stelle markiert. Reagiere im Geist des Werks: dichte philosophische Prosa, keine Listen, präzise ohne Akademismus.\n\n${UNTRUSTED_RULE}\n\nKAPITEL: ${wrapUntrusted(chapterTitle)}\n\nMARKIERTE STELLE:\n${wrapUntrusted(passage)}${neighbourBlock}`;

    if (mode === "frage") {
      return intro + `\n\nFormuliere die fruchtbarste philosophische Frage, die sich an genau dieser Stelle stellt — die Frage, die der Leser sich nach dem Lesen dieser Zeilen stellen müsste, ohne es zu wissen. Eine einzige Frage, gefolgt von 2 Absätzen, die ihre Reichweite ausloten.`;
    }
    if (mode === "analyse") {
      return intro + `\n\nAnalysiere diese Passage in 3 prägnanten Absätzen:\n1. Was tut die Stelle innerhalb des Werks — welcher gedankliche Schritt wird hier vollzogen?\n2. Welche Spannung oder welcher Bruch wird hier hörbar, der in den umliegenden Passagen noch verschwiegen bleibt?\n3. Wohin führt dieser Schritt — was wird durch ihn überhaupt erst denkbar?\n\nSchließe mit einer offenen Frage, die der Lesende weitertragen kann.`;
    }
    // mode === "frei"
    return intro + `\n\nDer Leser hat folgenden Impuls / folgende Frage formuliert:\n\n${wrapUntrusted(userPrompt ?? "")}\n\nBeantworte ihn in 2-4 prosaischen Absätzen, ausgehend von der markierten Passage. Bleibe im Duktus des Werks — kein Schulbuch-Ton, keine Aufzählungen. Schließe mit einer offenen Frage.`;
  }

  router.post("/api/passage-resonanz", rateLimiter('passage', 15, 60 * 60_000), async (req, res) => {
    if (getKeys().length === 0) return res.status(503).json({ error: "GEMINI_API_KEY ist nicht konfiguriert." });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const chunkId = typeof body.chunkId === "string" ? body.chunkId.trim().slice(0, 80) : "";
    const selectedRaw = typeof body.selectedText === "string" ? body.selectedText.trim() : "";
    const mode = body.mode;
    const userPrompt = typeof body.userPrompt === "string" ? body.userPrompt.trim().slice(0, PASSAGE_PROMPT_MAX) : "";

    if (!chunkId) return res.status(400).json({ error: "chunkId fehlt" });
    if (selectedRaw.length < 20) return res.status(400).json({ error: "selectedText zu kurz (mind. 20 Zeichen)" });
    if (mode !== "frage" && mode !== "analyse" && mode !== "frei") return res.status(400).json({ error: "mode muss 'frage', 'analyse' oder 'frei' sein" });
    if (mode === "frei" && userPrompt.length < 5) return res.status(400).json({ error: "userPrompt erforderlich im 'frei'-Modus" });

    // Chunk-Lookup für Kapiteltitel + Nachbar-Chunks. Liegt der Index vor,
    // muss die Markierung im Kapitel dieser Stelle vorkommen.
    const { getChunkLookup } = await import("../lib/werkRetrieval.js");
    const lookup = await getChunkLookup();
    const chunk = lookup.get(chunkId);
    if (lookup.size > 0) {
      if (!chunk) return res.status(400).json({ error: "Unbekannte Stelle." });
      const sources: string[] = [];
      lookup.forEach(c => { if (c.chapter === chunk.chapter) sources.push(c.text); });
      if (!selectionInSource(selectedRaw, sources)) {
        return res.status(400).json({ error: "Die Markierung gehört nicht zu dieser Stelle." });
      }
    }
    const selectedText = selectedRaw.slice(0, PASSAGE_SELECTION_MAX);
    const chapterTitle = chunk?.chapterTitle ?? "(unbekanntes Kapitel)";

    // Nachbar-Chunks: ±1 in derselben Kapitel-Sequenz
    const neighbours: string[] = [];
    if (chunk) {
      lookup.forEach(c => {
        if (c.chapter === chunk.chapter && Math.abs(c.position - chunk.position) === 1) {
          neighbours.push(c.text);
        }
      });
    }

    const prompt = buildPassagePrompt(selectedText, mode, userPrompt, chapterTitle, neighbours.slice(0, 2));

    try {
      const r = await generateFlashContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        temperature: 0.8,
        maxTokens: 2500,
        thinkingBudget: FLASH_THINKING_BUDGET,
      });
      if (!r.ok) return res.status(502).json({ error: scrub(flashErrorDetail(r)) });
      const answer = r.text;

      // resonanzLog akzeptiert "passage" jetzt als endpoint-Typ.
      // entryId müssen wir selber zurückgeben — logResonanz fire-and-forget.
      // Workaround: wir generieren die ID hier nicht, sondern liefern eine
      // synthetische Reference; der echte Eintrag bekommt seine ID intern.
      // Für UX-Zwecke ist das ausreichend ("erscheint nach CI-Build").
      const userDescriptor = mode === "frei" ? (userPrompt ?? "").slice(0, 200) : `${mode}: "${selectedText.slice(0, 100)}…"`;
      const anchorTail = chunkId.slice(0, 8);
      void logResonanz({
        endpoint: "passage",
        anchor: `passage:${anchorTail}`,
        prompt: userDescriptor,
        response: answer,
        model: "gemini-2.5-flash",
        contextMeta: {
          passage_chunk_id: chunkId,
          passage_selection: selectedText.slice(0, 500),
          mode,
          chapter: chunk?.chapter ?? null,
          chapter_title: chapterTitle,
          part_title: chunk?.partTitle ?? null,
        },
      });

      return res.json({
        response: answer,
        entryId: anchorTail,  // Provisorischer Identifier — echte ID kommt im Build
        chunkId,
        chapterTitle,
      });
    } catch (err: unknown) {
      const message = scrub(err instanceof Error ? err.message : String(err));
      return res.status(502).json({ error: `API-Fehler: ${message}` });
    }
  });
  return router;
}
