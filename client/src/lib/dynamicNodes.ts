/**
 * dynamicNodes.ts — lädt die server-persistierten, in den Kanon erhobenen
 * neuen Begriffe (client/public/concept-nodes.json, Phase 5c).
 *
 * Komplementär zu den statischen NODES in conceptGraph.ts. Konsumenten
 * (ConceptGraphPage, LandkartePage) mergen statisch + dynamisch beim Rendern.
 * Fail-soft: fehlt/kaputt → leere Liste. Muster wie promotedEdges.ts.
 */
export interface DynamicConceptNode {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
  category: string;
  x: number;
  y: number;
  r: number;
  anchorId: string;
  evidence: number;
  distinctness: number;
  createdAt: string;
  actor: string;
}

let _cache: DynamicConceptNode[] | null = null;
let _promise: Promise<DynamicConceptNode[]> | null = null;

export function loadDynamicNodes(): Promise<DynamicConceptNode[]> {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;
  _promise = fetch(`/concept-nodes.json?_=${Date.now()}`, { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      const nodes = Array.isArray(data?.nodes) ? (data.nodes as DynamicConceptNode[]) : [];
      _cache = nodes;
      return nodes;
    })
    .catch(() => {
      _cache = [];
      return [];
    });
  return _promise;
}

export function invalidateDynamicNodes(): void {
  _cache = null;
  _promise = null;
}
