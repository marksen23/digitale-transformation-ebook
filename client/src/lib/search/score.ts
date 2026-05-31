/**
 * Score-Helfer: Lex-Treffer bekommen einen Bonus, Sem-Cosine bleibt im
 * 0..1-Bereich. Bei Merge: gemeinsame Skala, Lex hat +0.15 Bonus.
 */
import type { SearchHit } from "./types";

const LEX_BONUS = 0.15;

/** Tier-Rank für Sortierung: primary kommt vor extended. */
export function tierRank(hit: { tier?: "primary" | "extended" }): 0 | 1 {
  return (hit.tier ?? "primary") === "primary" ? 0 : 1;
}

/** Vergleichs-Funktion: tier-first, dann Cosine/Lex-Score mit Mix-Bonus. */
export function compareByTierThenScore(a: SearchHit, b: SearchHit): number {
  const t = tierRank(a) - tierRank(b);
  if (t !== 0) return t;
  return applyMixBonus(b) - applyMixBonus(a);
}

/**
 * Lexikalischer Score: 1.0 für exact-substring im Titel, abnehmend nach
 * Position + Treffer-Häufigkeit. Body-Only-Match wird stärker gestraft,
 * weil solche Treffer ("Resonanz" tief im Body einer Antwort die etwas
 * anderes behandelt) den Reader irritieren, wenn sie zu weit oben landen.
 */
export function lexScore(query: string, title: string, body: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = title.toLowerCase();
  const b = body.toLowerCase();

  let s = 0;
  if (t === q) s = 1.0;
  else if (t.startsWith(q)) s = 0.85;
  else if (t.includes(q)) s = 0.7;
  else if (b.includes(q)) {
    // Fallback: Body-Only-Treffer — deutlich niedriger als jeder Titel-Match.
    // Skaliert sanft mit Treffer-Häufigkeit (mehr Erwähnungen = etwas relevanter),
    // erreicht aber nie 0.5 — damit Titel-Treffer immer vor Body-Treffern landen.
    const count = (b.match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
    s = Math.min(0.45, 0.2 + count * 0.04);
  }
  return s;
}

/**
 * Final-Score eines Hits: Cosine (sem) bekommt Bonus wenn auch Lex matched.
 * Lex-Hits behalten ihren Score.
 */
export function applyMixBonus(hit: SearchHit): number {
  if (hit.mode === "lex") return Math.min(1, hit.score + LEX_BONUS);
  return hit.score;
}

/**
 * Merged Hit-Listen aus Lex und Sem (deduped by id+type).
 * Strategie: Lex-Hits behalten ihre Position; Sem-Hits werden angehängt
 * (sortiert nach Score). Erst beim final-sort-Trigger werden alle gemischt.
 */
export function mergeHits(
  lexHits: SearchHit[],
  semHits: SearchHit[],
  finalSort = false
): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of lexHits) {
    const k = `${h.type}::${h.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  for (const h of semHits) {
    const k = `${h.type}::${h.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  if (finalSort) {
    out.sort(compareByTierThenScore);
  }
  return out;
}
