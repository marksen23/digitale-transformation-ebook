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

  return (
    <>
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

      <Section title="Repo & Snapshots" c={C}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontFamily: MONO, fontSize: "0.62rem" }}>
          <a
            href="https://github.com/markus-schober/digitale-transformation-ebook/releases/tag/last-stable"
            target="_blank" rel="noreferrer"
            style={{ color: C.accent, textDecoration: "none", letterSpacing: "0.05em" }}
          >
            ↗ last-stable Tag (GitHub)
          </a>
          <a
            href="https://github.com/markus-schober/digitale-transformation-ebook/tree/main/versions"
            target="_blank" rel="noreferrer"
            style={{ color: C.accent, textDecoration: "none", letterSpacing: "0.05em" }}
          >
            ↗ Snapshots-Verzeichnis (versions/)
          </a>
          <a
            href="https://github.com/markus-schober/digitale-transformation-ebook/actions"
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
              <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: c.muted, marginBottom: "0.5rem" }}>
                Echo-Cluster ({report.clusters.length})
              </div>
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
              <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: c.muted, marginBottom: "0.5rem" }}>
                Werk-Drift-Kandidaten (niedrigste werkstreue-Scores)
              </div>
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
      {h.lastSuccess && (
        <div style={{ background: c.surface, border: `1px solid ${c.border}`, padding: "0.5rem 0.7rem", marginBottom: "0.4rem" }}>
          <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#7ab898", marginBottom: "0.25rem" }}>
            Letzter Erfolg
          </div>
          <div style={{ fontFamily: MONO, fontSize: "0.6rem", color: c.text }}>
            {h.lastSuccess.endpoint} · {h.lastSuccess.anchor} · <span style={{ color: c.muted }}>{formatRelative(h.lastSuccess.ts)}</span>
          </div>
        </div>
      )}
      {h.lastFailure && (
        <div style={{ background: c.surface, border: `1px solid #c48282`, padding: "0.5rem 0.7rem" }}>
          <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#c48282", marginBottom: "0.25rem" }}>
            Letzter Fehler
          </div>
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
    </>
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
