/**
 * adminShared.tsx — gemeinsame Komponenten und Stats-Berechnung für die
 * drei Admin-Sub-Pages (Kuration / Metrics / Health).
 */
import type { ReactNode } from "react";
import { useEbookTheme } from "@/hooks/useEbookTheme";
import type { ResonanzEntry } from "@/lib/resonanzenIndex";

export const SERIF = "'EB Garamond', Georgia, serif";
export const MONO  = "'Courier Prime', 'Courier New', monospace";

export type Palette = {
  void: string; deep: string; surface: string; border: string;
  muted: string; textDim: string; text: string; textBright: string;
  accent: string; accentDim: string;
};
export const C_DARK: Palette = {
  void: "#080808", deep: "#0f0f0f", surface: "#161616", border: "#2a2a2a",
  muted: "#444", textDim: "#888", text: "#c8c2b4", textBright: "#e8e2d4",
  accent: "#c4a882", accentDim: "#7a6a52",
};
export const C_LIGHT: Palette = {
  void: "#fafaf9", deep: "#f0ece4", surface: "#ffffff", border: "#d8d2c8",
  muted: "#a8a29e", textDim: "#78716c", text: "#3a3530", textBright: "#1c1917",
  accent: "#c4a882", accentDim: "#7a6a52",
};

export function useAdminTheme(): Palette {
  const isDark = useEbookTheme();
  return isDark ? C_DARK : C_LIGHT;
}

// ─── Section + Stat — Layout-Bausteine ────────────────────────────────────

export function Section({ title, c, children }: { title: string; c: Palette; children: ReactNode }) {
  return (
    <section>
      <h2 style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.18em", color: c.muted, textTransform: "uppercase", marginBottom: "0.8rem", paddingBottom: "0.3rem", borderBottom: `1px solid ${c.border}`, fontWeight: 400 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Stat({ label, value, color, c }: { label: string; value: string | number; color: string; c: Palette }) {
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

// ─── Stats-Berechnung aus dem Index ───────────────────────────────────────

export interface AggregateStats {
  total: number;
  byEndpoint: Record<string, number>;
  byStatus: Record<string, number>;
  topNodeIds: Array<{ id: string; count: number }>;
  topAnchors: Array<{ anchor: string; count: number; endpoint: string }>;
  avgResponseLength: Record<string, number>;
  timeSeries: Array<{ date: string; total: number; byEndpoint: Record<string, number> }>;
}

export function computeStats(entries: ResonanzEntry[]): AggregateStats {
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

// ─── Tag-Cloud + TimeSeries (klein, SVG-only) ─────────────────────────────

export function MiniTagCloud({ items, c }: { items: Array<{ id: string; count: number }>; c: Palette }) {
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
        }} title={`${i.count} Begegnungen`}>
          {i.id}
          <sub style={{ fontFamily: MONO, fontSize: "0.45rem", color: c.muted, marginLeft: "0.15rem" }}>{i.count}</sub>
        </span>
      ))}
    </div>
  );
}

export function TimeSeries({ data, c }: { data: Array<{ date: string; total: number }>; c: Palette }) {
  const max = Math.max(...data.map(d => d.total), 1);
  const W = 800, H = 100, P = 4;
  const barW = (W - P * (data.length - 1)) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 100 }}>
      {data.map((d, i) => {
        const h = max === 0 ? 0 : (d.total / max) * (H - 4);
        return (
          <rect
            key={d.date}
            x={i * (barW + P)} y={H - h - 2}
            width={barW} height={Math.max(h, 1)}
            fill={d.total > 0 ? c.accent : c.border}
            opacity={d.total > 0 ? 0.85 : 0.3}
          >
            <title>{d.date}: {d.total} Anfragen</title>
          </rect>
        );
      })}
    </svg>
  );
}

// ─── Report-Loader für Validation + Drift ─────────────────────────────────

export interface ValidationReport {
  generatedAt: string;
  filesChecked: number;
  errors: number;
  warnings: number;
}
export interface DriftReport {
  generatedAt: string;
  status: "stable" | "drift-warning" | "drift-alarm" | "insufficient-data";
  delta?: { files: number };
  issues?: Array<{ level: string; rule: string; detail: string }>;
}

export async function loadOptionalJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-cache" });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
