/**
 * erkenntnisCandidates.ts — lädt die build-präkomputierten Erkenntnis-Kandidaten
 * (client/public/resonanzen-erkenntnis-candidates.json, Erkenntnisse-Phase 2).
 *
 * Antwort-zentrisch: jede Antwort, die ≥1 offene Schlussfrage faktisch löst und
 * distinkt zum kuratierten Kanon ist, ist ein Kandidat. Der Admin destilliert
 * einen Kernsatz und verleiht den Status „Erkenntnis". Fail-soft → leer.
 */
export interface ErkenntnisCandidate {
  id: string;
  answerId: string;
  answerEndpoint: string;
  answerStatus: string;
  answerExcerpt: string;
  distinctness: number;
  conceptAnchor: string | null;
  nodeIds: string[];
  resolveCount: number;
  resolves: Array<{ sourceId: string; question: string; score: number }>;
}

export interface ErkenntnisCandidatesFile {
  generatedAt: string;
  thresholds: Record<string, number>;
  candidates: ErkenntnisCandidate[];
  stats: Record<string, unknown>;
}

let _cache: ErkenntnisCandidatesFile | null = null;
let _promise: Promise<ErkenntnisCandidatesFile | null> | null = null;

export function loadErkenntnisCandidates(): Promise<ErkenntnisCandidatesFile | null> {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;
  _promise = fetch(`/resonanzen-erkenntnis-candidates.json?_=${Date.now()}`, { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then((data: ErkenntnisCandidatesFile | null) => {
      if (data && Array.isArray(data.candidates)) { _cache = data; return data; }
      return null;
    })
    .catch(() => null);
  return _promise;
}

export function invalidateErkenntnisCandidates(): void {
  _cache = null;
  _promise = null;
}
