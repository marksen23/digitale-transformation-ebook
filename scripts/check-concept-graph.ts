/**
 * check-concept-graph.ts — Wächter über die Topologie des Begriffsnetzes.
 *
 * Komplement zu validate-resonanzen.ts: dort wird der Korpus gegen das Netz
 * geprüft (danglingLinks), hier das Netz gegen sich selbst. Beantwortet die
 * Frage, die bislang niemand stellte: Hängt eigentlich alles zusammen?
 *
 * Gelesen werden alle drei kanonischen Schichten, die ConceptGraphPage rendert:
 *   - statisch : NODES / EDGES / LEITMOTIV_EDGES aus conceptGraph.ts
 *   - gewachsen: client/public/concept-edges.json  (Phase 5b, admin-erhoben)
 *   - gewachsen: client/public/concept-nodes.json  (Phase 5c, admin-erhoben)
 * Die private UserEdges-Schicht (localStorage) bleibt außen vor — sie ist pro
 * Leser verschieden und nicht Teil des Kanons.
 *
 * Die Rechnung steht in scripts/lib/concept-graph-utils.ts (dort auch das
 * Severity-Design). Hier nur Laden, Report schreiben, Exit-Code.
 *
 * Report: client/public/concept-graph-report.json
 * Exit 1 nur bei `alarm`. Isolation und abgetrennte Komponenten sind `warning` —
 * ob ein Begriff angebunden gehört, ist eine inhaltliche Entscheidung.
 *
 * Usage:
 *   pnpm check:graph
 *   pnpm check:graph --quiet     # nur Report + Statuszeile
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NODES, EDGES, LEITMOTIV_EDGES } from "../client/src/data/conceptGraph.js";
import type { PromotedEdge } from "../client/src/lib/promotedEdges.js";
import type { DynamicConceptNode } from "../client/src/lib/dynamicNodes.js";
import { analyseGraph, type TaggedEdge } from "./lib/concept-graph-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "client/public");
const REPORT_OUTPUT = path.join(PUBLIC_DIR, "concept-graph-report.json");

const QUIET = process.argv.includes("--quiet");

/** Fail-soft wie die Client-Loader: fehlt oder kaputt → leere Liste. */
function readLayer<T>(file: string, key: "edges" | "nodes"): T[] {
  const full = path.join(PUBLIC_DIR, file);
  if (!fs.existsSync(full)) return [];
  try {
    const data: unknown = JSON.parse(fs.readFileSync(full, "utf-8"));
    const list = (data as Record<string, unknown> | null)?.[key];
    return Array.isArray(list) ? (list as T[]) : [];
  } catch {
    console.warn(`[check-concept-graph] ${file} unlesbar — als leer behandelt`);
    return [];
  }
}

/**
 * Schreibt den Report nur, wenn sich inhaltlich etwas geändert hat — der
 * Zeitstempel allein zählt nicht. Sonst erzeugte jeder CI-Lauf einen Diff und
 * damit einen leeren Commit. Muster wie embeddingReuse.ts.
 */
function writeReportIfChanged(report: Record<string, unknown>): void {
  const withoutTimestamp = (data: Record<string, unknown>): string => {
    const { generatedAt: _ignored, ...rest } = data;
    return JSON.stringify(rest);
  };
  if (fs.existsSync(REPORT_OUTPUT)) {
    try {
      const previous: unknown = JSON.parse(fs.readFileSync(REPORT_OUTPUT, "utf-8"));
      if (withoutTimestamp(previous as Record<string, unknown>) === withoutTimestamp(report)) {
        console.log("[check-concept-graph] Report unverändert — nicht neu geschrieben");
        return;
      }
    } catch {
      // kaputter Vorgänger — einfach überschreiben
    }
  }
  fs.writeFileSync(REPORT_OUTPUT, JSON.stringify(report, null, 2));
}

function main(): void {
  const promoted = readLayer<PromotedEdge>("concept-edges.json", "edges");
  const dynamic = readLayer<DynamicConceptNode>("concept-nodes.json", "nodes");

  const nodeIds = [...NODES.map(n => n.id), ...dynamic.map(n => n.id)];

  const edges: TaggedEdge[] = [
    ...EDGES.map(e => ({ source: e.source, target: e.target, layer: "EDGES" })),
    ...LEITMOTIV_EDGES.map(e => ({ source: e.source, target: e.target, layer: "LEITMOTIV_EDGES" })),
    ...promoted.map(e => ({ source: e.source, target: e.target, layer: "concept-edges.json" })),
  ];

  const analysis = analyseGraph(nodeIds, edges);

  const report = {
    generatedAt: new Date().toISOString(),
    ...analysis,
    layers: {
      staticNodes: NODES.length,
      dynamicNodes: dynamic.length,
      staticEdges: EDGES.length + LEITMOTIV_EDGES.length,
      promotedEdges: promoted.length,
    },
  };

  const t = analysis.totals;
  console.log(
    `[check-concept-graph] status: ${analysis.status} — ` +
      `${t.nodes} Knoten, ${t.edges} Kanten, ${t.components} Komponente(n), ` +
      `${t.unreachableFromMain} vom Hauptnetz getrennt`,
  );

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  writeReportIfChanged(report);

  const warnings = analysis.issues.filter(i => i.level === "warning");
  const alarms = analysis.issues.filter(i => i.level === "alarm");

  if (!QUIET && warnings.length > 0) {
    console.warn("\n=== BEGRIFFSNETZ WARNINGS ===");
    for (const i of warnings) console.warn(`  [${i.rule}] ${i.detail}`);
  }
  if (alarms.length > 0) {
    console.error("\n=== BEGRIFFSNETZ ALARMS ===");
    for (const i of alarms) console.error(`  [${i.rule}] ${i.detail}`);
    process.exit(1);
  }
  if (warnings.length === 0) {
    console.log("[check-concept-graph] OK — Netz vollständig verbunden");
  }
}

main();
