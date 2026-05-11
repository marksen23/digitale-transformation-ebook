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
  const [tensionsExpanded, setTensionsExpanded] = useState(false);
  const [holdoutExpanded, setHoldoutExpanded] = useState(false);
  const [netlify, setNetlify] = useState<AsyncResult<NetlifyStatus>>({ state: "loading" });
  const [render, setRender] = useState<AsyncResult<RenderStatus>>({ state: "loading" });

  // Hosting-Status: Netlify + Render via Server-Proxies
  useEffect(() => {
    fetchAdminJson<NetlifyStatus>("/api/admin/netlify-status").then(setNetlify);
    fetchAdminJson<RenderStatus>("/api/admin/render-status").then(setRender);
  }, []);

  useEffect(() => {
    Promise.all([
      loadOptionalJson<ValidationReport>("/resonanzen-validation-report.json").then(setValidationReport),
      loadOptionalJson<DriftReport>("/resonanzen-drift-report.json").then(setDriftReport),
      loadOptionalJson<HoldoutReport>("/resonanzen-holdout-report.json").then(setHoldoutReport),
    ]).then(() => setReportsLoaded(true));
  }, []);

  // Anker-Spannungen: Index + Embeddings laden, dann detection laufen lassen
  useEffect(() => {
    Promise.all([loadResonanzenIndex(), loadEmbeddings()]).then(([idx, emb]) => {
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
