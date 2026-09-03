/**
 * dedupCorpus.ts — reine Gruppierungs-/Ranking-Logik für exakte Dubletten,
 * portiert aus scripts/dedup-corpus.ts (das CLI-Skript bleibt unverändert
 * bestehen — dieselbe Logik, jetzt zusätzlich als Admin-Panel erreichbar).
 *
 * Exakte Dubletten: gruppiert nach endpoint + anchor + normalisierter Frage.
 * Das ist NICHT dasselbe wie die semantische Near-Duplicate-Erkennung
 * (nearDuplicates-Feld, build-resonanzen-index.ts) — die bleibt unberührt,
 * dies hier räumt nur exakte Wiederholungen auf (Ingest-Dedup-Nachzügler).
 */
import type { IndexEntry } from "./indexUpdater.js";

const norm = (s: string) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const STATUS_RANK: Record<string, number> = { published: 3, approved: 2, pending: 1, raw: 0, rejected: -1 };
const rank = (s: string) => STATUS_RANK[s] ?? 0;

export interface DedupCandidate {
  id: string;
  endpoint: string;
  anchor: string;
  promptPreview: string;
  status: string;
  keeperId: string;
}

export interface DedupPreview {
  totalEntries: number;
  duplicateGroups: number;
  toDelete: DedupCandidate[];
  byEndpoint: Record<string, number>;
}

/** Gruppiert + rankt, liefert die zu löschenden Dubletten (Keeper ausgeschlossen).
 *  `rawOnly`: kuratierte Dubletten (approved/published) nicht anfassen — nur
 *  rohe/pending Wiederholungen. Reine Funktion, keine I/O. */
export function findExactDuplicates(entries: IndexEntry[], opts: { rawOnly?: boolean } = {}): DedupPreview {
  const groups = new Map<string, IndexEntry[]>();
  for (const e of entries) {
    const key = `${e.endpoint}|${e.anchor}|${norm(e.prompt)}`;
    const list = groups.get(key);
    if (list) list.push(e); else groups.set(key, [e]);
  }

  const toDelete: DedupCandidate[] = [];
  let duplicateGroups = 0;
  for (const [, list] of Array.from(groups.entries())) {
    if (list.length < 2) continue;
    duplicateGroups++;
    // Bester Keeper: höchster Status-Rang, bei Gleichstand ältester ts (Original).
    const sorted = [...list].sort((a, b) => (rank(b.status) - rank(a.status)) || a.ts.localeCompare(b.ts));
    const keep = sorted[0];
    for (const e of sorted.slice(1)) {
      if (opts.rawOnly && (e.status === "approved" || e.status === "published")) continue;
      toDelete.push({
        id: e.id, endpoint: e.endpoint, anchor: e.anchor,
        promptPreview: (e.prompt ?? "").slice(0, 100), status: e.status, keeperId: keep.id,
      });
    }
  }

  const byEndpoint: Record<string, number> = {};
  for (const e of toDelete) byEndpoint[e.endpoint] = (byEndpoint[e.endpoint] ?? 0) + 1;

  return { totalEntries: entries.length, duplicateGroups, toDelete, byEndpoint };
}
