/**
 * promotedEdges.ts — lädt die server-persistierte Wachstums-Schicht des
 * Begriffsnetzes (client/public/concept-edges.json).
 *
 * Diese Kanten wurden aus der Wissens-Landkarte in den Kanon erhoben
 * (Phase 5b). Komplementär zu den statischen EDGES in conceptGraph.ts und zu
 * den privaten UserEdges (localStorage). Fail-soft: fehlt/kaputt → leere Liste.
 */
export interface PromotedEdge {
  source: string;
  target: string;
  note?: string;
  evidence?: number;
  createdAt: string;
  actor: string;
}

let _cache: PromotedEdge[] | null = null;
let _promise: Promise<PromotedEdge[]> | null = null;

export function loadPromotedEdges(): Promise<PromotedEdge[]> {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;
  _promise = fetch(`/concept-edges.json?_=${Date.now()}`, { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      const edges = Array.isArray(data?.edges) ? (data.edges as PromotedEdge[]) : [];
      _cache = edges;
      return edges;
    })
    .catch(() => {
      _cache = [];
      return [];
    });
  return _promise;
}

export function invalidatePromotedEdges(): void {
  _cache = null;
  _promise = null;
}
