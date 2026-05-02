/**
 * Resonanzen-Page (/resonanzen) — öffentliche FAQ + Wortwolken-Sicht
 * über alle gesammelten KI-Antworten der Reader-App.
 *
 * Quelle: /resonanzen-index.json (vom Build-Step erzeugt aus
 * content/resonanzen/raw/**\/*.md). Wortwolke aggregiert die User-Anfragen
 * (prompt-Feld) — was die Leserschaft *fragt*, nicht was die KI antwortet.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import WordCloud from "@/components/enkidu/WordCloud";
import { useEbookTheme } from "@/hooks/useEbookTheme";
import {
  loadResonanzenIndex, extractCorpusKeywords,
  loadEmbeddings, fetchQueryEmbedding, rankBySimilarity,
  ENDPOINT_LABEL, ENDPOINT_COLOR,
  type ResonanzEntry, type ResonanzIndex,
} from "@/lib/resonanzenIndex";

const SERIF = "'EB Garamond', Georgia, serif";
const MONO  = "'Courier Prime', 'Courier New', monospace";

type Palette = {
  void: string; deep: string; surface: string; border: string;
  muted: string; textDim: string; text: string; textBright: string;
  accent: string; accentDim: string;
};

const C_DARK: Palette = {
  void: "#080808", deep: "#0f0f0f", surface: "#161616", border: "#2a2a2a",
  muted: "#444", textDim: "#888", text: "#c8c2b4", textBright: "#e8e2d4",
  accent: "#c4a882", accentDim: "#7a6a52",
};

const C_LIGHT: Palette = {
  void: "#fafaf9", deep: "#f0ece4", surface: "#ffffff", border: "#d8d2c8",
  muted: "#a8a29e", textDim: "#78716c", text: "#3a3530", textBright: "#1c1917",
  accent: "#c4a882", accentDim: "#7a6a52",
};

type EndpointKey = ResonanzEntry["endpoint"] | "all";
type StatusKey = "all" | "kuratiert";

export default function ResonanzenPage() {
  const isDark = useEbookTheme();
  const C = isDark ? C_DARK : C_LIGHT;

  const [index, setIndex] = useState<ResonanzIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterEndpoint, setFilterEndpoint] = useState<EndpointKey>("all");
  const [filterStatus, setFilterStatus] = useState<StatusKey>("all");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Semantische Suche — Toggle + Status. Embeddings werden lazy geladen,
  // Query-Embedding via /api/embed pro Suchvorgang.
  const [semanticMode, setSemanticMode] = useState(false);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticResults, setSemanticResults] = useState<Array<{ id: string; score: number }> | null>(null);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const [embeddingsAvailable, setEmbeddingsAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    loadResonanzenIndex()
      .then(setIndex)
      .catch(err => setLoadError(err instanceof Error ? err.message : String(err)));
    // Pre-fetch embeddings (lazy, im Hintergrund)
    loadEmbeddings().then(emb => {
      setEmbeddingsAvailable(emb !== null && Object.keys(emb.embeddings ?? {}).length > 0);
    });
  }, []);

  // Semantische Suche ausführen (debounced via Button-Click)
  const runSemanticSearch = async () => {
    const q = search.trim();
    if (!q || !index) return;
    setSemanticLoading(true);
    setSemanticError(null);
    setSemanticResults(null);
    try {
      const [queryVec, embeddings] = await Promise.all([
        fetchQueryEmbedding(q),
        loadEmbeddings(),
      ]);
      if (!queryVec) {
        setSemanticError("Query-Embedding konnte nicht berechnet werden.");
        return;
      }
      if (!embeddings || Object.keys(embeddings.embeddings).length === 0) {
        setSemanticError("Korpus-Embeddings nicht verfügbar.");
        return;
      }
      const ranked = rankBySimilarity(queryVec, index.entries, embeddings.embeddings, 20);
      setSemanticResults(ranked.map(r => ({ id: r.entry.id, score: r.score })));
    } catch (err) {
      setSemanticError(err instanceof Error ? err.message : String(err));
    } finally {
      setSemanticLoading(false);
    }
  };

  // ─── Filter + Suche ─────────────────────────────────────────────────────
  // Im semantischen Modus mit Resultat-Cache: zeige in dieser Sortierung
  // nur die rangierten Treffer (gefiltert durch Endpoint/Status/Tag).
  // Sonst: klassischer Volltext-Filter.
  const filtered = useMemo(() => {
    if (!index) return [];
    const passes = (e: ResonanzEntry): boolean => {
      if (filterEndpoint !== "all" && e.endpoint !== filterEndpoint) return false;
      if (filterStatus === "kuratiert" && e.status === "raw") return false;
      if (filterTag && !e.nodeIds.includes(filterTag)) return false;
      return true;
    };

    if (semanticMode && semanticResults) {
      const byId = new Map(index.entries.map(e => [e.id, e]));
      return semanticResults
        .map(r => byId.get(r.id))
        .filter((e): e is ResonanzEntry => !!e && passes(e));
    }

    const term = search.trim().toLowerCase();
    return index.entries.filter(e => {
      if (!passes(e)) return false;
      if (term) {
        const hay = (e.prompt + "\n" + e.response + "\n" + e.anchor).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [index, filterEndpoint, filterStatus, filterTag, search, semanticMode, semanticResults]);

  // Score-Map für semantische Anzeige (Eintrag → Cosine-Score)
  const scoreById = useMemo(() => {
    const m = new Map<string, number>();
    if (semanticResults) for (const r of semanticResults) m.set(r.id, r.score);
    return m;
  }, [semanticResults]);

  // Wortwolke: aus allen Einträgen (oder kuratiert nur) — nicht der gefilterten
  // Liste, weil die Wolke einen Gesamteindruck geben soll, kein Such-Echo
  const cloudEntries = useMemo(() => {
    if (!index) return [];
    return filterStatus === "kuratiert"
      ? index.entries.filter(e => e.status !== "raw")
      : index.entries;
  }, [index, filterStatus]);

  const keywords = useMemo(() => extractCorpusKeywords(cloudEntries, 50), [cloudEntries]);

  // Top-Tags aus dem Korpus (für Tag-Filter)
  const topTags = useMemo(() => {
    if (!index) return [];
    const freq: Record<string, number> = {};
    for (const e of index.entries) {
      for (const t of e.nodeIds) freq[t] = (freq[t] ?? 0) + 1;
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag, count]) => ({ tag, count }));
  }, [index]);

  // Stats nach Endpoint
  const endpointCounts = useMemo(() => {
    if (!index) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const e of index.entries) {
      counts[e.endpoint] = (counts[e.endpoint] ?? 0) + 1;
    }
    return counts;
  }, [index]);

  if (loadError) {
    return (
      <div style={{ position: "fixed", inset: 0, background: C.void, color: C.text, fontFamily: SERIF, padding: "2rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontStyle: "italic", color: C.textDim }}>Resonanzen-Index nicht erreichbar: {loadError}</p>
        <Link href="/" style={{ marginTop: "1rem", color: C.accent, fontFamily: MONO, fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>← Zum Werk</Link>
      </div>
    );
  }

  return (
    // Eigener Scroll-Container — die App-weite index.css setzt overflow: hidden
    // auf body/#root für die Reader-Vollbild-UX. data-scroll erlaubt
    // touch-action: pan-y auf Mobile.
    <div
      data-scroll
      style={{
        position: "fixed", inset: 0, overflowY: "auto",
        background: C.void, color: C.text, fontFamily: SERIF,
        WebkitOverflowScrolling: "touch",
        // iOS-safe-area: Content wird unter Notch + Home-Indicator nicht abgeschnitten
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      {/* Header */}
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: "1.5rem 1rem", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
          <h1 style={{ fontFamily: SERIF, fontSize: "1.8rem", fontStyle: "italic", color: C.textBright, margin: 0, fontWeight: 400 }}>
            Resonanzen
          </h1>
          <Link href="/" style={{ color: C.accent, fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>← Zum Werk</Link>
        </div>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.95rem", color: C.textDim, margin: 0, lineHeight: 1.5 }}>
          {index ? `${index.count} gesammelte Begegnungen — Fragen der Lesenden, Antworten der KI, Pfade durch das Werk.` : "lädt …"}
        </p>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "1.5rem 1rem 4rem" }}>
        {/* Wortwolke */}
        {keywords.length > 0 && (
          <section style={{ marginBottom: "2.5rem" }}>
            <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em", color: C.muted, textTransform: "uppercase", marginBottom: "0.8rem" }}>
              Kollektiver Fokus — was die Leserschaft fragt
            </div>
            <div style={{ background: C.deep, border: `1px solid ${C.border}`, padding: "1rem", overflow: "hidden" }}>
              <WordCloud keywords={keywords} width={Math.min(900, typeof window !== "undefined" ? window.innerWidth - 64 : 900)} height={260} />
            </div>
          </section>
        )}

        {/* Filter-Bar */}
        <section style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          {/* Endpoint-Pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {(["all", "chapter", "enkidu", "analyse", "graph-chat", "translate", "path-analyse"] as EndpointKey[]).map(key => {
              const active = filterEndpoint === key;
              const label = key === "all" ? "Alle" : ENDPOINT_LABEL[key];
              const count = key === "all" ? (index?.count ?? 0) : (endpointCounts[key] ?? 0);
              const color = key === "all" ? C.accent : ENDPOINT_COLOR[key];
              return (
                <button
                  key={key}
                  onClick={() => setFilterEndpoint(key)}
                  style={{
                    fontFamily: MONO, fontSize: "0.58rem", letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: active ? "#080808" : color,
                    background: active ? color : "none",
                    border: `1px solid ${color}`,
                    padding: "0.5rem 0.7rem", cursor: "pointer",
                    minHeight: 36, // Touch-Target (WCAG-Minimum 44, hier Kompromiss mit Filter-Dichte)
                    transition: "all 0.15s",
                  }}
                >
                  {label} <span style={{ opacity: 0.7 }}>({count})</span>
                </button>
              );
            })}
          </div>

          {/* Status- + Suchleiste */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="text"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                // Semantische Resultate werden beim Tippen ungültig
                if (semanticResults) setSemanticResults(null);
              }}
              onKeyDown={e => { if (e.key === "Enter" && semanticMode) runSemanticSearch(); }}
              placeholder={semanticMode ? "Semantische Suche — Enter drücken …" : "Volltext-Suche …"}
              style={{
                flex: 1, minWidth: 180, fontFamily: SERIF, fontStyle: "italic",
                background: C.surface, color: C.textBright,
                border: `1px solid ${search ? C.accentDim : C.border}`,
                padding: "0.6rem 0.8rem", outline: "none",
                fontSize: "16px", // iOS-Trick: ≥16px verhindert ungewünschten Zoom beim Fokus
                minHeight: 44,
              }}
            />
            {/* Semantische-Suche-Toggle (nur sichtbar wenn Embeddings da sind) */}
            {embeddingsAvailable && (
              <button
                onClick={() => {
                  const next = !semanticMode;
                  setSemanticMode(next);
                  setSemanticResults(null);
                  setSemanticError(null);
                  if (next && search.trim()) runSemanticSearch();
                }}
                disabled={semanticLoading}
                style={{
                  fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: semanticMode ? "#080808" : "#5aacb8",
                  background: semanticMode ? "#5aacb8" : "none",
                  border: `1px solid #5aacb8`,
                  padding: "0.5rem 0.7rem",
                  minHeight: 44,
                  cursor: semanticLoading ? "wait" : "pointer",
                  opacity: semanticLoading ? 0.5 : 1,
                }}
                title="Suche nach semantischer Ähnlichkeit (Embedding-basiert)"
              >
                {semanticLoading ? "…" : semanticMode ? "✓ semantisch" : "≈ semantisch"}
              </button>
            )}
            <button
              onClick={() => setFilterStatus(s => s === "all" ? "kuratiert" : "all")}
              style={{
                fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: filterStatus === "kuratiert" ? "#080808" : C.muted,
                background: filterStatus === "kuratiert" ? C.accent : "none",
                border: `1px solid ${filterStatus === "kuratiert" ? C.accent : C.border}`,
                padding: "0.5rem 0.7rem", cursor: "pointer",
                minHeight: 44,
              }}
              title="Nur kuratierte (vom Autor freigegebene) Einträge zeigen"
            >
              {filterStatus === "kuratiert" ? "✓ kuratiert" : "alle (auch ungeprüft)"}
            </button>
          </div>

          {/* Semantische Suche Status-Hinweis */}
          {semanticMode && (
            <div style={{ fontFamily: MONO, fontSize: "0.5rem", color: "#5aacb8", letterSpacing: "0.08em" }}>
              {semanticLoading ? "Embedding wird berechnet …"
                : semanticError ? <span style={{ color: "#c48282" }}>{semanticError}</span>
                : semanticResults ? `Sortiert nach Ähnlichkeit · Top ${semanticResults.length}`
                : "Suchbegriff eingeben + Enter drücken (oder Toggle erneut klicken)"}
            </div>
          )}

          {/* Tag-Filter (top tags) */}
          {topTags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", alignItems: "center" }}>
              <span style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginRight: "0.3rem" }}>Tags:</span>
              {filterTag && (
                <button
                  onClick={() => setFilterTag(null)}
                  style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.accent, background: "rgba(196,168,130,0.1)", border: `1px solid ${C.accentDim}`, padding: "0.18rem 0.5rem", cursor: "pointer" }}
                >
                  ✕ {filterTag}
                </button>
              )}
              {!filterTag && topTags.map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => setFilterTag(tag)}
                  style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.18rem 0.5rem", cursor: "pointer" }}
                >
                  {tag} <span style={{ opacity: 0.6 }}>{count}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Stats + Result-Count */}
        <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, letterSpacing: "0.1em", marginBottom: "1rem" }}>
          {filtered.length} von {index?.count ?? 0} Einträgen
          {filterStatus === "kuratiert" && <> · nur kuratierte</>}
        </div>

        {/* Eintragsliste */}
        <section>
          {filtered.length === 0 && index && (
            <div style={{ fontStyle: "italic", color: C.textDim, padding: "2rem 0", textAlign: "center" }}>
              Keine Einträge mit diesen Filtern gefunden.
            </div>
          )}
          {filtered.map(entry => (
            <article
              key={entry.id}
              style={{
                marginBottom: "0.7rem",
                background: C.surface,
                border: `1px solid ${C.border}`,
                padding: "0.9rem 1rem",
                cursor: "pointer",
              }}
              onClick={() => setExpandedId(id => id === entry.id ? null : entry.id)}
            >
              <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.15em", textTransform: "uppercase", color: ENDPOINT_COLOR[entry.endpoint] }}>
                  {ENDPOINT_LABEL[entry.endpoint]}
                  {entry.status === "raw" && <span style={{ color: C.muted, marginLeft: "0.5rem" }}>· ungeprüft</span>}
                  {semanticMode && scoreById.has(entry.id) && (
                    <span style={{ color: "#5aacb8", marginLeft: "0.5rem" }}>
                      · ≈ {(scoreById.get(entry.id)! * 100).toFixed(0)}%
                    </span>
                  )}
                </span>
                <time style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted }}>
                  {new Date(entry.ts).toLocaleDateString("de-DE", { year: "numeric", month: "short", day: "numeric" })}
                </time>
              </header>

              <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.95rem", color: C.textBright, lineHeight: 1.5, marginBottom: "0.4rem" }}>
                {entry.prompt}
              </div>

              {entry.nodeIds.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: "0.4rem" }}>
                  {entry.nodeIds.slice(0, 6).map(t => (
                    <span key={t} style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted, background: C.deep, padding: "0.1rem 0.4rem", border: `1px solid ${C.border}` }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {expandedId === entry.id ? (
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "0.6rem", marginTop: "0.4rem" }}>
                  {entry.response.split(/\n\n+/).map((para, i) => (
                    <p key={i} style={{ fontFamily: SERIF, fontSize: "0.88rem", color: C.text, lineHeight: 1.65, margin: "0 0 0.7rem" }}>
                      {para.trim()}
                    </p>
                  ))}
                </div>
              ) : (
                <div style={{ fontFamily: SERIF, fontSize: "0.78rem", color: C.textDim, lineHeight: 1.5 }}>
                  {entry.response.slice(0, 220).trim()}
                  {entry.response.length > 220 ? "…" : ""}
                </div>
              )}
            </article>
          ))}
        </section>

        {/* Footer */}
        <footer style={{ marginTop: "3rem", paddingTop: "1.5rem", borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontSize: "0.5rem", color: C.muted, letterSpacing: "0.1em", textAlign: "center" }}>
          Index zuletzt erzeugt: {index ? new Date(index.generatedAt).toLocaleString("de-DE") : "—"}
          <br />
          © Markus Oehring · Inhalte unterliegen der <a href="https://github.com/marksen23/digitale-transformation-ebook/blob/main/LICENSE" style={{ color: C.accent, textDecoration: "underline" }}>Werk-Lizenz</a>
        </footer>
      </main>
    </div>
  );
}
