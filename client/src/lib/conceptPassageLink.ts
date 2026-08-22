/**
 * conceptPassageLink.ts — löst "Begriff → Passage" auf, für die
 * Begriffsnetz-Knotenkarte "Zur Passage" (Design: Runde 1, Reader-first-
 * Kern). Kein erfundener Mechanismus: nutzt genau die Verknüpfung, die
 * WerkPage für die ◇N-Randnotiz schon liest — ResonanzEntry.nodeIds (welche
 * Begriffe ein Eintrag berührt) + contextMeta.passage_chunk_id /
 * werk_passages[].id (welche Werk-Stelle der Eintrag verankert).
 */
import { loadResonanzenIndexLazy, groupResonanzenByNode } from "@/lib/resonanzenIndex";

export interface ConceptPassageLink { chapterId: string; chunkId: string }

interface WerkChunksLookup { chunks: Array<{ id: string; chapter: string }> }

let chunksPromise: Promise<WerkChunksLookup | null> | null = null;
function loadWerkChunksLazy(): Promise<WerkChunksLookup | null> {
  if (!chunksPromise) {
    chunksPromise = fetch("/werk-chunks.json").then(r => r.ok ? r.json() : null).catch(() => null);
  }
  return chunksPromise;
}

/** Erster im Werk verankerter Begegnungs-Eintrag für einen Begriffsnetz-Knoten,
 *  aufgelöst zu (Kapitel, Chunk). null wenn kein Eintrag eine Werk-Stelle trägt. */
export async function findPassageForConcept(nodeId: string): Promise<ConceptPassageLink | null> {
  const idx = await loadResonanzenIndexLazy();
  if (!idx) return null;
  const entries = groupResonanzenByNode(idx.entries).get(nodeId);
  if (!entries || entries.length === 0) return null;

  let chunkId: string | null = null;
  for (const e of entries) {
    const cid = e.contextMeta?.passage_chunk_id;
    if (typeof cid === "string") { chunkId = cid; break; }
  }
  if (!chunkId) {
    for (const e of entries) {
      const wp = e.contextMeta?.werk_passages;
      if (Array.isArray(wp) && wp.length > 0) {
        const pid = (wp[0] as { id?: unknown })?.id;
        if (typeof pid === "string") { chunkId = pid; break; }
      }
    }
  }
  if (!chunkId) return null;

  const chunks = await loadWerkChunksLazy();
  const chunk = chunks?.chunks.find(c => c.id === chunkId);
  return chunk ? { chapterId: chunk.chapter, chunkId: chunk.id } : null;
}
