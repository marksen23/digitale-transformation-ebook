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
  Section, Stat, useAdminTheme, MONO,
  loadOptionalJson, type ValidationReport, type DriftReport,
} from "./adminShared";

type Heartbeat = { ok: boolean; latencyMs: number; checkedAt: string };

export default function AdminHealthPage() {
  const C = useAdminTheme();

  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null);
  const [heartbeat, setHeartbeat] = useState<Heartbeat | null>(null);
  const [reportsLoaded, setReportsLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      loadOptionalJson<ValidationReport>("/resonanzen-validation-report.json").then(setValidationReport),
      loadOptionalJson<DriftReport>("/resonanzen-drift-report.json").then(setDriftReport),
    ]).then(() => setReportsLoaded(true));
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
