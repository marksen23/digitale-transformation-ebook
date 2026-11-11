/**
 * Anker fürs Korpus-Logging.
 *
 * Der Validator (scripts/lib/resonanzen-utils.ts, gespiegelt in
 * validate-resonanzen.ts) lässt im Dialog-Tail nur [a-zäöüß0-9_+-] zu.
 * Freitext aus focus („Freiheit, Gelassenheit, Werden“) wird auf bekannte
 * Begriffs-IDs abgebildet, sonst slugifiziert, und sonst abgelehnt.
 */
import { NODES } from "../../client/src/data/conceptGraph.js";
import { passesSpamFilter } from "./resonanz-log-utils.js";

const TAIL_MAX = 80;
const DIALOG_TAIL = /^[a-zäöüß0-9_+-]+$/i;
const FALLBACK_TAILS = new Set(["weiterdenken", "freier"]);

export const DIALOG_PERSIST_PROMPT_MAX = 8000;
export const DIALOG_PERSIST_RESPONSE_MAX = 48_000;
export const DIALOG_PERSIST_TURNS_MAX = 24;

function fold(s: string): string {
  return s.toLowerCase().replace(/[\s\-_./]+/g, "");
}

const conceptByKey = new Map<string, string>();
for (const n of NODES) {
  const put = (key: string) => {
    if (key && !conceptByKey.has(key)) conceptByKey.set(key, n.id);
  };
  put(n.id.toLowerCase());
  put(fold(n.id));
  put(fold(n.fullLabel));
  put(fold(n.label.replace(/\n/g, "")));
}

function knownId(token: string): string | null {
  const t = token.trim();
  if (!t) return null;
  return conceptByKey.get(t.toLowerCase()) ?? conceptByKey.get(fold(t)) ?? null;
}

function unique(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 8) break;
  }
  return out;
}

function asNodeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = knownId(item);
    if (id) ids.push(id);
  }
  return unique(ids);
}

function splitFocus(raw: string): string[] {
  const parts = raw
    .split(/\s*(?:,|;|·|\/|\+)\s*|\s+und\s+/i)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [raw.trim()];
}

/** Freitext → Validator-Tail. Doppelpunkt wird Bindestrich, Aufzählungen „+“. */
export function slugifyAnchorTail(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/:/g, "-")
    .replace(/\s+und\s+/g, "+")
    .replace(/[,;·/|]+/g, "+")
    .replace(/\s+/g, "+")
    .replace(/[^a-zäöüß0-9_+-]/g, "")
    .replace(/\++/g, "+")
    .replace(/-+/g, "-")
    .replace(/^[+-]+|[+-]+$/g, "")
    .slice(0, TAIL_MAX);
}

function anchorFromIds(ids: string[]): string {
  return `dialog:${ids.join("+")}`;
}

/**
 * focus darf ein String (Labels, IDs, schon mit dialog:-Präfix) oder leer sein.
 * nodeIds sind die vom Client mitgeschickten Begriffs-IDs.
 * null = kein gültiger Anker, der Eintrag darf nicht geschrieben werden.
 */
export function normalizeDialogAnchor(
  focus: unknown,
  nodeIds: unknown,
): { anchor: string; nodeIds: string[] } | null {
  const knownNodes = asNodeIds(nodeIds);
  let raw = typeof focus === "string" ? focus.trim() : "";
  if (raw.toLowerCase().startsWith("dialog:")) raw = raw.slice("dialog:".length).trim();

  if (!raw) {
    if (knownNodes.length === 0) return null;
    return { anchor: anchorFromIds(knownNodes), nodeIds: knownNodes };
  }

  if (FALLBACK_TAILS.has(raw.toLowerCase())) {
    return { anchor: `dialog:${raw.toLowerCase()}`, nodeIds: knownNodes };
  }

  const mapped = unique(splitFocus(raw).map(knownId).filter((id): id is string => !!id));
  if (mapped.length > 0) {
    return { anchor: anchorFromIds(mapped), nodeIds: unique([...mapped, ...knownNodes]) };
  }
  if (knownNodes.length > 0) {
    return { anchor: anchorFromIds(knownNodes), nodeIds: knownNodes };
  }

  const slug = slugifyAnchorTail(raw);
  if (slug.length >= 2 && DIALOG_TAIL.test(slug)) {
    return { anchor: `dialog:${slug}`, nodeIds: [] };
  }
  return null;
}

/**
 * Leerer focus fällt auf den Endpoint-Default (weiterdenken / freier).
 * Ein gesetzter focus, der sich nicht normalisieren lässt, wird abgelehnt.
 */
export function resolveDialogAnchor(
  focus: unknown,
  nodeIds: unknown,
  fallback: "weiterdenken" | "freier",
): { anchor: string; nodeIds: string[] } | null {
  const normalized = normalizeDialogAnchor(focus, nodeIds);
  if (normalized) return normalized;
  const hasFocus = typeof focus === "string" && focus.trim().length > 0;
  if (hasFocus) return null;
  return { anchor: `dialog:${fallback}`, nodeIds: [] };
}

function stripTail(anchor: string, prefix: string, extra?: (tail: string) => string): string {
  if (!anchor.startsWith(prefix)) return "";
  const prepared = extra ? extra(anchor.slice(prefix.length)) : anchor.slice(prefix.length);
  return prepared
    .toLowerCase()
    .replace(/[^a-z0-9äöüß_+-]/g, "")
    .replace(/\++/g, "+")
    .replace(/-+/g, "-")
    .replace(/^[+-]+|[+-]+$/g, "")
    .slice(0, 120);
}

/**
 * Letzte Schranke vor dem Schreiben: jeder Endpoint-Anker muss dem
 * Validator-Schema genügen. Client-Reste (Großbuchstaben, Leerzeichen,
 * Satzzeichen) werden normalisiert oder der Write abgelehnt.
 */
export function prepareCorpusAnchor(
  endpoint: string,
  anchor: string,
  nodeIds?: string[],
): { anchor: string; nodeIds: string[] } | null {
  const ids = nodeIds ?? [];
  if (endpoint === "dialog") return normalizeDialogAnchor(anchor, ids);
  if (endpoint === "graph-chat") return anchor === "graph" ? { anchor, nodeIds: ids } : null;
  if (endpoint === "enkidu") return anchor === "enkidu" ? { anchor, nodeIds: ids } : null;
  if (endpoint === "passage") {
    const tail = anchor.startsWith("passage:") ? anchor.slice("passage:".length) : "";
    const hex = tail.toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 8);
    if (hex.length !== 8) return null;
    return { anchor: `passage:${hex}`, nodeIds: ids };
  }
  if (endpoint === "chapter") {
    const tail = stripTail(anchor, "chapter:", raw => raw.replace(/_/g, "-")).replace(/[_+]/g, "");
    if (!tail || !/^[a-z0-9äöüß-]+$/.test(tail)) return null;
    return { anchor: `chapter:${tail}`, nodeIds: ids };
  }
  if (endpoint === "analyse" || endpoint === "path-analyse" || endpoint === "translate") {
    const tail = stripTail(anchor, `${endpoint}:`);
    if (!tail || !/^[a-z0-9äöüß_+-]+$/.test(tail)) return null;
    return { anchor: `${endpoint}:${tail}`, nodeIds: ids };
  }
  return null;
}

export interface PreparedDialogPersist {
  anchor: string;
  nodeIds: string[];
  prompt: string;
  response: string;
  sessionId: string | null;
  focus: string | null;
  turns: Array<{ role: "user" | "model"; text: string }>;
}

/** Validiert /api/dialog/persist, bevor irgendetwas ins Korpus geht. */
export function prepareDialogPersist(body: unknown):
  | { ok: true; value: PreparedDialogPersist }
  | { ok: false; error: string } {
  const rec = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const turnsRaw = rec.turns;
  if (!Array.isArray(turnsRaw) || turnsRaw.length < 2) {
    return { ok: false, error: "Mindestens 2 Turns (1 User + 1 Antwort) nötig" };
  }
  if (turnsRaw.length > DIALOG_PERSIST_TURNS_MAX) {
    return { ok: false, error: "Zu viele Turns — Limit 24" };
  }
  const lastRaw = turnsRaw[turnsRaw.length - 1];
  if (!lastRaw || typeof lastRaw !== "object" || (lastRaw as { role?: unknown }).role !== "model") {
    return { ok: false, error: "Letzter Turn muss eine Model-Antwort sein" };
  }

  const turns: Array<{ role: "user" | "model"; text: string }> = [];
  for (const item of turnsRaw) {
    if (!item || typeof item !== "object") return { ok: false, error: "Turn ist ungültig" };
    const role = (item as { role?: unknown }).role;
    const text = (item as { text?: unknown }).text;
    if ((role !== "user" && role !== "model") || typeof text !== "string") {
      return { ok: false, error: "Turn ist ungültig" };
    }
    const trimmed = text.trim();
    const max = role === "model" ? DIALOG_PERSIST_RESPONSE_MAX : DIALOG_PERSIST_PROMPT_MAX;
    if (trimmed.length > max) {
      return { ok: false, error: role === "model" ? "Antwort zu lang" : "Frage zu lang" };
    }
    turns.push({ role, text: trimmed });
  }

  const lastUser = [...turns].reverse().find(t => t.role === "user");
  if (!lastUser) return { ok: false, error: "Keine User-Anfrage gefunden" };
  const response = turns[turns.length - 1].text;
  if (!passesSpamFilter({ endpoint: "dialog", prompt: lastUser.text, response })) {
    return { ok: false, error: "Frage oder Antwort genügt dem Korpus-Filter nicht" };
  }

  const resolved = resolveDialogAnchor(rec.focus, rec.focusedNodeIds, "freier");
  if (!resolved) return { ok: false, error: "focus ergibt keinen gültigen Anker" };

  const sessionId = typeof rec.sessionId === "string" && rec.sessionId.trim()
    ? rec.sessionId.trim().replace(/\s+/g, " ").slice(0, 80)
    : null;
  const focus = typeof rec.focus === "string" && rec.focus.trim()
    ? rec.focus.trim().replace(/\s+/g, " ").slice(0, 200)
    : null;

  return {
    ok: true,
    value: {
      anchor: resolved.anchor,
      nodeIds: resolved.nodeIds,
      prompt: lastUser.text,
      response,
      sessionId,
      focus,
      turns,
    },
  };
}
