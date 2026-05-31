/**
 * Resonanzen-Source — Such-Adapter für den kuratierten Korpus.
 *
 * Strategie:
 *   - Primär matcht prompt (= die Frage des Users). Da liefert lexScore
 *     hohen Score wenn der Begriff exakt im Prompt steht.
 *   - Sekundär matcht response (= die Antwort). lexScore straft
 *     Body-Only-Matches stark (max 0.45), sodass diese unten landen.
 *   - Anchor wird mit-durchsucht, aber liefert keine eigene Sichtbarkeit
 *     im Snippet — nur Score-Beitrag.
 *
 * Bewusst NICHT: related/nearDuplicates werden NICHT mitdurchsucht.
 * Das wäre die Hauptursache für Falsch-Positive auf der Wissensseite —
 * der User sieht einen Treffer, in dem das gesuchte Wort gar nicht
 * vorkommt (sondern in einer verbundenen Resonanz).
 */
import type { SearchHit, SearchSource } from "@/lib/search/types";
import { extractSnippet } from "@/lib/search/highlight";
import { lexScore } from "@/lib/search/score";
import { loadResonanzenIndexLazy, type ResonanzEntry } from "@/lib/resonanzenIndex";

// Loader-State: lazy + cached
let cache: ResonanzEntry[] | null = null;
let promise: Promise<ResonanzEntry[] | null> | null = null;

async function getEntries(): Promise<ResonanzEntry[] | null> {
  if (cache) return cache;
  if (promise) return promise;
  promise = loadResonanzenIndexLazy().then(idx => {
    if (!idx) return null;
    // Nur kuratierte (published/approved) — raw ist Suchrauschen.
    // Master werden bevorzugt vor ihren Varianten gezeigt.
    cache = idx.entries.filter(e =>
      e.status === "published" || e.status === "approved"
    );
    return cache;
  });
  return promise;
}

export const resonanzenSource: SearchSource = {
  id: "resonanzen",
  type: "resonanz",
  label: "Resonanzen",
  async search(q) {
    if (!q.trim()) return [];
    const entries = await getEntries();
    if (!entries) return [];
    const lower = q.toLowerCase();
    const hits: SearchHit[] = [];
    for (const e of entries) {
      const prompt = e.prompt ?? "";
      const response = e.response ?? "";
      const anchor = e.anchor ?? "";
      // Schnell-Check: nur weiter wenn Match irgendwo
      if (!prompt.toLowerCase().includes(lower) &&
          !response.toLowerCase().includes(lower) &&
          !anchor.toLowerCase().includes(lower)) {
        continue;
      }
      // lexScore mit prompt als "Titel" und response als "Body" —
      // straft Body-Only-Treffer (max 0.45), Prompt-Treffer bis 1.0.
      const score = lexScore(q, prompt, response);
      hits.push({
        id: e.id,
        type: "resonanz",
        title: prompt.slice(0, 120),
        snippet: extractSnippet(response || prompt, q, 60).slice(0, 200),
        score,
        payload: e,
        anchor: e.id,
      });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits;
  },
};
