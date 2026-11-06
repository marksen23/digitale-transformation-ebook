/**
 * geminiText.ts — gemeinsamer Gemini-Text-Aufruf (generateContent).
 *
 * Drop-in zu claudeClient.ts:callClaude (identische Signatur), damit Pre-Scoring
 * + Master-Synthese den LLM-Anbieter per ENV wählen können. Konsolidiert alles
 * auf Gemini (eine API, eine Rechnung) — der user-seitige Generator ist
 * `gemini-2.5-flash`; als unabhängiger RICHTER nutzen wir per Default
 * `gemini-2.5-pro` (stärker, anderes Modell → kein Selbst-Bewertungs-Bias).
 *
 * Request-/Response-Form wie die bewährten Endpunkte (server/index.ts).
 * Key-Failover via getKeys()/classifyError() aus embeddingClient — Keys der
 * Reihe nach, Rotation bei billing/quota/auth. Wirft nie; null bei Fehler.
 */
import { getKeys, classifyError } from "./embeddingClient.js";
import { geminiAuthHeaders, geminiGenerateUrl, redactSecrets } from "./geminiHttp.js";

export const DEFAULT_GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-2.5-pro";

let _claudeFailLogged = 0;
const FAIL_LOG_LIMIT = 3;

// Letzter Fehler des jüngsten callGemini — damit Endpunkte den echten Grund
// (401/429/billing/quota) sichtbar machen können, statt nur null zu schlucken.
let _lastError: string | null = null;
export function getLastGeminiError(): string | null { return _lastError; }

export function isGeminiAvailable(): boolean { return getKeys().length > 0; }

/**
 * Sichtbares Ausgabe-Budget plus Denk-Budget.
 * Bei Gemini zählen Thinking-Tokens gegen maxOutputTokens. Liegt das Denk-Budget
 * im selben Kontingent, wird die sichtbare Prosa abgeschnitten (finishReason
 * MAX_TOKENS), oft mitten im Satz. Das Denk-Budget wird deshalb obendrauf gelegt:
 * das angeforderte maxTokens bleibt der Prosa erhalten.
 */
export function outputTokenBudget(maxTokens: number | undefined, thinkingBudget: number | undefined): number {
  const out = maxTokens ?? 4096;
  const think = typeof thinkingBudget === "number" && thinkingBudget > 0 ? thinkingBudget : 0;
  return out + think;
}

/** true, wenn der Text nach abstreifbaren Markdown-Hüllen mit Satzschluss endet. */
export function endsComplete(text: string): boolean {
  const t = text.trim().replace(/[\s*_`"'“”„»«)\]>]+$/, "");
  return /[.!?…]$/.test(t);
}

/**
 * Hängt eine Fortsetzung an einen abgeschnittenen Text.
 * Überlappung (das Modell wiederholt das Ende) wird entfernt; ein mitten im
 * Wort abgebrochenes Fragment wird ohne Leerzeichen weitergeführt.
 */
export function spliceContinuation(partial: string, extra: string): string {
  const a = partial.replace(/\s+$/, "");
  let b = extra.replace(/^\s+/, "");
  if (!a) return b;
  if (!b) return a;
  const probeLen = Math.min(80, a.length);
  if (probeLen >= 24) {
    const probe = a.slice(-probeLen);
    const idx = b.indexOf(probe);
    if (idx >= 0 && idx < 240) {
      const raw = b.slice(idx + probe.length);
      const hadBreak = /^\s/.test(raw);
      b = raw.replace(/^\s+/, "");
      if (!b) return a;
      return hadBreak ? `${a} ${b}` : a + b;
    }
  }
  if (/[„"«]$/.test(a)) return a + b;
  const openWord = !/[\s.!?…,;:–—)\]»«]$/.test(a);
  if (!openWord) {
    if (/[.!?…:]$/.test(a)) return `${a}\n\n${b}`;
    return `${a} ${b}`;
  }
  const lastTok = a.match(/[A-Za-zÄÖÜäöüß]+$/)?.[0] ?? "";
  const nextTok = b.match(/^[a-zäöüß]+/)?.[0] ?? "";
  const suffix = /^(ität|ung|keit|lich|ische|ischen|ter|te|ten|ße|ßen|en|er|es|em|e)$/.test(nextTok)
    || lastTok.length > 0 && lastTok.length <= 3;
  if (suffix && /^[a-zäöü]/.test(b)) return a + b;
  return `${a} ${b}`;
}

const CONTINUE_TRIES = 2;

function continuationPrompt(partial: string): string {
  const tail = partial.slice(-1600);
  return [
    "Der folgende Text wurde wegen einer Längengrenze abgeschnitten.",
    "Setze ihn nahtlos fort, beginnend genau an der Abbruchstelle, auch mitten im Wort.",
    "Wiederhole den schon geschriebenen Text nicht. Kein Vorspann, keine Entschuldigung.",
    "Bringe den Gedanken zu einem vollständigen Ende: der letzte Satz schließt mit . ? oder !.",
    "Keine offene Aufzählung, kein abgebrochenes Wort.",
    "",
    "ABBRUCHSTELLE:",
    tail,
  ].join("\n");
}

/**
 * Ruft Gemini mit system + user-Prompt auf. Returnt den Text-Output oder null
 * bei Fehler/fehlendem Key. Wirft nie. Signatur identisch zu callClaude.
 */
export async function callGemini(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  /** gemini-2.5-Thinking-Budget in Tokens. Niedriger = schneller/billiger.
   *  Für simple Rating-Tasks (Pre-Scoring) reichen ~512. Weggelassen = 0:
   *  dynamisches Thinking würde das Ausgabe-Budget auffressen. Das gesetzte
   *  Budget wird von outputTokenBudget zusätzlich zu maxTokens gerechnet. */
  thinkingBudget?: number;
}): Promise<string | null> {
  const keys = getKeys();
  if (keys.length === 0) {
    _lastError = "Kein GEMINI_API_KEY[S]/FALLBACK gesetzt";
    if (_claudeFailLogged < FAIL_LOG_LIMIT) { _claudeFailLogged++; console.warn(`[callGemini] ${_lastError}`); }
    return null;
  }
  const model = opts.model?.trim() || DEFAULT_GEMINI_TEXT_MODEL;
  // Weggelassenes thinkingBudget heißt 0, nicht Modell-Default. Dynamisches
  // Thinking von gemini-2.5-pro frisst sonst das gesamte maxOutputTokens und
  // die sichtbare Antwort kommt leer oder abgeschnitten zurück.
  const thinking = typeof opts.thinkingBudget === "number" ? opts.thinkingBudget : 0;
  const first = await geminiOnce({
    model,
    system: opts.system,
    contents: [{ role: "user", parts: [{ text: opts.user }] }],
    temperature: opts.temperature ?? 0.7,
    maxTokens: outputTokenBudget(opts.maxTokens, thinking),
    thinkingBudget: thinking,
  });
  if (!first.ok && !first.text) {
    _lastError = (first.errorDetail ?? "unbekannt").slice(0, 300);
    if (_claudeFailLogged < FAIL_LOG_LIMIT) {
      _claudeFailLogged++;
      console.error(`[callGemini] failed (model=${model}): ${_lastError}`);
    }
    return null;
  }
  const finished = await continueUntilComplete(first, async (partial) => geminiOnce({
    model,
    system: opts.system,
    contents: [{ role: "user", parts: [{ text: continuationPrompt(partial) }] }],
    temperature: 0.3,
    maxTokens: 4096,
    thinkingBudget: 0,
  }));
  if (!finished.text) {
    _lastError = (first.errorDetail ?? "leere Antwort").slice(0, 300);
    return null;
  }
  _lastError = null;
  return finished.text;
}

interface GeminiOnceResult {
  ok: boolean;
  text: string;
  finishReason: string | null;
  status: number | null;
  errorDetail: string | null;
}

/** Ein generateContent-Aufruf, ohne Fortsetzungs-Schleife. */
async function geminiOnce(opts: {
  model: string;
  system?: string;
  contents: unknown;
  temperature: number;
  maxTokens: number;
  thinkingBudget: number;
}): Promise<GeminiOnceResult> {
  const keys = getKeys();
  const body = JSON.stringify({
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    contents: opts.contents,
    generationConfig: {
      temperature: opts.temperature,
      maxOutputTokens: opts.maxTokens,
      thinkingConfig: { thinkingBudget: opts.thinkingBudget },
    },
  });

  let lastErr = "unbekannt";
  let lastStatus: number | null = null;
  // Keys der Reihe nach probieren; bei billing/quota/auth zum nächsten rotieren.
  for (let i = 0; i < keys.length; i++) {
    try {
      const res = await fetch(
        geminiGenerateUrl(opts.model),
        { method: "POST", headers: geminiAuthHeaders(keys[i]), body },
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        let msg = errText;
        try { msg = JSON.parse(errText)?.error?.message || errText; } catch { /* roher Text */ }
        lastStatus = res.status;
        lastErr = redactSecrets(`HTTP ${res.status}: ${msg}`).slice(0, 300);
        const cls = classifyError(res.status, errText);
        // bei billing/quota/auth: nächster Key könnte auf anderem GCP-Projekt liegen
        if (cls === "billing" || cls === "quota" || cls === "auth") continue;
        break; // andere Fehler (400 Bad Request etc.) → nicht durch Rotation lösbar
      }
      const data = await res.json();
      const cand = data?.candidates?.[0];
      // Robust: bei Thinking-Modellen (gemini-2.5-pro) kann ein "thought"-Part
      // vor dem eigentlichen Text stehen — alle Text-Parts joinen statt parts[0].
      const parts: Array<{ text?: string }> = cand?.content?.parts ?? [];
      const text = parts.map(p => (typeof p?.text === "string" ? p.text : "")).join("").trim();
      const finishReason: string | null = cand?.finishReason ?? null;
      if (text) return { ok: true, text, finishReason, status: res.status, errorDetail: null };
      // Häufigste Ursache: finishReason=MAX_TOKENS → maxOutputTokens zu niedrig,
      // weil die Denk-Tokens (thinking) das Budget aufbrauchen.
      lastErr = `leere Antwort (finishReason=${finishReason ?? "?"}) — bei gemini-2.5-pro meist maxOutputTokens zu niedrig (thinking)`;
      return { ok: false, text: "", finishReason, status: res.status, errorDetail: lastErr };
    } catch (err) {
      lastErr = redactSecrets(err instanceof Error ? err.message : String(err));
    }
  }

  return { ok: false, text: "", finishReason: null, status: lastStatus, errorDetail: lastErr.slice(0, 300) };
}

/** Bei MAX_TOKENS ein- bis zweimal nahtlos fortsetzen, damit der Satz zu Ende kommt. */
async function continueUntilComplete(
  seed: GeminiOnceResult,
  again: (partial: string) => Promise<GeminiOnceResult>,
): Promise<{ text: string; finishReason: string | null; truncated: boolean }> {
  let text = seed.text;
  let finish = seed.finishReason;
  for (let i = 0; i < CONTINUE_TRIES && finish === "MAX_TOKENS" && text; i++) {
    const next = await again(text);
    if (!next.text) break;
    const merged = spliceContinuation(text, next.text);
    if (merged.trim() === text.trim()) break;
    text = merged;
    finish = next.finishReason;
    if (endsComplete(text) && finish !== "MAX_TOKENS") break;
  }
  return {
    text,
    finishReason: finish,
    truncated: finish === "MAX_TOKENS" && !endsComplete(text),
  };
}

// Modell der user-seitigen KI-Flächen (analyse, dialog, graph-chat, ask, …).
// Bewusst `flash` (schnell, günstig) — im Gegensatz zum `pro`-RICHTER oben.
export const USER_FLASH_MODEL = process.env.GEMINI_USER_MODEL?.trim() || "gemini-2.5-flash";

/**
 * Joint ALLE Text-Parts eines Gemini-Kandidaten. Thinking-Modelle liefern u.U.
 * mehrere Parts (z.B. ein „thought"-Part vor dem Text) — `parts[0].text` allein
 * verliert dann Text oder ist leer. Immer alle Parts konkatenieren.
 */
export function joinGeminiParts(cand: unknown): string {
  const parts = (cand as { content?: { parts?: Array<{ text?: unknown }> } } | null | undefined)
    ?.content?.parts ?? [];
  return parts.map(p => (typeof p?.text === "string" ? p.text : "")).join("");
}

export interface FlashGenResult {
  ok: boolean;
  /** Vollständiger Antworttext (alle Parts gejoint, getrimmt). */
  text: string;
  /** Gemini-finishReason des Kandidaten (STOP | MAX_TOKENS | SAFETY | …). */
  finishReason: string | null;
  /** true wenn finishReason === "MAX_TOKENS" — Antwort wurde abgeschnitten. */
  truncated: boolean;
  /** HTTP-Status des letzten Versuchs (für endpoint-spezifisches Messaging). */
  status: number | null;
  errorDetail: string | null;
}

/**
 * Nicht-gestreamter generateContent-Aufruf für die user-seitigen KI-Flächen.
 * Drei Härtungen gegenüber dem früheren Inline-fetch-Muster:
 *   1. Multi-Key-Failover (getKeys + classifyError) — ein billing/quota/auth-
 *      blockierter Primärkey rotiert auf GEMINI_API_KEY_FALLBACK (anderes
 *      GCP-Projekt). So bleibt der Endpunkt „bedienbar".
 *   2. Alle Text-Parts werden gejoint (joinGeminiParts) → vollständige Antwort.
 *   3. finishReason/truncated werden gemeldet, damit Abschneiden sichtbar wird.
 * Key liegt via geminiAuthHeaders im Header (nicht in der URL). Wirft nie;
 * der Aufrufer baut aus status/errorDetail seine Fehlermeldung.
 */
export async function generateFlashContent(opts: {
  model?: string;
  system?: string;
  contents: unknown;
  temperature?: number;
  maxTokens?: number;
  /** number => thinkingConfig.thinkingBudget; weggelassen => 0 (Prosa, kein Thinking-Fraß). */
  thinkingBudget?: number;
}): Promise<FlashGenResult> {
  if (getKeys().length === 0) {
    return {
      ok: false, text: "", finishReason: null, truncated: false, status: null,
      errorDetail: "Kein GEMINI_API_KEY[S]/FALLBACK gesetzt",
    };
  }
  const model = opts.model?.trim() || USER_FLASH_MODEL;
  const thinking = typeof opts.thinkingBudget === "number" ? opts.thinkingBudget : 0;
  const temperature = opts.temperature ?? 0.7;
  const first = await geminiOnce({
    model,
    system: opts.system,
    contents: opts.contents,
    temperature,
    maxTokens: outputTokenBudget(opts.maxTokens, thinking),
    thinkingBudget: thinking,
  });
  if (!first.ok && !first.text) {
    return {
      ok: false, text: "", finishReason: first.finishReason, truncated: false,
      status: first.status, errorDetail: first.errorDetail,
    };
  }
  const finished = await continueUntilComplete(first, (partial) => geminiOnce({
    model,
    system: opts.system,
    contents: [{ role: "user", parts: [{ text: continuationPrompt(partial) }] }],
    temperature: Math.min(temperature, 0.4),
    maxTokens: 4096,
    thinkingBudget: 0,
  }));
  return {
    ok: !!finished.text,
    text: finished.text,
    finishReason: finished.finishReason,
    truncated: finished.truncated,
    status: first.status,
    errorDetail: finished.text ? null : (first.errorDetail ?? "leere Antwort"),
  };
}
