/**
 * geminiStream.ts — geteilter SSE-Helfer für token-weises Streaming von Gemini
 * (Phase 3). Setzt die SSE-Header, ruft streamGenerateContent, leitet Text-
 * Deltas als `data: {"delta": "..."}` an den Client und gibt den vollständigen
 * Text zurück. Bei Fehler ist bereits ein `{error}`-Event gesendet + res
 * beendet, und es wird null zurückgegeben.
 *
 * Der Aufrufer baut Prompt/Kontext, ruft streamGeminiSSE, und sendet danach das
 * abschließende `{done, ...}`-Event (sseSend) + res.end() + Logging. So bleibt
 * die endpoint-spezifische Logik (RAG, Citations, Korpus-Append) beim Aufrufer.
 */
import type { Response } from "express";
import { geminiAuthHeaders, geminiStreamUrl, redactSecrets } from "./geminiHttp.js";
import { classifyError, type EmbedErrorClass } from "./embeddingClient.js";
import { generateFlashContent, spliceContinuation } from "./geminiText.js";

interface StreamOpts {
  /** Alle verfügbaren Keys (getKeys()) — für Failover VOR dem Header-Flush. */
  apiKeys: string[];
  system?: string;
  contents: unknown;
  generationConfig: Record<string, unknown>;
  model?: string;
}

export function sseSend(res: Response, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function streamGeminiSSE(res: Response, opts: StreamOpts): Promise<string | null> {
  // Thinking-Tokens zählen bei Gemini gegen maxOutputTokens. Liegt ein
  // thinkingBudget im generationConfig, wird es auf das sichtbare Budget
  // addiert, damit die Prosa nicht vom Reasoning aufgefressen wird.
  const think = (opts.generationConfig.thinkingConfig as { thinkingBudget?: number } | undefined)?.thinkingBudget;
  const baseOut = typeof opts.generationConfig.maxOutputTokens === "number" ? opts.generationConfig.maxOutputTokens : 4096;
  const generationConfig = {
    ...opts.generationConfig,
    maxOutputTokens: baseOut + (typeof think === "number" && think > 0 ? think : 0),
  };
  const body = JSON.stringify({
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    contents: opts.contents,
    generationConfig,
  });

  // Upstream mit Key-Failover öffnen, BEVOR die SSE-Header geflusht sind — so
  // kann ein billing/quota/auth-blockierter Primärkey noch auf den Fallback
  // (anderes GCP-Projekt) rotieren, statt den Stream sofort als Fehler zu enden.
  const keys = opts.apiKeys;
  const url = opts.model ? geminiStreamUrl(opts.model) : geminiStreamUrl();
  let upstream: Awaited<ReturnType<typeof fetch>> | null = null;
  let lastStatus = 0;
  let lastCls: EmbedErrorClass | null = null;
  for (let i = 0; i < keys.length; i++) {
    try {
      const r = await fetch(url, { method: "POST", headers: geminiAuthHeaders(keys[i]), body });
      if (r.ok && r.body) { upstream = r; break; }
      lastStatus = r.status;
      const errText = await r.text().catch(() => "");
      const cls = classifyError(r.status, errText);
      lastCls = cls;
      if (cls === "billing" || cls === "quota" || cls === "auth") continue; // nächster Key
      break; // andere Fehler (400 etc.) → nicht durch Rotation lösbar
    } catch { /* Netzwerkfehler — nächsten Key versuchen */ }
  }

  // Ab hier ist die Antwort ein SSE-Stream.
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  // no-store (nicht no-cache!): no-cache erlaubt Speichern + Revalidieren, und
  // Netlify Edge servierte dann intermittierend eine leere gecachte Antwort
  // (Netlify-Vary: query ignoriert den POST-Body). no-store verbietet Speichern.
  res.setHeader("Cache-Control", "no-store, no-transform");
  res.setHeader("Netlify-CDN-Cache-Control", "no-store");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  if (!upstream || !upstream.body) {
    sseSend(res, {
      error: lastCls === "billing" ? "KI-Kontingent derzeit aufgebraucht — bitte später erneut versuchen."
        : lastStatus === 429 ? "Zu viele Anfragen — bitte kurz warten."
        : keys.length === 0 ? "Gemini API nicht konfiguriert."
        : `Fehler ${lastStatus || "—"}`,
    });
    res.end();
    return null;
  }

  try {
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", full = "";
    let finishReason: string | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const json = t.slice(5).trim();
        if (!json || json === "[DONE]") continue;
        try {
          const chunk = JSON.parse(json) as { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }> };
          const cand = chunk?.candidates?.[0];
          if (cand?.finishReason) finishReason = cand.finishReason;
          // ALLE Text-Parts joinen (nicht nur parts[0]) — Thinking-Modelle
          // können mehrere Parts pro Chunk liefern.
          const parts = cand?.content?.parts ?? [];
          const delta = parts.map(p => (typeof p?.text === "string" ? p.text : "")).join("");
          if (delta) { full += delta; sseSend(res, { delta }); }
        } catch { /* Frame über Lese-Grenze gesplittet — buffer trägt Rest */ }
      }
    }
    // Stream am Token-Limit: einmal nicht-gestreamt fortsetzen und den Rest
    // als weiteres Delta schicken, bevor der Aufrufer {done} sendet.
    if (finishReason === "MAX_TOKENS" && full.trim()) {
      const cont = await generateFlashContent({
        system: opts.system,
        contents: [{ role: "user", parts: [{ text: `Der folgende Text wurde wegen einer Längengrenze abgeschnitten. Setze ihn nahtlos fort, beginnend genau an der Abbruchstelle, auch mitten im Wort. Wiederhole nichts. Kein Vorspann. Der letzte Satz endet mit . ? oder !.\n\nABBRUCHSTELLE:\n${full.slice(-1600)}` }] }],
        temperature: 0.3,
        maxTokens: 4096,
        thinkingBudget: 0,
      });
      if (cont.ok && cont.text) {
        const merged = spliceContinuation(full, cont.text);
        const extra = merged.slice(full.length);
        if (extra) { full = merged; sseSend(res, { delta: extra }); }
      }
    }
    return full;
  } catch (err) {
    try { sseSend(res, { error: `API-Fehler: ${redactSecrets(err instanceof Error ? err.message : String(err)).slice(0, 300)}` }); res.end(); } catch { /* schon geschlossen */ }
    return null;
  }
}
