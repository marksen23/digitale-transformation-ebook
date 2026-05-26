/**
 * AdminHealthPage (/admin/health) — Korpus-Validation, Drift-Status,
 * Server-Heartbeat.
 *
 * Daten-Quellen:
 *   /resonanzen-validation-report.json (Schema/YAML/Anchor-Checks)
 *   /resonanzen-drift-report.json      (Vergleich gegen letzten Snapshot)
 *   /api/admin/check                   (Heartbeat als Auth-Probe)
 */
import { useEffect, useState } from "react";
import {
  loadResonanzenIndex, loadEmbeddings,
  ENDPOINT_COLOR, ENDPOINT_LABEL,
} from "@/lib/resonanzenIndex";
import { detectAnchorTensions, type TensionResult } from "@/lib/widerspruchs";
import { analyzeCorpusCoherence, type CoherenceReport } from "@/lib/corpusCoherence";
import type { ResonanzEntry } from "@/lib/resonanzenIndex";
import Skeleton from "@/components/Skeleton";
import SectionLabel from "@/components/SectionLabel";
import { NODES, CAT_COLOR } from "@/data/conceptGraph";
import {
  Section, Stat, useAdminTheme, MONO, SERIF,
  loadOptionalJson, type ValidationReport, type DriftReport, type HoldoutReport,
} from "./adminShared";

type Heartbeat = { ok: boolean; latencyMs: number; checkedAt: string };

interface NetlifyDeploy {
  id: string;
  state: "ready" | "building" | "error" | "new" | "uploading" | "uploaded" | "preparing" | "processing" | string;
  branch: string;
  commit_ref: string | null;
  commit_url: string | null;
  title: string | null;
  deploy_time: number | null;
  created_at: string;
  published_at: string | null;
  error_message: string | null;
}
interface NetlifyStatus {
  site: {
    name: string; url: string; ssl_url: string;
    state: string; updated_at: string;
    published_deploy_id: string | null;
  };
  deploys: NetlifyDeploy[];
}

interface RenderDeploy {
  id: string;
  status: string;
  commit: { id: string; message: string } | null;
  createdAt: string;
  finishedAt: string | null;
  trigger: string;
}
interface RenderStatus {
  service: {
    name: string;
    type: string;
    repo: string;
    branch: string;
    serviceDetails: { url: string; region: string; plan: string } | null;
    suspended: string;
    updatedAt: string;
  };
  deploys: RenderDeploy[];
}

interface ResonanzHealth {
  githubTokenPresent: boolean;
  repoOwner: string;
  repoName: string;
  repoBranch: string;
  successCount: number;
  failureCount: number;
  skippedNoToken: number;
  skippedSpamFilter: number;
  lastSuccess: { id: string; ts: string; endpoint: string; anchor: string } | null;
  lastFailure: { ts: string; endpoint: string; reason: string } | null;
  echoDetector?: {
    cacheAgeSec: number | null;
    cachedEntries: number;
    lastEchoCount: number;
  };
  indexUpdater?: {
    appendSuccessCount: number;
    appendFailureCount: number;
    lastAppend: { id: string; ts: string } | null;
    lastAppendError: { ts: string; reason: string } | null;
  };
}

/** UMAP-2D-Projektion der Korpus-Embeddings (Phase 5). Vom Build-Step
 *  generiert via umap-js. Pro Punkt: id, endpoint, x/y in [0..1000],
 *  isOutlier (>2σ vom Centroid), promptPreview für Tooltip. */
interface CorpusMapFile {
  generatedAt: string;
  method: string;
  params: { nComponents: number; nNeighbors: number; minDist: number; seed: number };
  points: Array<{
    id: string;
    endpoint: string;
    x: number; y: number;
    isOutlier: boolean;
    isMaster: boolean;
    promptPreview: string;
  }>;
  stats: {
    total: number;
    outliers: number;
    byEndpoint: Record<string, number>;
  };
}

/** Edge-Kandidaten vom Build-Step (scripts/build-resonanzen-index.ts:
 *  writeLinkPredictions). Begriffspaare die in Resonanz-Einträgen oft
 *  gemeinsam als nodeIds auftauchen, aber keine direkte Concept-Graph-
 *  Kante haben. → potentielle Erweiterung von conceptGraph.ts EDGES. */
/** Korpus-Timeline (Feature I — Coherence-Dashboard). Aggregierte
 *  Zeitreihe aus versions/snapshot-*.json + aktuellem Index. */
interface TimelineBucket {
  date: string;
  totalEntries: number;
  byStatus: Record<string, number>;
  byEndpoint: Record<string, number>;
  publishedRatio?: number;
  medianWerkVoice?: number;
  medianCorpusVoice?: number;
  echoRatio?: number;
  noveltyRatio?: number;
}
interface TimelineFile {
  generatedAt: string;
  buckets: TimelineBucket[];
  stats: {
    totalSnapshots: number;
    avgGrowthPerDay: number;
    latestEchoRatio: number | null;
    latestNoveltyRatio: number | null;
  };
}

interface LinkPredictionsFile {
  generatedAt: string;
  minCooccurrence: number;
  candidates: Array<{
    source: string;
    target: string;
    cooccurrence: number;
    endpoints: Record<string, number>;
    sampleEntryIds: string[];
  }>;
  stats: {
    totalPairs: number;
    candidatesCount: number;
    existingEdges: number;
    maxCooccurrence: number;
  };
}

type AsyncResult<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "error"; error: string };

async function fetchAdminJson<T>(path: string): Promise<AsyncResult<T>> {
  const t = localStorage.getItem("dt-admin-token");
  if (!t) return { state: "error", error: "Token fehlt" };
  try {
    const res = await fetch(path, { headers: { "Authorization": `Bearer ${t}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { state: "error", error: data.error ?? `HTTP ${res.status}` };
    return { state: "ok", data: data as T };
  } catch (err) {
    return { state: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

export default function AdminHealthPage() {
  const C = useAdminTheme();

  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null);
  const [holdoutReport, setHoldoutReport] = useState<HoldoutReport | null>(null);
  // Link-Predictions: Begriffspaare die in Resonanzen oft zusammen auftauchen
  // aber keine Concept-Graph-Kante haben → Edge-Kandidaten zum Review.
  const [linkPredictions, setLinkPredictions] = useState<LinkPredictionsFile | null>(null);
  const [linkPredExpanded, setLinkPredExpanded] = useState(false);
  // Korpus-Landkarte (UMAP-2D der Embeddings)
  const [corpusMap, setCorpusMap] = useState<CorpusMapFile | null>(null);
  const [mapHoverPoint, setMapHoverPoint] = useState<CorpusMapFile["points"][number] | null>(null);
  const [timeline, setTimeline] = useState<TimelineFile | null>(null);
  const [heartbeat, setHeartbeat] = useState<Heartbeat | null>(null);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [tensions, setTensions] = useState<TensionResult | null>(null);
  const [coherence, setCoherence] = useState<CoherenceReport | null>(null);
  const [allEntries, setAllEntries] = useState<ResonanzEntry[] | null>(null);
  const [coherenceExpanded, setCoherenceExpanded] = useState(false);
  const [tensionsExpanded, setTensionsExpanded] = useState(false);
  const [holdoutExpanded, setHoldoutExpanded] = useState(false);
  const [netlify, setNetlify] = useState<AsyncResult<NetlifyStatus>>({ state: "loading" });
  const [render, setRender] = useState<AsyncResult<RenderStatus>>({ state: "loading" });
  const [ingest, setIngest] = useState<AsyncResult<ResonanzHealth>>({ state: "loading" });

  // Hosting-Status: Netlify + Render via Server-Proxies
  useEffect(() => {
    fetchAdminJson<NetlifyStatus>("/api/admin/netlify-status").then(setNetlify);
    fetchAdminJson<RenderStatus>("/api/admin/render-status").then(setRender);
    fetchAdminJson<ResonanzHealth>("/api/admin/resonanz-health").then(setIngest);
  }, []);

  useEffect(() => {
    Promise.all([
      loadOptionalJson<ValidationReport>("/resonanzen-validation-report.json").then(setValidationReport),
      loadOptionalJson<DriftReport>("/resonanzen-drift-report.json").then(setDriftReport),
      loadOptionalJson<HoldoutReport>("/resonanzen-holdout-report.json").then(setHoldoutReport),
      loadOptionalJson<LinkPredictionsFile>("/resonanzen-link-predictions.json").then(setLinkPredictions),
      loadOptionalJson<CorpusMapFile>("/resonanzen-corpus-map.json").then(setCorpusMap),
      loadOptionalJson<TimelineFile>("/resonanzen-timeline.json").then(setTimeline),
    ]).then(() => setReportsLoaded(true));
  }, []);

  // Anker-Spannungen + Korpus-Kohärenz: einmal laden, beide Analysen
  useEffect(() => {
    Promise.all([loadResonanzenIndex(), loadEmbeddings()]).then(([idx, emb]) => {
      setAllEntries(idx.entries);
      setCoherence(analyzeCorpusCoherence(idx.entries));
      if (!emb) {
        setTensions({ anchorsChecked: 0, tensionsFound: 0, medianAnchorCosine: null, tensions: [], status: "no-embeddings" });
        return;
      }
      const result = detectAnchorTensions(idx.entries, emb.embeddings);
      setTensions(result);
    }).catch(() => setTensions({ anchorsChecked: 0, tensionsFound: 0, medianAnchorCosine: null, tensions: [], status: "no-embeddings" }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      const t = localStorage.getItem("dt-admin-token");
      const start = performance.now();
      try {
        const res = await fetch("/api/admin/check", {
          method: "POST",
          headers: { "Authorization": `Bearer ${t ?? ""}`, "Content-Type": "application/json" },
        });
        const latencyMs = Math.round(performance.now() - start);
        if (!cancelled) setHeartbeat({ ok: res.ok, latencyMs, checkedAt: new Date().toISOString() });
      } catch {
        if (!cancelled) setHeartbeat({ ok: false, latencyMs: -1, checkedAt: new Date().toISOString() });
      }
    };
    ping();
    return () => { cancelled = true; };
  }, []);

  // Diagnose: wenn das Korpus voll ist aber keinerlei Embedding-abhängige
  // Felder enthält, fehlt mit hoher Sicherheit das GEMINI_API_KEY-Secret
  // in den GitHub-Actions-Settings. (Der Workflow läuft erfolgreich durch,
  // skipped die Embedding-Berechnung still — der einzige sichtbare Effekt
  // ist, dass Hold-out, Kohärenz, Spannungen und Drift leer bleiben.)
  const missingEmbeddingsLikely = !!allEntries && allEntries.length > 20
    && allEntries.every(e => !e.related?.length && typeof e.werkVoiceScore !== "number");

  return (
    <>
      {missingEmbeddingsLikely && (
        <div style={{
          background: "rgba(232,200,112,0.08)",
          border: `1px solid #e8c870`,
          borderRadius: 6,
          padding: "0.7rem 0.9rem",
          marginBottom: "1rem",
          fontFamily: SERIF,
          fontSize: "0.88rem",
          lineHeight: 1.55,
          color: C.text,
        }}>
          <SectionLabel c={C} color="#e8c870" tracking="tight" marginBottom="0.4rem">
            Diagnose
          </SectionLabel>
          <p style={{ margin: 0, fontStyle: "italic" }}>
            Der Korpus hat {allEntries?.length} Einträge, aber{" "}
            <strong>keine semantischen Felder</strong> (<code style={{ fontFamily: MONO, color: C.accent }}>werkVoiceScore</code>,{" "}
            <code style={{ fontFamily: MONO, color: C.accent }}>related[]</code>). Mögliche Ursachen:
          </p>
          <ol style={{ margin: "0.5rem 0", paddingLeft: "1.2rem", fontStyle: "italic" }}>
            <li><code style={{ fontFamily: MONO, color: C.accent }}>GEMINI_API_KEY</code>-Secret fehlt
              in den GitHub-Actions-Settings.</li>
            <li>Secret ist gesetzt, hat aber Whitespace (Copy-Paste-Falle) oder ist falscher Key.</li>
            <li>Free-Tier-Quota überschritten (100 RPM für text-embedding-004).</li>
          </ol>
          <p style={{ margin: "0.5rem 0 0", fontFamily: MONO, fontSize: "0.6rem", color: C.muted }}>
            Setup: <a
              href="https://github.com/marksen23/digitale-transformation-ebook/settings/secrets/actions"
              target="_blank" rel="noreferrer"
              style={{ color: C.accent, textDecoration: "none" }}
            >Repo → Settings → Secrets and variables → Actions ↗</a>{" "}
            · Name: <code style={{ color: C.accent }}>GEMINI_API_KEY</code> · Value: derselbe Key
            wie auf Render (keine Anführungszeichen, keine umrandenden Spaces). Danach „↻ Index neu
            bauen" drücken — der Workflow loggt jetzt erkennbar{" "}
            <code style={{ color: C.accent }}>GEMINI_API_KEY OK (len=…, masked=AIz…xyz)</code> bei
            Erfolg und{" "}
            <code style={{ color: C.accent }}>FATAL: 0 erfolgreiche Embedding-Calls</code> bei
            Fehlschlag (rot in den Action-Logs sichtbar).
          </p>
        </div>
      )}

      {/* H1: AdminHealthPage in 4 thematische Gruppen unterteilt mit
          GroupHeader (H2-Style mit Akzent-Hairline). Ersetzt die ehemals
          13 unstrukturierten Sections durch eine klare Hierarchie:
          Hosting → Qualität → Visualisierungen → Meta. */}
      <HealthTOC c={C} />

      <GroupHeader c={C} label="Hosting · Was läuft?" anchor="hosting" />

      <Section title="Server-Heartbeat" c={C}>
        {!heartbeat ? (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>pinge /api/admin/check …</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.8rem" }}>
            <Stat
              label="Status"
              value={heartbeat.ok ? "✓ online" : "✕ offline"}
              color={heartbeat.ok ? "#7ab898" : "#c48282"}
              c={C}
            />
            <Stat
              label="Latenz"
              value={heartbeat.latencyMs >= 0 ? `${heartbeat.latencyMs} ms` : "—"}
              color={heartbeat.latencyMs < 0 ? "#c48282" : heartbeat.latencyMs > 800 ? C.accent : "#7ab898"}
              c={C}
            />
            <Stat
              label="Geprüft"
              value={new Date(heartbeat.checkedAt).toLocaleTimeString("de-DE")}
              color={C.muted}
              c={C}
            />
          </div>
        )}
      </Section>

      <Section title="Auto-Ingest — Resonanzen-Logger" c={C}>
        <IngestPanel result={ingest} c={C} />
      </Section>

      <Section title="Netlify — Frontend-Deploys" c={C}>
        <NetlifyPanel result={netlify} c={C} />
      </Section>

      <Section title="Render — Backend-Service" c={C}>
        <RenderPanel result={render} c={C} />
      </Section>

      <GroupHeader c={C} label="Qualität · Wie steht's um die Substanz?" anchor="qualitaet" />

      <Section title="Korpus-Health (Validation)" c={C}>
        {!reportsLoaded ? (
          <Skeleton height={48} subtle />
        ) : validationReport ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.8rem", marginBottom: "0.6rem" }}>
              <Stat label="Files geprüft" value={validationReport.filesChecked} color={C.accent} c={C} />
              <Stat
                label="Errors"
                value={validationReport.errors}
                color={validationReport.errors > 0 ? "#c48282" : "#7ab898"}
                c={C}
              />
              <Stat
                label="Warnings"
                value={validationReport.warnings}
                color={validationReport.warnings > 0 ? C.accent : C.muted}
                c={C}
              />
            </div>
            <p style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, margin: 0 }}>
              Letzter Run: {new Date(validationReport.generatedAt).toLocaleString("de-DE")}
            </p>
          </>
        ) : (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>Kein Validation-Report verfügbar.</p>
        )}
      </Section>

      <Section title="Hold-out-Konsistenz" c={C}>
        {!reportsLoaded ? (
          <Skeleton height={48} subtle />
        ) : !holdoutReport ? (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>
            Kein Hold-out-Report verfügbar — Korpus zu klein (&lt;30) oder Build ohne Embeddings.
          </p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.8rem", marginBottom: "0.6rem" }}>
              <Stat label="Geprüft" value={holdoutReport.checked} color={C.accent} c={C} />
              <Stat label="Stabil" value={holdoutReport.stable} color="#7ab898" c={C} />
              <Stat label="Verschoben" value={holdoutReport.shifted} color={C.accent} c={C} />
              <Stat label="Drift" value={holdoutReport.drifted} color={holdoutReport.drifted > 0 ? "#c48282" : C.muted} c={C} />
            </div>
            <p style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, margin: "0 0 0.5rem 0" }}>
              Letzter Check: {new Date(holdoutReport.generatedAt).toLocaleString("de-DE")}
            </p>
            {holdoutReport.drifted > 0 && (
              <button
                onClick={() => setHoldoutExpanded(v => !v)}
                style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.5rem 0.8rem", cursor: "pointer", marginBottom: "0.5rem", minHeight: 36 }}
              >
                {holdoutExpanded ? "▾" : "▸"} Drift-Details ({holdoutReport.drifted})
              </button>
            )}
            {holdoutExpanded && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {holdoutReport.details.filter(d => d.overlap < 2).map(d => (
                  <div key={d.id} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "0.6rem 0.8rem", fontFamily: MONO, fontSize: "0.55rem" }}>
                    <div style={{ color: C.text, marginBottom: "0.3rem" }}>
                      <a href={`/resonanzen?id=${d.id}`} target="_blank" rel="noreferrer" style={{ color: C.accent, textDecoration: "none" }}>{d.id}</a>
                      <span style={{ marginLeft: "0.5rem", color: "#c48282" }}>overlap = {d.overlap}/3</span>
                    </div>
                    <div style={{ color: C.muted, lineHeight: 1.5 }}>
                      <div>baseline: {d.baseline.join(", ") || "—"}</div>
                      <div>current : {d.current.join(", ") || "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Section>

      {/* Korpus-Landkarte — UMAP-2D-Projektion der Embeddings. Zeigt
          thematische Cluster + Außenseiter im 3072-dim Embedding-Raum
          als SVG-Scatter. Build-time generiert via umap-js, Datei:
          resonanzen-corpus-map.json. */}
      <GroupHeader c={C} label="Visualisierungen · Wo wächst was?" anchor="visualisierungen" />

      <Section title="Korpus-Landkarte (UMAP-2D)" c={C}>
        {!corpusMap ? (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>
            corpus-map.json nicht verfügbar — entweder älterer Build oder Korpus &lt;10 Embeddings.
          </p>
        ) : (() => {
          const ENDPOINT_COLOR_LOCAL: Record<string, string> = {
            "analyse": "#5aacb8",
            "path-analyse": "#5aacb8",
            "graph-chat": "#7ab898",
            "chapter": "#c8a87a",
            "enkidu": "#f59e0b",
            "translate": "#9a88b8",
          };
          const PAD = 30;
          const SIZE = 520;
          // x/y → SVG-Koordinaten (Punkte sind in [0..1000])
          const tx = (x: number) => PAD + (x / 1000) * (SIZE - 2 * PAD);
          const ty = (y: number) => PAD + (y / 1000) * (SIZE - 2 * PAD);

          return (
            <>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: C.textDim, lineHeight: 1.5, marginTop: 0, marginBottom: "0.9rem" }}>
                {corpusMap.stats.total} Einträge projiziert via {corpusMap.method} ({corpusMap.params.nNeighbors} Nachbarn) ·{" "}
                <strong style={{ color: "#c48282" }}>{corpusMap.stats.outliers} Außenseiter</strong> (Distanz vom Centroid &gt;2σ).
                Nähe in der Karte = semantische Nähe im 3072-dim Embedding-Raum.
                Klick auf einen Punkt öffnet den Eintrag.
              </p>

              {/* Endpoint-Legende */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", marginBottom: "0.8rem", fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.05em" }}>
                {Object.entries(corpusMap.stats.byEndpoint).map(([ep, count]) => (
                  <span key={ep} style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: C.muted }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: ENDPOINT_COLOR_LOCAL[ep] ?? C.muted }} />
                    {ep} <span style={{ color: C.text }}>({count})</span>
                  </span>
                ))}
                <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: C.muted, marginLeft: "auto" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: "transparent", border: "1.5px solid #c48282" }} />
                  Außenseiter
                </span>
              </div>

              <div style={{ position: "relative" }}>
                <svg
                  viewBox={`0 0 ${SIZE} ${SIZE}`}
                  style={{
                    width: "100%", maxWidth: SIZE, height: "auto",
                    background: C.surface, border: `1px solid ${C.border}`,
                    display: "block",
                  }}
                >
                  {/* Faint center crosshair */}
                  <line x1={SIZE / 2} y1={PAD} x2={SIZE / 2} y2={SIZE - PAD} stroke={C.border} strokeDasharray="2 3" opacity={0.3} />
                  <line x1={PAD} y1={SIZE / 2} x2={SIZE - PAD} y2={SIZE / 2} stroke={C.border} strokeDasharray="2 3" opacity={0.3} />

                  {corpusMap.points.map(p => {
                    const color = ENDPOINT_COLOR_LOCAL[p.endpoint] ?? C.muted;
                    const isHover = mapHoverPoint?.id === p.id;
                    const r = p.isMaster ? 6 : p.isOutlier ? 5 : 3.5;
                    return (
                      <a
                        key={p.id}
                        href={`/resonanzen?id=${p.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <circle
                          cx={tx(p.x)} cy={ty(p.y)}
                          r={isHover ? r + 2 : r}
                          fill={p.isOutlier ? "transparent" : color}
                          stroke={p.isOutlier ? "#c48282" : p.isMaster ? "#7ab898" : color}
                          strokeWidth={p.isOutlier || p.isMaster ? 1.5 : 0.5}
                          opacity={isHover ? 1 : 0.75}
                          onMouseEnter={() => setMapHoverPoint(p)}
                          onMouseLeave={() => setMapHoverPoint(null)}
                          style={{ cursor: "pointer", transition: "all 0.12s" }}
                        />
                      </a>
                    );
                  })}
                </svg>
                {/* Hover-Tooltip */}
                {mapHoverPoint && (
                  <div style={{
                    position: "absolute", pointerEvents: "none",
                    top: 8, right: 8,
                    background: C.deep, border: `1px solid ${C.border}`,
                    padding: "0.5rem 0.7rem", maxWidth: 260,
                    fontFamily: MONO, fontSize: "0.55rem", color: C.text,
                    letterSpacing: "0.04em",
                  }}>
                    <div style={{ color: ENDPOINT_COLOR_LOCAL[mapHoverPoint.endpoint] ?? C.accent, marginBottom: "0.3rem" }}>
                      {mapHoverPoint.endpoint}
                      {mapHoverPoint.isMaster && <span style={{ color: "#7ab898" }}> · ◆ MASTER</span>}
                      {mapHoverPoint.isOutlier && <span style={{ color: "#c48282" }}> · Außenseiter</span>}
                    </div>
                    <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.78rem", color: C.text, lineHeight: 1.4 }}>
                      {mapHoverPoint.promptPreview}
                      {mapHoverPoint.promptPreview.length >= 80 && "…"}
                    </div>
                  </div>
                )}
              </div>
              <p style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, marginTop: "0.6rem", marginBottom: 0 }}>
                Seed {corpusMap.params.seed} (deterministic) · minDist {corpusMap.params.minDist} · Letzter Build: {new Date(corpusMap.generatedAt).toLocaleString("de-DE")}
              </p>
            </>
          );
        })()}
      </Section>

      {/* Kohärenz-über-Zeit (Tier-1-3-Roadmap, Feature I).
          Multi-Line-Chart: Median-Werk-Voice + Echo-Ratio + Novelty-Ratio
          + Growth über Zeit, aus versions/snapshot-*.json + aktuellem
          Index aggregiert. */}
      <Section title="Kohärenz über Zeit" c={C}>
        {!timeline || timeline.buckets.length === 0 ? (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>
            Timeline noch leer — beim nächsten Build wird die Aggregation aus versions/snapshot-*.json gebaut.
          </p>
        ) : (
          <TimelineChart timeline={timeline} c={C} />
        )}
      </Section>

      <Section title="Korpus-Kohärenz — Echos & Werk-Drift" c={C}>
        {!coherence || !allEntries ? (
          <Skeleton height={64} subtle />
        ) : (
          <CoherencePanel
            report={coherence}
            entries={allEntries}
            expanded={coherenceExpanded}
            onToggleExpanded={() => setCoherenceExpanded(v => !v)}
            c={C}
          />
        )}
      </Section>

      <Section title="Anker-Spannungen" c={C}>
        {!tensions ? (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>analysiere Embeddings …</p>
        ) : tensions.status === "no-embeddings" ? (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>
            Embeddings nicht verfügbar — Build-Step ohne <code style={{ fontFamily: MONO, color: C.accent }}>GEMINI_API_KEY</code>.
          </p>
        ) : tensions.status === "no-multi-anchors" ? (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>
            Keine Anker mit ≥2 Einträgen vorhanden — Detection wartet auf wachsenden Korpus.
          </p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.8rem", marginBottom: "0.6rem" }}>
              <Stat label="Anker geprüft" value={tensions.anchorsChecked} color={C.accent} c={C} />
              <Stat
                label="Spannungen"
                value={tensions.tensionsFound}
                color={tensions.tensionsFound === 0 ? "#7ab898" : "#c48282"}
                c={C}
              />
              <Stat
                label="Median Cosine"
                value={tensions.medianAnchorCosine !== null ? tensions.medianAnchorCosine.toFixed(3) : "—"}
                color={C.muted}
                c={C}
              />
            </div>
            {tensions.tensionsFound === 0 ? (
              <p style={{ fontFamily: MONO, fontSize: "0.6rem", color: "#7ab898" }}>
                ✓ keine Spannungen unter Schwelle (cos &lt; 0.55)
              </p>
            ) : (
              <>
                <button
                  onClick={() => setTensionsExpanded(v => !v)}
                  style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.5rem 0.8rem", cursor: "pointer", marginBottom: "0.6rem", minHeight: 36 }}
                >
                  {tensionsExpanded ? "▾" : "▸"} {tensions.tensions.length} Paare anzeigen
                </button>
                {tensionsExpanded && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {tensions.tensions.map((t, i) => (
                      <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "0.7rem 0.9rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: ENDPOINT_COLOR[t.endpoint] }}>
                            {ENDPOINT_LABEL[t.endpoint]} · {t.anchor}
                          </span>
                          <span style={{ fontFamily: MONO, fontSize: "0.55rem", color: t.similarity < 0.4 ? "#c48282" : C.accent }}>
                            cos = {t.similarity.toFixed(3)}
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.5rem" }}>
                          <a href={`/resonanzen?id=${t.entryA.id}`} target="_blank" rel="noreferrer"
                             style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.78rem", color: C.text, textDecoration: "none", lineHeight: 1.4, padding: "0.4rem 0.5rem", border: `1px solid ${C.border}`, minHeight: 44 }}>
                            A → {t.entryA.prompt.slice(0, 80)}{t.entryA.prompt.length > 80 ? "…" : ""}
                          </a>
                          <a href={`/resonanzen?id=${t.entryB.id}`} target="_blank" rel="noreferrer"
                             style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.78rem", color: C.text, textDecoration: "none", lineHeight: 1.4, padding: "0.4rem 0.5rem", border: `1px solid ${C.border}`, minHeight: 44 }}>
                            B → {t.entryB.prompt.slice(0, 80)}{t.entryB.prompt.length > 80 ? "…" : ""}
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Section>

      {/* Edge-Kandidaten — Begriffspaare die oft zusammen als nodeIds
          in Resonanzen auftauchen, aber im Concept-Graph keine direkte
          Kante haben. Wird vom build-resonanzen-index.ts:writeLinkPredictions
          generiert (resonanzen-link-predictions.json). */}
      <Section title="Edge-Kandidaten — Begriffe die zusammen klingen, aber nicht verbunden sind" c={C}>
        {!reportsLoaded ? (
          <Skeleton height={48} subtle />
        ) : linkPredictions && linkPredictions.candidates.length > 0 ? (() => {
          const visible = linkPredExpanded ? linkPredictions.candidates : linkPredictions.candidates.slice(0, 10);
          // Quick-Lookup für Node-Labels + Kategorien
          const nodeLabel = (id: string): string => {
            const n = NODES.find(x => x.id === id);
            return n ? (n.fullLabel || n.label.replace("\n", " ")) : id;
          };
          const nodeCat = (id: string): string | undefined => NODES.find(x => x.id === id)?.category;
          return (
            <>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem", color: C.textDim, lineHeight: 1.5, marginTop: 0, marginBottom: "0.8rem" }}>
                <strong>{linkPredictions.stats.candidatesCount}</strong> Paare mit ≥{linkPredictions.minCooccurrence} gemeinsamen
                Resonanzen, aber ohne Kante im <code style={{ fontFamily: MONO, color: C.accent }}>conceptGraph.ts</code>.
                Empirische Brücken die der Werk-Graph noch nicht abbildet. Klick auf einen Pfeil → Pfad-Tool im Begriffsnetz.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {visible.map((c, idx) => {
                  const srcCat = nodeCat(c.source);
                  const tgtCat = nodeCat(c.target);
                  const srcColor = srcCat ? (CAT_COLOR as Record<string, string>)[srcCat] : C.muted;
                  const tgtColor = tgtCat ? (CAT_COLOR as Record<string, string>)[tgtCat] : C.muted;
                  return (
                    <div key={`${c.source}-${c.target}-${idx}`} style={{
                      display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap",
                      padding: "0.5rem 0.7rem",
                      background: c.cooccurrence >= 4 ? "rgba(126,184,200,0.06)" : C.surface,
                      border: `1px solid ${c.cooccurrence >= 4 ? "rgba(126,184,200,0.3)" : C.border}`,
                      borderLeft: `3px solid ${c.cooccurrence >= 4 ? "#5aacb8" : C.border}`,
                    }}>
                      <span style={{ fontFamily: MONO, fontSize: "0.62rem", letterSpacing: "0.08em", color: srcColor }}>
                        {nodeLabel(c.source)}
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: "0.7rem", color: C.muted }}>↔</span>
                      <span style={{ fontFamily: MONO, fontSize: "0.62rem", letterSpacing: "0.08em", color: tgtColor }}>
                        {nodeLabel(c.target)}
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: "0.55rem", color: c.cooccurrence >= 4 ? "#5aacb8" : C.muted, marginLeft: "auto" }}>
                        {c.cooccurrence}× zusammen
                      </span>
                      <a
                        href={`/begriffsnetz?from=${c.source}&to=${c.target}`}
                        target="_blank" rel="noreferrer"
                        title={`Pfad-Analyse im Begriffsnetz · ${Object.entries(c.endpoints).map(([k, v]) => `${k}=${v}`).join(", ")}`}
                        style={{
                          fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em",
                          textTransform: "uppercase", color: "#5aacb8",
                          textDecoration: "none",
                          padding: "0.3rem 0.5rem",
                          border: "1px solid rgba(126,184,200,0.4)",
                          minHeight: 28,
                        }}
                      >
                        ◈ Pfad ↗
                      </a>
                    </div>
                  );
                })}
              </div>
              {linkPredictions.candidates.length > 10 && (
                <button
                  onClick={() => setLinkPredExpanded(v => !v)}
                  style={{
                    marginTop: "0.7rem",
                    fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em",
                    textTransform: "uppercase", color: C.muted,
                    background: "none", border: `1px solid ${C.border}`,
                    padding: "0.5rem 0.8rem", cursor: "pointer", minHeight: 36,
                  }}
                >
                  {linkPredExpanded
                    ? "einklappen"
                    : `+ ${linkPredictions.candidates.length - 10} weitere zeigen`}
                </button>
              )}
              <p style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, marginTop: "0.8rem", lineHeight: 1.5 }}>
                Aufnahme ins Werk: <code style={{ color: C.accent }}>client/src/data/conceptGraph.ts</code> →
                <code style={{ color: C.accent }}> EDGES</code>-Array erweitern mit{" "}
                <code style={{ color: C.accent }}>{`{ source: "…", target: "…", weight: "secondary" }`}</code>.
                {linkPredictions.stats.existingEdges} Kanten existieren bereits · max Co-Occurrence: {linkPredictions.stats.maxCooccurrence}× ·
                Letzter Check: {new Date(linkPredictions.generatedAt).toLocaleString("de-DE")}
              </p>
            </>
          );
        })() : linkPredictions ? (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>
            Keine Edge-Kandidaten gefunden — alle in Resonanzen häufig gemeinsam auftretenden
            Begriffspaare haben bereits eine Kante im Concept-Graph.
          </p>
        ) : (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>
            link-predictions.json nicht verfügbar (älterer Build oder Workflow-Run pending).
          </p>
        )}
      </Section>

      <Section title="Drift-Status" c={C}>
        {!reportsLoaded ? (
          <Skeleton height={48} subtle />
        ) : driftReport ? (
          <>
            <div style={{ marginBottom: "0.6rem" }}>
              <span style={{
                fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase",
                color: driftReport.status === "stable" ? "#7ab898" : driftReport.status === "drift-alarm" ? "#c48282" : C.accent,
              }}>
                {driftReport.status === "stable" && "✓ stable"}
                {driftReport.status === "drift-warning" && "⚠ warning"}
                {driftReport.status === "drift-alarm" && "🚨 alarm"}
                {driftReport.status === "insufficient-data" && "noch zu wenig Daten"}
              </span>
            </div>
            {driftReport.delta && (
              <p style={{ fontFamily: MONO, fontSize: "0.6rem", color: C.text, margin: "0 0 0.5rem 0" }}>
                Δ Files seit letztem Snapshot: {driftReport.delta.files > 0 ? "+" : ""}{driftReport.delta.files}
              </p>
            )}
            {driftReport.issues && driftReport.issues.length > 0 && (
              <ul style={{ fontFamily: MONO, fontSize: "0.62rem", color: C.text, paddingLeft: "1.2rem", lineHeight: 1.6, margin: "0.4rem 0" }}>
                {driftReport.issues.map((i, idx) => (
                  <li key={idx} style={{ color: i.level === "alarm" ? "#c48282" : C.accent }}>
                    [{i.rule}] {i.detail}
                  </li>
                ))}
              </ul>
            )}
            <p style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, margin: "0.6rem 0 0 0" }}>
              Letzter Check: {new Date(driftReport.generatedAt).toLocaleString("de-DE")}
            </p>
          </>
        ) : (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>
            Kein Drift-Report verfügbar (mindestens 2 Snapshots nötig).
          </p>
        )}
      </Section>

      <GroupHeader c={C} label="Meta · Repo & Snapshots" anchor="meta" />

      <Section title="Repo & Snapshots" c={C}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontFamily: MONO, fontSize: "0.62rem" }}>
          <a
            href="https://github.com/marksen23/digitale-transformation-ebook/releases/tag/last-stable"
            target="_blank" rel="noreferrer"
            style={{ color: C.accent, textDecoration: "none", letterSpacing: "0.05em" }}
          >
            ↗ last-stable Tag (GitHub)
          </a>
          <a
            href="https://github.com/marksen23/digitale-transformation-ebook/tree/main/versions"
            target="_blank" rel="noreferrer"
            style={{ color: C.accent, textDecoration: "none", letterSpacing: "0.05em" }}
          >
            ↗ Snapshots-Verzeichnis (versions/)
          </a>
          <a
            href="https://github.com/marksen23/digitale-transformation-ebook/actions"
            target="_blank" rel="noreferrer"
            style={{ color: C.accent, textDecoration: "none", letterSpacing: "0.05em" }}
          >
            ↗ GitHub Actions — letzte Workflow-Runs
          </a>
        </div>
      </Section>
    </>
  );
}

// ─── Ingest-Panel — Auto-Logging-Status ─────────────────────────────────

// ─── Korpus-Kohärenz-Panel ──────────────────────────────────────────────
//
// Surface zwei Sichten:
//   1. Echo-Cluster: Gruppen von Einträgen, die einander semantisch
//      wiederholen (Cosine ≥0.88). "Diese 3 sagen im Kern dasselbe."
//   2. Werk-Drift: Einträge mit niedrigem werkVoiceScore (Distanz zum
//      Centroid der kuratierten Einträge). Drift-Verdacht ab <0.55.

function CoherencePanel({ report, entries, expanded, onToggleExpanded, c }: {
  report: CoherenceReport;
  entries: ResonanzEntry[];
  expanded: boolean;
  onToggleExpanded: () => void;
  c: ReturnType<typeof useAdminTheme>;
}) {
  const byId = new Map(entries.map(e => [e.id, e]));
  const haveSemantic = report.voiceStats !== null;

  if (!haveSemantic && report.clusters.length === 0) {
    return (
      <p style={{ fontStyle: "italic", color: c.textDim, fontSize: "0.85rem" }}>
        Embeddings nicht verfügbar — Build-Step ohne <code style={{ fontFamily: MONO, color: c.accent }}>GEMINI_API_KEY</code>.
        Kohärenz-Analyse braucht semantische Vektoren.
      </p>
    );
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.8rem", marginBottom: "0.8rem" }}>
        <Stat label="Echo-Cluster" value={report.clusters.length} color={report.clusters.length > 0 ? "#e8c870" : "#7ab898"} c={c} />
        <Stat label="Einträge mit Echos" value={report.entriesWithEchoes} color={c.accent} c={c} />
        <Stat label="Werk-Drift-Verdacht" value={report.driftCandidates} color={report.driftCandidates > 0 ? "#c48282" : "#7ab898"} c={c} />
        {report.voiceStats && (
          <Stat
            label="Werk-Median"
            value={(report.voiceStats.median * 100).toFixed(0) + "%"}
            color={report.voiceStats.median > 0.65 ? "#7ab898" : report.voiceStats.median > 0.55 ? c.accent : "#c48282"}
            c={c}
          />
        )}
        {report.corpusVoiceStats && (
          <Stat
            label="Buch-Median"
            value={(report.corpusVoiceStats.median * 100).toFixed(0) + "%"}
            color={report.corpusVoiceStats.median > 0.6 ? "#7ab898" : report.corpusVoiceStats.median > 0.45 ? c.accent : "#c48282"}
            c={c}
          />
        )}
      </div>

      {report.clusters.length === 0 && report.driftCandidates === 0 ? (
        <p style={{ fontStyle: "italic", color: c.textDim, fontSize: "0.85rem", margin: 0 }}>
          ✓ Keine semantischen Echos, keine Drift-Kandidaten. Der Korpus spricht in einer Stimme.
        </p>
      ) : (
        <button
          onClick={onToggleExpanded}
          style={{
            fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
            color: c.muted, background: "none", border: `1px solid ${c.border}`,
            padding: "0.35rem 0.7rem", cursor: "pointer", borderRadius: 4,
            marginBottom: expanded ? "0.8rem" : 0,
          }}
        >
          {expanded ? "▾ einklappen" : "▸ Details zeigen"}
        </button>
      )}

      {expanded && (
        <>
          {report.clusters.length > 0 && (
            <div style={{ marginTop: "0.5rem", marginBottom: "1.2rem" }}>
              <SectionLabel c={c} tracking="tight" marginBottom="0.5rem">
                Echo-Cluster ({report.clusters.length})
              </SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {report.clusters.slice(0, 6).map((cluster, i) => (
                  <div key={i} style={{ background: c.surface, border: `1px solid ${c.border}`, padding: "0.6rem 0.8rem", borderRadius: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.4rem", flexWrap: "wrap" }}>
                      <span style={{
                        fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
                        color: "#e8c870",
                      }}>
                        {cluster.ids.length} Einträge · {cluster.dominantEndpoint}
                      </span>
                      {cluster.sharedAnchor && (
                        <span style={{ fontFamily: MONO, fontSize: "0.5rem", color: c.muted }}>
                          → {cluster.sharedAnchor}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {cluster.ids.map(id => {
                        const e = byId.get(id);
                        if (!e) return null;
                        return (
                          <a
                            key={id}
                            href={`/resonanzen?id=${id}`}
                            style={{
                              fontFamily: SERIF, fontStyle: "italic", fontSize: "0.78rem",
                              color: c.text, textDecoration: "none",
                              borderLeft: `2px solid ${c.border}`, paddingLeft: "0.6rem",
                              lineHeight: 1.4,
                            }}
                          >
                            {e.prompt.length > 100 ? e.prompt.slice(0, 100) + "…" : e.prompt}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {report.clusters.length > 6 && (
                  <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: c.textDim, fontStyle: "italic" }}>
                    … und {report.clusters.length - 6} weitere Cluster
                  </div>
                )}
              </div>
            </div>
          )}

          {report.topDrift.length > 0 && (
            <div>
              <SectionLabel c={c} tracking="tight" marginBottom="0.5rem">
                Werk-Drift-Kandidaten (niedrigste werkstreue-Scores)
              </SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {report.topDrift.map(e => (
                  <a
                    key={e.id}
                    href={`/resonanzen?id=${e.id}`}
                    style={{
                      display: "block",
                      background: c.surface, border: `1px solid #c48282`, borderRadius: 6,
                      padding: "0.5rem 0.7rem", textDecoration: "none",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.4rem", marginBottom: "0.25rem" }}>
                      <span style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#c48282" }}>
                        {e.endpoint} · {e.anchor}
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: "0.6rem", color: "#c48282", display: "inline-flex", gap: "0.5rem", alignItems: "baseline" }}>
                        <span title="Werkstreue-Score: Distanz zum Centroid kuratierter Einträge">werk {((e.werkVoiceScore ?? 0) * 100).toFixed(0)}%</span>
                        {typeof e.corpusVoiceScore === "number" && (
                          <span title="Buchstreue-Score: max Cosine zu Kapitel-Embeddings" style={{ color: e.corpusVoiceScore < 0.4 ? "#c48282" : c.muted }}>
                            · buch {((e.corpusVoiceScore) * 100).toFixed(0)}%
                          </span>
                        )}
                      </span>
                    </div>
                    <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.78rem", color: c.text, lineHeight: 1.4 }}>
                      {e.prompt.length > 110 ? e.prompt.slice(0, 110) + "…" : e.prompt}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function IngestPanel({ result, c }: { result: AsyncResult<ResonanzHealth>; c: ReturnType<typeof useAdminTheme> }) {
  if (result.state === "loading") {
    return <p style={{ fontStyle: "italic", color: c.textDim, fontSize: "0.85rem" }}>frage Status …</p>;
  }
  if (result.state === "error") {
    return <p style={{ fontStyle: "italic", color: c.textDim, fontSize: "0.85rem" }}>Fehler: {result.error}</p>;
  }
  const h = result.data;
  const tokenOk = h.githubTokenPresent;
  const hasActivity = h.successCount > 0 || h.failureCount > 0;
  // Status-Diagnose: kaputt, wenn Token fehlt, oder wenn nur Fehler/Skips
  const broken = !tokenOk || (hasActivity && h.successCount === 0);
  const statusColor = broken ? "#c48282" : !hasActivity ? c.muted : "#7ab898";
  const statusLabel = !tokenOk
    ? "✗ Token fehlt"
    : !hasActivity
      ? "○ keine Aktivität seit Server-Start"
      : broken
        ? "⚠ schreibt nicht"
        : "✓ aktiv";

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.8rem", marginBottom: "0.8rem" }}>
        <Stat label="Pipeline-Status" value={statusLabel} color={statusColor} c={c} />
        <Stat label="Erfolgreich gelogged" value={h.successCount} color="#7ab898" c={c} />
        <Stat label="Fehlgeschlagen" value={h.failureCount} color={h.failureCount > 0 ? "#c48282" : c.muted} c={c} />
        <Stat label="Übersprungen (kein Token)" value={h.skippedNoToken} color={h.skippedNoToken > 0 ? "#c48282" : c.muted} c={c} />
        <Stat label="Übersprungen (Spam)" value={h.skippedSpamFilter} color={c.muted} c={c} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: c.muted, letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
        Ziel-Repo: <span style={{ color: c.text }}>{h.repoOwner}/{h.repoName}</span> @ <span style={{ color: c.accent }}>{h.repoBranch}</span>
      </div>
      {h.echoDetector && (
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: c.muted, letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
          Echo-Detector: <span style={{ color: c.text }}>{h.echoDetector.cachedEntries}</span> Einträge im Cache
          {h.echoDetector.cacheAgeSec !== null && <> · <span style={{ color: c.text }}>{h.echoDetector.cacheAgeSec}s</span> alt</>}
          {h.echoDetector.lastEchoCount > 0 && <> · letzter Treffer: <span style={{ color: "#e8c870" }}>{h.echoDetector.lastEchoCount} Echo(s)</span></>}
        </div>
      )}
      {h.indexUpdater && (
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: c.muted, letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
          Index-Append: <span style={{ color: "#7ab898" }}>{h.indexUpdater.appendSuccessCount} ✓</span>
          {h.indexUpdater.appendFailureCount > 0 && <> · <span style={{ color: "#c48282" }}>{h.indexUpdater.appendFailureCount} ✗</span></>}
          {h.indexUpdater.lastAppend && <> · letzter: <span style={{ color: c.text }}>{h.indexUpdater.lastAppend.id}</span></>}
          {h.indexUpdater.lastAppendError && (
            <div style={{ color: "#c48282", fontStyle: "italic", marginTop: "0.2rem" }}>
              ⚠ {h.indexUpdater.lastAppendError.reason}
            </div>
          )}
        </div>
      )}
      {h.lastSuccess && (
        <div style={{ background: c.surface, border: `1px solid ${c.border}`, padding: "0.5rem 0.7rem", marginBottom: "0.4rem" }}>
          <SectionLabel c={c} color="#7ab898" size="sm" tracking="tight" marginBottom="0.25rem">
            Letzter Erfolg
          </SectionLabel>
          <div style={{ fontFamily: MONO, fontSize: "0.6rem", color: c.text }}>
            {h.lastSuccess.endpoint} · {h.lastSuccess.anchor} · <span style={{ color: c.muted }}>{formatRelative(h.lastSuccess.ts)}</span>
          </div>
        </div>
      )}
      {h.lastFailure && (
        <div style={{ background: c.surface, border: `1px solid #c48282`, padding: "0.5rem 0.7rem" }}>
          <SectionLabel c={c} color="#c48282" size="sm" tracking="tight" marginBottom="0.25rem">
            Letzter Fehler
          </SectionLabel>
          <div style={{ fontFamily: MONO, fontSize: "0.6rem", color: c.text, marginBottom: "0.25rem" }}>
            {h.lastFailure.endpoint} · <span style={{ color: c.muted }}>{formatRelative(h.lastFailure.ts)}</span>
          </div>
          <div style={{ fontFamily: SERIF, fontSize: "0.78rem", fontStyle: "italic", color: c.text, lineHeight: 1.4 }}>
            {h.lastFailure.reason}
          </div>
        </div>
      )}
      {!tokenOk && (
        <div style={{ fontFamily: SERIF, fontSize: "0.85rem", fontStyle: "italic", color: c.textDim, marginTop: "0.4rem" }}>
          <code style={{ fontFamily: MONO, color: c.accent }}>GITHUB_TOKEN</code> ist nicht in den Server-Env-Vars gesetzt — alle KI-Antworten werden still verworfen. Auf Render im Dashboard hinzufügen, dann Service neu starten.
        </div>
      )}
      <IngestRebuildSection c={c} />
    </>
  );
}

/**
 * Verbindet TriggerRebuild + WorkflowRuns — nach erfolgreichem Trigger
 * refresht die Runs-Liste sofort (nicht erst beim nächsten 30s-Interval).
 */
function IngestRebuildSection({ c }: { c: ReturnType<typeof useAdminTheme> }) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <TriggerRebuild c={c} onTriggered={() => setRefreshKey(k => k + 1)} />
      <WorkflowRuns c={c} refreshKey={refreshKey} />
    </>
  );
}

interface WorkflowRun {
  id: number;
  runNumber: number;
  status: string;
  conclusion: string | null;
  event: string;
  displayTitle: string;
  headSha: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  triggeringActor: string;
}

/**
 * Zeigt die letzten 5 validate-corpus.yml-Runs. Auto-refresh alle 30s,
 * damit ein laufender Rebuild seinen Status hier durchpulst.
 */
function WorkflowRuns({ c, refreshKey }: { c: ReturnType<typeof useAdminTheme>; refreshKey?: number }) {
  const [runs, setRuns] = useState<WorkflowRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const t = localStorage.getItem("dt-admin-token");
    try {
      const res = await fetch("/api/admin/workflow-runs", {
        headers: { "Authorization": `Bearer ${t ?? ""}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setRuns(data.runs);
        setError(null);
      } else {
        setError(data.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verbindungsfehler");
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  // refreshKey bewirkt sofortigen reload nach TriggerRebuild
  }, [refreshKey]);

  if (error) {
    return (
      <div style={{ marginTop: "0.6rem", fontFamily: MONO, fontSize: "0.55rem", color: c.muted }}>
        Workflow-Runs nicht abrufbar: {error}
      </div>
    );
  }
  if (!runs) {
    return (
      <div style={{ marginTop: "0.6rem", fontFamily: MONO, fontSize: "0.55rem", color: c.muted, fontStyle: "italic" }}>
        lade Workflow-Runs …
      </div>
    );
  }
  if (runs.length === 0) {
    return (
      <div style={{ marginTop: "0.6rem", fontFamily: MONO, fontSize: "0.55rem", color: c.muted }}>
        Noch keine Workflow-Runs.
      </div>
    );
  }

  return (
    <div style={{ marginTop: "0.7rem" }}>
      <SectionLabel c={c} size="sm" tracking="tight" marginBottom="0.4rem">
        Letzte 5 Workflow-Runs (validate-corpus)
      </SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        {runs.map(r => {
          const color = r.status === "in_progress" || r.status === "queued"
            ? "#e8c870"
            : r.conclusion === "success"
              ? "#7ab898"
              : r.conclusion === "failure"
                ? "#c48282"
                : c.muted;
          const label = r.status !== "completed"
            ? `⟳ ${r.status}`
            : r.conclusion === "success" ? "✓ success"
            : r.conclusion === "failure" ? "✗ failed"
            : r.conclusion ?? "?";
          return (
            <a
              key={r.id}
              href={r.htmlUrl}
              target="_blank" rel="noreferrer"
              style={{
                display: "block",
                fontFamily: MONO, fontSize: "0.55rem",
                textDecoration: "none",
                padding: "0.3rem 0.5rem",
                background: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: 4,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.15rem" }}>
                <span style={{ color, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {label} · {r.event}
                </span>
                <span style={{ color: c.muted }}>
                  #{r.runNumber} · {formatRelative(r.updatedAt)}
                </span>
              </div>
              <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.72rem", color: c.text, lineHeight: 1.3 }}>
                {r.displayTitle.length > 90 ? r.displayTitle.slice(0, 90) + "…" : r.displayTitle}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

/**
 * TriggerRebuild — Self-Service-Button, der den validate-corpus-Workflow
 * via /api/admin/trigger-rebuild dispatched. Bevölkert semantische Felder
 * (related, nearDuplicates, werkVoiceScore, corpusVoiceScore) inkl.
 * Buchtext-Embeddings, sofern GEMINI_API_KEY als Repo-Secret gesetzt ist.
 */
function TriggerRebuild({ c, onTriggered }: { c: ReturnType<typeof useAdminTheme>; onTriggered?: () => void }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [actionsUrl, setActionsUrl] = useState<string | null>(null);
  async function trigger() {
    setState("loading"); setMessage(""); setActionsUrl(null);
    const t = localStorage.getItem("dt-admin-token");
    try {
      const res = await fetch("/api/admin/trigger-rebuild", {
        method: "POST",
        headers: { "Authorization": `Bearer ${t ?? ""}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setState("ok");
        setMessage(data.message ?? "Workflow triggered");
        setActionsUrl(data.actionsUrl ?? null);
        // GitHub-API hat eine kurze Latenz bis der neue Run sichtbar wird.
        // Nach 3s nochmal triggern damit der Run sicher gelistet ist.
        setTimeout(() => onTriggered?.(), 500);
        setTimeout(() => onTriggered?.(), 3000);
      } else {
        setState("error");
        setMessage(`${data.error ?? `HTTP ${res.status}`}${data.hint ? ` · ${data.hint}` : ""}`);
      }
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Verbindungsfehler");
    }
  }
  return (
    <div style={{ marginTop: "0.8rem", paddingTop: "0.7rem", borderTop: `1px solid ${c.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
        <button
          onClick={trigger}
          disabled={state === "loading"}
          style={{
            fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase",
            color: state === "loading" ? c.muted : c.accent,
            background: "transparent",
            border: `1px solid ${state === "loading" ? c.border : c.accent}`,
            padding: "0.4rem 0.8rem", borderRadius: 6,
            cursor: state === "loading" ? "not-allowed" : "pointer",
            transition: "all 0.15s",
          }}
          title="Triggert validate-corpus.yml — rebuildet Index inkl. Embeddings"
        >
          {state === "loading" ? "wird getriggert …" : "↻ Index neu bauen"}
        </button>
        <span style={{ fontFamily: MONO, fontSize: "0.55rem", color: c.muted, letterSpacing: "0.05em" }}>
          (Workflow-Dispatch — ~1-2 Min bis Commit auf main)
        </span>
      </div>
      {state === "ok" && (
        <div style={{ marginTop: "0.4rem", fontFamily: MONO, fontSize: "0.6rem", color: "#7ab898" }}>
          ✓ {message}
          {actionsUrl && (
            <> · <a href={actionsUrl} target="_blank" rel="noreferrer" style={{ color: c.accent }}>Workflow-Run öffnen ↗</a></>
          )}
        </div>
      )}
      {state === "error" && (
        <div style={{ marginTop: "0.4rem", fontFamily: MONO, fontSize: "0.6rem", color: "#c48282" }}>
          ✗ {message}
        </div>
      )}
    </div>
  );
}

// ─── Netlify-Panel ──────────────────────────────────────────────────────

function NetlifyPanel({ result, c }: { result: AsyncResult<NetlifyStatus>; c: ReturnType<typeof useAdminTheme> }) {
  if (result.state === "loading") {
    return <p style={{ fontStyle: "italic", color: c.textDim, fontSize: "0.85rem" }}>frage Netlify-API …</p>;
  }
  if (result.state === "error") {
    return (
      <p style={{ fontStyle: "italic", color: c.textDim, fontSize: "0.85rem" }}>
        {result.error.includes("nicht konfiguriert")
          ? <>Netlify-API nicht konfiguriert. Setze auf Render: <code style={{ fontFamily: MONO, color: c.accent }}>NETLIFY_TOKEN</code> + <code style={{ fontFamily: MONO, color: c.accent }}>NETLIFY_SITE_ID</code>.</>
          : `Fehler: ${result.error}`}
      </p>
    );
  }
  const { site, deploys } = result.data;
  const lastReady = deploys.find(d => d.state === "ready");

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.8rem", marginBottom: "0.8rem" }}>
        <Stat
          label="Site-Status"
          value={site.state === "current" ? "✓ live" : site.state}
          color={site.state === "current" ? "#7ab898" : "#c48282"}
          c={c}
        />
        <Stat
          label="Letzter Deploy"
          value={lastReady ? formatRelative(lastReady.published_at ?? lastReady.created_at) : "—"}
          color={c.accent}
          c={c}
        />
        <Stat
          label="Build-Dauer"
          value={lastReady?.deploy_time ? `${lastReady.deploy_time}s` : "—"}
          color={c.muted}
          c={c}
        />
      </div>
      <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: c.muted, letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
        Letzte 5 Deploys
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {deploys.map(d => (
          <div key={d.id} style={{ background: c.surface, border: `1px solid ${c.border}`, padding: "0.6rem 0.8rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.3rem" }}>
              <span style={{
                fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
                color: deployStateColor(d.state, c),
              }}>
                {d.state} · {d.branch}
              </span>
              <span style={{ fontFamily: MONO, fontSize: "0.5rem", color: c.muted }}>
                {formatRelative(d.published_at ?? d.created_at)}
              </span>
            </div>
            {d.title && (
              <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.78rem", color: c.text, lineHeight: 1.4 }}>
                {d.title.slice(0, 110)}{d.title.length > 110 ? "…" : ""}
              </div>
            )}
            {d.error_message && (
              <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: "#c48282", marginTop: "0.3rem" }}>
                ⚠ {d.error_message.slice(0, 200)}
              </div>
            )}
            {d.commit_url && (
              <a href={d.commit_url} target="_blank" rel="noreferrer" style={{ fontFamily: MONO, fontSize: "0.5rem", color: c.accent, textDecoration: "none" }}>
                ↗ {d.commit_ref?.slice(0, 7) ?? "commit"}
              </a>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Render-Panel ───────────────────────────────────────────────────────

function RenderPanel({ result, c }: { result: AsyncResult<RenderStatus>; c: ReturnType<typeof useAdminTheme> }) {
  if (result.state === "loading") {
    return <p style={{ fontStyle: "italic", color: c.textDim, fontSize: "0.85rem" }}>frage Render-API …</p>;
  }
  if (result.state === "error") {
    return (
      <p style={{ fontStyle: "italic", color: c.textDim, fontSize: "0.85rem" }}>
        {result.error.includes("nicht konfiguriert")
          ? <>Render-API nicht konfiguriert. Setze auf Render: <code style={{ fontFamily: MONO, color: c.accent }}>RENDER_API_KEY</code> + <code style={{ fontFamily: MONO, color: c.accent }}>RENDER_SERVICE_ID</code>.</>
          : `Fehler: ${result.error}`}
      </p>
    );
  }
  const { service, deploys } = result.data;
  const lastLive = deploys.find(d => d.status === "live");
  const isSuspended = service.suspended === "suspended";

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.8rem", marginBottom: "0.8rem" }}>
        <Stat
          label="Service"
          value={isSuspended ? "✕ pausiert" : "✓ live"}
          color={isSuspended ? "#c48282" : "#7ab898"}
          c={c}
        />
        <Stat
          label="Letzter Deploy"
          value={lastLive ? formatRelative(lastLive.finishedAt ?? lastLive.createdAt) : "—"}
          color={c.accent}
          c={c}
        />
        <Stat
          label="Region"
          value={service.serviceDetails?.region ?? "—"}
          color={c.muted}
          c={c}
        />
        <Stat
          label="Plan"
          value={service.serviceDetails?.plan ?? "—"}
          color={c.muted}
          c={c}
        />
      </div>
      <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: c.muted, letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
        Letzte 3 Deploys
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {deploys.map(d => (
          <div key={d.id} style={{ background: c.surface, border: `1px solid ${c.border}`, padding: "0.6rem 0.8rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.3rem" }}>
              <span style={{
                fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
                color: deployStateColor(d.status, c),
              }}>
                {d.status} · {d.trigger}
              </span>
              <span style={{ fontFamily: MONO, fontSize: "0.5rem", color: c.muted }}>
                {formatRelative(d.finishedAt ?? d.createdAt)}
              </span>
            </div>
            {d.commit?.message && (
              <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.78rem", color: c.text, lineHeight: 1.4 }}>
                {d.commit.message.split("\n")[0].slice(0, 120)}
                <span style={{ fontFamily: MONO, fontSize: "0.55rem", color: c.muted, marginLeft: "0.5rem" }}>
                  {d.commit.id.slice(0, 7)}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function deployStateColor(state: string, c: ReturnType<typeof useAdminTheme>): string {
  if (state === "ready" || state === "live") return "#7ab898";
  if (state === "error" || state === "build_failed" || state === "canceled") return "#c48282";
  if (state === "building" || state === "uploading" || state === "preparing" || state === "in_progress" || state === "queued") return c.accent;
  return c.muted;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} Min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} h`;
  const dd = Math.floor(h / 24);
  if (dd < 7) return `vor ${dd} Tagen`;
  return d.toLocaleDateString("de-DE", { year: "numeric", month: "short", day: "numeric" });
}

// ─── TimelineChart (Tier-1-3-Roadmap, Feature I) ─────────────────────────
// Multi-Line-SVG-Chart aus den Timeline-Buckets. Lines: totalEntries,
// medianWerkVoice (skaliert), echoRatio, noveltyRatio. Tooltip via Hover.
function TimelineChart({ timeline, c }: { timeline: TimelineFile; c: ReturnType<typeof useAdminTheme> }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 700, H = 240, PAD_L = 50, PAD_R = 20, PAD_T = 20, PAD_B = 40;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const buckets = timeline.buckets;
  if (buckets.length < 2) {
    return <p style={{ fontStyle: 'italic', color: c.textDim }}>Mindestens 2 Snapshots nötig für Trend.</p>;
  }
  const maxTotal = Math.max(...buckets.map(b => b.totalEntries), 10);
  const tx = (i: number) => PAD_L + (i / (buckets.length - 1)) * innerW;
  const ty = (v: number, max: number) => PAD_T + (1 - v / max) * innerH;

  // Lines: Werk-Voice (0..1) auf rechter Skala; Total (0..maxTotal) auf linker
  const linePoints = (key: 'medianWerkVoice' | 'echoRatio' | 'noveltyRatio') =>
    buckets.map((b, i) => {
      const v = b[key];
      if (typeof v !== 'number') return null;
      return { x: tx(i), y: ty(v, 1) };
    });
  const totalPoints = buckets.map((b, i) => ({ x: tx(i), y: ty(b.totalEntries, maxTotal) }));
  const polyTotal = totalPoints.map(p => p.x + ',' + p.y).join(' ');
  const polyWerk  = linePoints('medianWerkVoice').filter(p => p !== null).map(p => p!.x + ',' + p!.y).join(' ');
  const polyEcho  = linePoints('echoRatio').filter(p => p !== null).map(p => p!.x + ',' + p!.y).join(' ');
  const polyNov   = linePoints('noveltyRatio').filter(p => p !== null).map(p => p!.x + ',' + p!.y).join(' ');

  const hov = hoverIdx !== null ? buckets[hoverIdx] : null;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.6rem', fontFamily: MONO, fontSize: '0.55rem', color: c.muted }}>
        <Legend color={c.accent} label='total Einträge' />
        <Legend color='#5aacb8' label='median werkVoice' />
        <Legend color='#f59e0b' label='echo-Anteil' />
        <Legend color='#7ab898' label='novelty-Anteil' />
      </div>
      <svg viewBox={'0 0 ' + W + ' ' + H} width='100%' style={{ maxWidth: W, background: c.surface, border: '1px solid ' + c.border }}>
        {/* Y-axis Total (left) */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={'l' + f}>
            <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + f * innerH} y2={PAD_T + f * innerH} stroke={c.border} strokeDasharray='2,3' opacity={0.4} />
            <text x={PAD_L - 5} y={PAD_T + f * innerH + 3} fontSize='9' fill={c.muted} textAnchor='end' fontFamily={MONO as string}>
              {Math.round(maxTotal * (1 - f))}
            </text>
          </g>
        ))}
        {/* Y-axis Ratio (right) */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <text key={'r' + f} x={W - PAD_R + 5} y={PAD_T + f * innerH + 3} fontSize='9' fill={c.muted} fontFamily={MONO as string}>
            {(1 - f).toFixed(2)}
          </text>
        ))}
        {/* X-axis Dates */}
        {buckets.map((b, i) => i % Math.max(1, Math.floor(buckets.length / 6)) === 0 && (
          <text key={'d' + i} x={tx(i)} y={H - PAD_B + 14} fontSize='9' fill={c.muted} textAnchor='middle' fontFamily={MONO as string}>
            {b.date.slice(5)}
          </text>
        ))}
        {/* Lines */}
        {polyTotal && <polyline points={polyTotal} fill='none' stroke={c.accent} strokeWidth={1.5} />}
        {polyWerk  && <polyline points={polyWerk}  fill='none' stroke='#5aacb8' strokeWidth={1.5} />}
        {polyEcho  && <polyline points={polyEcho}  fill='none' stroke='#f59e0b' strokeWidth={1.5} />}
        {polyNov   && <polyline points={polyNov}   fill='none' stroke='#7ab898' strokeWidth={1.5} />}
        {/* Hover-Markers */}
        {buckets.map((b, i) => (
          <rect key={'h' + i} x={tx(i) - 12} y={PAD_T} width={24} height={innerH}
            fill='transparent' onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} />
        ))}
        {hov && (
          <g>
            <line x1={tx(hoverIdx!)} x2={tx(hoverIdx!)} y1={PAD_T} y2={PAD_T + innerH} stroke={c.text} strokeDasharray='2,2' opacity={0.5} />
            <circle cx={tx(hoverIdx!)} cy={ty(hov.totalEntries, maxTotal)} r={3} fill={c.accent} />
          </g>
        )}
      </svg>
      {hov && (
        <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.7rem', background: c.deep, border: '1px solid ' + c.border, fontFamily: MONO, fontSize: '0.55rem', color: c.text, lineHeight: 1.6 }}>
          <strong>{hov.date}</strong> · {hov.totalEntries} Einträge
          {typeof hov.medianWerkVoice === 'number' && ' · medWerk ' + hov.medianWerkVoice.toFixed(2)}
          {typeof hov.echoRatio === 'number' && ' · echo ' + (hov.echoRatio * 100).toFixed(0) + '%'}
          {typeof hov.noveltyRatio === 'number' && ' · novelty ' + (hov.noveltyRatio * 100).toFixed(0) + '%'}
        </div>
      )}
      <p style={{ marginTop: '0.6rem', fontFamily: MONO, fontSize: '0.5rem', color: c.muted, lineHeight: 1.6 }}>
        Ø-Wachstum: {timeline.stats.avgGrowthPerDay} Einträge/Tag · {timeline.buckets.length} Snapshots ·{' '}
        latest: echo {timeline.stats.latestEchoRatio !== null ? (timeline.stats.latestEchoRatio * 100).toFixed(0) + '%' : '–'} ·
        novelty {timeline.stats.latestNoveltyRatio !== null ? (timeline.stats.latestNoveltyRatio * 100).toFixed(0) + '%' : '–'}
      </p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <span style={{ width: 10, height: 2, background: color }} />
      {label}
    </span>
  );
}


// ─── GroupHeader (Sprint H1) ──────────────────────────────────────────────
// Thematische Gruppe-Überschrift zwischen den Section-Clustern auf der
// AdminHealthPage. Größer und ruhiger als ein Section-Header (h2 wäre
// hierarchie-verwirrend), mit Akzent-Hairline und Anchor-ID für Quick-Jumps.
function GroupHeader({ c, label, anchor }: { c: ReturnType<typeof useAdminTheme>; label: string; anchor: string }) {
  return (
    <div id={anchor} style={{
      marginTop: "2.2rem", marginBottom: "0.6rem",
      paddingTop: "1.2rem",
      borderTop: `2px solid ${c.accent}`,
      scrollMarginTop: "5rem",  // damit Anchor-Sprung nicht unter dem AppFrame steht
    }}>
      <div style={{
        fontFamily: SERIF, fontStyle: "italic",
        fontSize: "0.95rem", color: c.accent,
        letterSpacing: "0.01em", lineHeight: 1.3,
      }}>
        {label}
      </div>
    </div>
  );
}

// ─── HealthTOC (Sprint H1) ────────────────────────────────────────────────
// Sticky Quick-Jump-Nav am Seitenanfang. Vier Gruppen-Anker als kompakte
// Mono-Caps-Pills. Nur Desktop (>=768px) — auf Mobile wäre die Sticky-Bar
// zu viel Bildschirm-Verbrauch.
function HealthTOC({ c }: { c: ReturnType<typeof useAdminTheme> }) {
  return (
    <nav
      className="health-toc"
      style={{
        position: "sticky", top: "3.4rem", zIndex: 40,
        display: "flex", gap: "0.4rem", flexWrap: "wrap",
        padding: "0.6rem 0.8rem",
        background: `${c.deep}f0`,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: `1px solid ${c.border}`,
        marginBottom: "1.5rem",
        fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
      }}
    >
      <span style={{ color: c.muted, marginRight: "0.4rem" }}>↪ Springe zu:</span>
      <a href="#hosting" style={{ color: c.accent, textDecoration: "none" }}>Hosting</a>
      <span style={{ color: c.muted }}>·</span>
      <a href="#qualitaet" style={{ color: c.accent, textDecoration: "none" }}>Qualität</a>
      <span style={{ color: c.muted }}>·</span>
      <a href="#visualisierungen" style={{ color: c.accent, textDecoration: "none" }}>Visualisierungen</a>
      <span style={{ color: c.muted }}>·</span>
      <a href="#meta" style={{ color: c.accent, textDecoration: "none" }}>Meta</a>
      <style>{`
        @media (max-width: 768px) { .health-toc { display: none !important; } }
      `}</style>
    </nav>
  );
}
