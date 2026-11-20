/**
 * Newsletter-Adressen. Liegen nur auf dem Server, nie im öffentlichen
 * Korpus und nie unter client/public. Pfad über NEWSLETTER_STORE_PATH,
 * sonst data/newsletter/subscribers.json (gitignoriert).
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type Cadence = "daily" | "weekly";
export type SubscriberStatus = "pending" | "confirmed";

export interface Subscriber {
  email: string;
  status: SubscriberStatus;
  cadence: Cadence;
  confirmToken: string;
  unsubscribeToken: string;
  createdAt: string;
  consentAt: string;
  confirmedAt: string | null;
}

export interface DigestMarks {
  dailySent: string | null;
  weeklySent: string | null;
  dailyLogged: string | null;
  weeklyLogged: string | null;
  /** cadence:YYYY-MM-DD → Adressen, die diese Ausgabe wirklich bekommen haben. */
  sentTo: Record<string, string[]>;
}

export interface NewsletterState {
  subscribers: Subscriber[];
  marks: DigestMarks;
}

export function defaultNewsletterStorePath(): string {
  return path.join(process.cwd(), "data", "newsletter", "subscribers.json");
}

export function newsletterStorePath(): string {
  const configured = (process.env.NEWSLETTER_STORE_PATH ?? "").trim();
  return configured || defaultNewsletterStorePath();
}

function emptyMarks(): DigestMarks {
  return { dailySent: null, weeklySent: null, dailyLogged: null, weeklyLogged: null, sentTo: {} };
}

function emptyState(): NewsletterState {
  return { subscribers: [], marks: emptyMarks() };
}

function asCadence(value: unknown): Cadence | null {
  return value === "daily" || value === "weekly" ? value : null;
}

function normalize(raw: unknown): NewsletterState {
  if (!raw || typeof raw !== "object") throw new Error("Newsletter-Speicher unlesbar");
  const rec = raw as { subscribers?: unknown; marks?: Partial<DigestMarks> };
  if (!Array.isArray(rec.subscribers)) throw new Error("Newsletter-Speicher unlesbar");
  const subscribers: Subscriber[] = [];
  for (const item of rec.subscribers) {
    if (!item || typeof item !== "object") continue;
    const s = item as Partial<Subscriber>;
    const cadence = asCadence(s.cadence);
    if (!s.email || !s.confirmToken || !s.unsubscribeToken || !cadence) continue;
    if (s.status !== "pending" && s.status !== "confirmed") continue;
    subscribers.push({
      email: s.email,
      status: s.status,
      cadence,
      confirmToken: s.confirmToken,
      unsubscribeToken: s.unsubscribeToken,
      createdAt: s.createdAt || new Date(0).toISOString(),
      consentAt: s.consentAt || s.createdAt || new Date(0).toISOString(),
      confirmedAt: s.confirmedAt ?? null,
    });
  }
  const marks = rec.marks ?? {};
  const sentTo: Record<string, string[]> = {};
  if (marks.sentTo && typeof marks.sentTo === "object") {
    for (const [key, list] of Object.entries(marks.sentTo)) {
      if (Array.isArray(list)) sentTo[key] = list.filter(v => typeof v === "string");
    }
  }
  return {
    subscribers,
    marks: {
      dailySent: marks.dailySent ?? null,
      weeklySent: marks.weeklySent ?? null,
      dailyLogged: marks.dailyLogged ?? null,
      weeklyLogged: marks.weeklyLogged ?? null,
      sentTo,
    },
  };
}

function readState(): NewsletterState {
  const file = newsletterStorePath();
  if (!fs.existsSync(file)) return emptyState();
  return normalize(JSON.parse(fs.readFileSync(file, "utf8")));
}

function writeState(state: NewsletterState): void {
  const file = newsletterStorePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, file);
}

let chain: Promise<unknown> = Promise.resolve();

export function withNewsletterState<T>(fn: (state: NewsletterState) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const state = readState();
    const result = await fn(state);
    writeState(state);
    return result;
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export function upsertSubscriber(
  state: NewsletterState,
  input: { email: string; cadence: Cadence; now: string },
): { kind: "pending"; subscriber: Subscriber } | { kind: "confirmed"; cadenceChanged: boolean } {
  const existing = state.subscribers.find(s => s.email === input.email);
  if (existing?.status === "confirmed") {
    const cadenceChanged = existing.cadence !== input.cadence;
    existing.cadence = input.cadence;
    return { kind: "confirmed", cadenceChanged };
  }
  if (existing) {
    existing.cadence = input.cadence;
    existing.confirmToken = newToken();
    existing.consentAt = input.now;
    return { kind: "pending", subscriber: existing };
  }
  const subscriber: Subscriber = {
    email: input.email,
    status: "pending",
    cadence: input.cadence,
    confirmToken: newToken(),
    unsubscribeToken: newToken(),
    createdAt: input.now,
    consentAt: input.now,
    confirmedAt: null,
  };
  state.subscribers.push(subscriber);
  return { kind: "pending", subscriber };
}

export function confirmSubscriber(state: NewsletterState, token: string, now: string): "confirmed" | "already" | "invalid" {
  const sub = state.subscribers.find(s => s.confirmToken === token);
  if (!sub) return "invalid";
  if (sub.status === "confirmed") return "already";
  sub.status = "confirmed";
  sub.confirmedAt = now;
  return "confirmed";
}

export function unsubscribeSubscriber(state: NewsletterState, token: string): "removed" | "invalid" {
  const idx = state.subscribers.findIndex(s => s.unsubscribeToken === token);
  if (idx < 0) return "invalid";
  state.subscribers.splice(idx, 1);
  return "removed";
}

export function deleteSubscriber(state: NewsletterState, email: string): boolean {
  const idx = state.subscribers.findIndex(s => s.email === email);
  if (idx < 0) return false;
  state.subscribers.splice(idx, 1);
  return true;
}

export function subscriberCounts(state: NewsletterState): { pending: number; confirmed: number } {
  let pending = 0;
  let confirmed = 0;
  for (const s of state.subscribers) {
    if (s.status === "confirmed") confirmed += 1;
    else pending += 1;
  }
  return { pending, confirmed };
}

export function publicSubscriber(s: Subscriber) {
  return {
    email: s.email,
    status: s.status,
    cadence: s.cadence,
    createdAt: s.createdAt,
    confirmedAt: s.confirmedAt,
  };
}

export function digestKey(cadence: Cadence, day: string): string {
  return `${cadence}:${day}`;
}

export function pendingConfirmations(state: NewsletterState): Subscriber[] {
  return state.subscribers.filter(s => s.status === "pending");
}

export function confirmedFor(state: NewsletterState, cadence: Cadence): Subscriber[] {
  return state.subscribers.filter(s => s.status === "confirmed" && s.cadence === cadence);
}
