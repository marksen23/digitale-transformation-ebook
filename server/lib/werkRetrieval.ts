/**
 * werkRetrieval.ts — Tier-1-3-Roadmap, Feature D (Werk-Text-RAG).
 *
 * Lädt client/public/werk-chunks.json einmal beim ersten Aufruf in
 * den Memory-Cache und beantwortet Retrieval-Queries via Cosine.
 *
 * Wird von den KI-Endpunkten (analyse, path-analyse, graph-chat, ask)
 * vor jedem Claude-Call aufgerufen, um den relevantesten Buchtext als
 * autorisierten Kontext einzuspielen — verhindert dass die KI vom
 * Werk semantisch driftet.
 *
 * Server-Pfad: dist/werk-chunks.json (esbuild kopiert nicht) → wir
 * lesen aus client/public/werk-chunks.json (relativ zum project root).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchEmbedding, cosineSim } from "./embeddingClient.js";
import { enrichQueryWithNodes } from "./queryEnrichment.js";

const __filename = fileURLToPath(import.meta.url);
const __dir = path.dirname(__filename);

/**
 * Robuste Pfad-Auflösung für die committeten Korpus-JSONs unter
 * client/public/. KRITISCH: in DEV liegt dieser Code in server/lib/
 * (zwei Ebenen unter Root), im PROD-Build ist aber ALLES in dist/index.js
 * gebündelt (eine Ebene). Eine feste "../.."-Annahme zeigt im Prod-Build
 * eine Ebene zu hoch → Datei nicht gefunden → RAG liefert still 0 Passagen
 * (genau dieser Bug machte die KI-Antworten in Produktion ungeerdet).
 *
 * Daher: mehrere Kandidaten probieren, ersten existierenden nehmen.
 * process.cwd() (Render startet `node dist/index.js` aus dem Repo-Root)
 * deckt Prod ab; die __dir-Varianten decken Dev + alternative Layouts ab.
 */
function resolveDataPath(rel: string): string {
  const candidates = [
    path.resolve(process.cwd(), rel),               // Render-CWD = Repo-Root; Dev meist auch
    path.resolve(__dir, "..", "..", rel),           // Dev: server/lib → Root
    path.resolve(__dir, "..", rel),                 // Prod-Bundle: dist → Root
    path.resolve(__dir, rel),                       // Fallback: gleiche Ebene
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return candidates[0];  // nichts gefunden → erster Kandidat (loadX loggt dann die Warnung)
}

const CHUNKS_PATH = resolveDataPath("client/public/werk-chunks.json");
// R1: Zweite Retrieval-Quelle — der bestehende Resonanzen-Korpus.
const RESONANZ_INDEX_PATH = resolveDataPath("client/public/resonanzen-index.json");
const RESONANZ_EMB_PATH = resolveDataPath("client/public/resonanzen-embeddings.json");

export interface WerkChunk {
  id: string;
  chapter: string;
  part: string;
  partTitle: string;
  chapterTitle: string;
  position: number;
  text: string;
  embedding?: number[];
}

interface WerkChunksFile {
  generatedAt: string;
  model: string;
  chunkCount: number;
  embeddedCount: number;
  chunks: WerkChunk[];
}

let _cache: WerkChunksFile | null = null;
let _loaded = false;

function loadChunks(): WerkChunksFile | null {
  if (_loaded) return _cache;
  _loaded = true;
  try {
    if (!fs.existsSync(CHUNKS_PATH)) {
      console.warn(`[werkRetrieval] werk-chunks.json nicht gefunden bei ${CHUNKS_PATH}`);
      return null;
    }
    const raw = fs.readFileSync(CHUNKS_PATH, "utf-8");
    _cache = JSON.parse(raw);
    const withEmb = (_cache?.chunks ?? []).filter(c => Array.isArray(c.embedding)).length;
    console.log(`[werkRetrieval] geladen: ${_cache?.chunks.length} chunks, ${withEmb} mit embedding (model=${_cache?.model})`);
    return _cache;
  } catch (err) {
    console.error(`[werkRetrieval] load failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** Schlägt eine Chunk-Liste mit Embedding für Cosine-Vergleich auf. */
function embeddedChunks(): WerkChunk[] {
  const f = loadChunks();
  if (!f) return [];
  return f.chunks.filter(c => Array.isArray(c.embedding) && c.embedding!.length > 0);
}

export interface RetrievedPassage {
  /** Diskriminator: "werk" = aus Buchtext (werk-chunks), "resonanz" = aus
   *  dem kuratiertem Q&A-Korpus. Der LLM-Prompt wird beide Quellen anders
   *  formatieren, das Frontend zeigt sie unterschiedlich. */
  source: "werk" | "resonanz";
  id: string;
  // werk-spezifisch
  chapter?: string;
  part?: string;
  partTitle?: string;
  chapterTitle?: string;
  // resonanz-spezifisch
  endpoint?: string;
  anchor?: string;
  prompt?: string;          // die ursprüngliche Frage
  status?: string;          // "published"/"approved"/...
  // gemeinsam
  text: string;
  score: number;
}

// R1: Resonanzen als zweite Retrieval-Quelle.
// Wird einmal beim Server-Start geladen + bei Hot-Reload (broadcast event).
interface ResonanzEmbCache {
  embeddings: Map<string, number[]>;
  meta: Map<string, {
    endpoint: string; anchor: string; nodeIds: string[]; status: string;
    prompt: string; response: string; ts: string;
  }>;
}
let _resonanzCache: ResonanzEmbCache | null = null;
let _resonanzLoaded = false;

function loadResonanzCorpus(): ResonanzEmbCache | null {
  if (_resonanzLoaded) return _resonanzCache;
  _resonanzLoaded = true;
  try {
    if (!fs.existsSync(RESONANZ_EMB_PATH) || !fs.existsSync(RESONANZ_INDEX_PATH)) {
      console.warn(`[werkRetrieval] resonanzen-{index,embeddings}.json nicht gefunden — Resonanz-Retrieval deaktiviert`);
      return null;
    }
    const embFile = JSON.parse(fs.readFileSync(RESONANZ_EMB_PATH, "utf-8")) as { embeddings: Record<string, number[]> };
    const idxFile = JSON.parse(fs.readFileSync(RESONANZ_INDEX_PATH, "utf-8")) as {
      entries: Array<{ id: string; endpoint: string; anchor: string; nodeIds: string[]; status: string; prompt: string; response: string; ts: string }>;
    };
    const embMap = new Map<string, number[]>(Object.entries(embFile.embeddings));
    const metaMap = new Map<string, ResonanzEmbCache["meta"] extends Map<string, infer V> ? V : never>();
    for (const e of idxFile.entries ?? []) {
      // Nur kuratierte Resonanzen ins Retrieval — raw/rejected verfälschen Antworten.
      if (e.status !== "published" && e.status !== "approved") continue;
      const emb = embMap.get(e.id);
      if (!emb || !emb.length) continue;
      metaMap.set(e.id, {
        endpoint: e.endpoint, anchor: e.anchor, nodeIds: e.nodeIds ?? [],
        status: e.status, prompt: e.prompt, response: e.response, ts: e.ts,
      });
    }
    _resonanzCache = { embeddings: embMap, meta: metaMap };
    console.log(`[werkRetrieval] resonanzen geladen: ${metaMap.size} kuratierte (von ${idxFile.entries?.length ?? 0} total) für Retrieval`);
    return _resonanzCache;
  } catch (err) {
    console.error(`[werkRetrieval] Resonanz-Korpus-Load failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** Bei Hot-Reload (nach Curation-Wechsel etc.) den Cache invalidieren —
 *  damit ein eben „approved"-Eintrag sofort retrievebar wird. */
export function invalidateResonanzRetrievalCache(): void {
  _resonanzLoaded = false;
  _resonanzCache = null;
}

/**
 * Sucht die topK relevantesten Werk-Passagen für eine Query.
 * R1: Diese Funktion bleibt für reine Werk-Retrieval. Für gemischtes
 * Retrieval (Werk + Resonanzen) siehe retrieveRelevantCorpus() unten.
 */
export async function retrieveRelevantWerkPassages(
  query: string,
  topK = 5,
): Promise<RetrievedPassage[]> {
  if (!query?.trim()) return [];
  const chunks = embeddedChunks();
  if (chunks.length === 0) return [];

  const qVec = await fetchEmbedding(query);
  if (!qVec) return [];

  const scored: RetrievedPassage[] = [];
  for (const c of chunks) {
    const s = cosineSim(qVec, c.embedding!);
    if (s > 0.1) {
      scored.push({
        source: "werk",
        id: c.id, chapter: c.chapter, part: c.part,
        partTitle: c.partTitle, chapterTitle: c.chapterTitle,
        text: c.text, score: s,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * R3: Query-Rewriting via Gemini Flash. Erzeugt 3 paraphrasierte
 * Alternativen zur User-Anfrage, sodass das Retrieval verschiedene
 * Begriffs-Aspekte abdeckt — nicht nur exakte Lexem-Matches.
 *
 * Default-On wenn GEMINI_API_KEY gesetzt. Deaktivierbar via
 * RAG_QUERY_EXPANSION=0.
 *
 * Returns die Original-Query + bis zu 3 Paraphrasen. Bei API-Fehler:
 * nur Original — graceful degradation.
 */
export async function expandQuery(query: string): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || process.env.RAG_QUERY_EXPANSION === "0") return [query];
  if (query.length > 600) return [query];  // bei sehr langen Anfragen lohnt Paraphrase nicht
  try {
    const prompt = `Du bist Suchhilfe für ein deutsches Philosophiewerk. Generiere genau 3 alternative Formulierungen für die folgende Anfrage. Jede Alternative soll einen anderen Begriffs-Aspekt oder eine andere Ebene betonen (z.B. abstrakter, konkreter, technischer, poetischer). Keine Erklärung, keine Aufzählung — exakt 3 Zeilen, je eine Alternative pro Zeile.

Anfrage: ${query}

Alternativen:`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 250 },
      }),
    });
    if (!res.ok) return [query];
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return [query];
    const alts = text.split("\n")
      .map((l: string) => l.replace(/^[-\d.\s)]+/, "").trim())  // strip Aufzählungs-Präfixe
      .filter((l: string) => l.length > 5 && l.length < 400)
      .slice(0, 3);
    return [query, ...alts];
  } catch (err) {
    console.warn(`[expandQuery] failed: ${err instanceof Error ? err.message : err}`);
    return [query];
  }
}

/**
 * R1: Vereinte Retrieval-Strategie — Werk-Chunks UND kuratierte Resonanzen
 * gemeinsam scoren. Sortiert nach Cosine, aber mit milder Score-Anhebung
 * für Werk-Quellen (×1.05), damit der Buchtext bei Score-Gleichstand
 * primär bleibt. Resonanzen bringen historische Q&A-Tiefe rein.
 *
 * Returns mixed list of RetrievedPassage (mit source-Tag). Default-Mix:
 *   topKWerk=3 + topKResonanz=2 = 5 Quellen pro Antwort.
 */
export async function retrieveRelevantCorpus(
  query: string,
  topKWerk = 3,
  topKResonanz = 2,
): Promise<RetrievedPassage[]> {
  if (!query?.trim()) return [];
  // R7: Query mit Konzept-Definitionen anreichern, falls erkannte Node-IDs/Labels
  // im Prompt vorkommen. Bei strukturellen Templates (Pfad-Analyse: A → B → C)
  // ist das der entscheidende Hebel für semantische Tiefe im Embedding.
  const { enriched, matchedNodes } = enrichQueryWithNodes(query);
  if (matchedNodes.length > 0) {
    console.log(`[retrieveRelevantCorpus] R7 enriched query with ${matchedNodes.length} node defs: ${matchedNodes.join(", ")}`);
  }
  const qVec = await fetchEmbedding(enriched);
  if (!qVec) return [];

  const out: RetrievedPassage[] = [];

  // Werk-Passages
  const chunks = embeddedChunks();
  if (chunks.length > 0) {
    const werkScored: RetrievedPassage[] = [];
    for (const c of chunks) {
      const s = cosineSim(qVec, c.embedding!) * 1.05;  // Werk leicht bevorzugt
      if (s > 0.1) {
        werkScored.push({
          source: "werk",
          id: c.id, chapter: c.chapter, part: c.part,
          partTitle: c.partTitle, chapterTitle: c.chapterTitle,
          text: c.text, score: s,
        });
      }
    }
    werkScored.sort((a, b) => b.score - a.score);
    out.push(...werkScored.slice(0, topKWerk));
  }

  // Resonanzen — nur kuratierte (published/approved)
  const reso = loadResonanzCorpus();
  if (reso && reso.meta.size > 0) {
    const resoScored: RetrievedPassage[] = [];
    reso.meta.forEach((meta, id) => {
      const emb = reso.embeddings.get(id);
      if (!emb) return;
      const s = cosineSim(qVec, emb);
      if (s > 0.1) {
        resoScored.push({
          source: "resonanz",
          id,
          endpoint: meta.endpoint,
          anchor: meta.anchor,
          status: meta.status,
          prompt: meta.prompt,
          // text = die Antwort (das ist das eigentliche RAG-Material)
          text: meta.response,
          score: s,
        });
      }
    });
    resoScored.sort((a, b) => b.score - a.score);
    out.push(...resoScored.slice(0, topKResonanz));
  }

  // Final-Sort über beide Quellen
  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * Formatiert eine gemischte Liste retrieved Passagen als Kontext-Block
 * für den System-Prompt. R1: unterscheidet Werk-Passagen von Resonanzen,
 * sodass der LLM die Quellen-Typen erkennt und unterschiedlich zitieren
 * kann.
 *
 * Werk-Passage:
 *   [chunkId] Band III · Resonanz im Zeitalter… :
 *   <Werktext>
 *
 * Resonanz (kuratiertes Q&A):
 *   ↩ [resonanzId] frühere Begegnung (analyse · 2026-04):
 *     Frage: <ursprüngliche Frage>
 *     Antwort: <was die KI damals geantwortet hat, kuratiert>
 */
export function formatWerkContext(passages: RetrievedPassage[]): string {
  if (passages.length === 0) return "";
  const werk = passages.filter(p => p.source === "werk");
  const reso = passages.filter(p => p.source === "resonanz");
  const parts: string[] = [];

  if (werk.length > 0) {
    parts.push("WERK-PASSAGEN (autorisierter Buchtext, zitiere via [chunkId]):");
    for (const p of werk) {
      parts.push(
        `[${p.id}] ${p.partTitle ?? ""} · ${p.chapterTitle ?? ""} (score ${p.score.toFixed(2)}):`,
        p.text,
        ""
      );
    }
  }

  if (reso.length > 0) {
    parts.push("");
    parts.push("BEREITS BEANTWORTETE FRAGEN aus dem kuratierten Korpus (zitiere via [resonanzId]):");
    for (const p of reso) {
      const dateOnly = p.endpoint ? `${p.endpoint} · ${(p as { ts?: string }).ts?.slice(0,10) ?? ""}` : "kuratiert";
      parts.push(
        `↩ [${p.id}] frühere Begegnung (${dateOnly}, score ${p.score.toFixed(2)}):`,
        `   Frage: ${(p.prompt ?? "").slice(0, 300)}`,
        `   Antwort: ${(p.text ?? "").slice(0, 800)}`,
        ""
      );
    }
  }

  return parts.join("\n");
}

/**
 * R3: Multi-Query Retrieval — eine Anfrage in mehrere paraphrasierte
 * Anfragen expandieren, jede separat retrieven, top-K mergen + dedup.
 *
 * Vorteil: erfasst Anfragen, die das Werk anders ausdrückt als der Reader.
 * „Was ist Resonanz?" → expandiert zu „antwortendes Beziehungs-Modell",
 * „Schwingung zwischen Subjekt und Objekt", etc. — Werk-Chunks ohne das
 * Wort „Resonanz" werden trotzdem gefunden.
 *
 * Default-on wenn GEMINI_API_KEY gesetzt + RAG_QUERY_EXPANSION≠"0".
 */
export async function retrieveRelevantCorpusMultiQuery(
  query: string,
  topKWerk = 3,
  topKResonanz = 2,
): Promise<{ passages: RetrievedPassage[]; expandedQueries: string[] }> {
  const queries = await expandQuery(query);
  // Wenn keine Expansion stattfand (keine API/disabled), Singletrack.
  if (queries.length === 1) {
    const passages = await retrieveRelevantCorpus(queries[0], topKWerk, topKResonanz);
    return { passages, expandedQueries: queries };
  }

  // Pro Sub-Query: kleinerer top-K (sonst explodiert das merged-set).
  // Faustregel: pro Query 60% des Final-top-K, damit Dedup-merge
  // genug Material zum Aussortieren hat.
  const subWerk = Math.max(2, Math.ceil(topKWerk * 0.7));
  const subReso = Math.max(1, Math.ceil(topKResonanz * 0.7));

  // Best-of-score-per-ID-Strategie: ein Eintrag, der nur in einer
  // Sub-Query auftaucht, bekommt seinen besten Score; ein Eintrag,
  // der in mehreren auftaucht, bekommt einen Bonus (×1.08) — weil
  // Konsens über Paraphrasen ein starkes Signal ist.
  const bestById = new Map<string, { passage: RetrievedPassage; hits: number }>();
  for (const q of queries) {
    const sub = await retrieveRelevantCorpus(q, subWerk, subReso);
    for (const r of sub) {
      const existing = bestById.get(r.id);
      if (!existing) {
        bestById.set(r.id, { passage: r, hits: 1 });
      } else {
        existing.hits++;
        if (r.score > existing.passage.score) {
          existing.passage = { ...r, score: r.score };
        }
      }
    }
  }
  // Konsens-Bonus + Final-Sort
  const merged: RetrievedPassage[] = [];
  bestById.forEach(({ passage, hits }) => {
    const consensusBonus = hits >= 2 ? Math.pow(1.08, hits - 1) : 1;
    merged.push({ ...passage, score: passage.score * consensusBonus });
  });
  merged.sort((a, b) => b.score - a.score);
  return {
    passages: merged.slice(0, topKWerk + topKResonanz),
    expandedQueries: queries,
  };
}

/**
 * R4: LLM-Re-Ranking. Nimmt einen Pool von Cosine-Kandidaten (typisch 15)
 * und lässt Claude die top-K relevantesten herauspicken — basierend auf
 * dem tatsächlichen Inhalt, nicht nur Vektor-Distanz.
 *
 * Vorteil: catches Fälle wo Cosine semantische Nähe behauptet aber das
 * Werk-Material thematisch fern ist. Auch: dämpft R3-Über-Expansion
 * (wenn Multi-Query zu lockere Treffer liefert).
 *
 * Opt-in via RAG_RERANK=1 (kostet 1 extra Claude-Call ~800ms).
 * Bei Claude-Fehler: fallback auf Cosine-Order.
 */
export async function rerankWithClaude(
  query: string,
  candidates: RetrievedPassage[],
  finalTopK: number,
): Promise<RetrievedPassage[]> {
  if (process.env.RAG_RERANK !== "1") return candidates.slice(0, finalTopK);
  if (candidates.length <= finalTopK) return candidates;
  try {
    const { callClaude, isClaudeAvailable } = await import("./claudeClient.js");
    if (!isClaudeAvailable()) return candidates.slice(0, finalTopK);

    // Kompakte Beschreibung pro Kandidat — kurzer Snippet, damit der
    // Claude-Call nicht explodiert. Für resonanz: Frage+kurze Antwort;
    // für werk: erste 250 chars des Chunks.
    const candidateBlock = candidates.map((c, i) => {
      const snippet = c.source === "resonanz"
        ? `(frühere Frage: "${(c.prompt ?? "").slice(0, 120)}") ${(c.text ?? "").slice(0, 220)}`
        : `${(c.text ?? "").slice(0, 250)}`;
      return `[${i + 1}] (${c.source}, id=${c.id}): ${snippet}`;
    }).join("\n\n");

    const system = `Du bist ein präziser Retrieval-Reranker für ein deutsches Philosophiewerk. Aus einer Liste von Kandidaten wählst du die ${finalTopK} relevantesten für eine User-Anfrage aus — basierend darauf, wie direkt jeder Kandidat zur tatsächlich gestellten Frage Stellung nimmt.

ANTWORT-FORMAT (STRIKT — exakt eine Zeile mit JSON-Array):
[<index1>, <index2>, ..., <index${finalTopK}>]

Beispiel für ${finalTopK} Treffer: [3, 7, 1, 11, 5]
Keine Erklärung, keine Markdown, kein Vorspann.`;

    const user = `ANFRAGE: ${query}

KANDIDATEN:
${candidateBlock}

Wähle die ${finalTopK} relevantesten Indizes.`;

    const text = await callClaude({ system, user, maxTokens: 100, temperature: 0.1 });
    if (!text) return candidates.slice(0, finalTopK);

    // Parse JSON-Array
    const m = text.match(/\[\s*[\d,\s]+\]/);
    if (!m) return candidates.slice(0, finalTopK);
    const indices = JSON.parse(m[0]) as number[];
    if (!Array.isArray(indices)) return candidates.slice(0, finalTopK);

    const picked: RetrievedPassage[] = [];
    const seen = new Set<number>();
    for (const idx of indices) {
      if (typeof idx !== "number" || idx < 1 || idx > candidates.length) continue;
      if (seen.has(idx)) continue;
      seen.add(idx);
      picked.push(candidates[idx - 1]);
      if (picked.length >= finalTopK) break;
    }
    // Fall: Claude hat zu wenige Indizes geliefert — top-K mit Cosine-Order auffüllen
    if (picked.length < finalTopK) {
      for (const c of candidates) {
        if (picked.includes(c)) continue;
        picked.push(c);
        if (picked.length >= finalTopK) break;
      }
    }
    return picked;
  } catch (err) {
    console.warn(`[rerankWithClaude] failed, fallback to cosine: ${err instanceof Error ? err.message : err}`);
    return candidates.slice(0, finalTopK);
  }
}

/**
 * One-Shot-Helper für KI-Endpunkte: retrieved + formatted in einem Call.
 * R1: jetzt zieht aus BEIDEN Quellen (Werk + Resonanzen). Default 3+2,
 * aber konfigurierbar. R3: nutzt Multi-Query, wenn expansion verfügbar.
 *
 * Wenn keine Embeddings verfügbar: returnt leerer String → Endpunkt
 * läuft ohne Kontext (graceful fallback).
 */
export async function buildWerkContext(query: string, topK = 5): Promise<{
  passages: RetrievedPassage[];
  contextBlock: string;
  expandedQueries?: string[];
  reranked?: boolean;
}> {
  // Default-Mix: 60% Werk, 40% Resonanzen — der Buchtext bleibt primär,
  // die Resonanzen ergänzen mit Dialog-Tiefe.
  const topKWerk = Math.max(1, Math.round(topK * 0.6));
  const topKResonanz = Math.max(1, topK - topKWerk);

  // R4: wenn Reranking aktiv, holen wir größeren Cosine-Pool (×3),
  // damit Claude echte Auswahl hat. Sonst direkt top-K.
  const rerankEnabled = process.env.RAG_RERANK === "1";
  const overFetch = rerankEnabled ? 3 : 1;
  const { passages: candidates, expandedQueries } = await retrieveRelevantCorpusMultiQuery(
    query,
    topKWerk * overFetch,
    topKResonanz * overFetch,
  );

  let finalPassages = candidates;
  let reranked = false;
  if (rerankEnabled && candidates.length > topK) {
    finalPassages = await rerankWithClaude(query, candidates, topK);
    reranked = finalPassages !== candidates;
  } else {
    finalPassages = candidates.slice(0, topK);
  }

  return { passages: finalPassages, contextBlock: formatWerkContext(finalPassages), expandedQueries, reranked };
}

/** Liefert eine flache Lookup-Map id → Chunk für die KI-Antwort-Renderer
 *  (Frontend-Code parsed [chunkId]-Anker und braucht die Quelle). */
export function getChunkLookup(): Map<string, WerkChunk> {
  const map = new Map<string, WerkChunk>();
  const f = loadChunks();
  if (!f) return map;
  for (const c of f.chunks) map.set(c.id, c);
  return map;
}
