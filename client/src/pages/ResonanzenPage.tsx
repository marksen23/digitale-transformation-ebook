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
import { useAdminAuth, callAdminAction } from "@/lib/adminAuth";
import DeleteConfirm from "@/components/admin/DeleteConfirm";
import { PHILOSOPHERS } from "@/data/philosophyMap";

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
// Reading-Mode-Verdichtung — phänomenologisches Responsive-Pattern:
//   surface  → minimal, Frage + 1-Zeilen-Excerpt
//   depth    → Default, Frage + Excerpt + Tags + on-click Verwandte
//   research → alles voll, audit-trail-ähnliche Sicht
type ReadingMode = "surface" | "depth" | "research";

export default function ResonanzenPage() {
  const isDark = useEbookTheme();
  const C = isDark ? C_DARK : C_LIGHT;

  const [index, setIndex] = useState<ResonanzIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // URL-Init: Filter-State aus Query-Params (für Deep-Links + Browser-Back)
  const initParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const [filterEndpoint, setFilterEndpoint] = useState<EndpointKey>(
    (initParams.get("endpoint") as EndpointKey) ?? "all"
  );
  const [filterStatus, setFilterStatus] = useState<StatusKey>(
    initParams.get("status") === "kuratiert" ? "kuratiert" : "all"
  );
  const [filterTag, setFilterTag] = useState<string | null>(initParams.get("tag"));
  const [search, setSearch] = useState(initParams.get("q") ?? "");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [readingMode, setReadingMode] = useState<ReadingMode>("depth");
  const [showRelatedFor, setShowRelatedFor] = useState<string | null>(null);
  // Phase 3: Filter-Bar kollabierbar (Default-Minimal).
  // Wenn beim Mount schon Filter via URL aktiv sind, sofort aufklappen —
  // sonst bliebe ein gesetzter Filter unsichtbar hinter "▸ Filter (1 aktiv)".
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    return (initParams.get("endpoint") && initParams.get("endpoint") !== "all")
      || initParams.get("status") === "kuratiert"
      || !!initParams.get("tag");
  });

  // Semantische Suche — Toggle + Status. Embeddings werden lazy geladen,
  // Query-Embedding via /api/embed pro Suchvorgang.
  const [semanticMode, setSemanticMode] = useState(false);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticResults, setSemanticResults] = useState<Array<{ id: string; score: number }> | null>(null);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const [embeddingsAvailable, setEmbeddingsAvailable] = useState<boolean | null>(null);

  // Admin-Inline-Löschen: nur sichtbar wenn Token gesetzt + Server-validiert
  const { state: adminState } = useAdminAuth();
  const isAdmin = adminState === "ok";
  const [confirmDelete, setConfirmDelete] = useState<ResonanzEntry | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleInlineDelete(id: string) {
    setDeleteLoading(true);
    setDeleteError(null);
    const result = await callAdminAction("delete", { id });
    setDeleteLoading(false);
    if (result.ok) {
      setIndex(curr => curr ? {
        ...curr,
        count: curr.count - 1,
        entries: curr.entries.filter(e => e.id !== id),
      } : curr);
      setConfirmDelete(null);
      if (expandedId === id) setExpandedId(null);
    } else {
      setDeleteError(result.error ?? "Fehler beim Löschen");
    }
  }

  useEffect(() => {
    loadResonanzenIndex()
      .then(idx => {
        setIndex(idx);
        // Deep-Link: ?id=… expandiert + scrollt zum Eintrag (vom Begriffsnetz aus)
        const params = new URLSearchParams(window.location.search);
        const targetId = params.get("id");
        const targetTag = params.get("tag");
        if (targetId && idx.entries.some(e => e.id === targetId)) {
          setExpandedId(targetId);
          requestAnimationFrame(() => {
            document.getElementById(`entry-${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          });
        }
        if (targetTag && idx.entries.some(e => e.nodeIds.includes(targetTag))) {
          setFilterTag(targetTag);
        }
      })
      .catch(err => setLoadError(err instanceof Error ? err.message : String(err)));
    // Pre-fetch embeddings (lazy, im Hintergrund)
    loadEmbeddings().then(emb => {
      setEmbeddingsAvailable(emb !== null && Object.keys(emb.embeddings ?? {}).length > 0);
    });
  }, []);

  // URL-Sync: Such-Term + aktive Filter spiegeln in Query-Params (shareable Deep-Links)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const update = (key: string, val: string | null) => {
      if (val && val !== "all") params.set(key, val);
      else params.delete(key);
    };
    update("q", search.trim() || null);
    update("endpoint", filterEndpoint);
    update("status", filterStatus === "kuratiert" ? "kuratiert" : null);
    update("tag", filterTag);
    // 'id' nur bei expliziter Wahl beibehalten (initial Deep-Link)
    const newSearch = params.toString();
    const target = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
    if (target !== window.location.pathname + window.location.search) {
      window.history.replaceState({}, "", target);
    }
  }, [search, filterEndpoint, filterStatus, filterTag]);

  // Anzahl aktiver Filter (für "Filter (N aktiv)"-Affordance)
  const activeFilterCount =
    (filterEndpoint !== "all" ? 1 : 0) +
    (filterStatus === "kuratiert" ? 1 : 0) +
    (filterTag ? 1 : 0);

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
        <p style={{ fontStyle: "italic", color: C.textDim }}>Wissens-Index nicht erreichbar: {loadError}</p>
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
            Kollektives Wissen
          </h1>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "baseline" }}>
            <Link href="/philosophie" style={{ color: C.accent, fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>Philosophische Karte</Link>
            <Link href="/" style={{ color: C.accent, fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>← Zum Werk</Link>
          </div>
        </div>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.95rem", color: C.textDim, margin: 0, lineHeight: 1.5 }}>
          {index ? `${index.count} Begegnungen aus dem kollektiven Wissen — was die Leserschaft fragt, was sich darin sammelt.` : "lädt …"}
        </p>
        {/* Reading-Mode-Toggle: phänomenologisch-responsive Verdichtung.
            Default 'depth'. 'surface' ist für Schnelldurchsicht, 'research'
            zeigt alles inkl. Provenance. Verdichtung wirkt auf Eintragsliste. */}
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginRight: "0.4rem" }}>Tiefe:</span>
          {(["surface", "depth", "research"] as ReadingMode[]).map(m => {
            const active = readingMode === m;
            const label = m === "surface" ? "Oberfläche" : m === "depth" ? "Vertiefung" : "Forschung";
            return (
              <button
                key={m}
                onClick={() => setReadingMode(m)}
                style={{
                  fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
                  color: active ? C.textBright : C.muted,
                  background: active ? C.deep : "none",
                  border: `1px solid ${active ? C.accentDim : C.border}`,
                  padding: "0.4rem 0.7rem", cursor: "pointer", minHeight: 36,
                  transition: "all 0.15s",
                }}
              >{label}</button>
            );
          })}
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "0 1rem 4rem" }}>
        {/* ═══ SUCH-HERO: zentrales Tool, sticky beim Scroll ═══ */}
        <section
          style={{
            position: "sticky", top: 0, zIndex: 10,
            background: `${C.void}f0`,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            padding: "1rem 0",
            marginBottom: "1.5rem",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "stretch", flexWrap: "wrap" }}>
            <input
              type="text"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                if (semanticResults) setSemanticResults(null);
              }}
              onKeyDown={e => { if (e.key === "Enter" && semanticMode) runSemanticSearch(); }}
              placeholder={semanticMode ? "Semantische Suche — Enter drücken …" : "Suchen im kollektiven Wissen …"}
              style={{
                flex: 1, minWidth: 200,
                fontFamily: SERIF, fontStyle: "italic",
                fontSize: "1rem",
                background: C.surface, color: C.textBright,
                border: `1px solid ${search ? C.accentDim : C.border}`,
                padding: "0.9rem 1.1rem", outline: "none",
                minHeight: 56,
                transition: "border-color 0.2s",
              }}
            />
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
                  fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase",
                  color: semanticMode ? "#080808" : "#5aacb8",
                  background: semanticMode ? "#5aacb8" : "none",
                  border: `1px solid #5aacb8`,
                  padding: "0 1rem",
                  minHeight: 56, minWidth: 110,
                  cursor: semanticLoading ? "wait" : "pointer",
                  opacity: semanticLoading ? 0.5 : 1,
                }}
                title="Toggle: Volltext-Match vs. semantische Ähnlichkeit"
              >
                {semanticLoading ? "…" : semanticMode ? "✓ semantisch" : "≈ semantisch"}
              </button>
            )}
            {search && (
              <button
                onClick={() => { setSearch(""); setSemanticResults(null); setSemanticError(null); }}
                aria-label="Suche zurücksetzen"
                style={{
                  fontFamily: MONO, fontSize: "1rem",
                  color: C.muted, background: "none",
                  border: `1px solid ${C.border}`,
                  minHeight: 56, minWidth: 56,
                  cursor: "pointer",
                }}
              >×</button>
            )}
          </div>
          {/* Live-Counter / Status */}
          <div style={{ marginTop: "0.5rem", fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", color: C.muted, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span>
              {semanticMode && semanticLoading ? "Embedding wird berechnet …"
                : semanticMode && semanticError ? <span style={{ color: "#c48282" }}>{semanticError}</span>
                : semanticMode && semanticResults ? `Top ${semanticResults.length} nach Ähnlichkeit`
                : semanticMode ? "Suchbegriff + Enter drücken"
                : search.trim() ? `${filtered.length} Treffer von ${index?.count ?? 0}`
                : `${index?.count ?? 0} Begegnungen insgesamt`}
            </span>
            {/* Filter-Toggle mit Active-Count */}
            <button
              onClick={() => setFiltersExpanded(v => !v)}
              style={{
                fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
                color: activeFilterCount > 0 ? C.accent : C.muted,
                background: "none",
                border: `1px solid ${activeFilterCount > 0 ? C.accentDim : C.border}`,
                padding: "0.4rem 0.7rem", cursor: "pointer",
                minHeight: 36,
              }}
              aria-expanded={filtersExpanded}
            >
              {filtersExpanded ? "▾" : "▸"} Filter{activeFilterCount > 0 ? ` (${activeFilterCount} aktiv)` : ""}
            </button>
          </div>
        </section>

        {/* ═══ KOLLABIERBARE FILTER ═══ */}
        {filtersExpanded && (
          <section style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.8rem", padding: "1rem", background: C.deep, border: `1px solid ${C.border}` }}>
            {/* Endpoint-Pills */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Kategorie:</div>
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
                        fontFamily: MONO, fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase",
                        color: active ? "#080808" : color,
                        background: active ? color : "none",
                        border: `1px solid ${color}`,
                        padding: "0.5rem 0.7rem", cursor: "pointer", minHeight: 36,
                      }}
                    >
                      {label} <span style={{ opacity: 0.7 }}>({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Status-Toggle */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Kuration:</div>
              <button
                onClick={() => setFilterStatus(s => s === "all" ? "kuratiert" : "all")}
                style={{
                  fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
                  color: filterStatus === "kuratiert" ? "#080808" : C.muted,
                  background: filterStatus === "kuratiert" ? C.accent : "none",
                  border: `1px solid ${filterStatus === "kuratiert" ? C.accent : C.border}`,
                  padding: "0.5rem 0.8rem", cursor: "pointer", minHeight: 44,
                }}
              >
                {filterStatus === "kuratiert" ? "✓ Nur kuratiert" : "Alle (auch ungeprüft)"}
              </button>
            </div>
            {/* Tags */}
            {topTags.length > 0 && (
              <div>
                <div style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                  Tags:{filterTag && <span style={{ marginLeft: "0.5rem", color: C.accent }}>aktiv: {filterTag}</span>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                  {filterTag && (
                    <button
                      onClick={() => setFilterTag(null)}
                      style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.accent, background: "rgba(196,168,130,0.1)", border: `1px solid ${C.accentDim}`, padding: "0.3rem 0.6rem", cursor: "pointer", minHeight: 32 }}
                    >
                      ✕ {filterTag} entfernen
                    </button>
                  )}
                  {!filterTag && topTags.map(({ tag, count }) => (
                    <button
                      key={tag}
                      onClick={() => setFilterTag(tag)}
                      style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.3rem 0.6rem", cursor: "pointer", minHeight: 32 }}
                    >
                      {tag} <span style={{ opacity: 0.6 }}>{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ═══ WORTWOLKE — klickbar als Such-Hilfe ═══ */}
        {keywords.length > 0 && !search.trim() && (
          <section style={{ marginBottom: "2rem" }}>
            <div style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.18em", color: C.muted, textTransform: "uppercase", marginBottom: "0.8rem", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span>Kollektiver Fokus — Klick auf ein Wort sucht es</span>
            </div>
            <div style={{ background: C.deep, border: `1px solid ${C.border}`, padding: "1rem", overflow: "hidden" }}>
              <WordCloud
                keywords={keywords}
                width={Math.min(900, typeof window !== "undefined" ? window.innerWidth - 64 : 900)}
                height={260}
                onWordClick={(word) => {
                  setSearch(word);
                  setSemanticResults(null);
                  if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </div>
          </section>
        )}

        {/* Cross-Link zur Philosophie-Karte: wenn ein Tag aktiv ist und
            Philosophen mit diesem Konzept verbunden sind, biete einen
            Sprung dorthin an — die Brücke wirkt in beide Richtungen. */}
        {filterTag && (() => {
          const linkedPhils = PHILOSOPHERS.filter(p => p.concepts?.includes(filterTag));
          if (linkedPhils.length === 0) return null;
          return (
            <section style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderLeft: `3px solid ${C.accent}`,
              padding: "0.7rem 0.9rem",
              marginBottom: "0.8rem",
            }}>
              <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.15em", textTransform: "uppercase", color: C.muted, marginBottom: "0.4rem" }}>
                Philosophen zu „{filterTag}"
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "baseline" }}>
                {linkedPhils.map(p => (
                  <a
                    key={p.id}
                    href={`/philosophie?id=${p.id}`}
                    style={{
                      fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem",
                      color: C.accent, textDecoration: "none",
                      borderBottom: `1px dotted ${C.accentDim}`,
                    }}
                  >
                    {p.name}
                  </a>
                ))}
                <span style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, letterSpacing: "0.05em", marginLeft: "0.3rem" }}>
                  → in Karte sehen
                </span>
              </div>
            </section>
          );
        })()}

        {/* Eintragsliste */}
        <section>
          {filtered.length === 0 && index && (
            <div style={{ fontStyle: "italic", color: C.textDim, padding: "2rem 0", textAlign: "center" }}>
              Keine Einträge mit diesen Filtern gefunden.
            </div>
          )}
          {filtered.map(entry => {
            const isExpanded = expandedId === entry.id;
            const showRelated = showRelatedFor === entry.id;
            // Default-Minimal-Regel: Tags je nach Reading-Mode begrenzen
            const tagLimit = readingMode === "surface" ? 0 : readingMode === "depth" ? 3 : 99;
            const excerptLen = readingMode === "surface" ? 90 : readingMode === "depth" ? 220 : 500;
            // Verwandte Einträge zum Anzeigen aus dem Index ziehen
            const relatedEntries = (entry.related ?? [])
              .map(rid => index!.entries.find(e => e.id === rid))
              .filter((e): e is ResonanzEntry => !!e)
              .slice(0, readingMode === "research" ? 5 : 3);
            return (
              <article
                key={entry.id}
                id={`entry-${entry.id}`}
                style={{
                  marginBottom: "0.7rem",
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  padding: "0.9rem 1rem",
                  cursor: "pointer",
                  scrollMarginTop: "1rem",
                }}
                onClick={() => setExpandedId(id => id === entry.id ? null : entry.id)}
              >
                <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.15em", textTransform: "uppercase", color: ENDPOINT_COLOR[entry.endpoint] }}>
                    {ENDPOINT_LABEL[entry.endpoint]}
                    {entry.status === "raw" && readingMode !== "surface" && <span style={{ color: C.muted, marginLeft: "0.5rem" }}>· ungeprüft</span>}
                    {semanticMode && scoreById.has(entry.id) && (
                      <span style={{ color: "#5aacb8", marginLeft: "0.5rem" }}>
                        · ≈ {(scoreById.get(entry.id)! * 100).toFixed(0)}%
                      </span>
                    )}
                  </span>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
                    {readingMode !== "surface" && (
                      <time style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted }}>
                        {new Date(entry.ts).toLocaleDateString("de-DE", { year: "numeric", month: "short", day: "numeric" })}
                      </time>
                    )}
                    {isAdmin && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(entry); setDeleteError(null); }}
                        title="Eintrag löschen (Admin)"
                        aria-label="Eintrag löschen"
                        style={{
                          fontFamily: MONO, fontSize: "0.6rem",
                          color: "#c48282", background: "none",
                          border: `1px solid ${C.border}`,
                          padding: "0.2rem 0.4rem", cursor: "pointer",
                          minWidth: 28, minHeight: 28, lineHeight: 1,
                        }}
                      >🗑</button>
                    )}
                  </div>
                </header>

                <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.95rem", color: C.textBright, lineHeight: 1.5, marginBottom: "0.4rem" }}>
                  {!semanticMode && search.trim() ? highlightTerm(entry.prompt, search) : entry.prompt}
                </div>

                {/* Tags — nur in depth/research, mit Mode-abhängigem Limit */}
                {tagLimit > 0 && entry.nodeIds.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: "0.4rem", alignItems: "center" }}>
                    {entry.nodeIds.slice(0, tagLimit).map(t => (
                      <span key={t} style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted, background: C.deep, padding: "0.1rem 0.4rem", border: `1px solid ${C.border}` }}>
                        {t}
                      </span>
                    ))}
                    {entry.nodeIds.length > tagLimit && (
                      <span style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.textDim }}>
                        +{entry.nodeIds.length - tagLimit}
                      </span>
                    )}
                  </div>
                )}

                {isExpanded ? (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "0.6rem", marginTop: "0.4rem" }}>
                    {entry.response.split(/\n\n+/).map((para, i) => (
                      <p key={i} style={{ fontFamily: SERIF, fontSize: "0.88rem", color: C.text, lineHeight: 1.65, margin: "0 0 0.7rem" }}>
                        {para.trim()}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontFamily: SERIF, fontSize: readingMode === "surface" ? "0.74rem" : "0.78rem", color: C.textDim, lineHeight: 1.5 }}>
                    {(() => {
                      const excerpt = entry.response.slice(0, excerptLen).trim() + (entry.response.length > excerptLen ? "…" : "");
                      return !semanticMode && search.trim() ? highlightTerm(excerpt, search) : excerpt;
                    })()}
                  </div>
                )}

                {/* Verwandte Begegnungen — Cross-Linking. Default eingeklappt
                    in 'depth', voll sichtbar in 'research', verborgen in 'surface'. */}
                {readingMode !== "surface" && relatedEntries.length > 0 && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{ borderTop: `1px solid ${C.border}`, paddingTop: "0.5rem", marginTop: "0.5rem" }}
                  >
                    {readingMode === "depth" && !showRelated ? (
                      <button
                        onClick={() => setShowRelatedFor(entry.id)}
                        style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "none", border: "none", padding: "0.3rem 0", cursor: "pointer" }}
                      >
                        + {relatedEntries.length} verwandte Begegnungen
                      </button>
                    ) : (
                      <>
                        <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: "0.4rem" }}>
                          Verwandte Begegnungen
                          {readingMode === "depth" && (
                            <button
                              onClick={() => setShowRelatedFor(null)}
                              style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted, background: "none", border: "none", marginLeft: "0.5rem", cursor: "pointer", padding: 0 }}
                            >einklappen</button>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                          {relatedEntries.map(r => (
                            <button
                              key={r.id}
                              onClick={() => {
                                setExpandedId(r.id);
                                setShowRelatedFor(null);
                                requestAnimationFrame(() => {
                                  document.getElementById(`entry-${r.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                                });
                              }}
                              style={{
                                fontFamily: SERIF, fontStyle: "italic", fontSize: "0.74rem",
                                color: C.textDim, textAlign: "left", background: "none",
                                border: "none", padding: "0.3rem 0", cursor: "pointer",
                                display: "flex", gap: "0.4rem", alignItems: "baseline",
                              }}
                            >
                              <span style={{ color: ENDPOINT_COLOR[r.endpoint], fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", flexShrink: 0 }}>
                                {ENDPOINT_LABEL[r.endpoint].slice(0, 5)}
                              </span>
                              <span style={{ flex: 1 }}>→ {r.prompt.slice(0, 80)}{r.prompt.length > 80 ? "…" : ""}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Provenance — nur in research-Modus */}
                {readingMode === "research" && isExpanded && (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "0.5rem", marginTop: "0.5rem", fontFamily: MONO, fontSize: "0.5rem", color: C.muted, lineHeight: 1.6 }}>
                    <div>id: {entry.id}</div>
                    <div>anchor: {entry.anchor}</div>
                    <div>status: {entry.status}</div>
                  </div>
                )}
              </article>
            );
          })}
        </section>

        {/* Footer */}
        <footer style={{ marginTop: "3rem", paddingTop: "1.5rem", borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontSize: "0.5rem", color: C.muted, letterSpacing: "0.1em", textAlign: "center" }}>
          Index zuletzt erzeugt: {index ? new Date(index.generatedAt).toLocaleString("de-DE") : "—"}
          <br />
          © Markus Oehring · Inhalte unterliegen der <a href="https://github.com/marksen23/digitale-transformation-ebook/blob/main/LICENSE" style={{ color: C.accent, textDecoration: "underline" }}>Werk-Lizenz</a>
        </footer>
      </main>

      {/* Admin-Inline-Löschen — Confirmation-Modal */}
      {confirmDelete && (
        <DeleteConfirm
          entry={confirmDelete}
          loading={deleteLoading}
          onCancel={() => { setConfirmDelete(null); setDeleteError(null); }}
          onConfirm={() => handleInlineDelete(confirmDelete.id)}
          theme={{ deep: C.deep, border: C.border, muted: C.muted, text: C.text }}
        />
      )}
      {deleteError && (
        <div
          role="alert"
          style={{
            position: "fixed", bottom: "1rem", left: "50%", transform: "translateX(-50%)",
            zIndex: 600, background: C.deep, border: "1px solid #c48282",
            padding: "0.6rem 1rem", fontFamily: MONO, fontSize: "0.6rem", color: "#c48282",
          }}
        >
          ✕ {deleteError}
        </div>
      )}
    </div>
  );
}

// ─── Helper: Suchbegriff im Text hervorheben ──────────────────────────────
// Splittet Text an Treffer-Positionen, wrappt Treffer in <mark> mit Akzent.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightTerm(text: string, term: string): React.ReactNode {
  const t = term.trim();
  if (!t || t.length < 2) return text;
  const re = new RegExp(`(${escapeRegex(t)})`, "gi");
  const parts = text.split(re);
  return parts.map((part, i) =>
    re.test(part) && part.toLowerCase() === t.toLowerCase() ? (
      <mark key={i} style={{ background: "rgba(196,168,130,0.28)", color: "inherit", padding: "0 1px", borderRadius: "1px" }}>{part}</mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}
