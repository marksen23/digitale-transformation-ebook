/**
 * Graph-Chat, Dialog-Persistenz und Weiterdenken (JSON und SSE).
 * Aus server/index.ts unverändert herausgelöst.
 */
import { Router } from "express";
import { recordCitations } from "../lib/citationTracker.js";
import { prepareGraphChat } from "../lib/conversationPrompt.js";
import { getKeys } from "../lib/embeddingClient.js";
import { streamGeminiSSE, sseSend } from "../lib/geminiStream.js";
import { endsComplete, generateFlashContent } from "../lib/geminiText.js";
import { GRAPH_SYSTEM_PROMPT } from "../lib/graphContext.js";
import { flashErrorDetail, FLASH_THINKING_BUDGET, PROSE_MAX_TOKENS } from "../lib/proseAssist.js";
import { OUTPUT_VOICE_RULE } from "../lib/promptSafety.js";
import { prepareDialogPersist, resolveDialogAnchor } from "../lib/dialogAnchor.js";
import { logResonanz } from "../lib/resonanzLog.js";
import { prepareWeiterdenken, weiterdenkenSafetySuffix } from "../lib/weiterdenkenPrompt.js";
import { buildWerkContext } from "../lib/werkRetrieval.js";
import { rateLimiter, scrub } from "../middleware/rateLimit.js";

export function createDialogRouter(): Router {
  const router = Router();
  // ─── Graph-Chat: freier Gemini-Dialog über das gesamte Begriffsnetz ──
  router.post("/api/graph-chat", rateLimiter('graph-chat', 30, 60 * 60_000), async (req, res) => {
    if (getKeys().length === 0) return res.status(503).json({ error: "Gemini API nicht konfiguriert." });

    const prepared = prepareGraphChat(req.body ?? {});
    if ("error" in prepared) return res.status(400).json({ error: prepared.error });
    const { contents, lastUserText, turns } = prepared;

    // Werk-Text-RAG (Feature D): retrieve passend zur aktuellen User-Nachricht
    const { passages: chatPassages, contextBlock: chatWerkContext } = await buildWerkContext(lastUserText, 4);

    // i18n (Feature F): wenn Client EN-Locale signalisiert, antworte EN
    const acceptLang = (req.headers["accept-language"] ?? "").toString();
    const referer = (req.headers["referer"] ?? "").toString();
    const isEnglish = /\/en(\/|$|\?)/.test(referer) || /^en/i.test(acceptLang.split(",")[0]?.trim() ?? "");
    const langAddition = isEnglish
      ? "\n\nIMPORTANT: Respond in English. The user's interface is set to English."
      : "";
    const enrichedSystem = chatWerkContext
      ? `${GRAPH_SYSTEM_PROMPT}\n\n${chatWerkContext}\n\nZitiere Werk-Passagen via [chunkId] und kuratierte Resonanzen via [resonanzId] aus dem obigen Block. Bei „bereits beantworteten" Fragen — baue auf der älteren Antwort auf statt sie zu wiederholen. Erfinde keine IDs.${langAddition}`
      : GRAPH_SYSTEM_PROMPT + langAddition;

    try {
      const r = await generateFlashContent({
        system: enrichedSystem,
        contents,
        temperature: 0.85,
        maxTokens: PROSE_MAX_TOKENS,
        thinkingBudget: FLASH_THINKING_BUDGET,
      });
      if (!r.ok) return res.status(502).json({ error: scrub(flashErrorDetail(r)) });
      if (r.truncated && !endsComplete(r.text)) {
        return res.status(502).json({ error: "Die Antwort wurde unvollständig abgeschnitten. Bitte erneut versuchen." });
      }
      const reply = r.text;
      // R6: Citation-Tracking. chatPassages haben einen source-Tag aus R1.
      recordCitations(reply, chatPassages.map(p => ({ source: p.source, id: p.id })));
      // graph-chat: chatPassages haben kein .source-Property direkt im
      // citedChunks-payload — fügen wir hinzu für Frontend-Konsistenz.
      res.json({ reply, citedChunks: chatPassages.map(p => ({ source: p.source, id: p.id, chapter: p.chapter, partTitle: p.partTitle, chapterTitle: p.chapterTitle, endpoint: p.endpoint, prompt: p.prompt })) });
      void logResonanz({
        endpoint: "graph-chat",
        anchor: "graph",
        prompt: lastUserText,
        response: reply,
        model: "gemini-2.5-flash",
        contextMeta: {
          historyLength: Math.max(0, turns.length - 1),
          werk_passages: chatPassages.map(p => ({ id: p.id, chapter: p.chapter, score: Number(p.score.toFixed(3)) })),
        },
      });
      return;
    } catch (err: unknown) {
      const message = scrub(err instanceof Error ? err.message : String(err));
      return res.status(502).json({ error: `API-Fehler: ${message}` });
    }
  });

  // ─── Graph-Chat Streaming (Phase 3, SSE) ─────────────────────────────────
  // Additive Streaming-Variante: gleicher Prompt/RAG/Logging wie /api/graph-chat,
  // aber Gemini streamGenerateContent → Text erscheint token-weise. Der
  // bestehende JSON-Endpoint bleibt unberührt (Fallback im Client). Schlussfrage-
  // /Citation-Verarbeitung läuft NACH Stream-Ende auf dem vollständigen Text.
  router.post("/api/graph-chat/stream", rateLimiter('graph-chat', 30, 60 * 60_000), async (req, res) => {
    const apiKeys = getKeys();
    if (apiKeys.length === 0) return res.status(503).json({ error: "Gemini API nicht konfiguriert." });
    const prepared = prepareGraphChat(req.body ?? {});
    if ("error" in prepared) return res.status(400).json({ error: prepared.error });
    const { contents, lastUserText, turns } = prepared;
    const { passages: chatPassages, contextBlock: chatWerkContext } = await buildWerkContext(lastUserText, 4);
    const acceptLang = (req.headers["accept-language"] ?? "").toString();
    const referer = (req.headers["referer"] ?? "").toString();
    const isEnglish = /\/en(\/|$|\?)/.test(referer) || /^en/i.test(acceptLang.split(",")[0]?.trim() ?? "");
    const langAddition = isEnglish ? "\n\nIMPORTANT: Respond in English. The user's interface is set to English." : "";
    const enrichedSystem = chatWerkContext
      ? `${GRAPH_SYSTEM_PROMPT}\n\n${chatWerkContext}\n\nZitiere Werk-Passagen via [chunkId] und kuratierte Resonanzen via [resonanzId] aus dem obigen Block. Bei „bereits beantworteten" Fragen — baue auf der älteren Antwort auf statt sie zu wiederholen. Erfinde keine IDs.${langAddition}`
      : GRAPH_SYSTEM_PROMPT + langAddition;

    const full = await streamGeminiSSE(res, {
      apiKeys,
      system: enrichedSystem,
      contents,
      generationConfig: { temperature: 0.85, maxOutputTokens: PROSE_MAX_TOKENS, ...(typeof FLASH_THINKING_BUDGET === "number" ? { thinkingConfig: { thinkingBudget: FLASH_THINKING_BUDGET } } : {}) },
    });
    if (full === null) return;  // Fehler-Event wurde bereits gesendet + res beendet
    const reply = full.trim() || "Keine Antwort erhalten.";
    if (!endsComplete(reply)) {
      sseSend(res, { error: "Die Antwort wurde unvollständig abgeschnitten. Bitte erneut versuchen." });
      res.end();
      return;
    }
    recordCitations(reply, chatPassages.map(p => ({ source: p.source, id: p.id })));
    sseSend(res, { done: true, citedChunks: chatPassages.map(p => ({ source: p.source, id: p.id, chapter: p.chapter, partTitle: p.partTitle, chapterTitle: p.chapterTitle, endpoint: p.endpoint, prompt: p.prompt })) });
    res.end();
    void logResonanz({
      endpoint: "graph-chat", anchor: "graph", prompt: lastUserText, response: reply,
      model: "gemini-2.5-flash",
      contextMeta: {
        historyLength: Math.max(0, turns.length - 1), streamed: true,
        werk_passages: chatPassages.map(p => ({ id: p.id, chapter: p.chapter, score: Number(p.score.toFixed(3)) })),
      },
    });
  });

  // ─── Dialog-Persist (Tier-1-3-Roadmap, Feature B) ────────────────────
  // Multi-Turn-Dialogs laufen über das existierende /api/graph-chat,
  // dessen Sessions clientseitig im LocalStorage gehalten werden. Wenn
  // der Reader einen gelungenen Turn ins Korpus aufnehmen will, wird
  // er hier persistiert — als endpoint="dialog" mit der gesamten
  // Vorgeschichte in contextMeta.dialog_history.
  router.post("/api/dialog/persist", rateLimiter('dialog-persist', 30, 60 * 60_000), async (req, res) => {
    const prepared = prepareDialogPersist(req.body);
    if (!prepared.ok) return res.status(400).json({ error: prepared.error });
    const { anchor, nodeIds, prompt, response, sessionId, focus, turns } = prepared.value;
    // Spam, Länge und Anker sind geprüft. Dedup läuft in logResonanz,
    // derselbe Pfad wie bei den anderen Endpunkten.
    void logResonanz({
      endpoint: "dialog",
      anchor,
      nodeIds,
      prompt,
      response,
      model: "gemini-2.5-flash",
      contextMeta: {
        session_id: sessionId,
        turn_count: turns.length,
        dialog_history: turns.map(t => ({ role: t.role, text: t.text.slice(0, 800) })),
        focus,
      },
    });

    return res.json({ ok: true, anchor, turnCount: turns.length });
  });

  // ─── Weiterdenken — rekursive Schlussfragen-Fortsetzung ────────────────
  // Jede KI-Ausgabe endet mit einer offenen Frage. Dieser Endpoint trägt
  // genau diese Frage weiter: er antwortet in 1–2 dichten Absätzen und
  // schließt mit GENAU EINER neuen offenen Frage. Frontend baut daraus einen
  // rekursiven Faden (WeiterdenkenThread). Antwort wird server-seitig in
  // reflection (Body) + nextQuestion (neue Schlussfrage) aufgespalten, damit
  // der Client nicht raten muss.
  //
  // Korpus: geloggt als endpoint="dialog" (kein Schema-Churn).

  const WEITERDENKEN_SYSTEM_PROMPT = `Du trägst eine offene Frage des Werks "Die Digitale Transformation" weiter — einer poetisch-philosophischen Trilogie über Resonanzvernunft, das Mensch-Maschine-Verhältnis und digitale Existenz.

Der Leser hat eine offene Schlussfrage vor sich und möchte den Gedanken weiterführen. Manchmal hat er sie selbst schon beantwortet — dann baue auf SEINER Antwort auf, nicht gegen sie.

DEINE AUFGABE:
- Antworte in 1–2 dichten, prosaischen Absätzen im Geist des Werks. Keine Listen, kein Akademismus-Prunk, kein Fazit.
- Trage den Gedanken einen echten Schritt weiter — wiederhole nicht, was schon im Faden steht.
- SCHLIESSE mit GENAU EINER einzigen neuen offenen Frage, die der Lesende weitertragen kann. Diese Frage MUSS der allerletzte Absatz sein, allein stehend, und mit einem Fragezeichen enden.

Wenn Werk-Passagen im Kontext gegeben sind, lass dich von ihnen tragen, ohne sie aufzuzählen.

${OUTPUT_VOICE_RULE}`;

  function weiterdenkenSystem(contextBlock: string, langAddition: string): string {
    const base = `${WEITERDENKEN_SYSTEM_PROMPT}${weiterdenkenSafetySuffix()}`;
    return contextBlock ? `${base}\n\n${contextBlock}${langAddition}` : base + langAddition;
  }

  /** Spaltet die KI-Antwort in Body + finale Schlussfrage. Die Frage ist
   *  der letzte Absatz/Satz, der mit "?" endet. Fällt auf den ganzen Text
   *  zurück, wenn keine Frage gefunden wird. */
  function splitClosingQuestion(text: string): { reflection: string; nextQuestion: string } {
    const trimmed = text.trim();
    // Letzten Absatz, der mit ? endet, als Frage nehmen
    const paras = trimmed.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    for (let i = paras.length - 1; i >= 0; i--) {
      if (paras[i].endsWith("?")) {
        const question = paras[i].replace(/^##\s*Offene Frage\s*/i, "").trim();
        const reflection = paras.slice(0, i).join("\n\n").trim() || trimmed;
        return { reflection, nextQuestion: question };
      }
    }
    // Fallback: letzter Satz mit ?
    const m = trimmed.match(/([^.!?\n]*\?)\s*$/);
    if (m) {
      const question = m[1].trim();
      const reflection = trimmed.slice(0, trimmed.length - m[0].length).trim() || trimmed;
      return { reflection, nextQuestion: question };
    }
    return { reflection: trimmed, nextQuestion: "" };
  }

  function logWeiterdenken(
    focus: unknown,
    focusedNodeIds: unknown,
    entry: { prompt: string; response: string; contextMeta: Record<string, unknown> },
  ): void {
    const logged = resolveDialogAnchor(focus, focusedNodeIds, "weiterdenken");
    if (!logged) {
      console.warn(`[weiterdenken] Anker abgelehnt, kein Korpus-Eintrag: ${String(focus).slice(0, 80)}`);
      return;
    }
    void logResonanz({
      endpoint: "dialog",
      anchor: logged.anchor,
      nodeIds: logged.nodeIds,
      prompt: entry.prompt,
      response: entry.response,
      model: "gemini-2.5-flash",
      contextMeta: entry.contextMeta,
    });
  }

  router.post("/api/weiterdenken", rateLimiter('weiterdenken', 30, 60 * 60_000), async (req, res) => {
    if (getKeys().length === 0) return res.status(503).json({ error: "Gemini API nicht konfiguriert." });

    const { focus, focusedNodeIds } = (req.body ?? {}) as {
      focus?: string;
      focusedNodeIds?: string[];
    };
    const prepared = prepareWeiterdenken(req.body ?? {});
    if ("error" in prepared) return res.status(400).json({ error: prepared.error });
    const { userAnswer, thread: safeThread, ragQuery, logPrompt, contents } = prepared;

    // RAG: auf der aktuellen Frage (bzw. der User-Antwort) ankern.
    const { passages, contextBlock } = await buildWerkContext(ragQuery, 4);

    // i18n
    const acceptLang = (req.headers["accept-language"] ?? "").toString();
    const referer = (req.headers["referer"] ?? "").toString();
    const isEnglish = /\/en(\/|$|\?)/.test(referer) || /^en/i.test(acceptLang.split(",")[0]?.trim() ?? "");
    const langAddition = isEnglish ? "\n\nIMPORTANT: Respond in English." : "";
    const system = weiterdenkenSystem(contextBlock, langAddition);

    try {
      const r = await generateFlashContent({
        system,
        contents,
        temperature: 0.85,
        maxTokens: PROSE_MAX_TOKENS,
        thinkingBudget: FLASH_THINKING_BUDGET,
      });
      if (!r.ok) return res.status(502).json({ error: scrub(flashErrorDetail(r)) });
      if (r.truncated && !endsComplete(r.text)) {
        return res.status(502).json({ error: "Die Antwort wurde unvollständig abgeschnitten. Bitte erneut versuchen." });
      }
      const full = r.text;

      const { reflection, nextQuestion } = splitClosingQuestion(full);
      recordCitations(full, passages.map(p => ({ source: p.source, id: p.id })));

      res.json({
        reflection,
        nextQuestion,
        citedChunks: passages.map(p => ({ source: p.source, id: p.id, chapter: p.chapter, partTitle: p.partTitle, chapterTitle: p.chapterTitle, endpoint: p.endpoint, prompt: p.prompt })),
      });

      // Korpus-Append: der weitergedachte Schritt als dialog-Eintrag.
      logWeiterdenken(focus, focusedNodeIds, {
        prompt: logPrompt,
        response: full,
        contextMeta: {
          kind: "weiterdenken",
          thread: safeThread.map(t => ({ role: t.role, text: t.text.slice(0, 800) })),
          had_user_answer: !!userAnswer,
          werk_passages: passages.map(p => ({ id: p.id, score: Number(p.score.toFixed(3)) })),
        },
      });
      return;
    } catch (err: unknown) {
      const msg = scrub(err instanceof Error ? err.message : String(err));
      return res.status(502).json({ error: `API-Fehler: ${msg}` });
    }
  });

  // ─── Weiterdenken Streaming (Phase 3, SSE) ───────────────────────────────
  // Additive Streaming-Variante von /api/weiterdenken. Streamt den rohen Text
  // token-weise; der Client spaltet am Stream-Ende in reflection + nextQuestion
  // (lib/closingQuestion.splitClosing, spiegelt splitClosingQuestion hier).
  router.post("/api/weiterdenken/stream", rateLimiter('weiterdenken', 30, 60 * 60_000), async (req, res) => {
    const apiKeys = getKeys();
    if (apiKeys.length === 0) return res.status(503).json({ error: "Gemini API nicht konfiguriert." });
    const { focus, focusedNodeIds } = (req.body ?? {}) as {
      focus?: string; focusedNodeIds?: string[];
    };
    const prepared = prepareWeiterdenken(req.body ?? {});
    if ("error" in prepared) return res.status(400).json({ error: prepared.error });
    const { userAnswer, thread: safeThread, ragQuery, logPrompt, contents } = prepared;
    const { passages, contextBlock } = await buildWerkContext(ragQuery, 4);
    const acceptLang = (req.headers["accept-language"] ?? "").toString();
    const referer = (req.headers["referer"] ?? "").toString();
    const isEnglish = /\/en(\/|$|\?)/.test(referer) || /^en/i.test(acceptLang.split(",")[0]?.trim() ?? "");
    const langAddition = isEnglish ? "\n\nIMPORTANT: Respond in English." : "";
    const system = weiterdenkenSystem(contextBlock, langAddition);

    const streamedFull = await streamGeminiSSE(res, {
      apiKeys,
      system,
      contents,
      generationConfig: { temperature: 0.85, maxOutputTokens: PROSE_MAX_TOKENS, ...(typeof FLASH_THINKING_BUDGET === "number" ? { thinkingConfig: { thinkingBudget: FLASH_THINKING_BUDGET } } : {}) },
    });
    if (streamedFull === null) return;  // Fehler-Event wurde bereits gesendet + res beendet
    const full = streamedFull.trim() || "(keine Reflexion)";
    if (!endsComplete(full)) {
      sseSend(res, { error: "Die Antwort wurde unvollständig abgeschnitten. Bitte erneut versuchen." });
      res.end();
      return;
    }
    sseSend(res, { done: true, citedChunks: passages.map(p => ({ source: p.source, id: p.id, chapter: p.chapter, partTitle: p.partTitle, chapterTitle: p.chapterTitle, endpoint: p.endpoint, prompt: p.prompt })) });
    res.end();
    logWeiterdenken(focus, focusedNodeIds, {
      prompt: logPrompt,
      response: full,
      contextMeta: {
        kind: "weiterdenken", streamed: true,
        thread: safeThread.map(t => ({ role: t.role, text: t.text.slice(0, 800) })),
        had_user_answer: !!userAnswer,
        werk_passages: passages.map(p => ({ id: p.id, score: Number(p.score.toFixed(3)) })),
      },
    });
  });
  return router;
}
