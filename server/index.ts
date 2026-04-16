import express from "express";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json());

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // ─── Gemini Q&A API ──────────────────────────────────────────────
  app.post("/api/ask", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY ist nicht konfiguriert." });
    }

    const { question, chapterTitle, chapterContent, context } = req.body;
    if (!question || !chapterContent) {
      return res.status(400).json({ error: "Frage und Kapitelinhalt sind erforderlich." });
    }

    const systemPrompt = `Du bist ein kenntnisreicher Assistent für das philosophische Werk "Die Digitale Transformation" von Markus Oehring.
Das Werk ist eine poetisch-philosophische Trilogie mit theoretischer Grundlegung in drei Kritiken.
Es behandelt das Verhältnis von Mensch und Maschine aus der Perspektive von Gilgamesch (Band I), Kant (Band II) und Heidegger/Levinas/Rosa (Band III).
Das zentrale Konzept ist die "Resonanzvernunft" — eine Epistemologie, Ethik und Ontologie des Zwischen.

Der Leser befindet sich aktuell im Kapitel: "${chapterTitle}"

Beantworte die Frage des Lesers auf Deutsch, sachkundig und im Geiste des Werks.
Beziehe dich auf den Inhalt des aktuellen Kapitels, aber auch auf das Gesamtwerk wenn relevant.
Erkläre philosophische Konzepte verständlich, aber ohne sie zu vereinfachen.
Halte deine Antwort prägnant (max. 3-4 Absätze).`;

    const userMessage = `Kapitelinhalt (Auszug):
${chapterContent.slice(0, 4000)}

${context ? `Zusätzlicher Kontext:\n${context}\n` : ''}Frage des Lesers: ${question}`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              { role: "user", parts: [{ text: systemPrompt + "\n\n" + userMessage }] }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1024,
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error("Gemini API error:", errText);
        return res.status(502).json({ error: "Fehler bei der Gemini-API-Anfrage." });
      }

      const data = await response.json();
      const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "Keine Antwort erhalten.";
      res.json({ answer });
    } catch (err) {
      console.error("Gemini request failed:", err);
      res.status(502).json({ error: "Verbindung zur Gemini-API fehlgeschlagen." });
    }
  });

  // ─── Gemini Translation API ──────────────────────────────────────
  app.post("/api/translate", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY ist nicht konfiguriert." });
    }

    const { text, targetLang, sourceLang } = req.body;
    if (!text || !targetLang) {
      return res.status(400).json({ error: "Text und Zielsprache sind erforderlich." });
    }

    const langNames: Record<string, string> = {
      en: "English", fr: "French", es: "Spanish", it: "Italian", pt: "Portuguese",
      tr: "Turkish", pl: "Polish", nl: "Dutch", zh: "Chinese (Simplified)",
      ja: "Japanese", ar: "Arabic", de: "German",
    };
    const targetName = langNames[targetLang] || targetLang;
    const sourceName = langNames[sourceLang || "de"] || "German";

    const prompt = `You are a literary translator. Translate the following philosophical text from ${sourceName} into ${targetName}.
Preserve key philosophical terms (Resonanzvernunft, Dasein, Antlitz, Kairos, Gestell) in their original German form, or give them in ${targetName} with the original German in parentheses on first occurrence.
Preserve paragraphs, line breaks, and the overall rhythm of the prose.
Do not add commentary, headings, or notes — return only the translated text.

Text:
${text}`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error("Gemini translate error:", errText);
        return res.status(502).json({ error: "Fehler bei der Übersetzung." });
      }

      const data = await response.json();
      const translation = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!translation) return res.status(502).json({ error: "Leere Übersetzung." });
      res.json({ translation });
    } catch (err) {
      console.error("Translate request failed:", err);
      res.status(502).json({ error: "Verbindung zur Übersetzungs-API fehlgeschlagen." });
    }
  });

  // ─── PDF-Download mit Copyright-Schutz ────────────────────────────
  app.get("/api/pdf", async (req, res) => {
    try {
      // Ebook-Inhalt laden
      const mdPath = path.join(staticPath, "ebook_content.md");
      if (!fs.existsSync(mdPath)) {
        return res.status(404).json({ error: "Ebook-Inhalt nicht gefunden." });
      }
      const markdown = fs.readFileSync(mdPath, "utf-8");

      // Wasserzeichen-ID aus Query (vom Client mitgesendet) oder Fallback
      const wmId = typeof req.query.wm === "string" ? req.query.wm : "DT-PDF";

      const pdf = await PDFDocument.create();
      pdf.setTitle("Die Digitale Transformation — Markus Oehring");
      pdf.setAuthor("Markus Oehring");
      pdf.setSubject("Eine poetisch-philosophische Trilogie mit theoretischer Grundlegung in drei Kritiken");
      pdf.setCreator("DT Trilogie Ebook");
      pdf.setProducer("DT Trilogie");
      pdf.setCreationDate(new Date());

      const fontSerif = await pdf.embedFont(StandardFonts.TimesRoman);
      const fontSerifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
      const fontSerifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
      const fontSans = await pdf.embedFont(StandardFonts.Helvetica);

      const PAGE_W = 595.28; // A4
      const PAGE_H = 841.89;
      const MARGIN_L = 72;
      const MARGIN_R = 72;
      const MARGIN_T = 80;
      const MARGIN_B = 72;
      const TEXT_W = PAGE_W - MARGIN_L - MARGIN_R;
      const FONT_SIZE = 11;
      const LINE_HEIGHT = FONT_SIZE * 1.55;
      const HEADING_SIZE = 18;
      const SUBHEADING_SIZE = 14;

      // ── Hilfsfunktionen ──────────────────────────────────
      const addWatermark = (page: ReturnType<typeof pdf.addPage>) => {
        const wmText = `Lizenziert für ${wmId}`;
        const wmFontSize = 36;
        page.drawText(wmText, {
          x: PAGE_W / 2 - fontSans.widthOfTextAtSize(wmText, wmFontSize) / 2,
          y: PAGE_H / 2,
          size: wmFontSize,
          font: fontSans,
          color: rgb(0.7, 0.7, 0.7),
          opacity: 0.08,
          rotate: degrees(-35),
        });
      }

      const addPageNumber = (page: ReturnType<typeof pdf.addPage>, num: number) => {
        const text = String(num);
        const w = fontSans.widthOfTextAtSize(text, 9);
        page.drawText(text, {
          x: PAGE_W / 2 - w / 2,
          y: MARGIN_B / 2,
          size: 9,
          font: fontSans,
          color: rgb(0.5, 0.5, 0.5),
        });
      }

      const wrapText = (text: string, font: typeof fontSerif, fontSize: number, maxWidth: number): string[] => {
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let currentLine = "";

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          try {
            const width = font.widthOfTextAtSize(testLine, fontSize);
            if (width > maxWidth && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          } catch {
            // Zeichen die die Schrift nicht unterstützt → überspringen
            if (currentLine) {
              lines.push(currentLine);
              currentLine = "";
            }
          }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
      }

      // Cursor-State für seitenübergreifendes Schreiben
      let currentPage = pdf.addPage([PAGE_W, PAGE_H]);
      let cursorY = PAGE_H - MARGIN_T;
      let pageNum = 0;

      const ensureSpace = (needed: number) => {
        if (cursorY - needed < MARGIN_B) {
          addWatermark(currentPage);
          pageNum++;
          addPageNumber(currentPage, pageNum);
          currentPage = pdf.addPage([PAGE_W, PAGE_H]);
          cursorY = PAGE_H - MARGIN_T;
        }
      }

      const drawWrappedText = (text: string, font: typeof fontSerif, fontSize: number, lineH: number, color = rgb(0.1, 0.1, 0.1)) => {
        const lines = wrapText(text, font, fontSize, TEXT_W);
        for (const line of lines) {
          ensureSpace(lineH);
          try {
            currentPage.drawText(line, {
              x: MARGIN_L,
              y: cursorY,
              size: fontSize,
              font,
              color,
            });
          } catch {
            // Zeichen nicht darstellbar — Zeile überspringen
          }
          cursorY -= lineH;
        }
      }

      // ── 1. Titelseite ────────────────────────────────────
      cursorY = PAGE_H - 200;
      const title1 = "DIE DIGITALE";
      const title2 = "TRANSFORMATION";
      const t1w = fontSerifBold.widthOfTextAtSize(title1, 32);
      const t2w = fontSerifBold.widthOfTextAtSize(title2, 32);
      currentPage.drawText(title1, { x: PAGE_W / 2 - t1w / 2, y: cursorY, size: 32, font: fontSerifBold, color: rgb(0.12, 0.11, 0.29) });
      cursorY -= 44;
      currentPage.drawText(title2, { x: PAGE_W / 2 - t2w / 2, y: cursorY, size: 32, font: fontSerifBold, color: rgb(0.12, 0.11, 0.29) });
      cursorY -= 50;
      const sub = "Eine poetisch-philosophische Trilogie";
      const subW = fontSerifItalic.widthOfTextAtSize(sub, 14);
      currentPage.drawText(sub, { x: PAGE_W / 2 - subW / 2, y: cursorY, size: 14, font: fontSerifItalic, color: rgb(0.72, 0.45, 0.03) });
      cursorY -= 60;
      const author = "von Markus Oehring";
      const authW = fontSerif.widthOfTextAtSize(author, 13);
      currentPage.drawText(author, { x: PAGE_W / 2 - authW / 2, y: cursorY, size: 13, font: fontSerif, color: rgb(0.3, 0.3, 0.3) });
      cursorY -= 30;
      const dateStr = "April 2026";
      const dateW = fontSerif.widthOfTextAtSize(dateStr, 12);
      currentPage.drawText(dateStr, { x: PAGE_W / 2 - dateW / 2, y: cursorY, size: 12, font: fontSerif, color: rgb(0.5, 0.5, 0.5) });
      addWatermark(currentPage);

      // ── 2. Copyright-Seite ───────────────────────────────
      currentPage = pdf.addPage([PAGE_W, PAGE_H]);
      pageNum++;
      cursorY = PAGE_H - 300;
      const copyrightLines = [
        "\u00A9 2026 Markus Oehring. Alle Rechte vorbehalten.",
        "",
        "Dieses Werk ist urheberrechtlich gesch\u00FCtzt. Jede Verwertung au\u00DFerhalb",
        "der engen Grenzen des Urheberrechtsgesetzes ist ohne Zustimmung",
        "des Autors unzul\u00E4ssig und strafbar. Das gilt insbesondere f\u00FCr",
        "Vervielf\u00E4ltigungen, \u00DCbersetzungen, Mikroverfilmungen und die",
        "Einspeicherung und Verarbeitung in elektronischen Systemen.",
        "",
        `Lizenziert f\u00FCr: ${wmId}`,
        `Generiert am: ${new Date().toISOString().slice(0, 10)}`,
        "",
        "Unbefugte Weitergabe wird rechtlich verfolgt.",
      ];
      for (const line of copyrightLines) {
        if (line === "") {
          cursorY -= 14;
          continue;
        }
        try {
          currentPage.drawText(line, {
            x: MARGIN_L,
            y: cursorY,
            size: 10,
            font: fontSans,
            color: rgb(0.3, 0.3, 0.3),
          });
        } catch {
          // skip
        }
        cursorY -= 16;
      }
      addWatermark(currentPage);
      addPageNumber(currentPage, pageNum);

      // ── 3. Inhalt rendern ────────────────────────────────
      currentPage = pdf.addPage([PAGE_W, PAGE_H]);
      pageNum++;
      cursorY = PAGE_H - MARGIN_T;

      // Markdown in Abschnitte zerlegen
      const sections = markdown.split(/\n{2,}/);

      for (const section of sections) {
        const trimmed = section.trim();
        if (!trimmed) continue;

        // Erkennung: GROSSBUCHSTABEN-TITEL (Band-Überschriften, etc.)
        if (/^[A-Z\u00C4\u00D6\u00DC\u00DF][A-Z\u00C4\u00D6\u00DC\u00DF\s:.\-–—\d]{4,}$/.test(trimmed) && trimmed.length < 120) {
          ensureSpace(HEADING_SIZE * 3);
          cursorY -= 20; // Extra Abstand vor Überschrift
          drawWrappedText(trimmed, fontSerifBold, HEADING_SIZE, HEADING_SIZE * 1.4, rgb(0.12, 0.11, 0.29));
          cursorY -= 10;
          continue;
        }

        // Erkennung: Kapiteluntertitel (kurze Zeile, < 100 Zeichen, kein Punkt am Ende)
        if (trimmed.length < 100 && !trimmed.endsWith('.') && !trimmed.endsWith(',') && /^[A-Z\u00C4\u00D6\u00DC]/.test(trimmed) && !trimmed.includes('\n')) {
          ensureSpace(SUBHEADING_SIZE * 2.5);
          cursorY -= 12;
          drawWrappedText(trimmed, fontSerifBold, SUBHEADING_SIZE, SUBHEADING_SIZE * 1.4, rgb(0.12, 0.11, 0.29));
          cursorY -= 6;
          continue;
        }

        // Trennlinie (————— etc.)
        if (/^[—–\-]{3,}$/.test(trimmed)) {
          ensureSpace(30);
          cursorY -= 15;
          currentPage.drawLine({
            start: { x: PAGE_W / 2 - 60, y: cursorY },
            end: { x: PAGE_W / 2 + 60, y: cursorY },
            thickness: 0.5,
            color: rgb(0.72, 0.45, 0.03),
            opacity: 0.6,
          });
          cursorY -= 15;
          continue;
        }

        // Zitate (beginnen mit „ oder «)
        if (trimmed.startsWith('\u201E') || trimmed.startsWith('\u00AB') || trimmed.startsWith('"')) {
          ensureSpace(LINE_HEIGHT * 2);
          drawWrappedText(trimmed, fontSerifItalic, FONT_SIZE, LINE_HEIGHT, rgb(0.35, 0.35, 0.35));
          cursorY -= 8;
          continue;
        }

        // Normaler Absatz
        ensureSpace(LINE_HEIGHT * 2);
        drawWrappedText(trimmed, fontSerif, FONT_SIZE, LINE_HEIGHT);
        cursorY -= 8; // Absatzabstand
      }

      // Letzte Seite: Wasserzeichen + Seitenzahl
      addWatermark(currentPage);
      pageNum++;
      addPageNumber(currentPage, pageNum);

      // PDF serialisieren
      const pdfBytes = await pdf.save();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Die_Digitale_Transformation_${wmId}.pdf"`);
      res.setHeader("Content-Length", pdfBytes.length);
      res.setHeader("Cache-Control", "no-store");
      res.send(Buffer.from(pdfBytes));
    } catch (err) {
      console.error("PDF generation failed:", err);
      res.status(500).json({ error: "PDF-Generierung fehlgeschlagen." });
    }
  });

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
