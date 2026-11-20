/**
 * Tägliche und wöchentliche Ausgabe aus dem Atom-Feed.
 * Der Zeitplan startet nur bei NEWSLETTER_SCHEDULE=1, ab 06:00 UTC.
 */
import { utcDateString } from "../../shared/dailyErkenntnis.js";
import { renderDailyFeedXml } from "./erkenntnisFeed.js";
import { deliverMail, resolveDelivery, siteUrl, type DeliveryDeps, type DeliveryResult } from "./newsletterMail.js";
import {
  confirmationMail,
  digestMail,
  parseFeedEntries,
  selectDigestSnippets,
} from "./newsletterMessages.js";
import {
  confirmedFor,
  digestKey,
  pendingConfirmations,
  withNewsletterState,
  type Cadence,
  type Subscriber,
} from "./newsletterStore.js";

export interface DigestReport {
  cadence: Cadence;
  day: string;
  recipients: number;
  delivered: number;
  logged: number;
  failed: number;
  skipped: string | null;
}

function loggedMark(cadence: Cadence): "dailyLogged" | "weeklyLogged" {
  return cadence === "daily" ? "dailyLogged" : "weeklyLogged";
}

function sentMark(cadence: Cadence): "dailySent" | "weeklySent" {
  return cadence === "daily" ? "dailySent" : "weeklySent";
}

function injected(deps?: DeliveryDeps): boolean {
  return Boolean(deps?.fetchImpl || deps?.smtpSend);
}

function canSend(deps?: DeliveryDeps): boolean {
  return resolveDelivery().ready && !(process.env.VITEST && !injected(deps));
}

export async function sendDigest(
  cadence: Cadence,
  opts: { now?: Date; force?: boolean; markEmpty?: boolean; deliverDeps?: DeliveryDeps } = {},
): Promise<DigestReport> {
  const now = opts.now ?? new Date();
  const day = utcDateString(now);
  const snippets = selectDigestSnippets(parseFeedEntries(renderDailyFeedXml(now)), cadence, now);
  const ready = canSend(opts.deliverDeps);
  const plan = await withNewsletterState(state => {
    const report: DigestReport = { cadence, day, recipients: 0, delivered: 0, logged: 0, failed: 0, skipped: null };
    const mark = loggedMark(cadence);
    if (!opts.force && !ready && state.marks[mark] === day) {
      report.skipped = "heute schon protokolliert";
      return { report, recipients: [] as Subscriber[], send: false };
    }
    if (snippets.length === 0) {
      report.skipped = "kein Kernsatz im Feed";
      if (opts.markEmpty) state.marks[mark] = day;
      return { report, recipients: [] as Subscriber[], send: false };
    }
    const key = digestKey(cadence, day);
    if (opts.force) delete state.marks.sentTo[key];
    const already = new Set(opts.force ? [] : (state.marks.sentTo[key] ?? []));
    const recipients = confirmedFor(state, cadence).filter(s => !already.has(s.email)).map(s => ({ ...s }));
    report.recipients = recipients.length;
    if (recipients.length === 0) {
      report.skipped = "keine offenen Empfänger";
      state.marks[sentMark(cadence)] = day;
      return { report, recipients, send: false };
    }
    if (!ready) {
      console.info(`[newsletter] Digest ${cadence} nicht gesendet (kein Anbieter): ${recipients.length} bestätigte Empfänger, Betreff „${snippets[0]?.title ?? cadence}"`);
      state.marks[mark] = day;
      report.logged = recipients.length;
      return { report, recipients, send: false };
    }
    return { report, recipients, send: true };
  });
  if (!plan.send) return plan.report;

  const site = siteUrl();
  const sent: string[] = [];
  let failed = 0;
  let logged = 0;
  for (const sub of plan.recipients) {
    const mail = digestMail(sub, snippets, cadence, site);
    if (!mail) continue;
    const result: DeliveryResult = await deliverMail(mail, opts.deliverDeps ?? {});
    if (result.delivered) sent.push(sub.email);
    else if (result.failed) failed += 1;
    else logged += 1;
  }
  return withNewsletterState(state => {
    const key = digestKey(cadence, day);
    const list = state.marks.sentTo[key] ?? [];
    for (const email of sent) {
      if (!list.includes(email)) list.push(email);
    }
    state.marks.sentTo[key] = list;
    const done = confirmedFor(state, cadence).every(s => list.includes(s.email));
    if (done && failed === 0 && logged === 0) state.marks[sentMark(cadence)] = day;
    if (logged > 0) state.marks[loggedMark(cadence)] = day;
    return { ...plan.report, delivered: sent.length, failed, logged };
  });
}

export async function sendPendingConfirmations(deps: DeliveryDeps = {}): Promise<{ pending: number; delivered: number; logged: number; failed: number }> {
  const site = siteUrl();
  const pending = await withNewsletterState(state => pendingConfirmations(state).map(s => ({ ...s })));
  const out = { pending: pending.length, delivered: 0, logged: 0, failed: 0 };
  if (pending.length === 0) return out;
  const ready = resolveDelivery().ready && !(process.env.VITEST && !deps.fetchImpl && !deps.smtpSend);
  if (!ready) {
    console.info(`[newsletter] ${pending.length} Bestätigungen nicht gesendet (kein Anbieter)`);
    out.logged = pending.length;
    return out;
  }
  for (const sub of pending) {
    const result = await deliverMail(confirmationMail(sub as Subscriber, site), deps);
    if (result.delivered) out.delivered += 1;
    else if (result.failed) out.failed += 1;
    else out.logged += 1;
  }
  return out;
}

export async function runDueDigests(now = new Date(), deps: DeliveryDeps = {}): Promise<DigestReport[]> {
  if (now.getUTCHours() < 6) return [];
  const reports = [await sendDigest("daily", { now, markEmpty: true, deliverDeps: deps })];
  if (now.getUTCDay() === 0) reports.push(await sendDigest("weekly", { now, markEmpty: true, deliverDeps: deps }));
  return reports;
}

export function startNewsletterSchedule(): void {
  if (process.env.NEWSLETTER_SCHEDULE !== "1") return;
  const tick = () => {
    void runDueDigests().catch(err => {
      const message = err instanceof Error ? err.message : "unbekannt";
      console.info(`[newsletter] Zeitplan fehlgeschlagen: ${message.slice(0, 180)}`);
    });
  };
  setTimeout(tick, 30_000).unref();
  setInterval(tick, 15 * 60 * 1000).unref();
}
