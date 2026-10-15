/**
 * Gesprächsverläufe für Enkidu und den Graph-Chat.
 *
 * Der Client schickt die bisherige Unterhaltung mit. Assistant-Turns sind
 * damit kein Server-Gedächtnis, sondern mitgelieferter Text. Jede Blase wird
 * begrenzt und als <USER_INPUT> gerahmt, unbekannte Rollen fallen weg.
 */

import { wrapUntrusted } from "./promptSafety.js";

export const CONVERSATION_TURN_MAX = 6000;
export const CONVERSATION_TURNS_MAX = 17;

export interface ConversationTurn {
  role: "user" | "model";
  text: string;
}

export interface ConversationContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export interface PreparedConversation {
  turns: ConversationTurn[];
  contents: ConversationContent[];
  lastUserText: string;
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function prepareConversation(input: {
  messages: unknown;
  textKey?: "content" | "text";
  userRoles?: readonly string[];
  assistantRoles?: readonly string[];
  maxTurns?: number;
  maxChars?: number;
  skipError?: boolean;
  emptyError?: string;
}): PreparedConversation | { error: string } {
  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    return { error: input.emptyError ?? "messages-Array ist erforderlich." };
  }
  const textKey = input.textKey ?? "content";
  const userRoles = new Set(input.userRoles ?? ["user"]);
  const assistantRoles = new Set(input.assistantRoles ?? ["assistant", "model"]);
  const maxTurns = input.maxTurns ?? CONVERSATION_TURNS_MAX;
  const maxChars = input.maxChars ?? CONVERSATION_TURN_MAX;
  const turns: ConversationTurn[] = [];

  for (const item of input.messages) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { role?: unknown; error?: unknown };
    if (input.skipError && rec.error) continue;
    if (typeof rec.role !== "string") continue;
    const role = userRoles.has(rec.role) ? "user" : assistantRoles.has(rec.role) ? "model" : null;
    if (!role) continue;
    const text = clip((rec as Record<string, unknown>)[textKey], maxChars);
    if (!text) continue;
    turns.push({ role, text });
  }

  const kept = turns.slice(-maxTurns);
  const last = kept[kept.length - 1];
  if (!last || last.role !== "user") {
    return { error: "Letzte Nachricht muss vom Nutzer sein." };
  }

  return {
    turns: kept,
    lastUserText: last.text,
    contents: kept.map((t) => ({
      role: t.role,
      parts: [{ text: wrapUntrusted(t.text) }],
    })),
  };
}

/** Graph-Chat: history plus die aktuelle Nachricht, dieselbe Umrahmung. */
export function prepareGraphChat(input: {
  message?: unknown;
  history?: unknown;
}): PreparedConversation | { error: string } {
  const message = clip(input.message, 4000);
  if (!message) return { error: "Nachricht fehlt." };
  const history = Array.isArray(input.history) ? input.history : [];
  return prepareConversation({
    messages: [...history, { role: "user", text: message }],
    textKey: "text",
    userRoles: ["user"],
    assistantRoles: ["model"],
    maxTurns: 21,
    maxChars: 8000,
    emptyError: "Nachricht fehlt.",
  });
}
