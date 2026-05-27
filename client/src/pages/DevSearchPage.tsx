/**
 * /dev/search — Demo-Route für M1.
 *
 * Mock-Sources zum Erproben des UnifiedSearch-Patterns ohne Daten-Adapter.
 * Wird in späteren Milestones durch echte Source-Adapter ersetzt.
 */
import { useState } from "react";
import { UnifiedSearch } from "@/components/search/UnifiedSearch";
import { GlobalSearchOverlay } from "@/components/search/GlobalSearchOverlay";
import type { FilterGroup, SearchHit, SearchSource } from "@/lib/search/types";
import { lexScore } from "@/lib/search/score";
import { extractSnippet } from "@/lib/search/highlight";
import { useGlobalHotkey } from "@/hooks/useGlobalHotkey";

const MOCK_CHAPTERS = [
  { id: "c1", title: "Was ist Resonanz?", body: "Resonanz ist nicht bloß Reaktion — sie setzt Eigenfrequenz voraus. Nur wer für etwas ansprechbar ist, kann in Resonanz geraten." },
  { id: "c2", title: "Vernunft im Zwischen", body: "Vernunft entsteht nicht im isolierten Ich, sondern im resonanten Zwischen — als lebendiges Antwortgeschehen." },
  { id: "c3", title: "Existenz und Dasein", body: "Existenz heißt: in die Welt geworfen, mit Anderen, zur Verwandlung bestimmt." },
  { id: "c4", title: "Werk und Wirklichkeit", body: "Ein Werk wirkt nur, wenn es resoniert. Wirklichkeit ist nicht objektive Gegebenheit, sondern antwortendes Geschehen." },
];

const MOCK_RESONANZEN = [
  { id: "r1", prompt: "Wie verhält sich Vernunft zur Resonanz?", response: "Vernunft braucht Resonanz, um nicht zur Maschine zu werden …" },
  { id: "r2", prompt: "Was sagt Heidegger zur Existenz?", response: "Dasein als In-der-Welt-sein, geworfen, antwortend …" },
];

const chaptersSource: SearchSource = {
  id: "chapters", type: "chapter", label: "Werk-Kapitel",
  search(q) {
    if (!q) return [];
    const hits: SearchHit[] = [];
    for (const c of MOCK_CHAPTERS) {
      const score = lexScore(q, c.title, c.body);
      if (score > 0) {
        hits.push({
          id: c.id, type: "chapter",
          title: c.title,
          snippet: extractSnippet(c.body, q),
          score, payload: c,
        });
      }
    }
    return hits;
  },
};

const resonanzenSource: SearchSource = {
  id: "resonanzen", type: "resonanz", label: "Resonanzen",
  search(q) {
    if (!q) return [];
    const hits: SearchHit[] = [];
    for (const r of MOCK_RESONANZEN) {
      const score = lexScore(q, r.prompt, r.response);
      if (score > 0) {
        hits.push({
          id: r.id, type: "resonanz",
          title: r.prompt,
          snippet: extractSnippet(r.response, q),
          score, payload: r,
        });
      }
    }
    return hits;
  },
};

const MOCK_FILTERS: FilterGroup[] = [
  {
    id: "status", label: "Status", multi: true,
    options: [
      { value: "published", label: "Veröffentlicht", count: 79 },
      { value: "approved", label: "Bestätigt", count: 12 },
      { value: "pending", label: "Wartend", count: 5 },
    ],
  },
  {
    id: "endpoint", label: "Quelle", multi: true,
    options: [
      { value: "analyse", label: "Analyse", count: 41 },
      { value: "path-analyse", label: "Pfad-Analyse", count: 23 },
      { value: "dialog", label: "Dialog", count: 8 },
    ],
  },
];

export default function DevSearchPage() {
  const [lastHit, setLastHit] = useState<SearchHit | null>(null);
  const [globalOpen, setGlobalOpen] = useState(false);

  useGlobalHotkey("k", (e) => { e.preventDefault(); setGlobalOpen(o => !o); }, { meta: true });
  useGlobalHotkey("/", () => setGlobalOpen(o => !o));

  return (
    <div className="min-h-dvh bg-stone-50 dark:bg-stone-950 text-stone-800 dark:text-stone-200 p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <header>
          <h1 className="text-2xl font-serif">Dev — Search Playground</h1>
          <p className="text-sm text-stone-500 mt-1">
            M1-Demo. Ctrl+K (oder <kbd className="px-1 border rounded text-xs">/</kbd>) öffnet die globale Suche.
          </p>
        </header>

        <section>
          <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-2">Page-Scope (1 Source)</h2>
          <UnifiedSearch
            scope="page"
            scopeId="dev-chapters"
            sources={[chaptersSource]}
            onSelect={setLastHit}
            placeholder="In Kapiteln suchen …"
          />
        </section>

        <section>
          <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-2">Page-Scope mit Filter-Chips (2 Sources)</h2>
          <UnifiedSearch
            scope="page"
            scopeId="dev-mixed"
            sources={[chaptersSource, resonanzenSource]}
            filterGroups={MOCK_FILTERS}
            onSelect={setLastHit}
            placeholder="Alles durchsuchen …"
          />
        </section>

        <section>
          <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-2">Letzter Treffer</h2>
          <pre className="text-xs p-3 rounded bg-stone-100 dark:bg-stone-900 overflow-x-auto">
            {lastHit ? JSON.stringify({ id: lastHit.id, type: lastHit.type, title: lastHit.title, score: lastHit.score }, null, 2) : "—"}
          </pre>
        </section>

        <GlobalSearchOverlay
          open={globalOpen}
          onClose={() => setGlobalOpen(false)}
          sources={[chaptersSource, resonanzenSource]}
          onSelect={setLastHit}
        />
      </div>
    </div>
  );
}
