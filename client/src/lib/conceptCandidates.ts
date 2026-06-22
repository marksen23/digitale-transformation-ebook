/**
 * conceptCandidates.ts — lädt die build-präkomputierten Begriffs-Kandidaten
 * (client/public/resonanzen-concept-candidates.json, Phase 5c-Erweiterung).
 *
 * Knoten-Analog zu den Kanten-Vorschlägen (resonanzen-link-predictions.json):
 * Cluster kuratierter Resonanzen, die distinkt zu allen bestehenden Begriffen
 * sind und genug Evidenz tragen — emergente Themen, die das Begriffsnetz noch
 * nicht abbildet. Advisory: dient als Vorbefüllung für /api/admin/propose-concept,
 * die Annahme/Autorisierung bleibt menschlich. Fail-soft: fehlt/kaputt → leer.
 */
export interface ConceptCandidate {
  /** Vorschlag für das Label (Top-Keyword) — der Mensch finalisiert ihn. */
  suggestedLabel: string;
  keywords: Array<{ word: string; count: number }>;
  /** Clustergröße = Zahl tragender kuratierter Resonanzen. */
  evidence: number;
  /** 1 − maxCosine(Centroid, bestehende Begriffe). Hoch = neuartig. */
  distinctness: number;
  /** Nächstliegender bestehender Begriff → Anker-Vorschlag fürs Formular. */
  nearestConcept: string | null;
  nearestSim: number;
  /** Bis 5 Beispiel-Resonanzen aus dem Cluster (Permalink-fähig). */
  sampleEntryIds: string[];
}

export interface ConceptCandidatesFile {
  generatedAt: string;
  thresholds: Record<string, number>;
  candidates: ConceptCandidate[];
  stats: Record<string, unknown>;
}

let _cache: ConceptCandidatesFile | null = null;
let _promise: Promise<ConceptCandidatesFile | null> | null = null;

export function loadConceptCandidates(): Promise<ConceptCandidatesFile | null> {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;
  _promise = fetch(`/resonanzen-concept-candidates.json?_=${Date.now()}`, { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then((data: ConceptCandidatesFile | null) => {
      if (data && Array.isArray(data.candidates)) {
        _cache = data;
        return data;
      }
      return null;
    })
    .catch(() => null);
  return _promise;
}

export function invalidateConceptCandidates(): void {
  _cache = null;
  _promise = null;
}
