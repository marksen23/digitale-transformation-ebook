/**
 * MobileBetriebMetrics — Bereich "Betrieb → Metrics" auf dem Telefon.
 * Reuses AdminMetricsPage's real Section/Stat/MiniTagCloud/TimeSeries/
 * computeStats building blocks verbatim (adminShared.tsx) — nur in einer
 * kompakten, einspaltigen Anordnung statt Desktop-Grids. Semantische
 * Cluster (Embeddings-Analyse) und der volle Live-Feed bleiben bewusst
 * Desktop-Werkzeuge; hier reicht die Übersicht.
 */
import { useState } from "react";
import { ENDPOINT_LABEL, ENDPOINT_COLOR, type ResonanzIndex } from "@/lib/resonanzenIndex";
import { Section, Stat, MiniTagCloud, TimeSeries, computeStats, MONO, SERIF, type Palette } from "@/pages/admin/adminShared";

const STATUS_META: Array<[string, string, string]> = [
  ["published", "veröffentlicht", "#7ab898"],
  ["approved", "freigegeben", "#5aacb8"],
  ["pending", "ausstehend", ""], // Akzentfarbe der Palette
  ["raw", "roh", ""], // muted
  ["rejected", "abgelehnt", "#c48282"],
];

export default function MobileBetriebMetrics({ C, index }: { C: Palette; index: ResonanzIndex | null }) {
  const [feedLimit, setFeedLimit] = useState(15);
  if (!index) return <div style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</div>;
  const stats = computeStats(index.entries);
  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 };

  const feed = index.entries.slice().sort((a, b) => b.ts.localeCompare(a.ts));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 4 }}>
      <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 12.5, color: C.textDim }}>
        {stats.total} Begegnungen · zuletzt {new Date(index.generatedAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
      </div>

      <Section title="Übersicht — Endpoint-Verteilung" c={C}>
        <div style={grid}>
          {Object.entries(stats.byEndpoint).map(([ep, n]) => (
            <Stat key={ep} label={ENDPOINT_LABEL[ep as keyof typeof ENDPOINT_LABEL] ?? ep} value={n} color={ENDPOINT_COLOR[ep as keyof typeof ENDPOINT_COLOR] ?? C.accent} c={C} />
          ))}
        </div>
      </Section>

      <Section title="Status-Verteilung (Kuration)" c={C}>
        <div style={grid}>
          {STATUS_META.map(([id, label, color]) => (
            <Stat key={id} label={label} value={stats.byStatus[id] ?? 0} color={color || C.accent} c={C} />
          ))}
        </div>
      </Section>

      <Section title="Anfragen — letzte 30 Tage" c={C}>
        <TimeSeries data={stats.timeSeries} c={C} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontFamily: MONO, fontSize: 8.5, color: C.muted }}>
          <span>{stats.timeSeries[0]?.date}</span>
          <span>{stats.timeSeries[stats.timeSeries.length - 1]?.date}</span>
        </div>
      </Section>

      {stats.topNodeIds.length > 0 && (
        <Section title="Top-Konzepte" c={C}>
          <MiniTagCloud items={stats.topNodeIds} c={C} />
        </Section>
      )}

      <Section title="Meistgefragte Anker" c={C}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {stats.topAnchors.map(a => (
            <div key={a.anchor} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: ENDPOINT_COLOR[a.endpoint as keyof typeof ENDPOINT_COLOR] ?? C.accent, flexShrink: 0, width: 74, lineHeight: 1.3 }}>{a.endpoint}</span>
              <span style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 11, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.anchor}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.accent, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{a.count}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Durchschnittliche Antwortlänge" c={C}>
        <div style={grid}>
          {Object.entries(stats.avgResponseLength).map(([ep, len]) => (
            <Stat key={ep} label={ENDPOINT_LABEL[ep as keyof typeof ENDPOINT_LABEL] ?? ep} value={`${len.toLocaleString("de-DE")} Z.`} color={ENDPOINT_COLOR[ep as keyof typeof ENDPOINT_COLOR] ?? C.accent} c={C} />
          ))}
        </div>
      </Section>

      <Section title="Live-Feed" c={C}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {feed.slice(0, feedLimit).map(e => (
            <div key={e.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: ENDPOINT_COLOR[e.endpoint as keyof typeof ENDPOINT_COLOR] ?? C.muted }}>{ENDPOINT_LABEL[e.endpoint as keyof typeof ENDPOINT_LABEL] ?? e.endpoint}</span>
                <span style={{ fontFamily: MONO, fontSize: 8.5, color: C.muted, flexShrink: 0 }}>{new Date(e.ts).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</span>
              </div>
              <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 12.5, color: C.text, marginTop: 2 }}>
                {e.prompt.slice(0, 140)}{e.prompt.length > 140 ? "…" : ""}
              </div>
            </div>
          ))}
        </div>
        {feed.length > feedLimit && (
          <button type="button" onClick={() => setFeedLimit(l => l + 15)}
            style={{ marginTop: 10, minHeight: 40, width: "100%", background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.accentText, fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
          >+ {Math.min(15, feed.length - feedLimit)} weitere von {feed.length}</button>
        )}
        <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 9, letterSpacing: "0.03em", lineHeight: 1.6, color: C.muted }}>
          Der Live-Feed aller Begegnungen liegt bewusst nur hier — auf der Wissens-Seite verbietet der Resonanzverhinderungsgedanke das endlose Scrollen.
        </div>
      </Section>
    </div>
  );
}
