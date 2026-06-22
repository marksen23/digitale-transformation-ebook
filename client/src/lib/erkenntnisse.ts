/**
 * erkenntnisse.ts — lädt die menschlich bestätigten Erkenntnisse
 * (client/public/resonanzen-erkenntnisse.json, Erkenntnisse-Vision).
 *
 * Server-persistiert (server/lib/erkenntnisse.ts, /api/admin/confirm-erkenntnis);
 * Grundlage der späteren öffentlichen /erkenntnisse-Seite (Phase 3). Fail-soft.
 */
export interface Erkenntnis {
  id: string;
  kernsatz: string;
  questionSourceId: string;
  answerId: string;
  conceptAnchor: string | null;
  masterAnchor?: string | null;
  distinctness: number;
  createdAt: string;
  actor: string;
}

let _cache: Erkenntnis[] | null = null;
let _promise: Promise<Erkenntnis[]> | null = null;

export function loadErkenntnisse(): Promise<Erkenntnis[]> {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;
  _promise = fetch(`/resonanzen-erkenntnisse.json?_=${Date.now()}`, { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      const list = Array.isArray(data?.erkenntnisse) ? (data.erkenntnisse as Erkenntnis[]) : [];
      _cache = list;
      return list;
    })
    .catch(() => { _cache = []; return []; });
  return _promise;
}

export function invalidateErkenntnisse(): void {
  _cache = null;
  _promise = null;
}
