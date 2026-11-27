/**
 * Frische des Korpus: letzter Leser-Eintrag gegen eine Schwelle.
 * Der Alarm öffnet höchstens ein Issue und schließt es, sobald wieder
 * Einträge ankommen.
 */

export const STALE_MS = 48 * 60 * 60 * 1000;
export const FRESHNESS_MARKER = "<!-- corpus-freshness-alert -->";

const TS_RE = /^\d{4}-\d{2}-\d{2}T/;

export interface FreshnessInput {
  indexTimestamps: Array<string | null | undefined>;
  commitAt?: string | null;
  commitSubject?: string | null;
  now: Date;
  staleMs?: number;
}

export interface FreshnessReport {
  stale: boolean;
  latest: string | null;
  source: "index" | "commit" | "none";
  ageHours: number | null;
  title: string;
  body: string;
}

function parseTs(value: string | null | undefined): number | null {
  if (!value || !TS_RE.test(value)) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

export function assessFreshness(input: FreshnessInput): FreshnessReport {
  const staleMs = input.staleMs ?? STALE_MS;
  let latestMs: number | null = null;
  let latest: string | null = null;
  let source: FreshnessReport["source"] = "none";

  for (const ts of input.indexTimestamps) {
    const ms = parseTs(ts);
    if (ms === null) continue;
    if (latestMs === null || ms > latestMs) {
      latestMs = ms;
      latest = ts ?? null;
      source = "index";
    }
  }
  const commitMs = parseTs(input.commitAt);
  if (commitMs !== null && (latestMs === null || commitMs > latestMs)) {
    latestMs = commitMs;
    latest = input.commitAt ?? null;
    source = "commit";
  }

  const ageMs = latestMs === null ? null : input.now.getTime() - latestMs;
  const stale = ageMs === null || ageMs > staleMs;
  const ageHours = ageMs === null ? null : Math.floor(ageMs / (60 * 60 * 1000));
  const title = "Leser-Lauf: seit über 48 Stunden kein neuer Korpus-Eintrag";
  const when = latest ?? "kein Zeitstempel gefunden";
  const subject = input.commitSubject?.trim()
    ? `Letzter \`log(resonanz)\`-Commit: ${input.commitSubject.trim()}`
    : "Kein \`log(resonanz)\`-Commit im Verlauf gefunden.";
  const body = [
    FRESHNESS_MARKER,
    "",
    "Der tägliche Leser-Lauf scheint stehengeblieben zu sein.",
    "",
    `Letzter Korpus-Zeitpunkt: ${when}`,
    subject,
    `Geprüft am: ${input.now.toISOString()}`,
    "Schwelle: mehr als 48 Stunden ohne neuen Eintrag.",
    "",
    "Seit dieser Schwelle ist weder ein neuer Index-Zeitstempel noch ein neuer `log(resonanz)`-Commit angekommen. Bitte den Persona-Lauf und die Validate-Korpus-Action prüfen.",
    "",
    "Dieses Issue wird fortgeschrieben, nicht verdoppelt, und schließt sich von selbst, sobald wieder Einträge ankommen.",
  ].join("\n");

  return { stale, latest, source, ageHours, title, body };
}
