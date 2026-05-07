/**
 * AdminMetricsPage (/admin/metrics) — Analytics aus dem Korpus.
 *
 * Read-only Dashboard mit Endpoint-Verteilung, Status, Time-Series,
 * Top-Konzepten, Top-Ankern und durchschnittlicher Antwortlänge.
 * Daten kommen aus /resonanzen-index.json.
 */
import { useEffect, useMemo, useState } from "react";
import {
  loadResonanzenIndex,
  ENDPOINT_LABEL, ENDPOINT_COLOR,
  type ResonanzIndex,
} from "@/lib/resonanzenIndex";
import {
  Section, Stat, MiniTagCloud, TimeSeries, computeStats, useAdminTheme, MONO,
} from "./adminShared";

export default function AdminMetricsPage() {
  const C = useAdminTheme();
  const [index, setIndex] = useState<ResonanzIndex | null>(null);

  useEffect(() => {
    loadResonanzenIndex().then(setIndex).catch(() => null);
  }, []);

  const stats = useMemo(() => index ? computeStats(index.entries) : null, [index]);

  if (!stats) return <p style={{ fontStyle: "italic", color: C.textDim }}>lädt Statistiken …</p>;

  return (
    <>
      <p style={{ fontStyle: "italic", fontSize: "0.85rem", color: C.textDim, margin: 0 }}>
        {index ? `${index.count} Begegnungen · zuletzt erzeugt ${new Date(index.generatedAt).toLocaleString("de-DE")}` : ""}
      </p>

      <Section title="Übersicht — Endpoint-Verteilung" c={C}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.8rem" }}>
          {Object.entries(stats.byEndpoint).map(([ep, count]) => (
            <Stat key={ep} label={ENDPOINT_LABEL[ep as keyof typeof ENDPOINT_LABEL] ?? ep} value={count} color={ENDPOINT_COLOR[ep as keyof typeof ENDPOINT_COLOR] ?? C.accent} c={C} />
          ))}
        </div>
      </Section>

      <Section title="Status-Verteilung (Kuration)" c={C}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.8rem" }}>
          {(["raw", "pending", "approved", "published", "rejected"] as const).map(s => (
            <Stat key={s} label={s} value={stats.byStatus[s] ?? 0} color={s === "published" ? "#7ab898" : s === "approved" ? "#5aacb8" : s === "pending" ? C.accent : s === "rejected" ? "#c48282" : C.muted} c={C} />
          ))}
        </div>
      </Section>

      <Section title="Anfragen — letzte 30 Tage" c={C}>
        <TimeSeries data={stats.timeSeries} c={C} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", fontFamily: MONO, fontSize: "0.5rem", color: C.muted }}>
          <span>{stats.timeSeries[0]?.date}</span>
          <span>{stats.timeSeries[stats.timeSeries.length - 1]?.date}</span>
        </div>
      </Section>

      <Section title={`Top-Konzepte im Korpus (${stats.topNodeIds.length})`} c={C}>
        <MiniTagCloud items={stats.topNodeIds} c={C} />
      </Section>

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

      <Section title="Durchschnittliche Antwortlänge" c={C}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.8rem" }}>
          {Object.entries(stats.avgResponseLength).map(([ep, len]) => (
            <Stat key={ep} label={ENDPOINT_LABEL[ep as keyof typeof ENDPOINT_LABEL] ?? ep} value={`${len.toLocaleString("de-DE")} Z.`} color={ENDPOINT_COLOR[ep as keyof typeof ENDPOINT_COLOR] ?? C.accent} c={C} />
          ))}
        </div>
      </Section>
    </>
  );
}
