/**
 * conceptNodes.ts — server-persistierte Wachstums-Schicht für KNOTEN des
 * Begriffsnetzes (Roadmap „Das wachsende Werk", Phase 5c).
 *
 * Analog conceptEdges.ts (Kanten, 5b): die handgesetzten NODES in
 * conceptGraph.ts bleiben der kanonische Kern; akzeptierte neue Begriffe
 * (Wortschöpfungen) lagern sich in client/public/concept-nodes.json an —
 * server-appendbar via GitHub-API, von Netlify ausgeliefert, von allen Lesern
 * gesehen, vom Server live gelesen.
 *
 * Schutzwall für Wortschöpfungen: ein neuer Begriff muss vom lebendigen
 * (kuratierten) Korpus getragen (evidence) UND distinkt zu bestehenden
 * Begriffen (distinctness) sein UND menschlich autorisiert werden.
 *
 * Das Embedding wird NICHT mitgespeichert (concept-nodes.json bleibt schlank);
 * build-search-index.ts re-embeddet die neuen Begriffe aus fullLabel +
 * description, sodass conceptVoiceScore (5a) sie automatisch einbezieht.
 */
import { cosineSim } from "./embeddingClient.js";

const GITHUB_API = "https://api.github.com";
const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? "marksen23";
const REPO_NAME = process.env.GITHUB_REPO_NAME ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";
const NODES_PATH = "client/public/concept-nodes.json";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/client/public`;

export interface ConceptNodeRecord {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
  category: string;
  x: number;
  y: number;
  r: number;
  /** Anker-Begriff: gibt Positionierung + nächstgelegene Verwandtschaft an. */
  anchorId: string;
  /** Provenienz des Schutzwall-Gates zum Akzept-Zeitpunkt. */
  evidence: number;
  distinctness: number;
  createdAt: string;
  actor: string;
}

interface NodesFile { generatedAt: string; nodes: ConceptNodeRecord[]; }

function authHeaders(token: string) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "dt-concept-nodes",
  };
}

async function fetchNodes(token: string): Promise<{ file: NodesFile; sha: string | null }> {
  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${NODES_PATH}?ref=${REPO_BRANCH}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 404) return { file: { generatedAt: new Date().toISOString(), nodes: [] }, sha: null };
  if (!res.ok) throw new Error(`GET concept-nodes: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { file: JSON.parse(content), sha: data.sha };
}

async function fetchJson(url: string): Promise<unknown | null> {
  try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; }
}

/** IDs der bereits akzeptierten dynamischen Knoten (read-only via Raw, kein Token). */
export async function loadDynamicNodeIds(): Promise<Set<string>> {
  const data = await fetchJson(`${RAW_BASE}/concept-nodes.json`) as NodesFile | null;
  return new Set((data?.nodes ?? []).map(n => n.id));
}

export interface ConceptGate {
  /** 1 − max Cosine zu bestehenden Begriffs-Embeddings. Hoch = distinkt. */
  distinctness: number;
  nearestConcept: string | null;
  nearestSim: number;
  /** Anzahl kuratierter Resonanzen, die diesen Begriff semantisch tragen. */
  evidence: number;
}

/**
 * Wertet einen Begriff (gegeben sein Embedding) gegen den Schutzwall aus:
 * Distinktheit zu bestehenden Begriffen + Korpus-Evidenz aus den kuratierten
 * Resonanzen. Lädt die Referenz-Embeddings frisch von GitHub-Raw.
 */
export async function evaluateConcept(
  embedding: number[],
  opts: { evidenceSim: number },
): Promise<ConceptGate> {
  const ce = await fetchJson(`${RAW_BASE}/concepts-embeddings.json`) as { embeddings?: Record<string, number[]> } | null;
  let maxSim = 0; let nearest: string | null = null;
  for (const [id, vec] of Object.entries(ce?.embeddings ?? {})) {
    const s = cosineSim(embedding, vec);
    if (s > maxSim) { maxSim = s; nearest = id; }
  }
  const distinctness = Math.max(0, Math.min(1, 1 - maxSim));

  const idx = await fetchJson(`${RAW_BASE}/resonanzen-index.json`) as { entries?: Array<{ id: string; status: string }> } | null;
  const emb = await fetchJson(`${RAW_BASE}/resonanzen-embeddings.json`) as { embeddings?: Record<string, number[]> } | null;
  let evidence = 0;
  if (idx?.entries && emb?.embeddings) {
    for (const e of idx.entries) {
      if (e.status !== "approved" && e.status !== "published") continue;
      const v = emb.embeddings[e.id];
      if (v && cosineSim(embedding, v) >= opts.evidenceSim) evidence++;
    }
  }
  return { distinctness, nearestConcept: nearest, nearestSim: maxSim, evidence };
}

/** Persistiert einen akzeptierten Knoten (dedup per id) nach GitHub. */
export async function acceptConceptNode(
  record: ConceptNodeRecord,
): Promise<{ ok: true; already?: boolean } | { ok: false; error: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: "GITHUB_TOKEN fehlt — Knoten nicht persistierbar" };
  try {
    const { file, sha } = await fetchNodes(token);
    if (file.nodes.some(n => n.id === record.id)) return { ok: true, already: true };
    const updated: NodesFile = { generatedAt: new Date().toISOString(), nodes: [...file.nodes, record] };
    const putRes = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${NODES_PATH}`, {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `concept-nodes: accept ${record.id} [${record.actor}]`,
        content: Buffer.from(JSON.stringify(updated, null, 2), "utf-8").toString("base64"),
        branch: REPO_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!putRes.ok) {
      const txt = await putRes.text().catch(() => "");
      if (putRes.status === 409) return { ok: false, error: "Schreibkonflikt (gleichzeitige Änderung) — erneut versuchen" };
      return { ok: false, error: `PUT concept-nodes: ${putRes.status} — ${txt.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
