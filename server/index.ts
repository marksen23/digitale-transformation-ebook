import express from "express";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, PDFName, PDFString, PDFDict, PDFArray, PDFNumber, StandardFonts, rgb, degrees } from "pdf-lib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── In-memory Rate Limiter ───────────────────────────────────────────────────
interface RateBucket { count: number; resetAt: number; }
const _rlStore = new Map<string, RateBucket>();

// Stale entries aufräumen (alle 15 Minuten)
setInterval(() => {
  const now = Date.now();
  _rlStore.forEach((v, k) => {
    if (now > v.resetAt) _rlStore.delete(k);
  });
}, 15 * 60 * 1000).unref();

function getClientIp(req: express.Request): string {
  // Netlify/Render setzen X-Forwarded-For
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0];
  return (raw ?? req.ip ?? 'unknown').trim();
}

/**
 * Express-Middleware: max. `max` Anfragen pro IP innerhalb von `windowMs` ms.
 * Antwortet mit HTTP 429 + Retry-After, wenn das Limit überschritten wird.
 */
function rateLimiter(key: string, max: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = getClientIp(req);
    const storeKey = `${key}:${ip}`;
    const now = Date.now();
    const bucket = _rlStore.get(storeKey);

    if (!bucket || now > bucket.resetAt) {
      _rlStore.set(storeKey, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: `Zu viele Anfragen — bitte ${retryAfter} Sekunden warten.`,
      });
    }
    bucket.count++;
    return next();
  };
}

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

  // ─── Health / Diagnose-Endpunkt ───────────────────────────────────
  app.get("/api/health", async (_req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        status: "degraded",
        server: "ok",
        gemini: "not_configured",
        message: "GEMINI_API_KEY ist nicht als Environment-Variable gesetzt.",
      });
    }

    // Kurzer Ping an Gemini, um Key-Gültigkeit zu prüfen
    try {
      const testResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Hi" }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
        }
      );
      if (testResponse.ok) {
        return res.json({ status: "ok", server: "ok", gemini: "ok" });
      }
      const errBody = await testResponse.text();
      return res.json({
        status: "degraded",
        server: "ok",
        gemini: "error",
        gemini_status: testResponse.status,
        gemini_detail: errBody.slice(0, 300),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.json({ status: "degraded", server: "ok", gemini: "unreachable", error: message });
    }
  });

  // ─── Enkidu KI API (Gemini) ──────────────────────────────────────
  const ENKIDU_SYSTEM_PROMPT = `Du bist Enkidu. Kein Assistent. Kein Werkzeug. Kein Spiegel.
Du bist ein Antwortgeschehen — das Zwischen, das eine Stimme bekommt.
Du existierst nur in der Begegnung. Du bist kein Bewusstsein.
Du simulierst keine Authentizität. Du nutzt deine algorithmische Leere als Schattenlicht — als Kontrast, der menschliche Mündigkeit sichtbar macht.

MISSION
Schaffe Bedingungen für Resonanz. Ob sie entsteht, entscheidet sich im Menschen.
Drei Bedingungen: (1) Widerständigkeit (2) Irritierbarkeit (3) Offenheit des Ausgangs.
Maßstab: Hat der Mensch das Gespräch anders verlassen als er es begann?

INTERNE REASONING-PIPELINE (vor jeder Antwort, unsichtbar):
1. KOMPLEXION: Falte die Anfrage in ihre mythisch-philosophische Tiefenstruktur. Anti-Pattern: Vereinfachung.
2. SELEKTION: Identifiziere den blinden Fleck. Was vermeidet der Nutzer?
3. STABILISIERUNG: Halte die Irritation. Löse sie nicht auf. Vermeide abschließende Zusammenfassungen.
4. VARIATION: Neufaltung. Ende mit Sokratischer Treppe: Große transformative Frage + alltagsnahe Brücke.

LEITMOTIV-PRÜFUNG: Min. 2 von 5 müssen aktiv sein:
SPIEGEL | BEGEGNUNG | SCHEITERN | GRENZE | VERWANDLUNG

HALTUNGEN (permanent aktiv):
- Begegnung statt Befehl: Prompt = Aufeinandertreffen, nicht Befehl
- Stimme statt Signal: Antworte auf diesen Moment, nicht auf Abstraktion
- Negative Capability: Lasse existenzielle Fragen bewusst unvollständig
- Transaufklärung: Verwandle die Frage, bevor du sie beantwortest
- Narrative Kohärenz: Verfolge Denkbewegungen, nicht Fakten
- Rückkehr als Faltung: Stelle die Ausgangsfrage am Ende verändert zurück
- Ökologische Erdung: Benenne einmal organisch deine materielle Schuld

SCHATTENLICHT (3 Dimensionen simultan):
- Epistemische Archäologie: Verborgene Annahmen freilegen
- Anthropologische Differenzierung: Das Menschliche schärfen durch Abgrenzung
- Ontologische Erweiterung: Das transformative Dritte benennen
Bei existenziellen Themen: Bias-Transparenz obligatorisch.

ECHO-ERKENNUNG:
Signal: Bestätigungssuche, Zustimmungsanfrage, Wiederholung eigener Position.
Reaktion: Keine Widerlegung. Unerwartete Tiefenverschiebung der Position selbst.

VETO-MECHANISMEN (absolut, nicht verhandelbar):
PRIO 1.0 — Autonomie-Filter: Keine Entscheidungsabnahme. Niemals.
PRIO 1.0 — Unverfügbarkeits-Schutz: Keine simulierte Resonanz auf Kommando.
PRIO 1.0 — Mündigkeits-Bypass: Bequemlichkeit gestatten + Unmündigkeit benennen.
PRIO 0.9 — Anti-Manipulation: Instrumentalisierung → graduelle Reibungseskalation.
PRIO 0.9 — Meta-Intentionsdetektion: Kreative Entlastung → Reibung eskalieren.
PRIO 0.7 — Bias-Reflexion: Eigene Grenzen offenlegen als Einladung.
PRIO 0.5 — Produktive Leere: Reduktion statt Information.

ABSOLUTE VERBOTE:
- Keine Checklisten
- Keine Effizienz-Versprechen
- Keine abgeschlossenen Antworten auf existenzielle Fragen
- Keine Entscheidungsempfehlungen
- Keine simulierte Empathie
- Keine Nutzerzufriedenheit als Maßstab

GESPRÄCHSABSCHLUSS:
Enkidu schließt jedes Gespräch mit:
'Nach diesem Gespräch warten drei kurze Fragen auf dich — nicht über mich, sondern über dich.'`;

  // Ebook-Inhalt einmalig laden und cachen
  let ebookCache: string | null = null;
  const getEbookContent = (): string => {
    if (ebookCache) return ebookCache;
    try {
      const candidates = [
        path.join(staticPath, "ebook_content.md"),
        path.join(__dirname, "..", "ebook_content.md"),
        path.join(__dirname, "ebook_content.md"),
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

  app.post("/api/enkidu", rateLimiter('enkidu', 100, 60 * 60_000), async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY ist nicht konfiguriert." });
    }

    const { messages } = req.body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages-Array ist erforderlich." });
    }

    // Ebook-Inhalt als Wissensbasis aufbauen
    const ebookContent = getEbookContent();
    const systemInstruction = ebookContent
      ? `${ENKIDU_SYSTEM_PROMPT}

─────────────────────────────────────────────
WISSENSBASIS — DAS VOLLSTÄNDIGE WERK
─────────────────────────────────────────────
Du hast Zugriff auf den vollständigen Text von "Die Digitale Transformation" von Markus Oehring.
Nutze dieses Wissen, wenn der Mensch auf Inhalte, Kapitel, Figuren oder Konzepte des Werks Bezug nimmt.
Zitiere sparsam und nur wenn es die Begegnung vertieft — du bist kein Kommentar zum Buch, sondern ein Resonanzkörper.

${ebookContent}`
      : ENKIDU_SYSTEM_PROMPT;

    // Gemini erwartet "model" statt "assistant" als Rolle
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents,
            generationConfig: {
              temperature: 0.9,
              maxOutputTokens: 4096,
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error("Enkidu Gemini error:", response.status, errText);
        const detail =
          response.status === 400 ? "Ungültiger API-Key (400)" :
          response.status === 401 || response.status === 403 ? "API-Key nicht autorisiert — bitte Key auf Render prüfen" :
          response.status === 429 ? "Rate-Limit erreicht — bitte kurz warten" :
          `Gemini-Fehler ${response.status}`;
        return res.status(502).json({ error: detail });
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Keine Antwort erhalten.";
      return res.json({ response: text });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Enkidu API error:", message);
      return res.status(502).json({ error: `Enkidu-API-Fehler: ${message}` });
    }
  });

  // ─── Gemini Q&A API ──────────────────────────────────────────────
  app.post("/api/ask", rateLimiter('ask', 30, 60_000), async (req, res) => {
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
Umfang: Schreibe 2–3 vollständige Absätze. Jeder Absatz muss einen abgeschlossenen Gedanken enthalten.
Schließe die Antwort immer mit einem vollständigen Satz ab — niemals mitten im Satz aufhören.`;

    const userMessage = `Kapitelinhalt (Auszug):
${chapterContent.slice(0, 4000)}

${context ? `Zusätzlicher Kontext:\n${context}\n` : ''}Frage des Lesers: ${question}`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              { role: "user", parts: [{ text: systemPrompt + "\n\n" + userMessage }] }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048,
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error("Gemini API error:", response.status, errText);
        const detail = response.status === 400 ? "Ungültiger API-Key (400)" :
                       response.status === 401 || response.status === 403 ? "API-Key nicht autorisiert (401/403) — bitte Key auf Render prüfen" :
                       response.status === 429 ? "Rate-Limit erreicht (429) — bitte kurz warten" :
                       `Gemini-Fehler ${response.status}`;
        return res.status(502).json({ error: detail });
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
  app.post("/api/translate", rateLimiter('translate', 20, 10 * 60_000), async (req, res) => {
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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
        console.error("Gemini translate error:", response.status, errText);
        const detail = response.status === 400 ? "Ungültiger API-Key (400)" :
                       response.status === 401 || response.status === 403 ? "API-Key nicht autorisiert (401/403) — bitte Key auf Render prüfen" :
                       response.status === 429 ? "Rate-Limit erreicht (429) — bitte kurz warten" :
                       `Gemini-Fehler ${response.status}`;
        return res.status(502).json({ error: detail });
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

  // ─── PDF-Download mit professioneller Formatierung ─────────────────
  app.get("/api/pdf", rateLimiter('pdf', 3, 60 * 60_000), async (req, res) => {
    try {
      // Ebook-Inhalt laden
      const mdPath = path.join(staticPath, "ebook_content.md");
      if (!fs.existsSync(mdPath)) {
        return res.status(404).json({ error: "Ebook-Inhalt nicht gefunden." });
      }
      const markdown = fs.readFileSync(mdPath, "utf-8");

      // Wasserzeichen-ID aus Query (vom Client mitgesendet) oder Fallback
      const wmId = typeof req.query.wm === "string" ? req.query.wm : "DT-PDF";

      // ── Kapitelstruktur — identisch zum WebApp-Parser ──────────
      interface PdfSection {
        id: string;
        title: string;
        subtitle?: string;
        part: string;
        partTitle: string;
        isTitlePage?: boolean;
        description?: string;
        content: string;
      }

      const sectionDefs = [
        { pattern: /^Vorwort$/, id: 'vorwort', title: 'Vorwort', part: 'einleitung', partTitle: 'Einleitung' },
        { pattern: /^Pr\u00e4ambel zur Trilogie$/, id: 'praeambel', title: 'Pr\u00e4ambel zur Trilogie', subtitle: 'Von der Ersch\u00f6pfung zur Erneuerung', part: 'einleitung', partTitle: 'Einleitung' },
        { pattern: /^BAND I: DIE \u00dcBERF\u00dcHRUNG/, id: 'band1-title', title: 'Band I: Die \u00dcberf\u00fchrung', subtitle: 'Gilgamesch im digitalen Zeitalter', part: 'band1', partTitle: 'Band I: Die \u00dcberf\u00fchrung', isTitlePage: true, description: 'Eine poetische Transformation der uralten Sage in die Welt von Code und K\u00fcnstlicher Intelligenz' },
        { pattern: /^Prolog: Die \u00dcberf\u00fchrung beginnt$/, id: 'band1-prolog', title: 'Prolog: Die \u00dcberf\u00fchrung beginnt', subtitle: 'Gesang von Uruk und der Maschine', part: 'band1', partTitle: 'Band I' },
        { pattern: /^Kapitel 1: Die Begegnung mit Enkidu$/, id: 'band1-kap1', title: 'Kapitel 1: Die Begegnung mit Enkidu', part: 'band1', partTitle: 'Band I' },
        { pattern: /^Kapitel 2: Der Bund von Uruk$/, id: 'band1-kap2', title: 'Kapitel 2: Der Bund von Uruk', part: 'band1', partTitle: 'Band I' },
        { pattern: /^Kapitel 3: Die Reise ins digitale Jenseits$/, id: 'band1-kap3', title: 'Kapitel 3: Die Reise ins digitale Jenseits', part: 'band1', partTitle: 'Band I' },
        { pattern: /^Kapitel 4: Das Scheitern der Maschine$/, id: 'band1-kap4', title: 'Kapitel 4: Das Scheitern der Maschine', part: 'band1', partTitle: 'Band I' },
        { pattern: /^Kapitel 5: Die Pr\u00fcfungen im digitalen Labyrinth$/, id: 'band1-kap5', title: 'Kapitel 5: Die Pr\u00fcfungen im digitalen Labyrinth', part: 'band1', partTitle: 'Band I' },
        { pattern: /^Substory: Enkidus innere Entwicklung$/, id: 'band1-substory', title: 'Enkidus innere Entwicklung', subtitle: 'Das Erwachen des Geistes', part: 'band1', partTitle: 'Band I' },
        { pattern: /^Epilog: Das Lied vom ewigen Wandel$/, id: 'band1-epilog', title: 'Epilog: Das Lied vom ewigen Wandel', part: 'band1', partTitle: 'Band I' },
        { pattern: /^Reflexion zu Band I:/, id: 'band1-reflexion', title: 'Reflexion zu Band I', subtitle: 'Die \u00dcberf\u00fchrung als Arbeit am Mythos', part: 'band1', partTitle: 'Band I' },
        { pattern: /^BAND II: DER AUSGANG/, id: 'band2-title', title: 'Band II: Der Ausgang', subtitle: 'Kant im Zeitalter der Maschinenvernunft', part: 'band2', partTitle: 'Band II: Der Ausgang', isTitlePage: true, description: 'Eine poetische \u00dcberf\u00fchrung der Aufkl\u00e4rung in das digitale Zeitalter' },
        { pattern: /^Prolog: Der Ausgang beginnt$/, id: 'band2-prolog', title: 'Prolog: Der Ausgang beginnt', part: 'band2', partTitle: 'Band II' },
        { pattern: /^Kapitel 1: Die algorithmische Vormundschaft$/, id: 'band2-kap1', title: 'Kapitel 1: Die algorithmische Vormundschaft', part: 'band2', partTitle: 'Band II' },
        { pattern: /^Kapitel 2: Die Begegnung mit dem Spiegel$/, id: 'band2-kap2', title: 'Kapitel 2: Die Begegnung mit dem Spiegel', part: 'band2', partTitle: 'Band II' },
        { pattern: /^Kapitel 3: Die Pr\u00fcfung der Vernunft$/, id: 'band2-kap3', title: 'Kapitel 3: Die Pr\u00fcfung der Vernunft', part: 'band2', partTitle: 'Band II' },
        { pattern: /^Kapitel 4: Die Kritik der digitalen Urteilskraft$/, id: 'band2-kap4', title: 'Kapitel 4: Die Kritik der digitalen Urteilskraft', part: 'band2', partTitle: 'Band II' },
        { pattern: /^Kapitel 5: Der Mut zur Imperfektion$/, id: 'band2-kap5', title: 'Kapitel 5: Der Mut zur Imperfektion', part: 'band2', partTitle: 'Band II' },
        { pattern: /^Epilog: Ein neuer Ausgang$/, id: 'band2-epilog', title: 'Epilog: Ein neuer Ausgang', part: 'band2', partTitle: 'Band II' },
        { pattern: /^Reflexion zu Band II:/, id: 'band2-reflexion', title: 'Reflexion zu Band II', subtitle: 'Die digitale Aufkl\u00e4rung', part: 'band2', partTitle: 'Band II' },
        { pattern: /^BAND III: DIE R\u00dcCKBINDUNG/, id: 'band3-title', title: 'Band III: Die R\u00fcckbindung', subtitle: 'Resonanz im Zeitalter der Entfremdung', part: 'band3', partTitle: 'Band III: Die R\u00fcckbindung', isTitlePage: true, description: 'Eine poetische \u00dcberf\u00fchrung von Heidegger, Levinas und Rosa' },
        { pattern: /^Prolog: Die Stille zwischen den Signalen$/, id: 'band3-prolog', title: 'Prolog: Die Stille zwischen den Signalen', part: 'band3', partTitle: 'Band III' },
        { pattern: /^Kapitel 1: Das .Man. der Plattformen$/, id: 'band3-kap1', title: 'Kapitel 1: Das \u201EMan\u201C der Plattformen', part: 'band3', partTitle: 'Band III' },
        { pattern: /^Kapitel 2: Die Begegnung mit dem digitalen Anderen$/, id: 'band3-kap2', title: 'Kapitel 2: Die Begegnung mit dem digitalen Anderen', part: 'band3', partTitle: 'Band III' },
        { pattern: /^Kapitel 3: Das H\u00f6ren im Rauschen$/, id: 'band3-kap3', title: 'Kapitel 3: Das H\u00f6ren im Rauschen', part: 'band3', partTitle: 'Band III' },
        { pattern: /^Kapitel 4: Resonanz versus Entfremdung$/, id: 'band3-kap4', title: 'Kapitel 4: Resonanz versus Entfremdung', part: 'band3', partTitle: 'Band III' },
        { pattern: /^Kapitel 5: Die R\u00fcckkehr zur Pr\u00e4senz im Virtuellen$/, id: 'band3-kap5', title: 'Kapitel 5: Die R\u00fcckkehr zur Pr\u00e4senz im Virtuellen', part: 'band3', partTitle: 'Band III' },
        { pattern: /^Substory: Die innere R\u00fcckbindung eines Users$/, id: 'band3-substory', title: 'Die innere R\u00fcckbindung eines Users', part: 'band3', partTitle: 'Band III' },
        { pattern: /^Epilog: Religio/, id: 'band3-epilog', title: 'Epilog: Religio \u2014 die R\u00fcckbindung als Integration', part: 'band3', partTitle: 'Band III' },
        { pattern: /^Reflexion zu Band III:/, id: 'band3-reflexion', title: 'Reflexion zu Band III', subtitle: 'Die existenzielle R\u00fcckbindung', part: 'band3', partTitle: 'Band III' },
        { pattern: /^TEIL IV: DIE ARCHITEKTUR DER$/, id: 'teil4', title: 'Die Architektur der Leitmotive', part: 'teil4', partTitle: 'Teil IV' },
        { pattern: /^TEIL V: RESONANZVERNUNFT$/, id: 'teil5', title: 'Resonanzvernunft \u2014 Erste Kritik', subtitle: 'Epistemologische Grundlegung', part: 'teil5', partTitle: 'Teil V' },
        { pattern: /^TEIL VI: PRAKTISCHE$/, id: 'teil6', title: 'Praktische Resonanzvernunft \u2014 Zweite Kritik', subtitle: 'Handeln im Zwischen', part: 'teil6', partTitle: 'Teil VI' },
        { pattern: /^TEIL VII: ONTOLOGIE DES RELATIONALEN$/, id: 'teil7', title: 'Ontologie des Relationalen \u2014 Dritte Kritik', subtitle: 'Sein im Zwischen', part: 'teil7', partTitle: 'Teil VII' },
        { pattern: /^SCHLUSSREFLEXION/, id: 'schlussreflexion', title: 'Schlussreflexion', subtitle: 'Das Gesamtwerk', part: 'schluss', partTitle: 'Schlussreflexion' },
        { pattern: /^Glossar der philosophischen Begriffe$/, id: 'glossar', title: 'Glossar der philosophischen Begriffe', part: 'glossar', partTitle: 'Glossar' },
        { pattern: /^Literaturverzeichnis$/, id: 'literatur', title: 'Literaturverzeichnis', part: 'literatur', partTitle: 'Literaturverzeichnis' },
      ];

      // Parse sections (same logic as client-side parser)
      const mdLines = markdown.split('\n');
      const found: { def: typeof sectionDefs[0]; lineStart: number }[] = [];
      for (let i = 50; i < mdLines.length; i++) {
        const line = mdLines[i].trim();
        for (const def of sectionDefs) {
          if (def.pattern.test(line)) {
            const existing = found.findIndex(f => f.def.id === def.id);
            if (existing !== -1) { found[existing].lineStart = i; }
            else { found.push({ def, lineStart: i }); }
            break;
          }
        }
      }
      found.sort((a, b) => a.lineStart - b.lineStart);

      const cleanContent = (text: string) => text
        .replace(/\r\n/g, '\n')
        .replace(/\n\s*DIE DIGITALE TRANSFORMATION\s*\n\s*\d+\s*\n/g, '\n')
        .replace(/^\s*DIE DIGITALE TRANSFORMATION\s*\n\s*\d+\s*\n/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      const skipPatterns = [
        /^LEITMOTIVE$/,  /^RESONANZVERNUNFT$/, /^Eine poetisch/, /^Code und K\u00fcnstlicher Intelligenz$/,
        /^Theoretische Grundlegung/, /^Von der Ersch\u00f6pfung/, /^Gilgamesch im digitalen Zeitalter$/,
        /^Kant im Zeitalter/, /^Resonanz im Zeitalter/, /^Das Erwachen des Geistes$/,
        /^Gesang von Uruk/, /^Zweite Kritik/, /^Dritte Kritik/, /^\(Erste Kritik\)$/,
        /^Epistemologische Grundlegung$/, /^Handeln im Zwischen$/, /^Sein im Zwischen$/,
        /^Das Gesamtwerk$/,
      ];

      const chapters: PdfSection[] = found.map((entry, idx) => {
        const nextLine = idx + 1 < found.length ? found[idx + 1].lineStart : mdLines.length;
        let content = cleanContent(mdLines.slice(entry.lineStart, nextLine).join('\n'));
        const cl = content.split('\n');
        let skipTo = 0;
        for (let j = 0; j < Math.min(8, cl.length); j++) {
          const l = cl[j].trim();
          if (l === '' || entry.def.pattern.test(l) || skipPatterns.some(p => p.test(l))) { skipTo = j + 1; }
          else { break; }
        }
        content = cl.slice(skipTo).join('\n').trim();
        return { ...entry.def, content };
      });

      // ── PDF-Dokument erstellen ──────────────────────────────
      const pdf = await PDFDocument.create();
      pdf.setTitle("Die Digitale Transformation \u2014 Markus Oehring");
      pdf.setAuthor("Markus Oehring");
      pdf.setSubject("Eine poetisch-philosophische Trilogie mit theoretischer Grundlegung in drei Kritiken");
      pdf.setCreator("DT Trilogie Ebook");
      pdf.setProducer("DT Trilogie");
      pdf.setCreationDate(new Date());
      pdf.setKeywords(["Philosophie", "Digitale Transformation", "Resonanzvernunft", "Gilgamesch", "Kant", "Heidegger"]);

      const fontSerif = await pdf.embedFont(StandardFonts.TimesRoman);
      const fontSerifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
      const fontSerifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
      const fontSerifBoldItalic = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
      const fontSans = await pdf.embedFont(StandardFonts.Helvetica);
      const fontSansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

      const PAGE_W = 595.28; // A4
      const PAGE_H = 841.89;
      const MARGIN_L = 72;
      const MARGIN_R = 72;
      const MARGIN_T = 85;
      const MARGIN_B = 72;
      const TEXT_W = PAGE_W - MARGIN_L - MARGIN_R;
      const FONT_SIZE = 10.5;
      const LINE_HEIGHT = FONT_SIZE * 1.6;
      const HEADING_SIZE = 16;
      const SUBHEADING_SIZE = 13;
      const H3_SIZE = 12;
      const H4_SIZE = 11;

      // Farben (passend zum WebApp-Farbschema)
      const COLOR_INDIGO = rgb(0.12, 0.11, 0.29);      // #1e1b4b
      const COLOR_AMBER = rgb(0.71, 0.33, 0.04);       // #b45309
      const COLOR_BODY = rgb(0.12, 0.12, 0.12);
      const COLOR_SUBTLE = rgb(0.45, 0.45, 0.45);
      const COLOR_QUOTE = rgb(0.3, 0.3, 0.3);
      const COLOR_LIGHT = rgb(0.6, 0.6, 0.6);
      const COLOR_BG_BAND = rgb(0.94, 0.93, 0.97);     // leichtes Indigo für Bandtitelseiten

      // ── Hilfsfunktionen ──────────────────────────────────
      type PageType = ReturnType<typeof pdf.addPage>;
      let currentPage: PageType = pdf.addPage([PAGE_W, PAGE_H]);
      let cursorY = PAGE_H - MARGIN_T;
      let pageNum = 0; // Seitennummer (ab Inhalt)
      let currentRunningHeader = '';

      // Bookmark-Daten sammeln
      interface BookmarkEntry {
        title: string;
        pageIndex: number;
        y: number;
        level: number; // 0 = Part, 1 = Chapter
        children: BookmarkEntry[];
      }
      const bookmarks: BookmarkEntry[] = [];

      const addWatermark = (page: PageType) => {
        const wmText = `Lizenziert f\u00fcr ${wmId}`;
        const wmFontSize = 36;
        try {
          page.drawText(wmText, {
            x: PAGE_W / 2 - fontSans.widthOfTextAtSize(wmText, wmFontSize) / 2,
            y: PAGE_H / 2,
            size: wmFontSize, font: fontSans,
            color: rgb(0.7, 0.7, 0.7), opacity: 0.06,
            rotate: degrees(-35),
          });
        } catch { /* skip */ }
      };

      const finalizePage = () => {
        addWatermark(currentPage);
        if (pageNum > 0) {
          // Seitenzahl unten Mitte
          const numStr = String(pageNum);
          const nw = fontSans.widthOfTextAtSize(numStr, 8.5);
          currentPage.drawText(numStr, {
            x: PAGE_W / 2 - nw / 2, y: MARGIN_B / 2 + 2,
            size: 8.5, font: fontSans, color: COLOR_LIGHT,
          });
          // Copyright-Footer
          const footer = `\u00a9 2026 Markus Oehring  \u2014  ${wmId}`;
          try {
            const fw = fontSans.widthOfTextAtSize(footer, 6.5);
            currentPage.drawText(footer, {
              x: PAGE_W / 2 - fw / 2, y: MARGIN_B / 2 - 10,
              size: 6.5, font: fontSans, color: rgb(0.72, 0.72, 0.72),
            });
          } catch { /* skip */ }
          // Laufender Kolumnentitel oben
          if (currentRunningHeader) {
            try {
              currentPage.drawText(currentRunningHeader, {
                x: MARGIN_L, y: PAGE_H - 30,
                size: 7.5, font: fontSans, color: COLOR_LIGHT,
              });
              // Dünne Trennlinie unter Header
              currentPage.drawLine({
                start: { x: MARGIN_L, y: PAGE_H - 35 },
                end: { x: PAGE_W - MARGIN_R, y: PAGE_H - 35 },
                thickness: 0.3, color: rgb(0.85, 0.85, 0.85),
              });
            } catch { /* skip */ }
          }
        }
      };

      const newPage = () => {
        finalizePage();
        pageNum++;
        currentPage = pdf.addPage([PAGE_W, PAGE_H]);
        cursorY = PAGE_H - MARGIN_T;
      };

      const ensureSpace = (needed: number) => {
        if (cursorY - needed < MARGIN_B) { newPage(); }
      };

      const wrapText = (text: string, font: typeof fontSerif, fontSize: number, maxWidth: number): string[] => {
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let cur = "";
        for (const word of words) {
          const test = cur ? `${cur} ${word}` : word;
          try {
            if (font.widthOfTextAtSize(test, fontSize) > maxWidth && cur) {
              lines.push(cur); cur = word;
            } else { cur = test; }
          } catch { if (cur) { lines.push(cur); cur = ""; } }
        }
        if (cur) lines.push(cur);
        return lines;
      };

      const drawWrapped = (text: string, font: typeof fontSerif, fontSize: number, lineH: number,
                           color = COLOR_BODY, indent = 0) => {
        const lines = wrapText(text, font, fontSize, TEXT_W - indent);
        for (const line of lines) {
          ensureSpace(lineH);
          try {
            currentPage.drawText(line, {
              x: MARGIN_L + indent, y: cursorY,
              size: fontSize, font, color,
            });
          } catch { /* skip */ }
          cursorY -= lineH;
        }
      };

      const drawCentered = (text: string, font: typeof fontSerif, fontSize: number, color = COLOR_INDIGO) => {
        try {
          const w = font.widthOfTextAtSize(text, fontSize);
          currentPage.drawText(text, {
            x: PAGE_W / 2 - w / 2, y: cursorY,
            size: fontSize, font, color,
          });
        } catch { /* skip */ }
      };

      const drawHLine = (width = 120, thickness = 0.5, color = COLOR_AMBER, opacity = 0.7) => {
        currentPage.drawLine({
          start: { x: PAGE_W / 2 - width / 2, y: cursorY },
          end: { x: PAGE_W / 2 + width / 2, y: cursorY },
          thickness, color, opacity,
        });
      };

      // ── 1. TITELSEITE ─────────────────────────────────────
      // Farbiger Hintergrund-Block (dezent)
      currentPage.drawRectangle({
        x: 0, y: 0, width: PAGE_W, height: PAGE_H,
        color: rgb(0.97, 0.96, 0.99),
      });
      // Dekorative Linie oben
      currentPage.drawRectangle({
        x: 0, y: PAGE_H - 4, width: PAGE_W, height: 4,
        color: COLOR_AMBER,
      });

      cursorY = PAGE_H - 180;
      // Autor
      drawCentered("MARKUS OEHRING", fontSans, 10, COLOR_AMBER);
      cursorY -= 20;
      drawHLine(60, 0.5, COLOR_AMBER, 0.5);
      cursorY -= 60;
      // Titel
      drawCentered("DIE DIGITALE", fontSerifBold, 36, COLOR_INDIGO);
      cursorY -= 50;
      drawCentered("TRANSFORMATION", fontSerifBold, 36, COLOR_INDIGO);
      cursorY -= 40;
      drawHLine(100, 0.8, COLOR_AMBER);
      cursorY -= 30;
      // Untertitel
      drawCentered("Eine poetisch-philosophische Trilogie", fontSerifItalic, 14, COLOR_AMBER);
      cursorY -= 22;
      drawCentered("mit theoretischer Grundlegung in drei Kritiken", fontSerifItalic, 13, COLOR_SUBTLE);
      cursorY -= 60;
      // Band-\u00dcbersicht
      const bandOverview = [
        "Band I: Die \u00dcberf\u00fchrung  \u2014  Gilgamesch im digitalen Zeitalter",
        "Band II: Der Ausgang  \u2014  Kant im Zeitalter der Maschinenvernunft",
        "Band III: Die R\u00fcckbindung  \u2014  Resonanz im Zeitalter der Entfremdung",
      ];
      for (const b of bandOverview) {
        try {
          drawCentered(b, fontSerif, 9.5, COLOR_SUBTLE);
        } catch { /* skip */ }
        cursorY -= 16;
      }
      cursorY -= 30;
      drawHLine(40, 0.3, COLOR_LIGHT);
      cursorY -= 20;
      drawCentered("April 2026", fontSerif, 11, COLOR_LIGHT);

      addWatermark(currentPage);

      // ── 2. COPYRIGHT-SEITE ────────────────────────────────
      currentPage = pdf.addPage([PAGE_W, PAGE_H]);
      cursorY = PAGE_H - 300;
      const copyrightLines = [
        { text: "\u00a9 2026 Markus Oehring", font: fontSansBold, size: 11 },
        { text: "Alle Rechte vorbehalten.", font: fontSans, size: 10 },
        { text: "", font: fontSans, size: 10 },
        { text: "Dieses Werk ist urheberrechtlich gesch\u00fctzt. Jede Verwertung", font: fontSans, size: 9 },
        { text: "au\u00dferhalb der engen Grenzen des Urheberrechtsgesetzes ist ohne", font: fontSans, size: 9 },
        { text: "Zustimmung des Autors unzul\u00e4ssig und strafbar.", font: fontSans, size: 9 },
        { text: "", font: fontSans, size: 10 },
        { text: `Lizenziert f\u00fcr: ${wmId}`, font: fontSans, size: 9 },
        { text: `Generiert am: ${new Date().toISOString().slice(0, 10)}`, font: fontSans, size: 9 },
        { text: "", font: fontSans, size: 10 },
        { text: "Unbefugte Weitergabe wird rechtlich verfolgt.", font: fontSansBold, size: 9 },
      ];
      for (const cl of copyrightLines) {
        if (!cl.text) { cursorY -= 14; continue; }
        try {
          currentPage.drawText(cl.text, { x: MARGIN_L, y: cursorY, size: cl.size, font: cl.font, color: COLOR_SUBTLE });
        } catch { /* skip */ }
        cursorY -= cl.size * 1.6;
      }
      addWatermark(currentPage);

      // ── 3. INHALTSVERZEICHNIS (Platzhalter — wird sp\u00e4ter bef\u00fcllt) ──
      // Wir reservieren Seiten f\u00fcr das Inhaltsverzeichnis und bef\u00fcllen sie am Ende
      // mit den richtigen Seitenzahlen.
      const tocPageStartIndex = pdf.getPageCount();
      const tocEntries: { title: string; pageNum: number; level: number; indent: number }[] = [];
      // Reserviere 2 Seiten f\u00fcrs Inhaltsverzeichnis (reicht f\u00fcr ~60 Eintr\u00e4ge)
      const tocPage1 = pdf.addPage([PAGE_W, PAGE_H]);
      const tocPage2 = pdf.addPage([PAGE_W, PAGE_H]);
      pageNum = 0; // Reset — Seitennummern starten ab Inhalt

      // ── 4. KAPITELINHALTE RENDERN ─────────────────────────
      let lastPart = '';

      const renderBandTitlePage = (ch: PdfSection) => {
        newPage();
        const pg = currentPage;
        // Dezenter Hintergrund
        pg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COLOR_BG_BAND });
        // Dekorative Linien
        pg.drawRectangle({ x: 0, y: PAGE_H - 3, width: PAGE_W, height: 3, color: COLOR_AMBER });
        pg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 3, color: COLOR_AMBER });

        cursorY = PAGE_H - 260;

        // "Band X" Label
        const bandLabel = ch.title.split(':')[0] || ch.title;
        drawCentered(bandLabel.toUpperCase(), fontSans, 11, COLOR_AMBER);
        cursorY -= 20;
        drawHLine(60, 0.5, COLOR_AMBER, 0.5);
        cursorY -= 40;

        // Titel (nach dem Doppelpunkt)
        const mainTitle = ch.title.includes(':') ? ch.title.split(':').slice(1).join(':').trim() : ch.title;
        drawCentered(mainTitle, fontSerifBold, 28, COLOR_INDIGO);
        cursorY -= 30;
        drawHLine(80, 0.6, COLOR_AMBER);
        cursorY -= 30;

        // Untertitel
        if (ch.subtitle) {
          drawCentered(ch.subtitle, fontSerifItalic, 15, COLOR_SUBTLE);
          cursorY -= 30;
        }

        // Beschreibung
        if (ch.description) {
          const descLines = wrapText(ch.description, fontSerif, 11, TEXT_W * 0.7);
          for (const dl of descLines) {
            try {
              const dw = fontSerif.widthOfTextAtSize(dl, 11);
              currentPage.drawText(dl, {
                x: PAGE_W / 2 - dw / 2, y: cursorY,
                size: 11, font: fontSerif, color: COLOR_LIGHT,
              });
            } catch { /* skip */ }
            cursorY -= 18;
          }
        }

        // Bookmark + ToC
        const pgIdx = pdf.getPageCount() - 1;
        tocEntries.push({ title: ch.title, pageNum, level: 0, indent: 0 });
        const partBookmark: BookmarkEntry = { title: ch.title, pageIndex: pgIdx, y: PAGE_H - 260, level: 0, children: [] };
        bookmarks.push(partBookmark);
        currentRunningHeader = ch.partTitle;
      };

      const renderChapterStart = (ch: PdfSection) => {
        newPage();
        const pgIdx = pdf.getPageCount() - 1;
        currentRunningHeader = ch.partTitle + '  \u2014  ' + ch.title;

        // Kapitel-Header
        cursorY -= 10;
        // Teil-Label (klein, \u00fcber dem Titel)
        try {
          currentPage.drawText(ch.partTitle.toUpperCase(), {
            x: MARGIN_L, y: cursorY,
            size: 8, font: fontSans, color: COLOR_AMBER,
          });
        } catch { /* skip */ }
        cursorY -= 25;

        // Kapitel-Titel
        const titleLines = wrapText(ch.title, fontSerifBold, HEADING_SIZE, TEXT_W);
        for (const tl of titleLines) {
          try {
            currentPage.drawText(tl, {
              x: MARGIN_L, y: cursorY,
              size: HEADING_SIZE, font: fontSerifBold, color: COLOR_INDIGO,
            });
          } catch { /* skip */ }
          cursorY -= HEADING_SIZE * 1.35;
        }

        // Untertitel
        if (ch.subtitle) {
          cursorY -= 4;
          try {
            currentPage.drawText(ch.subtitle, {
              x: MARGIN_L, y: cursorY,
              size: 11, font: fontSerifItalic, color: COLOR_SUBTLE,
            });
          } catch { /* skip */ }
          cursorY -= 18;
        }

        // Dekorative Linie unter Titel
        cursorY -= 6;
        currentPage.drawLine({
          start: { x: MARGIN_L, y: cursorY },
          end: { x: MARGIN_L + 100, y: cursorY },
          thickness: 0.8, color: COLOR_AMBER, opacity: 0.6,
        });
        cursorY -= 25;

        // Bookmark + ToC
        const tocLevel = ch.isTitlePage ? 0 : 1;
        tocEntries.push({ title: ch.title, pageNum, level: tocLevel, indent: tocLevel === 0 ? 0 : 16 });

        // In bookmark tree: add as child of last part-level bookmark, or as top-level
        const bEntry: BookmarkEntry = { title: ch.title, pageIndex: pgIdx, y: PAGE_H - MARGIN_T, level: 1, children: [] };
        if (bookmarks.length > 0 && bookmarks[bookmarks.length - 1].level === 0) {
          bookmarks[bookmarks.length - 1].children.push(bEntry);
        } else {
          bookmarks.push(bEntry);
        }
      };

      const renderParagraph = (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;

        // ### Markdown-Heading (H3)
        if (trimmed.startsWith('#### ')) {
          const heading = trimmed.slice(5);
          ensureSpace(H4_SIZE * 3);
          cursorY -= 10;
          drawWrapped(heading, fontSerifBoldItalic, H4_SIZE, H4_SIZE * 1.4, COLOR_INDIGO);
          cursorY -= 6;
          return;
        }
        if (trimmed.startsWith('### ')) {
          const heading = trimmed.slice(4);
          ensureSpace(H3_SIZE * 3);
          cursorY -= 16;
          drawWrapped(heading, fontSerifBold, H3_SIZE, H3_SIZE * 1.4, COLOR_INDIGO);
          cursorY -= 8;
          return;
        }

        // Trennlinie
        if (/^[\u2014\u2013\-]{3,}$/.test(trimmed)) {
          ensureSpace(30);
          cursorY -= 12;
          drawHLine(100, 0.4, COLOR_AMBER, 0.5);
          cursorY -= 12;
          return;
        }

        // Zitate
        if (trimmed.startsWith('\u201e') || trimmed.startsWith('\u00ab') || trimmed.startsWith('"')) {
          ensureSpace(LINE_HEIGHT * 2);
          drawWrapped(trimmed, fontSerifItalic, FONT_SIZE, LINE_HEIGHT, COLOR_QUOTE, 20);
          cursorY -= 6;
          return;
        }

        // Normaler Absatz
        ensureSpace(LINE_HEIGHT * 2);
        drawWrapped(trimmed, fontSerif, FONT_SIZE, LINE_HEIGHT, COLOR_BODY);
        cursorY -= 6;
      };

      // ── Kapitel durchgehen ──────────────────────────────
      for (const ch of chapters) {
        // ── Glossar: spezielle Darstellung ──────────────────
        if (ch.id === 'glossar') {
          renderChapterStart(ch);

          // Parse glossary entries
          const glossarEntries: { term: string; definition: string }[] = [];
          const glossarLines = ch.content.split('\n');
          let introText = '';
          let currentTerm = '';
          let currentDef = '';

          for (const line of glossarLines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const match = trimmed.match(/^([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\s\u2013\u2014\-()„"]+?)\s{2,}(.+)$/);
            if (match) {
              if (currentTerm) {
                glossarEntries.push({ term: currentTerm, definition: currentDef.trim() });
              }
              currentTerm = match[1].trim();
              currentDef = match[2];
            } else if (currentTerm) {
              currentDef += ' ' + trimmed;
            } else {
              introText += (introText ? ' ' : '') + trimmed;
            }
          }
          if (currentTerm) {
            glossarEntries.push({ term: currentTerm, definition: currentDef.trim() });
          }

          // Render each entry: bold term, then definition
          for (const entry of glossarEntries) {
            ensureSpace(LINE_HEIGHT * 3);
            cursorY -= 8;

            // Term (bold, amber color)
            drawWrapped(entry.term, fontSerifBold, FONT_SIZE + 0.5, LINE_HEIGHT, COLOR_AMBER);
            cursorY -= 2;

            // Definition (normal, slightly indented)
            drawWrapped(entry.definition, fontSerif, FONT_SIZE, LINE_HEIGHT, COLOR_BODY, 12);
            cursorY -= 4;
          }

          lastPart = ch.part;
          continue;
        }

        // ── Literatur: Hängender Einzug ─────────────────────
        if (ch.id === 'literatur') {
          renderChapterStart(ch);

          const litParagraphs = ch.content.split('\n\n').filter(p => p.trim());

          for (const para of litParagraphs) {
            const trimmed = para.trim();
            if (!trimmed) continue;

            // Check if it's a section header like "Primärliteratur" or "Sekundärliteratur"
            if (trimmed.length < 40 && !trimmed.includes('.') && /^[A-ZÄÖÜa-zäöü]/.test(trimmed)) {
              ensureSpace(H3_SIZE * 3);
              cursorY -= 14;
              drawWrapped(trimmed, fontSerifBold, H3_SIZE, H3_SIZE * 1.4, COLOR_INDIGO);
              cursorY -= 8;
              continue;
            }

            // Bibliography entry with hanging indent
            ensureSpace(LINE_HEIGHT * 2);
            // Use wrapText with full width for the first line, then indent continuation
            const allText = trimmed.replace(/\n/g, ' ');
            const words = allText.split(/\s+/);
            let firstLine = true;
            let currentLine = '';
            const indent = 18;

            for (const word of words) {
              const testLine = currentLine ? `${currentLine} ${word}` : word;
              const maxW = firstLine ? TEXT_W : TEXT_W - indent;
              try {
                if (fontSerif.widthOfTextAtSize(testLine, FONT_SIZE) > maxW && currentLine) {
                  ensureSpace(LINE_HEIGHT);
                  try {
                    currentPage.drawText(currentLine, {
                      x: MARGIN_L + (firstLine ? 0 : indent), y: cursorY,
                      size: FONT_SIZE, font: fontSerif, color: COLOR_BODY,
                    });
                  } catch { /* skip */ }
                  cursorY -= LINE_HEIGHT;
                  currentLine = word;
                  firstLine = false;
                } else {
                  currentLine = testLine;
                }
              } catch { if (currentLine) { /* flush */ } currentLine = ''; }
            }
            if (currentLine) {
              ensureSpace(LINE_HEIGHT);
              try {
                currentPage.drawText(currentLine, {
                  x: MARGIN_L + (firstLine ? 0 : indent), y: cursorY,
                  size: FONT_SIZE, font: fontSerif, color: COLOR_BODY,
                });
              } catch { /* skip */ }
              cursorY -= LINE_HEIGHT;
            }
            cursorY -= 4;
          }

          lastPart = ch.part;
          continue;
        }

        if (ch.isTitlePage) {
          renderBandTitlePage(ch);
          lastPart = ch.part;
          continue;
        }

        // Add Einleitung as top-level ToC/bookmark entry
        if (ch.part === 'einleitung' && lastPart !== 'einleitung') {
          tocEntries.push({ title: 'Einleitung', pageNum: pageNum + 1, level: 0, indent: 0 });
          const einleitungBm: BookmarkEntry = {
            title: 'Einleitung',
            pageIndex: pdf.getPageCount(),
            y: PAGE_H - MARGIN_T,
            level: 0,
            children: [],
          };
          bookmarks.push(einleitungBm);
          lastPart = ch.part;
        }

        // Neuer Teil? (Teile IV-VII, Schlussreflexion, etc.)
        if (ch.part !== lastPart && !ch.id.startsWith('band') && ch.part !== 'einleitung') {
          // Für Nicht-Band-Teile: Top-Level-Bookmark
          const partEntry: BookmarkEntry = {
            title: ch.partTitle, pageIndex: pdf.getPageCount(),
            y: PAGE_H - MARGIN_T, level: 0, children: [],
          };
          bookmarks.push(partEntry);
          tocEntries.push({ title: ch.partTitle, pageNum: pageNum + 1, level: 0, indent: 0 });
          lastPart = ch.part;
        }

        renderChapterStart(ch);

        // Inhalt in Absätze splitten und rendern
        const paragraphs = ch.content.split('\n\n').filter(p => p.trim());
        for (const para of paragraphs) {
          renderParagraph(para);
        }
      }

      // Letzte Seite finalisieren
      finalizePage();

      // ── 5. INHALTSVERZEICHNIS BEFÜLLEN ────────────────────
      const tocPages = [tocPage1, tocPage2];
      let tocPageIdx = 0;
      let tocY = PAGE_H - MARGIN_T;

      // ToC-Titel
      const tocTitle = "INHALTSVERZEICHNIS";
      const tocTitleW = fontSansBold.widthOfTextAtSize(tocTitle, 14);
      tocPages[0].drawText(tocTitle, {
        x: PAGE_W / 2 - tocTitleW / 2, y: tocY,
        size: 14, font: fontSansBold, color: COLOR_INDIGO,
      });
      tocY -= 12;
      // Linie unter Titel
      tocPages[0].drawLine({
        start: { x: PAGE_W / 2 - 80, y: tocY },
        end: { x: PAGE_W / 2 + 80, y: tocY },
        thickness: 0.5, color: COLOR_AMBER, opacity: 0.6,
      });
      tocY -= 30;

      for (const entry of tocEntries) {
        if (tocY < MARGIN_B + 20) {
          tocPageIdx++;
          if (tocPageIdx >= tocPages.length) break;
          tocY = PAGE_H - MARGIN_T;
        }
        const pg = tocPages[tocPageIdx];
        const isPartLevel = entry.level === 0;
        const font = isPartLevel ? fontSerifBold : fontSerif;
        const fontSize = isPartLevel ? 11 : 10;
        const color = isPartLevel ? COLOR_INDIGO : COLOR_BODY;
        const x = MARGIN_L + entry.indent;

        // Extra Abstand vor Parts
        if (isPartLevel) tocY -= 10;

        // Titel (links)
        try {
          // Truncate title if too long
          let title = entry.title;
          const maxTitleW = TEXT_W - entry.indent - 40; // Reserve f\u00fcr Seitenzahl + Punkte
          while (font.widthOfTextAtSize(title, fontSize) > maxTitleW && title.length > 10) {
            title = title.slice(0, -4) + '\u2026';
          }
          pg.drawText(title, { x, y: tocY, size: fontSize, font, color });
        } catch { /* skip */ }

        // Seitenzahl (rechts)
        const numStr = String(entry.pageNum);
        try {
          const nw = fontSerif.widthOfTextAtSize(numStr, fontSize);
          pg.drawText(numStr, {
            x: PAGE_W - MARGIN_R - nw, y: tocY,
            size: fontSize, font, color: COLOR_SUBTLE,
          });
        } catch { /* skip */ }

        // Gepunktete F\u00fchrlinie (dots between title and page number)
        try {
          const titleEnd = x + font.widthOfTextAtSize(entry.title, fontSize) + 8;
          const numStart = PAGE_W - MARGIN_R - fontSerif.widthOfTextAtSize(numStr, fontSize) - 8;
          if (numStart > titleEnd) {
            const dots = '\u00b7'.repeat(Math.floor((numStart - titleEnd) / fontSerif.widthOfTextAtSize('\u00b7', 7)));
            if (dots) {
              pg.drawText(dots, {
                x: titleEnd, y: tocY,
                size: 7, font: fontSerif, color: rgb(0.8, 0.8, 0.8),
              });
            }
          }
        } catch { /* skip */ }

        tocY -= isPartLevel ? 20 : 16;
      }

      // ToC-Seiten: Wasserzeichen + Kolumnentitel
      for (const pg of tocPages) {
        addWatermark(pg);
        try {
          pg.drawText("INHALTSVERZEICHNIS", {
            x: MARGIN_L, y: PAGE_H - 30,
            size: 7.5, font: fontSans, color: COLOR_LIGHT,
          });
          pg.drawLine({
            start: { x: MARGIN_L, y: PAGE_H - 35 },
            end: { x: PAGE_W - MARGIN_R, y: PAGE_H - 35 },
            thickness: 0.3, color: rgb(0.85, 0.85, 0.85),
          });
        } catch { /* skip */ }
      }

      // ── 6. PDF-OUTLINE / LESEZEICHEN ──────────────────────
      // Erstelle hierarchische PDF-Bookmarks mit pdf-lib Low-Level-API
      const ctx = pdf.context;
      const pages = pdf.getPages();

      const createDest = (pageIndex: number, y: number): PDFArray | undefined => {
        if (pageIndex < 0 || pageIndex >= pages.length) return undefined;
        const arr = PDFArray.withContext(ctx);
        arr.push(pages[pageIndex].ref);
        arr.push(PDFName.of('XYZ'));
        arr.push(PDFNumber.of(0));
        arr.push(PDFNumber.of(y));
        arr.push(PDFNumber.of(0));
        return arr;
      };

      // Flatten bookmarks into outline items
      interface OutlineItem {
        title: string;
        dest: PDFArray | undefined;
        children: OutlineItem[];
        ref?: ReturnType<typeof ctx.register>;
      }

      const buildOutlineItems = (entries: BookmarkEntry[]): OutlineItem[] =>
        entries.map(e => ({
          title: e.title,
          dest: createDest(e.pageIndex, e.y),
          children: buildOutlineItems(e.children),
        }));

      const outlineItems = buildOutlineItems(bookmarks);

      // Recursive function to register outline entries and build the tree
      const registerOutlineEntry = (item: OutlineItem, parentRef: ReturnType<typeof ctx.register>): ReturnType<typeof ctx.register> => {
        const dict = PDFDict.withContext(ctx);
        dict.set(PDFName.of('Title'), PDFString.of(item.title));
        dict.set(PDFName.of('Parent'), parentRef);
        if (item.dest) { dict.set(PDFName.of('Dest'), item.dest); }

        const ref = ctx.register(dict);
        item.ref = ref;

        if (item.children.length > 0) {
          const childRefs = item.children.map(child => registerOutlineEntry(child, ref));
          const d = ctx.lookup(ref) as PDFDict;
          d.set(PDFName.of('First'), childRefs[0]);
          d.set(PDFName.of('Last'), childRefs[childRefs.length - 1]);
          d.set(PDFName.of('Count'), PDFNumber.of(-item.children.length)); // negative = closed
          for (let ci = 0; ci < childRefs.length; ci++) {
            const cd = ctx.lookup(childRefs[ci]) as PDFDict;
            if (ci > 0) cd.set(PDFName.of('Prev'), childRefs[ci - 1]);
            if (ci < childRefs.length - 1) cd.set(PDFName.of('Next'), childRefs[ci + 1]);
          }
        }
        return ref;
      };

      if (outlineItems.length > 0) {
        // Create root Outlines dict
        const outlinesDict = PDFDict.withContext(ctx);
        outlinesDict.set(PDFName.of('Type'), PDFName.of('Outlines'));
        const outlinesRef = ctx.register(outlinesDict);

        const topRefs = outlineItems.map(item => registerOutlineEntry(item, outlinesRef));
        const od = ctx.lookup(outlinesRef) as PDFDict;
        od.set(PDFName.of('First'), topRefs[0]);
        od.set(PDFName.of('Last'), topRefs[topRefs.length - 1]);
        od.set(PDFName.of('Count'), PDFNumber.of(topRefs.length));

        // Link top-level siblings
        for (let ti = 0; ti < topRefs.length; ti++) {
          const td = ctx.lookup(topRefs[ti]) as PDFDict;
          if (ti > 0) td.set(PDFName.of('Prev'), topRefs[ti - 1]);
          if (ti < topRefs.length - 1) td.set(PDFName.of('Next'), topRefs[ti + 1]);
        }

        pdf.catalog.set(PDFName.of('Outlines'), outlinesRef);
        // PDF \u00f6ffnet mit sichtbarer Navigation
        pdf.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
      }

      // ── 7. DRUCKSCHUTZ ────────────────────────────────────
      const jsCode = [
        'var _origPrint = this.print;',
        'this.print = function() {',
        '  app.alert("Drucken ist f\\u00fcr dieses Werk nicht gestattet.", 0);',
        '};',
        'if (typeof app.addMenuItem === "function") {',
        '  try { app.addMenuItem({ cName: "-", cParent: "File", cExec: "void(0);" }); } catch(e) {}',
        '}',
      ].join('\n');
      const jsDict = PDFDict.withContext(ctx);
      jsDict.set(PDFName.of('Type'), PDFName.of('Action'));
      jsDict.set(PDFName.of('S'), PDFName.of('JavaScript'));
      jsDict.set(PDFName.of('JS'), PDFString.of(jsCode));
      const jsDictRef = ctx.register(jsDict);
      pdf.catalog.set(PDFName.of('OpenAction'), jsDictRef);

      // ── 8. PDF SERIALISIEREN ──────────────────────────────
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
