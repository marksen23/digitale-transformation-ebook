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
import {
  Section, Stat, useAdminTheme, MONO, SERIF,
  loadOptionalJson, type ValidationReport, type DriftReport,
} from "./adminShared";

type Heartbeat = { ok: boolean; latencyMs: number; checkedAt: string };

export default function AdminHealthPage() {
  const C = useAdminTheme();

  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null);
  const [heartbeat, setHeartbeat] = useState<Heartbeat | null>(null);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [tensions, setTensions] = useState<TensionResult | null>(null);
  const [tensionsExpanded, setTensionsExpanded] = useState(false);

  useEffect(() => {
    Promise.all([
      loadOptionalJson<ValidationReport>("/resonanzen-validation-report.json").then(setValidationReport),
      loadOptionalJson<DriftReport>("/resonanzen-drift-report.json").then(setDriftReport),
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

      <Section title="Korpus-Health (Validation)" c={C}>
        {!reportsLoaded ? (
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>lädt Reports …</p>
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
          <p style={{ fontStyle: "italic", color: C.textDim, fontSize: "0.85rem" }}>lädt Reports …</p>
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
