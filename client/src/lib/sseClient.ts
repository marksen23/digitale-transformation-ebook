/**
 * sseClient.ts — kleiner Client-Helfer zum Konsumieren der Server-SSE-Streams
 * (Phase 3). Ruft `onDelta` mit dem bisher akkumulierten Text bei jedem
 * Text-Delta. Liefert am Ende den Volltext + citedChunks.
 *
 * `ok: false` bedeutet: der Stream startete gar nicht (HTTP-Fehler / kein Body)
 * → der Aufrufer soll auf den nicht-gestreamten Endpoint zurückfallen.
 */
export interface SseResult {
  full: string;
  citedChunks: unknown[];
  error: string | null;
  /** true = Stream lief (auch wenn am Ende ein {error} kam); false = nie gestartet. */
  ok: boolean;
}

export async function consumeSSE(
  url: string,
  body: unknown,
  onDelta: (full: string) => void,
): Promise<SseResult> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok || !r.body) return { full: "", citedChunks: [], error: null, ok: false };
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "", acc = "";
    let cited: unknown[] = [];
    let error: string | null = null;
    let sawEvent = false;  // irgendein gültiges SSE-Event gesehen?
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const json = t.slice(5).trim();
        if (!json) continue;
        try {
          const ev = JSON.parse(json) as { delta?: string; done?: boolean; citedChunks?: unknown[]; error?: string };
          if (typeof ev.delta === "string") { sawEvent = true; acc += ev.delta; onDelta(acc); }
          else if (ev.done) { sawEvent = true; cited = Array.isArray(ev.citedChunks) ? ev.citedChunks : []; }
          else if (ev.error) { sawEvent = true; error = String(ev.error); }
        } catch { /* partieller Frame */ }
      }
    }
    // Leerer Stream (z.B. eine gecachte 0-Byte-Edge-Antwort) → ok:false,
    // damit der Aufrufer auf den nicht-gestreamten Endpoint zurückfällt.
    if (!sawEvent) return { full: "", citedChunks: [], error: null, ok: false };
    return { full: acc, citedChunks: cited, error, ok: true };
  } catch {
    return { full: "", citedChunks: [], error: null, ok: false };
  }
}
