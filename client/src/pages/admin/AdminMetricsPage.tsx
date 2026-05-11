/**
 * AdminMetricsPage (/admin/metrics) — Analytics aus dem Korpus.
 *
 * Read-only Dashboard mit Endpoint-Verteilung, Status, Time-Series,
 * Top-Konzepten, Top-Ankern und durchschnittlicher Antwortlänge.
 * Daten kommen aus /resonanzen-index.json.
 */
import { useEffect, useMemo, useState } from "react";
import {
  loadResonanzenIndex, loadEmbeddings,
  ENDPOINT_LABEL, ENDPOINT_COLOR,
  type ResonanzIndex,
} from "@/lib/resonanzenIndex";
import { analyzeClusters, type ClusterAnalysis } from "@/lib/clusterAnalysis";
import Skeleton from "@/components/Skeleton";
import {
  Section, Stat, MiniTagCloud, TimeSeries, computeStats, useAdminTheme, MONO, SERIF,
} from "./adminShared";

export default function AdminMetricsPage() {
  const C = useAdminTheme();
  const [index, setIndex] = useState<ResonanzIndex | null>(null);
  const [clusters, setClusters] = useState<ClusterAnalysis | null>(null);
  const [clusterState, setClusterState] = useState<"idle" | "computing" | "ready" | "no-embeddings" | "too-few">("idle");

  useEffect(() => {
    loadResonanzenIndex().then(setIndex).catch(() => null);
  }, []);

  // Cluster-Berechnung in idle-time, sobald Index geladen ist
  useEffect(() => {
    if (!index) return;
    setClusterState("computing");
    const run = () => {
      loadEmbeddings().then(emb => {
        if (!emb || Object.keys(emb.embeddings).length === 0) {
          setClusterState("no-embeddings");
          return;
        }
        const result = analyzeClusters(index.entries, emb.embeddings);
        if (!result) {
          setClusterState("too-few");
          return;
        }
        setClusters(result);
        setClusterState("ready");
      }).catch(() => setClusterState("no-embeddings"));
    };
    // requestIdleCallback wo verfügbar, sonst setTimeout
    type IdleAPI = (cb: () => void, opts?: { timeout: number }) => number;
    const ric = (window as unknown as { requestIdleCallback?: IdleAPI }).requestIdleCallback;
    if (typeof ric === "function") ric(run, { timeout: 2000 });
    else setTimeout(run, 50);
  }, [index]);

  const stats = useMemo(() => index ? computeStats(index.entries) : null, [index]);

  if (!stats) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <Skeleton height="1.4rem" width="60%" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.8rem" }}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={64} />)}
        </div>
        <Skeleton height="1rem" width="40%" subtle />
        <Skeleton height={200} subtle />
      </div>
    );
  }

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

      <Section title={clusters ? `Semantische Cluster (k = ${clusters.k})` : "Semantische Cluster"} c={C}>
        {clusterState === "computing" && (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>berechne Cluster …</p>
        )}
        {clusterState === "no-embeddings" && (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>
            Embeddings nicht verfügbar — Build-Step ohne <code style={{ fontFamily: MONO, color: C.accent }}>GEMINI_API_KEY</code>.
          </p>
        )}
        {clusterState === "too-few" && (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>
            Zu wenig Daten für Clusterung (mindestens 10 Einträge mit Embedding nötig).
          </p>
        )}
        {clusterState === "ready" && clusters && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.8rem" }}>
            {clusters.clusters.map(cl => {
              const epColor = ENDPOINT_COLOR[cl.dominantEndpoint] ?? C.accent;
              return (
                <div key={cl.index} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "0.9rem 1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
                    <span style={{ fontFamily: SERIF, fontSize: "1.6rem", color: epColor }}>{cl.size}</span>
                    <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.12em", textTransform: "uppercase", color: epColor }}>
                      {ENDPOINT_LABEL[cl.dominantEndpoint] ?? cl.dominantEndpoint}
                    </span>
                  </div>
                  {cl.topNodeIds.length > 0 && (
                    <div style={{ marginBottom: "0.5rem" }}>
                      <MiniTagCloud items={cl.topNodeIds} c={C} />
                    </div>
                  )}
                  {cl.closestEntries.length > 0 && (
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "0.5rem", marginTop: "0.4rem" }}>
                      <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: "0.3rem" }}>
                        zentrumsnächste
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                        {cl.closestEntries.map(e => (
                          <a
                            key={e.id}
                            href={`/resonanzen?id=${e.id}`}
                            target="_blank" rel="noreferrer"
                            style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.78rem", color: C.text, textDecoration: "none", lineHeight: 1.4 }}
                          >
                            → {e.prompt.slice(0, 90)}{e.prompt.length > 90 ? "…" : ""}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
