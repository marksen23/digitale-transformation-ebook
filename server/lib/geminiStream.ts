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

interface StreamOpts {
  apiKey: string;
  system?: string;
  contents: unknown;
  generationConfig: Record<string, unknown>;
}

export function sseSend(res: Response, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function streamGeminiSSE(res: Response, opts: StreamOpts): Promise<string | null> {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${opts.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
          contents: opts.contents,
          generationConfig: opts.generationConfig,
        }),
      }
    );
    if (!upstream.ok || !upstream.body) {
      sseSend(res, { error: upstream.status === 429 ? "Zu viele Anfragen — bitte kurz warten." : `Fehler ${upstream.status}` });
      res.end();
      return null;
    }
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", full = "";
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
          const chunk = JSON.parse(json) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
          const delta = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (typeof delta === "string" && delta) { full += delta; sseSend(res, { delta }); }
        } catch { /* Frame über Lese-Grenze gesplittet — buffer trägt Rest */ }
      }
    }
    return full;
  } catch (err) {
    try { sseSend(res, { error: `API-Fehler: ${err instanceof Error ? err.message : String(err)}` }); res.end(); } catch { /* schon geschlossen */ }
    return null;
  }
}
