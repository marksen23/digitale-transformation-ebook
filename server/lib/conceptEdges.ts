/**
 * conceptEdges.ts — server-persistierte Wachstums-Schicht des Begriffsnetzes
 * (Roadmap „Das wachsende Werk", Phase 5b).
 *
 * Die kanonischen Kanten des Netzes leben statisch in
 * client/src/data/conceptGraph.ts. Diese Datei verwaltet die DAZUWACHSENDEN
 * Kanten: werdende Verbindungen, die ein Mensch aus der Wissens-Landkarte in
 * den Kanon erhebt. Persistiert als client/public/concept-edges.json auf
 * GitHub (gleiche IO-Semantik wie indexUpdater.ts) → von Netlify ausgeliefert,
 * von allen Lesern gesehen. Das Netz wächst also geteilt, nicht nur lokal
 * (UserEdge in localStorage bleibt die private Variante).
 *
 * Schutzwall-konform: nur Admin-gegated promotebar; jede Kante trägt
 * Provenienz (createdAt, actor, optionale Begründung + Evidenz-Zähler).
 */
const GITHUB_API = "https://api.github.com";
const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? "marksen23";
const REPO_NAME = process.env.GITHUB_REPO_NAME ?? "digitale-transformation-ebook";
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH ?? "main";
const EDGES_PATH = "client/public/concept-edges.json";

export interface PromotedEdge {
  source: string;
  target: string;
  note?: string;
  /** Anzahl gesicherter Erkenntnisse, die beide Begriffe gemeinsam berührten
   *  (Evidenz zum Promotion-Zeitpunkt). */
  evidence?: number;
  createdAt: string;
  actor: string;
}

interface EdgesFile {
  generatedAt: string;
  edges: PromotedEdge[];
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function authHeaders(token: string) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "dt-concept-edges",
  };
}

async function fetchEdges(token: string): Promise<{ file: EdgesFile; sha: string | null }> {
  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${EDGES_PATH}?ref=${REPO_BRANCH}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 404) {
    return { file: { generatedAt: new Date().toISOString(), edges: [] }, sha: null };
  }
  if (!res.ok) throw new Error(`GET concept-edges: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { file: JSON.parse(content), sha: data.sha };
}

/**
 * Erhebt eine werdende Verbindung in den Kanon. Dedupt gegen bestehende
 * (sortiertes Paar) — doppeltes Promoten ist ein No-op-Erfolg.
 */
export async function promoteEdge(input: {
  source: string; target: string; note?: string; evidence?: number; actor: string;
}): Promise<{ ok: true; already?: boolean } | { ok: false; error: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: "GITHUB_TOKEN fehlt — Kante nicht persistierbar" };

  const source = String(input.source ?? "").trim();
  const target = String(input.target ?? "").trim();
  if (!source || !target) return { ok: false, error: "source/target fehlt" };
  if (source === target) return { ok: false, error: "source und target identisch" };

  try {
    const { file, sha } = await fetchEdges(token);
    const key = pairKey(source, target);
    if (file.edges.some(e => pairKey(e.source, e.target) === key)) {
      return { ok: true, already: true };
    }
    const edge: PromotedEdge = {
      source, target,
      ...(input.note ? { note: input.note.slice(0, 280) } : {}),
      ...(typeof input.evidence === "number" ? { evidence: input.evidence } : {}),
      createdAt: new Date().toISOString(),
      actor: input.actor,
    };
    const updated: EdgesFile = { generatedAt: new Date().toISOString(), edges: [...file.edges, edge] };
    const putRes = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${EDGES_PATH}`, {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `concept-edges: promote ${source}—${target} [${input.actor}]`,
        content: Buffer.from(JSON.stringify(updated, null, 2), "utf-8").toString("base64"),
        branch: REPO_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!putRes.ok) {
      const txt = await putRes.text().catch(() => "");
      if (putRes.status === 409) return { ok: false, error: "Schreibkonflikt (gleichzeitige Änderung) — erneut versuchen" };
      return { ok: false, error: `PUT concept-edges: ${putRes.status} — ${txt.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
