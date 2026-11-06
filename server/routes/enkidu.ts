/**
 * POST /api/enkidu — Gespräch mit Enkidu.
 * Aus server/index.ts unverändert herausgelöst.
 */
import { Router } from "express";
import { getKeys } from "../lib/embeddingClient.js";
import { generateFlashContent } from "../lib/geminiText.js";
import { prepareConversation } from "../lib/conversationPrompt.js";
import { flashErrorDetail, FLASH_THINKING_BUDGET } from "../lib/proseAssist.js";
import { UNTRUSTED_RULE } from "../lib/promptSafety.js";
import { logResonanz } from "../lib/resonanzLog.js";
import { rateLimiter, scrub } from "../middleware/rateLimit.js";

export function createEnkiduRouter(getEbookContent: () => string): Router {
  const router = Router();
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
'Nach diesem Gespräch warten drei kurze Fragen auf dich — nicht über mich, sondern über dich.'

${UNTRUSTED_RULE}`;

  router.post("/api/enkidu", rateLimiter('enkidu', 100, 60 * 60_000), async (req, res) => {
    if (getKeys().length === 0) {
      return res.status(500).json({ error: "GEMINI_API_KEY ist nicht konfiguriert." });
    }

    // Verlauf ist clientseitig. Jede Blase wird begrenzt und gerahmt;
    // Fehlerblasen und fremde Rollen bleiben draußen.
    const prepared = prepareConversation({
      messages: (req.body as { messages?: unknown } | undefined)?.messages,
      textKey: "content",
      userRoles: ["user"],
      assistantRoles: ["assistant"],
      maxTurns: 17,
      skipError: true,
    });
    if ("error" in prepared) return res.status(400).json({ error: prepared.error });

    // Ebook-Inhalt als Wissensbasis (erste 30.000 Zeichen — reduziert um
    // den Gesamtprompt unter der Grenze für zuverlässige Antworten zu halten)
    const ebookContent = getEbookContent();
    const ebookSnippet = ebookContent ? ebookContent.slice(0, 30_000) : "";

    // System-Instruktion: Enkidu-Persönlichkeit + Ebook-Wissen
    // Wird in das dedizierte systemInstruction-Feld geschrieben — nicht in die
    // user-Message gequetscht. Das ist das korrekte Gemini-API-Pattern.
    const systemText = [
      ENKIDU_SYSTEM_PROMPT,
      ebookSnippet
        ? [
            "\n─────────────────────────────────────────────",
            "WISSENSBASIS — DAS VOLLSTÄNDIGE WERK",
            "─────────────────────────────────────────────",
            'Du hast Zugriff auf den vollständigen Text von "Die Digitale Transformation".',
            "Nutze dieses Wissen, wenn der Mensch auf Inhalte, Kapitel, Figuren oder Konzepte des Werks Bezug nimmt.",
            "Zitiere sparsam und nur wenn es die Begegnung vertieft.",
            "",
            ebookSnippet,
          ].join("\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    // Gesprächshistorie als Multi-Turn-Array (Gemini: role "model", nicht "assistant").
    const conversationContents = prepared.contents;

    try {
      const r = await generateFlashContent({
        system: systemText,
        contents: conversationContents,
        temperature: 0.9,
        maxTokens: 4096,
        thinkingBudget: FLASH_THINKING_BUDGET,
      });
      if (!r.ok) {
        console.error("Enkidu Gemini error:", r.status, scrub(r.errorDetail ?? ""));
        return res.status(502).json({ error: scrub(flashErrorDetail(r)) });
      }
      const text = r.text;
      res.json({ response: text });
      void logResonanz({
        endpoint: "enkidu",
        anchor: "enkidu",
        prompt: prepared.lastUserText,
        response: text,
        model: "gemini-2.5-flash",
        contextMeta: { turnCount: prepared.turns.length },
      });
      return;
    } catch (err: unknown) {
      const message = scrub(err instanceof Error ? err.message : String(err));
      console.error("Enkidu API error:", message);
      return res.status(502).json({ error: `Enkidu-API-Fehler: ${message}` });
    }
  });
  return router;
}
