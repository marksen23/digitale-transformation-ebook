import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

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
