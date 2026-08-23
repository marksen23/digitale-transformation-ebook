/**
 * MobileBetriebHealth — Bereich "Betrieb → Health" auf dem Telefon: eine
 * kompakte, echte Zusammenfassung der wichtigsten Signale aus
 * AdminHealthPage.tsx' vier Gruppen (Hosting/Qualität/Visualisierungen/
 * Meta), nicht dessen volle Tiefe (Netlify/Render/GitHub-Workflow-Runs,
 * Citation-Stats, UMAP-Karte, Kohärenz-Zeitreihe bleiben Desktop-
 * Werkzeuge — hier reicht der Status auf einen Blick). Alle Werte kommen
 * aus denselben echten Quellen wie dort: /api/admin/check, /api/health,
 * /api/admin/resonanz-health, die statischen Report-JSONs, und dem
 * echten Begriffsnetz (data/conceptGraph.ts).
 */
import { useEffect, useState } from "react";
import { NODES, EDGES, LEITMOTIV_EDGES } from "@/data/conceptGraph";
import { loadOptionalJson, type ValidationReport, type DriftReport, type HoldoutReport, MONO, SERIF, type Palette } from "@/pages/admin/adminShared";

const ADMIN_TOKEN_KEY = "dt-admin-token";

interface Row { t: string; st: string; c: string; sub: string }

async function fetchAdminJson<T>(path: string): Promise<T | null> {
  const t = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (!t) return null;
  try {
    const res = await fetch(path, { headers: { Authorization: `Bearer ${t}` } });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

interface LinkPredictionsStats { candidatesCount: number }

export default function MobileBetriebHealth({ C }: { C: Palette }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const muted = C.muted;
      const green = "#7a9a82";
      const warn = C.accent;
      const bad = "#c48282";

      // Hosting
      const t0 = performance.now();
      const heartbeat = await fetchAdminJson<{ ok?: boolean }>("/api/admin/check");
      const latencyMs = Math.round(performance.now() - t0);
      const embedHealth = await fetch("/api/health").then(r => r.ok ? r.json() : null).catch(() => null) as { embedding?: string } | null;
      const ingest = await fetchAdminJson<{ successCount?: number; failureCount?: number; githubTokenPresent?: boolean }>("/api/admin/resonanz-health");

      // Qualität
      const validation = await loadOptionalJson<ValidationReport>("/resonanzen-validation-report.json");
      const holdout = await loadOptionalJson<HoldoutReport>("/resonanzen-holdout-report.json");

      // Visualisierungen
      const drift = await loadOptionalJson<DriftReport>("/resonanzen-drift-report.json");
      const linkPred = await loadOptionalJson<{ stats: LinkPredictionsStats }>("/resonanzen-link-predictions.json");

      if (!live) return;

      const groups: Array<{ label: string; rows: Row[] }> = [
        { label: "Hosting · Was läuft?", rows: [
          { t: "Server-Heartbeat", st: heartbeat ? "✓ online" : "✕ offline", c: heartbeat ? green : bad, sub: `${latencyMs} ms` },
          { t: "Embedding-Pipeline", st: embedHealth?.embedding === "ok" ? "✓ ok" : embedHealth?.embedding ? `— ${embedHealth.embedding}` : "— unbekannt", c: embedHealth?.embedding === "ok" ? green : warn, sub: "GET /api/health" },
          { t: "Auto-Ingest", st: ingest ? `${ingest.successCount ?? 0} gelogged` : "— kein Zugriff", c: ingest ? green : muted, sub: ingest ? `${ingest.failureCount ?? 0} fehlgeschlagen · Token ${ingest.githubTokenPresent ? "vorhanden" : "fehlt"}` : "Token nötig" },
        ] },
        { label: "Qualität · Substanz", rows: [
          { t: "Korpus-Validation", st: validation ? `${validation.errors} Errors` : "— fehlt", c: validation ? (validation.errors > 0 ? bad : green) : muted, sub: validation ? `${validation.filesChecked} Dateien · ${validation.warnings} Warnings` : "Report nicht gebaut" },
          { t: "Hold-out-Konsistenz", st: holdout ? `${holdout.stable}/${holdout.checked} stabil` : "— fehlt", c: holdout ? (holdout.drifted > 0 ? warn : green) : muted, sub: holdout ? `${holdout.shifted} verschoben · ${holdout.drifted} Drift` : "Report nicht gebaut" },
        ] },
        { label: "Visualisierungen · Wachstum", rows: [
          { t: "Drift-Status", st: drift ? driftLabel(drift.status) : "— fehlt", c: drift ? driftColor(drift.status, C) : muted, sub: drift ? new Date(drift.generatedAt).toLocaleDateString("de-DE") : "Report nicht gebaut" },
          { t: "Edge-Kandidaten", st: linkPred ? `${linkPred.stats.candidatesCount} Kandidaten` : "— fehlt", c: linkPred ? C.accent : muted, sub: "werdende Verbindungen, noch nicht erhoben" },
        ] },
        { label: "Meta · Begriffsnetz", rows: [
          { t: "Semantischer Index", st: "FRISCH", c: green, sub: `${NODES.length} Begriffe · ${EDGES.length + LEITMOTIV_EDGES.length} Kanten` },
        ] },
      ];
      setRows(groups.flatMap(g => [
        { t: `__group__${g.label}`, st: "", c: "", sub: "" },
        ...g.rows,
      ]));
    })();
    return () => { live = false; };
  }, [C]);

  if (!rows) return <div style={{ fontFamily: SERIF, fontStyle: "italic", color: C.muted }}>lädt …</div>;

  return (
    <div style={{ paddingBottom: 4 }}>
      {rows.map((r, i) => r.t.startsWith("__group__") ? (
        <div key={i} style={{ padding: i === 0 ? "0 0 4px" : "16px 0 4px", fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.2em", textTransform: "uppercase", color: C.accentText, borderTop: i === 0 ? "none" : `1px solid ${C.border}`, marginTop: i === 0 ? 0 : 8 }}>
          {r.t.replace("__group__", "")}
        </div>
      ) : (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontFamily: SERIF, fontSize: 13.5, color: C.text, display: "block" }}>{r.t}</span>
            <span style={{ fontFamily: MONO, fontSize: 8.5, color: C.muted, marginTop: 2, display: "block" }}>{r.sub}</span>
          </div>
          <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.06em", color: r.c, paddingTop: 2 }}>{r.st}</span>
        </div>
      ))}
    </div>
  );
}

function driftLabel(status: string): string {
  if (status === "stable") return "✓ stable";
  if (status === "drift-warning") return "⚠ warning";
  if (status === "drift-alarm") return "🚨 alarm";
  return "noch zu wenig Daten";
}
function driftColor(status: string, C: Palette): string {
  if (status === "stable") return "#7a9a82";
  if (status === "drift-warning") return C.accent;
  if (status === "drift-alarm") return "#c48282";
  return C.muted;
}
