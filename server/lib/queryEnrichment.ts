/**
 * R7 — Query-Anreicherung mit Konzept-Definitionen.
 *
 * Problem: Anfragen aus dem Begriffsnetz sind strukturell und semantisch
 * dünn — z.B. „Pfad-Analyse: Begegnung → Resonanzvernunft → Verwandlung".
 * Das Embedding-Modell sieht 3 Worte mit Operator-Symbolen; das Resultat
 * clustert mit anderen strukturellen Strings, nicht mit inhaltlichem
 * Werkstoff.
 *
 * Lösung: vor dem Embedding scannen wir die Query auf vorkommende Node-IDs
 * oder fullLabels (case-insensitive, Wortgrenzen), und hängen die Definition
 * jedes Treffers an die Query an. Das gibt dem Embedding semantisches
 * Fleisch ohne den Original-Prompt zu verformen.
 *
 * Effekt-Hypothese: Sibling-Recall sollte für strukturelle Templates
 * (Pfad-Analyse, Spannungsfeld, Triade, Quadratur) deutlich steigen.
 * Eval misst es nach dem nächsten index-rebuild — bzw. inline via R5.
 *
 * Default-on. Deaktivierbar via RAG_QUERY_ENRICHMENT=0.
 */

import { NODES } from "../../client/src/data/conceptGraph.js";

// Pre-compute: alle (matchKey -> {id, fullLabel, description}) Einträge.
// matchKey ist immer kleinbuchstabig — für Wort-Vergleiche.
interface NodeMatchEntry {
  id: string;
  fullLabel: string;
  description: string;
  matchKey: string;
}

const MATCH_TABLE: NodeMatchEntry[] = (() => {
  const out: NodeMatchEntry[] = [];
  for (const n of NODES) {
    // fullLabel kann „Resonanzvernunft" sein, label kann „Resonanz-\nvernunft"
    // sein (mit Zeilenumbruch zur Darstellung). Wir matchen auf fullLabel und id.
    const fullLabel = (n.fullLabel ?? n.label ?? "").replace(/\n/g, " ").trim();
    if (!fullLabel || !n.description) continue;
    out.push({
      id: n.id,
      fullLabel,
      description: n.description,
      matchKey: fullLabel.toLowerCase(),
    });
    // Auch die ID als matchKey aufnehmen — manche Queries enthalten die ID statt label
    if (n.id.toLowerCase() !== fullLabel.toLowerCase()) {
      out.push({
        id: n.id,
        fullLabel,
        description: n.description,
        matchKey: n.id.toLowerCase(),
      });
    }
  }
  // Längere matchKeys zuerst — verhindert dass "resonanz" eine "resonanzvernunft"-Match überschattet
  out.sort((a, b) => b.matchKey.length - a.matchKey.length);
  return out;
})();

const MAX_ENRICHMENTS = 5;   // max so viele Definitionen anhängen, sonst Embedding-Input zu lang
const MAX_DESCRIPTION_LEN = 240;

/**
 * Anreichern. Bei 0 Treffern: Original-Query unverändert.
 */
export function enrichQueryWithNodes(query: string): {
  enriched: string;
  matchedNodes: string[];
} {
  if (process.env.RAG_QUERY_ENRICHMENT === "0") {
    return { enriched: query, matchedNodes: [] };
  }
  if (!query?.trim()) return { enriched: query, matchedNodes: [] };

  const lower = query.toLowerCase();
  const matched: NodeMatchEntry[] = [];
  const seenIds = new Set<string>();

  for (const entry of MATCH_TABLE) {
    if (matched.length >= MAX_ENRICHMENTS) break;
    if (seenIds.has(entry.id)) continue;
    // Wortgrenzen-Match (vermeidet z.B. dass "ich" in "Lichtung" zählt)
    const idx = lower.indexOf(entry.matchKey);
    if (idx < 0) continue;
    const before = idx === 0 ? " " : lower[idx - 1];
    const after = idx + entry.matchKey.length >= lower.length
      ? " "
      : lower[idx + entry.matchKey.length];
    if (!/[\s.,;:?!→↔·•·()/\[\]{}<>'"„""'']/.test(before)) continue;
    if (!/[\s.,;:?!→↔·•·()/\[\]{}<>'"„""'']/.test(after)) continue;
    matched.push(entry);
    seenIds.add(entry.id);
  }

  if (matched.length === 0) return { enriched: query, matchedNodes: [] };

  const enrichmentBlock = matched
    .map(m => `[${m.fullLabel}]: ${m.description.slice(0, MAX_DESCRIPTION_LEN)}`)
    .join("\n");
  const enriched = `${query}\n\nKonzept-Kontext:\n${enrichmentBlock}`;
  return { enriched, matchedNodes: matched.map(m => m.id) };
}
