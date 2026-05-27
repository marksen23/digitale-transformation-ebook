/**
 * citationTracker.ts — verfolgt, welche Werk-Chunks + Resonanzen
 * tatsächlich von der KI zitiert werden (Sprint R6).
 *
 * RAG funktioniert nur dann, wenn die retrieved Quellen auch im Output
 * landen. Bisher Vibes — niemand weiß, ob Claude/Gemini die [chunkId]-
 * Anker tatsächlich setzt. Hier zählen wir nach.
 *
 * Verhalten:
 *   recordCitations(answerText, retrievedIds) parsed alle [ID]-Vorkommen
 *   aus dem Antwort-Text, validiert sie gegen die retrieved-Liste
 *   (keine halluzinierten IDs zählen), inkrementiert Counter.
 *
 * Persistenz: in-memory. Render redeployt → Counter resetten. Akzeptabel
 * für MVP. Bei Bedarf später GitHub-PUT analog indexUpdater.ts.
 *
 * Export: getCitationStats() für /api/admin/citation-stats.
 */

interface CitationStat {
  cited: number;
  retrieved: number;  // wie oft retrieved? (auch wenn nicht zitiert)
  lastCitedAt: string | null;
  lastRetrievedAt: string | null;
}

const _chunkStats = new Map<string, CitationStat>();
const _resonanzStats = new Map<string, CitationStat>();

let _totalAnswers = 0;
let _totalAnswersWithCitation = 0;

/** Parsed [chunkId-12char-hex] und [RESO-id]-Vorkommen aus einem Antwort-Text. */
function extractCitedIds(text: string): { werk: string[]; resonanz: string[] } {
  if (!text) return { werk: [], resonanz: [] };
  // Werk-Chunks: 12-char Hex (sha1.slice(0,12))
  const werkRegex = /\[([a-f0-9]{12})\]/g;
  // Resonanz-IDs: <Base36-Zeit>-<Hex8> wie "MPF4WM18-FF4843F1" oder MASTER-prefix
  const resoRegex = /\[((?:MASTER-)?[A-Z0-9]{4,12}-[A-F0-9]{6,12})\]/g;
  const werk = new Set<string>();
  const reso = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = werkRegex.exec(text)) !== null) werk.add(m[1]);
  while ((m = resoRegex.exec(text)) !== null) reso.add(m[1]);
  return { werk: Array.from(werk), resonanz: Array.from(reso) };
}

/** Erhöht retrieved-Count für IDs (auch wenn nicht zitiert wurden).
 *  Wird parallel zur Generation aufgerufen, mit der retrieved-Liste. */
export function recordRetrieved(retrievedIds: { source: "werk" | "resonanz"; id: string }[]): void {
  const now = new Date().toISOString();
  for (const { source, id } of retrievedIds) {
    const store = source === "werk" ? _chunkStats : _resonanzStats;
    const cur = store.get(id) ?? { cited: 0, retrieved: 0, lastCitedAt: null, lastRetrievedAt: null };
    cur.retrieved++;
    cur.lastRetrievedAt = now;
    store.set(id, cur);
  }
}

/** Parsed Antwort, zählt nur validierte Citations (die retrieved waren).
 *  Halluzinierte IDs (im Text aber nicht in retrievedIds) werden separat
 *  als „hallucination" gezählt — auch das ist eine Information. */
export function recordCitations(
  answerText: string,
  retrievedIds: { source: "werk" | "resonanz"; id: string }[],
): { citedWerk: number; citedResonanz: number; halluzinated: string[] } {
  _totalAnswers++;
  const { werk: citedWerk, resonanz: citedReso } = extractCitedIds(answerText);
  const retrievedWerk = new Set(retrievedIds.filter(r => r.source === "werk").map(r => r.id));
  const retrievedReso = new Set(retrievedIds.filter(r => r.source === "resonanz").map(r => r.id));
  const halluzinated: string[] = [];
  const now = new Date().toISOString();
  let citedValid = 0;

  for (const id of citedWerk) {
    if (!retrievedWerk.has(id)) { halluzinated.push(`werk:${id}`); continue; }
    citedValid++;
    const cur = _chunkStats.get(id) ?? { cited: 0, retrieved: 0, lastCitedAt: null, lastRetrievedAt: null };
    cur.cited++;
    cur.lastCitedAt = now;
    _chunkStats.set(id, cur);
  }
  for (const id of citedReso) {
    if (!retrievedReso.has(id)) { halluzinated.push(`resonanz:${id}`); continue; }
    citedValid++;
    const cur = _resonanzStats.get(id) ?? { cited: 0, retrieved: 0, lastCitedAt: null, lastRetrievedAt: null };
    cur.cited++;
    cur.lastCitedAt = now;
    _resonanzStats.set(id, cur);
  }

  if (citedValid > 0) _totalAnswersWithCitation++;
  return { citedWerk: citedWerk.length, citedResonanz: citedReso.length, halluzinated };
}

export interface CitationStatsResponse {
  totalAnswers: number;
  totalAnswersWithCitation: number;
  citationRate: number;  // 0-1
  byChunk: Array<{ id: string; cited: number; retrieved: number; lastCitedAt: string | null }>;
  byResonanz: Array<{ id: string; cited: number; retrieved: number; lastCitedAt: string | null }>;
  topCited: Array<{ source: string; id: string; cited: number }>;
  // Retrieved-but-never-cited: häufig retrieved, aber nie zitiert (verschlafen)
  retrievedButCold: Array<{ source: string; id: string; retrieved: number }>;
}

export function getCitationStats(): CitationStatsResponse {
  const byChunk = Array.from(_chunkStats.entries()).map(([id, s]) => ({
    id, cited: s.cited, retrieved: s.retrieved, lastCitedAt: s.lastCitedAt,
  }));
  const byResonanz = Array.from(_resonanzStats.entries()).map(([id, s]) => ({
    id, cited: s.cited, retrieved: s.retrieved, lastCitedAt: s.lastCitedAt,
  }));

  const allCited = [
    ...byChunk.map(c => ({ source: "werk", id: c.id, cited: c.cited })),
    ...byResonanz.map(r => ({ source: "resonanz", id: r.id, cited: r.cited })),
  ].filter(x => x.cited > 0).sort((a, b) => b.cited - a.cited);

  const cold = [
    ...byChunk.filter(c => c.retrieved >= 3 && c.cited === 0).map(c => ({ source: "werk", id: c.id, retrieved: c.retrieved })),
    ...byResonanz.filter(r => r.retrieved >= 3 && r.cited === 0).map(r => ({ source: "resonanz", id: r.id, retrieved: r.retrieved })),
  ].sort((a, b) => b.retrieved - a.retrieved);

  return {
    totalAnswers: _totalAnswers,
    totalAnswersWithCitation: _totalAnswersWithCitation,
    citationRate: _totalAnswers > 0 ? _totalAnswersWithCitation / _totalAnswers : 0,
    byChunk,
    byResonanz,
    topCited: allCited.slice(0, 20),
    retrievedButCold: cold.slice(0, 20),
  };
}
