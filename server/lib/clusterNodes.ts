/**
 * Knoten für /api/analyse-cluster.
 *
 * Der Client schickt Label und Beschreibung mit. Im Prompt gilt nur der
 * server-seitige Text: das feste Begriffsnetz, danach die akzeptierten
 * Knoten aus concept-nodes.json. Eine unbekannte ID wird abgelehnt.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ClusterNodeSource {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
}

export type ClusterResolution =
  | { ok: true; nodes: ClusterNodeSource[] }
  | { ok: false; error: string };

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? "marksen23";
const REPO_NAME = process.env.GITHUB_REPO_NAME ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";
const NODES_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/client/public/concept-nodes.json`;
const CACHE_MS = 60_000;

let cache: { at: number; map: Map<string, ClusterNodeSource> } | null = null;

function clipId(id: string): string {
  return id.replace(/[\u0000-\u001f]/g, "").slice(0, 80);
}

export function conceptSourcesFromJson(data: unknown): Map<string, ClusterNodeSource> {
  const list = data && typeof data === "object" && Array.isArray((data as { nodes?: unknown }).nodes)
    ? (data as { nodes: unknown[] }).nodes
    : [];
  const map = new Map<string, ClusterNodeSource>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const n = item as Record<string, unknown>;
    if (typeof n.id !== "string" || typeof n.fullLabel !== "string" || typeof n.description !== "string") continue;
    const id = n.id.trim();
    if (!id || !n.fullLabel.trim() || !n.description.trim()) continue;
    map.set(id, {
      id,
      label: typeof n.label === "string" && n.label.trim() ? n.label : n.fullLabel,
      fullLabel: n.fullLabel,
      description: n.description,
    });
  }
  return map;
}

function readLocalConceptNodes(): Map<string, ClusterNodeSource> {
  const rel = path.join("client", "public", "concept-nodes.json");
  const candidates = [
    path.resolve(process.cwd(), rel),
    path.resolve(__dir, "..", "..", rel),
    path.resolve(__dir, "..", rel),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      return conceptSourcesFromJson(JSON.parse(fs.readFileSync(file, "utf8")));
    } catch {
      /* nächste Quelle */
    }
  }
  return new Map();
}

/** Akzeptierte 5c-Knoten. GitHub-Raw zuerst, lokale Datei wenn das fehlschlägt. */
export async function loadDynamicConceptSources(): Promise<Map<string, ClusterNodeSource>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.map;
  let map: Map<string, ClusterNodeSource> | null = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(NODES_URL, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (res.ok) map = conceptSourcesFromJson(await res.json());
  } catch {
    map = null;
  }
  const resolved = map ?? readLocalConceptNodes();
  cache = { at: Date.now(), map: resolved };
  return resolved;
}

export function resolveClusterNodes(
  input: unknown,
  canonical: { get(id: string): ClusterNodeSource | undefined },
  dynamic: { get(id: string): ClusterNodeSource | undefined } = new Map(),
): ClusterResolution {
  if (!Array.isArray(input)) return { ok: false, error: "nodes-Array ist erforderlich." };
  if (input.length < 2 || input.length > 4) {
    return { ok: false, error: "Cluster-Analyse braucht 2 bis 4 Knoten." };
  }
  const nodes: ClusterNodeSource[] = [];
  for (const item of input) {
    const id = item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"
      ? (item as { id: string }).id.trim()
      : "";
    if (!id) return { ok: false, error: "Jeder Knoten braucht eine id." };
    const src = canonical.get(id) ?? dynamic.get(id);
    if (!src) return { ok: false, error: `Unbekannter Knoten: ${clipId(id)}` };
    nodes.push({ id: src.id, label: src.label, fullLabel: src.fullLabel, description: src.description });
  }
  if (new Set(nodes.map((n) => n.id)).size !== nodes.length) {
    return { ok: false, error: "Alle Konzepte müssen verschieden sein." };
  }
  return { ok: true, nodes };
}
