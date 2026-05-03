/**
 * Admin-Dashboard (/admin) — Analytics + (Phase 2) Kuration des
 * Resonanz-Korpus.
 *
 * Auth: Bearer-Token in localStorage. Beim ersten Aufruf via
 * /admin?token=XYZ wird der Token gespeichert. Server-Endpoint
 * /api/admin/check validiert.
 *
 * Read-only Phase 1: zeigt aggregierte Analytics aus existierenden
 * statischen Files (resonanzen-index.json, validation-report,
 * drift-report). Keine extra Tracking-Infrastruktur.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useEbookTheme } from "@/hooks/useEbookTheme";
import {
  loadResonanzenIndex,
  ENDPOINT_LABEL, ENDPOINT_COLOR,
  type ResonanzEntry, type ResonanzIndex,
} from "@/lib/resonanzenIndex";

const SERIF = "'EB Garamond', Georgia, serif";
const MONO  = "'Courier Prime', 'Courier New', monospace";

type Palette = {
  void: string; deep: string; surface: string; border: string;
  muted: string; textDim: string; text: string; textBright: string;
  accent: string; accentDim: string;
};
const C_DARK: Palette = {
  void: "#080808", deep: "#0f0f0f", surface: "#161616", border: "#2a2a2a",
  muted: "#444", textDim: "#888", text: "#c8c2b4", textBright: "#e8e2d4",
  accent: "#c4a882", accentDim: "#7a6a52",
};
const C_LIGHT: Palette = {
  void: "#fafaf9", deep: "#f0ece4", surface: "#ffffff", border: "#d8d2c8",
  muted: "#a8a29e", textDim: "#78716c", text: "#3a3530", textBright: "#1c1917",
  accent: "#c4a882", accentDim: "#7a6a52",
};

const TOKEN_KEY = "dt-admin-token";

// ─── Auth ───────────────────────────────────────────────────────────────────

function getStoredToken(): string | null {
  // Erster Call: ?token=XYZ aus URL extrahieren + speichern, URL aufräumen
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("token");
  if (fromUrl) {
    localStorage.setItem(TOKEN_KEY, fromUrl);
    // URL aufräumen, damit der Token nicht im Browser-Verlauf steht
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, "", cleanUrl);
    return fromUrl;
  }
  return localStorage.getItem(TOKEN_KEY);
}

async function checkToken(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/admin/check", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    });
    const data = await res.json();
    return { ok: !!data.ok, error: data.error };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Helper: Stats-Berechnung aus dem Index ────────────────────────────────

interface AggregateStats {
  total: number;
  byEndpoint: Record<string, number>;
  byStatus: Record<string, number>;
  topNodeIds: Array<{ id: string; count: number }>;
  topAnchors: Array<{ anchor: string; count: number; endpoint: string }>;
  avgResponseLength: Record<string, number>;
  timeSeries: Array<{ date: string; total: number; byEndpoint: Record<string, number> }>;
}

function computeStats(entries: ResonanzEntry[]): AggregateStats {
  const byEndpoint: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const nodeFreq: Record<string, number> = {};
  const anchorFreq: Record<string, { count: number; endpoint: string }> = {};
  const respLenSum: Record<string, number> = {};
  const respLenCount: Record<string, number> = {};

  // Time-Series der letzten 30 Tage
  const now = new Date();
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const tsByDate: Record<string, { total: number; byEndpoint: Record<string, number> }> = {};
  for (const d of days) tsByDate[d] = { total: 0, byEndpoint: {} };

  for (const e of entries) {
    byEndpoint[e.endpoint] = (byEndpoint[e.endpoint] ?? 0) + 1;
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    for (const id of e.nodeIds) nodeFreq[id] = (nodeFreq[id] ?? 0) + 1;
    if (!anchorFreq[e.anchor]) anchorFreq[e.anchor] = { count: 0, endpoint: e.endpoint };
    anchorFreq[e.anchor].count++;
    const rl = e.response.length;
    respLenSum[e.endpoint] = (respLenSum[e.endpoint] ?? 0) + rl;
    respLenCount[e.endpoint] = (respLenCount[e.endpoint] ?? 0) + 1;

    const date = e.ts.slice(0, 10);
    if (tsByDate[date]) {
      tsByDate[date].total++;
      tsByDate[date].byEndpoint[e.endpoint] = (tsByDate[date].byEndpoint[e.endpoint] ?? 0) + 1;
    }
  }

  const avgResponseLength: Record<string, number> = {};
  for (const ep of Object.keys(respLenSum)) {
    avgResponseLength[ep] = Math.round(respLenSum[ep] / respLenCount[ep]);
  }

  return {
    total: entries.length,
    byEndpoint,
    byStatus,
    topNodeIds: Object.entries(nodeFreq).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id, count]) => ({ id, count })),
    topAnchors: Object.entries(anchorFreq).sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([anchor, v]) => ({ anchor, count: v.count, endpoint: v.endpoint })),
    avgResponseLength,
    timeSeries: days.map(d => ({ date: d, total: tsByDate[d].total, byEndpoint: tsByDate[d].byEndpoint })),
  };
}

// ─── Tag-Cloud (kleine Inline-Variante) ────────────────────────────────────

function MiniTagCloud({ items, c }: { items: Array<{ id: string; count: number }>; c: Palette }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map(i => i.count));
  const min = Math.min(...items.map(i => i.count));
  const fontSize = (count: number) => {
    if (max === min) return 14;
    return 10 + ((count - min) / (max - min)) * 16;
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", alignItems: "baseline", padding: "0.5rem 0" }}>
      {items.map(i => (
        <span key={i.id} style={{
          fontFamily: SERIF, fontStyle: "italic",
          fontSize: `${fontSize(i.count)}px`,
          color: c.accent,
        }} title={`${i.count} Resonanzen`}>
          {i.id}
          <sub style={{ fontFamily: MONO, fontSize: "0.45rem", color: c.muted, marginLeft: "0.15rem" }}>{i.count}</sub>
        </span>
      ))}
    </div>
  );
}

// ─── Time-Series-Sparkline (SVG-only, keine Lib) ───────────────────────────

function TimeSeries({ data, c }: { data: Array<{ date: string; total: number }>; c: Palette }) {
  const max = Math.max(...data.map(d => d.total), 1);
  const W = 800, H = 100, P = 4;
  const barW = (W - P * (data.length - 1)) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 100 }}>
      {data.map((d, i) => {
        const h = max === 0 ? 0 : (d.total / max) * (H - 4);
        return (
          <g key={d.date}>
            <rect
              x={i * (barW + P)} y={H - h - 2}
              width={barW} height={Math.max(h, 1)}
              fill={d.total > 0 ? c.accent : c.border}
              opacity={d.total > 0 ? 0.85 : 0.3}
            >
              <title>{d.date}: {d.total} Anfragen</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Optional: Validation- + Drift-Report laden ────────────────────────────

interface ValidationReport {
  generatedAt: string;
  filesChecked: number;
  errors: number;
  warnings: number;
}
interface DriftReport {
  generatedAt: string;
  status: "stable" | "drift-warning" | "drift-alarm" | "insufficient-data";
  delta?: { files: number };
  issues?: Array<{ level: string; rule: string; detail: string }>;
}

async function loadOptionalJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-cache" });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// ─── Haupt-Component ───────────────────────────────────────────────────────

type AuthState = "checking" | "missing" | "invalid" | "ok" | "not-configured";

export default function AdminPage() {
  const isDark = useEbookTheme();
  const C = isDark ? C_DARK : C_LIGHT;

  const [authState, setAuthState] = useState<AuthState>("checking");
  const [authError, setAuthError] = useState<string | null>(null);
  const [index, setIndex] = useState<ResonanzIndex | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthState("missing");
      return;
    }
    checkToken(token).then(result => {
      if (result.ok) {
        setAuthState("ok");
      } else {
        setAuthError(result.error ?? "Auth fehlgeschlagen");
        if (result.error?.includes("nicht konfiguriert")) setAuthState("not-configured");
        else setAuthState("invalid");
      }
    });
  }, []);

  useEffect(() => {
    if (authState !== "ok") return;
    loadResonanzenIndex().then(setIndex).catch(() => null);
    loadOptionalJson<ValidationReport>("/resonanzen-validation-report.json").then(setValidationReport);
    loadOptionalJson<DriftReport>("/resonanzen-drift-report.json").then(setDriftReport);
  }, [authState]);

  const stats = useMemo(() => index ? computeStats(index.entries) : null, [index]);

  // ─── Auth-States ──────────────────────────────────────────────────────────
  if (authState === "checking") {
    return (
      <div style={authStyle(C)}>
        <p style={{ fontStyle: "italic", color: C.textDim }}>prüfe Zugang …</p>
      </div>
    );
  }
  if (authState === "missing") {
    return (
      <div style={authStyle(C)}>
        <h1 style={{ fontFamily: SERIF, fontSize: "2rem", fontStyle: "italic", color: C.textBright, marginBottom: "1rem", fontWeight: 400 }}>Admin-Zugang</h1>
        <p style={{ fontStyle: "italic", color: C.textDim, marginBottom: "0.5rem", textAlign: "center" }}>
          Kein Token gefunden. Aufruf via <code style={{ fontFamily: MONO, fontSize: "0.85rem", color: C.accent }}>/admin?token=…</code>
        </p>
        <Link href="/" style={{ marginTop: "2rem", color: C.accent, fontFamily: MONO, fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>← Zum Werk</Link>
      </div>
    );
  }
  if (authState === "invalid") {
    return (
      <div style={authStyle(C)}>
        <h1 style={{ fontFamily: SERIF, fontSize: "2rem", fontStyle: "italic", color: C.textBright, marginBottom: "1rem", fontWeight: 400 }}>Nicht autorisiert</h1>
        <p style={{ fontStyle: "italic", color: C.textDim, marginBottom: "0.5rem" }}>{authError}</p>
        <button
          onClick={() => { localStorage.removeItem(TOKEN_KEY); window.location.reload(); }}
          style={{ marginTop: "1rem", fontFamily: MONO, fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.5rem 1rem", cursor: "pointer" }}
        >Token zurücksetzen</button>
        <Link href="/" style={{ marginTop: "2rem", color: C.accent, fontFamily: MONO, fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>← Zum Werk</Link>
      </div>
    );
  }
  if (authState === "not-configured") {
    return (
      <div style={authStyle(C)}>
        <h1 style={{ fontFamily: SERIF, fontSize: "2rem", fontStyle: "italic", color: C.textBright, marginBottom: "1rem", fontWeight: 400 }}>Admin-Zugang nicht konfiguriert</h1>
        <p style={{ fontStyle: "italic", color: C.textDim, textAlign: "center" }}>
          <code style={{ fontFamily: MONO, fontSize: "0.85rem", color: C.accent }}>ADMIN_TOKEN</code> env var auf Render setzen, um den Zugang zu aktivieren.
        </p>
        <Link href="/" style={{ marginTop: "2rem", color: C.accent, fontFamily: MONO, fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>← Zum Werk</Link>
      </div>
    );
  }

  // ─── Authorisiert → Dashboard ────────────────────────────────────────────
  return (
    <div
      data-scroll
      style={{
        position: "fixed", inset: 0, overflowY: "auto",
        background: C.void, color: C.text, fontFamily: SERIF,
        WebkitOverflowScrolling: "touch",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: "1.5rem 1rem", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem", gap: "1rem", flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: SERIF, fontSize: "1.8rem", fontStyle: "italic", color: C.textBright, margin: 0, fontWeight: 400 }}>
            Admin · Korpus-Status
          </h1>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "baseline" }}>
            <Link href="/resonanzen" style={{ color: C.accent, fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>Resonanzen</Link>
            <Link href="/" style={{ color: C.accent, fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>← Zum Werk</Link>
          </div>
        </div>
        <p style={{ fontStyle: "italic", fontSize: "0.9rem", color: C.textDim, margin: 0 }}>
          {index ? `${index.count} Resonanzen im Korpus · zuletzt erzeugt ${new Date(index.generatedAt).toLocaleString("de-DE")}` : "lädt …"}
        </p>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem 1rem 4rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
        {!stats ? (
          <p style={{ fontStyle: "italic", color: C.textDim }}>lädt Statistiken …</p>
        ) : (
          <>
            {/* ── Übersicht: Endpoint-Verteilung + Status ── */}
            <Section title="Übersicht" c={C}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.8rem" }}>
                {Object.entries(stats.byEndpoint).map(([ep, count]) => (
                  <Stat key={ep} label={ENDPOINT_LABEL[ep as keyof typeof ENDPOINT_LABEL] ?? ep} value={count} color={ENDPOINT_COLOR[ep as keyof typeof ENDPOINT_COLOR] ?? C.accent} c={C} />
                ))}
              </div>
            </Section>

            {/* ── Status-Verteilung ── */}
            <Section title="Status-Verteilung (Kuration)" c={C}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.8rem" }}>
                {(["raw", "pending", "approved", "published"] as const).map(s => (
                  <Stat key={s} label={s} value={stats.byStatus[s] ?? 0} color={s === "published" ? "#7ab898" : s === "approved" ? "#5aacb8" : s === "pending" ? C.accent : C.muted} c={C} />
                ))}
              </div>
            </Section>

            {/* ── Time-Series (letzte 30 Tage) ── */}
            <Section title="Anfragen — letzte 30 Tage" c={C}>
              <TimeSeries data={stats.timeSeries} c={C} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", fontFamily: MONO, fontSize: "0.5rem", color: C.muted }}>
                <span>{stats.timeSeries[0]?.date}</span>
                <span>{stats.timeSeries[stats.timeSeries.length - 1]?.date}</span>
              </div>
            </Section>

            {/* ── Top-Konzepte ── */}
            <Section title={`Top-Konzepte im Korpus (${stats.topNodeIds.length})`} c={C}>
              <MiniTagCloud items={stats.topNodeIds} c={C} />
            </Section>

            {/* ── Top-Anker ── */}
            <Section title="Meistgefragte Anker" c={C}>
              <table style={{ width: "100%", fontFamily: MONO, fontSize: "0.62rem", borderCollapse: "collapse" }}>
                <tbody>
                  {stats.topAnchors.map(a => (
                    <tr key={a.anchor} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "0.4rem 0.5rem", color: ENDPOINT_COLOR[a.endpoint as keyof typeof ENDPOINT_COLOR], textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>{a.endpoint}</td>
                      <td style={{ padding: "0.4rem 0.5rem", color: C.text, fontFamily: MONO }}>{a.anchor}</td>
                      <td style={{ padding: "0.4rem 0.5rem", color: C.accent, textAlign: "right" }}>{a.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            {/* ── Avg Response-Length ── */}
            <Section title="Durchschnittliche Antwortlänge" c={C}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.8rem" }}>
                {Object.entries(stats.avgResponseLength).map(([ep, len]) => (
                  <Stat key={ep} label={ENDPOINT_LABEL[ep as keyof typeof ENDPOINT_LABEL] ?? ep} value={`${len.toLocaleString("de-DE")} Z.`} color={ENDPOINT_COLOR[ep as keyof typeof ENDPOINT_COLOR] ?? C.accent} c={C} />
                ))}
              </div>
            </Section>

            {/* ── Korpus-Health (Validation) ── */}
            <Section title="Korpus-Health (Validation)" c={C}>
              {validationReport ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.8rem" }}>
                  <Stat label="Files geprüft" value={validationReport.filesChecked} color={C.accent} c={C} />
                  <Stat label="Errors" value={validationReport.errors} color={validationReport.errors > 0 ? "#c48282" : "#7ab898"} c={C} />
                  <Stat label="Warnings" value={validationReport.warnings} color={validationReport.warnings > 0 ? C.accent : C.muted} c={C} />
                </div>
              ) : (
                <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>Kein Validation-Report verfügbar.</p>
              )}
            </Section>

            {/* ── Drift-Status ── */}
            <Section title="Drift-Status" c={C}>
              {driftReport ? (
                <div>
                  <div style={{ marginBottom: "0.5rem" }}>
                    <span style={{
                      fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
                      color: driftReport.status === "stable" ? "#7ab898" : driftReport.status === "drift-alarm" ? "#c48282" : C.accent,
                    }}>
                      {driftReport.status === "stable" && "✓ stable"}
                      {driftReport.status === "drift-warning" && "⚠ warning"}
                      {driftReport.status === "drift-alarm" && "🚨 alarm"}
                      {driftReport.status === "insufficient-data" && "noch zu wenig Daten"}
                    </span>
                  </div>
                  {driftReport.issues && driftReport.issues.length > 0 && (
                    <ul style={{ fontFamily: MONO, fontSize: "0.62rem", color: C.text, paddingLeft: "1.2rem", lineHeight: 1.6 }}>
                      {driftReport.issues.map((i, idx) => (
                        <li key={idx} style={{ color: i.level === "alarm" ? "#c48282" : C.accent }}>
                          [{i.rule}] {i.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>Kein Drift-Report verfügbar (mindestens 2 Snapshots nötig).</p>
              )}
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Sub-Components ────────────────────────────────────────────────────────

function Section({ title, c, children }: { title: string; c: Palette; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.18em", color: c.muted, textTransform: "uppercase", marginBottom: "0.8rem", paddingBottom: "0.3rem", borderBottom: `1px solid ${c.border}`, fontWeight: 400 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value, color, c }: { label: string; value: string | number; color: string; c: Palette }) {
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, padding: "0.7rem 0.9rem" }}>
      <div style={{ fontFamily: SERIF, fontSize: "1.4rem", fontWeight: 400, color, marginBottom: "0.2rem" }}>
        {value}
      </div>
      <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>
        {label}
      </div>
    </div>
  );
}

function authStyle(c: Palette): React.CSSProperties {
  return {
    position: "fixed", inset: 0, background: c.void, color: c.text,
    fontFamily: SERIF, padding: "2rem",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  };
}
