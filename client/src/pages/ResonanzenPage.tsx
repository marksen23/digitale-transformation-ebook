/**
 * Resonanzen-Page (/resonanzen) — öffentliche FAQ + Wortwolken-Sicht
 * über alle gesammelten KI-Antworten der Reader-App.
 *
 * Quelle: /resonanzen-index.json (vom Build-Step erzeugt aus
 * content/resonanzen/raw/**\/*.md). Wortwolke aggregiert die User-Anfragen
 * (prompt-Feld) — was die Leserschaft *fragt*, nicht was die KI antwortet.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation as useWouterLocation } from "wouter";
import { UnifiedSearch } from "@/components/search/UnifiedSearch";
import {
  resonanzenSource, conceptsSource, philosophersSource, createChaptersSource,
} from "@/lib/search/sources";
import type { ActiveFilters, FilterGroup, SearchHit, SearchSource } from "@/lib/search/types";
import { useEbook } from "@/hooks/useEbook";
import WordCloud from "@/components/enkidu/WordCloud";
import { useEbookTheme } from "@/hooks/useEbookTheme";
import {
  loadResonanzenIndex, extractCorpusKeywords,
  ENDPOINT_LABEL, ENDPOINT_COLOR,
  type ResonanzEntry, type ResonanzIndex,
} from "@/lib/resonanzenIndex";
import { useAdminAuth, callAdminAction } from "@/lib/adminAuth";
import DeleteConfirm from "@/components/admin/DeleteConfirm";
import { PHILOSOPHERS } from "@/data/philosophyMap";
import PageNav from "@/components/PageNav";
import { SERIF, SERIF_BODY, MONO, C_DARK, C_LIGHT, RADIUS, SHADOW, TRANSITION, TRACKED, ORNAMENT, type Palette } from "@/lib/theme";
import Ornament, { DropCap } from "@/components/Ornament";
import SectionLabel from "@/components/SectionLabel";
import { analyzeCorpusCoherence } from "@/lib/corpusCoherence";

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
  const [scrollRef, setScrollRef] = useState<HTMLElement | null>(null);
  const [, navigate] = useWouterLocation();
  // M4: extended Sources für "Weiterführend"-Treffer in der UnifiedSearch.
  // Werk-Source braucht Ebook (lazy-loaded), die anderen sind Singletons.
  const ebook = useEbook();
  const extendedSources = useMemo<SearchSource[]>(
    () => [createChaptersSource(ebook), conceptsSource, philosophersSource],
    [ebook]
  );

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
  // Relevanz-Filter: Echo (nearDuplicates > 0) vs. Novelty (peripheral
  // semantic position) vs. alles. Deep-linkbar via ?relevanz=echos|novelty.
  type RelevanzKey = "all" | "echos" | "novelty";
  const [filterRelevanz, setFilterRelevanz] = useState<RelevanzKey>(
    initParams.get("relevanz") === "echos" ? "echos" :
    initParams.get("relevanz") === "novelty" ? "novelty" : "all"
  );

  // Anker-Cluster mit Master ausgeklappt — pro Anker zeigen wir per
  // Default nur den Master, Variantes nur wenn User explizit aufklappt
  // (Set<anchor>). Deep-linkbar via ?showVariants=<anchor>.
  const [showVariantsFor, setShowVariantsFor] = useState<Set<string>>(
    () => new Set((initParams.get("showVariants") ?? "").split(",").filter(Boolean))
  );
  const toggleVariantsFor = (anchor: string) => {
    setShowVariantsFor(prev => {
      const next = new Set(prev);
      if (next.has(anchor)) next.delete(anchor); else next.add(anchor);
      return next;
    });
  };
  const [search, setSearch] = useState(initParams.get("q") ?? "");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Permalink-Modus: ?id=ABC im URL beim Mount → zeigt nur diesen einen
  // Eintrag (statt der gesamten Liste, die wir bewusst nicht mehr rendern).
  // Wird gelöscht sobald User aktiv sucht/filtert.
  const [permalinkId, setPermalinkId] = useState<string | null>(initParams.get("id"));
  const [readingMode, setReadingMode] = useState<ReadingMode>("depth");
  const [showRelatedFor, setShowRelatedFor] = useState<string | null>(null);
  // Variations-Cluster (Cosine ≥0.88) — separat von related[]. Default
  // im depth-Mode eingeklappt mit Counter, in research-Mode ausgeklappt.
  const [showVariationsFor, setShowVariationsFor] = useState<string | null>(null);

  // Such-Input-Ref für '/'-Tastenkürzel
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // '/' fokussiert die Suche; ignorieren wenn schon ein Input fokussiert
      const target = e.target as HTMLElement | null;
      if (e.key !== "/" || (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable))) return;
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // M8: Such-Historie + Semantik-Toggle entfernt — beides läuft jetzt
  // automatisch im UnifiedSearch. History via useSearchHistory(scopeId),
  // Semantik default-on via enableSemantic+resonanzenSource.semanticSearch.

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
    // M8: Pre-fetch embeddings entfällt — resonanzenSource lädt sie lazy
    // bei der ersten semantischen Suche.

    // S1: Cross-Tab/Cross-Page-Auto-Refresh — wenn Admin-Actions den Index
    // mutieren, dispatchen sie ein „resonanzen-index-stale"-Event. Wir hören
    // hier zu und reloaden den Index automatisch ohne manuellen Refresh.
    const onStale = () => {
      void loadResonanzenIndex().then(idx => setIndex(idx)).catch(() => null);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("resonanzen-index-stale", onStale);
      return () => window.removeEventListener("resonanzen-index-stale", onStale);
    }
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
    update("relevanz", filterRelevanz === "all" ? null : filterRelevanz);
    update("showVariants", showVariantsFor.size > 0 ? Array.from(showVariantsFor).join(",") : null);
    // 'id' nur bei expliziter Wahl beibehalten (initial Deep-Link)
    const newSearch = params.toString();
    const target = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
    if (target !== window.location.pathname + window.location.search) {
      window.history.replaceState({}, "", target);
    }
  }, [search, filterEndpoint, filterStatus, filterTag, filterRelevanz, showVariantsFor]);

  // Anzahl aktiver Filter (für "Filter (N aktiv)"-Affordance)
  const activeFilterCount =
    (filterEndpoint !== "all" ? 1 : 0) +
    (filterStatus === "kuratiert" ? 1 : 0) +
    (filterTag ? 1 : 0) +
    (filterRelevanz !== "all" ? 1 : 0);

  // ─── Filter + Suche ─────────────────────────────────────────────────────
  // Im semantischen Modus mit Resultat-Cache: zeige in dieser Sortierung
  // nur die rangierten Treffer (gefiltert durch Endpoint/Status/Tag).
  // Sonst: klassischer Volltext-Filter.
  // Anker → Master-Eintrag (für Filter-Logik: Variantes ausblenden wenn
  // Master vorhanden, außer User hat aufgeklappt oder Permalink auf Variante).
  const mastersByAnchor = useMemo(() => {
    const m = new Map<string, ResonanzEntry>();
    if (index) {
      for (const e of index.entries) {
        if (e.is_master && e.anchor) m.set(e.anchor, e);
      }
    }
    return m;
  }, [index]);

  const filtered = useMemo(() => {
    if (!index) return [];
    // Permalink-Modus: nur den einen gemeinten Eintrag rendern (auch wenn
    // er eine Variante mit Master ist — explizite User-Anfrage hat Vorrang).
    if (permalinkId && !search.trim() && filterEndpoint === "all" && !filterTag && filterStatus !== "kuratiert") {
      const target = index.entries.find(e => e.id === permalinkId);
      return target ? [target] : [];
    }
    const passes = (e: ResonanzEntry): boolean => {
      if (filterEndpoint !== "all" && e.endpoint !== filterEndpoint) return false;
      if (filterStatus === "kuratiert" && e.status === "raw") return false;
      if (filterTag && !e.nodeIds.includes(filterTag)) return false;
      if (filterRelevanz === "echos" && (!e.nearDuplicates || e.nearDuplicates.length === 0)) return false;
      if (filterRelevanz === "novelty" && !e.novelty) return false;
      // Master-Filter: wenn Anker einen Master hat UND dies eine Variante
      // ist UND User hat nicht aufgeklappt → Variante ausblenden. Master
      // selbst läuft durch.
      if (e.anchor && mastersByAnchor.has(e.anchor) && !e.is_master && !showVariantsFor.has(e.anchor)) {
        return false;
      }
      return true;
    };

    const term = search.trim().toLowerCase();
    return index.entries.filter(e => {
      if (!passes(e)) return false;
      if (term) {
        const hay = (e.prompt + "\n" + e.response + "\n" + e.anchor).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [index, filterEndpoint, filterStatus, filterTag, filterRelevanz, search, permalinkId, mastersByAnchor, showVariantsFor]);

  // Wortwolke: aus allen Einträgen (oder kuratiert nur) — nicht der gefilterten
  // Liste, weil die Wolke einen Gesamteindruck geben soll, kein Such-Echo
  const cloudEntries = useMemo(() => {
    if (!index) return [];
    return filterStatus === "kuratiert"
      ? index.entries.filter(e => e.status !== "raw")
      : index.entries;
  }, [index, filterStatus]);

  const keywords = useMemo(() => extractCorpusKeywords(cloudEntries, 50), [cloudEntries]);

  // Echo-Cluster-Membership: pro Eintrag-ID die transitiv verknüpften
  // Geschwister-IDs (Cosine ≥0.88). Wird im Treffer-Layout als
  // "Variationen einer Aussage" gerendert — sprachlich bewusst nicht als
  // Duplikat-Vorwurf, sondern als Mehrstimmigkeit.
  const echoMembership = useMemo(() => {
    if (!index) return new Map<string, string[]>();
    const coherence = analyzeCorpusCoherence(index.entries);
    const map = new Map<string, string[]>();
    for (const cluster of coherence.clusters) {
      for (const id of cluster.ids) {
        map.set(id, cluster.ids.filter(other => other !== id));
      }
    }
    return map;
  }, [index]);

  // ─── Such-Engine: ist gerade eine Anfrage aktiv? ─────────────────────
  // Ohne aktive Anfrage zeigt die Seite nur Suchfeld + Wortwolke + Filter —
  // kein automatisches Listing aller 100+ Einträge.
  const hasActiveQuery =
    search.trim().length > 0
    || filterTag !== null
    || filterEndpoint !== "all"
    || filterStatus === "kuratiert"
    || filterRelevanz !== "all"
    || permalinkId !== null;

  // Beim ersten User-Eingriff (Suche tippen oder Filter setzen) verlässt
  // der Permalink-Modus die Bühne — sonst überschattet er die echte Suche.
  useEffect(() => {
    if (permalinkId && (search.trim().length > 0 || filterTag !== null || filterEndpoint !== "all" || filterStatus === "kuratiert")) {
      setPermalinkId(null);
    }
  }, [search, filterTag, filterEndpoint, filterStatus, permalinkId]);

  // M8: Live-Vorschläge entfernt — der UnifiedSearch-Dropdown listet
  // selbst die Treffer mit Highlight, eine zweite Suggestion-Liste war
  // redundant.

  // Default-Limit für Ergebnis-Listing — wird via "+ mehr zeigen" erhöht
  const [resultsLimit, setResultsLimit] = useState(20);
  // Bei jeder neuen Suche Limit zurücksetzen
  useEffect(() => { setResultsLimit(20); }, [search, filterEndpoint, filterStatus, filterTag]);

  // Endpoint-Facets: pro Endpoint zählen, wieviele Treffer es OHNE den
  // Endpoint-Filter gäbe — damit der User entscheiden kann, wohin er
  // seine Suche verengt. Wird im Such-Hero über der Sort-Toolbar gezeigt.
  const endpointFacets = useMemo(() => {
    if (!index) return [] as Array<{ endpoint: ResonanzEntry["endpoint"]; count: number }>;
    // Apply same passes WITHOUT endpoint filter
    const term = search.trim().toLowerCase();
    const matched = index.entries.filter(e => {
      if (filterStatus === "kuratiert" && e.status === "raw") return false;
      if (filterTag && !e.nodeIds.includes(filterTag)) return false;
      if (term) {
        const hay = (e.prompt + "\n" + e.response + "\n" + e.anchor).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    const counts: Record<string, number> = {};
    for (const e of matched) counts[e.endpoint] = (counts[e.endpoint] ?? 0) + 1;
    return (Object.entries(counts) as Array<[ResonanzEntry["endpoint"], number]>)
      .sort((a, b) => b[1] - a[1])
      .map(([endpoint, count]) => ({ endpoint, count }));
  }, [index, search, filterStatus, filterTag]);

  // Sortierung der Ergebnisse — Default 'date' (neueste zuerst)
  type ResultSort = "date" | "relevance" | "length";
  const [resultSort, setResultSort] = useState<ResultSort>("date");
  const sortedResults = useMemo(() => {
    const arr = [...filtered];
    if (resultSort === "date") arr.sort((a, b) => b.ts.localeCompare(a.ts));
    else if (resultSort === "length") arr.sort((a, b) => b.response.length - a.response.length);
    // 'relevance': belasse die Original-Reihenfolge (Semantic-Score schon sortiert,
    // Volltext-Match in Index-Reihenfolge)
    return arr;
  }, [filtered, resultSort]);

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

  // M4-Followup: Chip-Builder-Filter. filterGroups beschreiben die
  // Auswahlmöglichkeiten, activeFilters spiegelt die existing setter-States,
  // handleFiltersChange übersetzt zurück.
  const filterGroups = useMemo<FilterGroup[]>(() => {
    type ConcreteEndpoint = Exclude<EndpointKey, "all">;
    const endpointKeys: ConcreteEndpoint[] = ["chapter", "enkidu", "analyse", "graph-chat", "translate", "path-analyse", "passage", "dialog"];
    return [
      {
        id: "endpoint", label: "Quelle", multi: false,
        options: endpointKeys
          .filter(k => (endpointCounts[k] ?? 0) > 0)
          .map(k => ({ value: k, label: ENDPOINT_LABEL[k] ?? k, count: endpointCounts[k] })),
      },
      {
        id: "status", label: "Status", multi: false,
        options: [{ value: "kuratiert", label: "Nur kuratiert" }],
      },
      {
        id: "relevanz", label: "Relevanz", multi: false,
        options: [
          { value: "novelty", label: "❖ Neue Erkenntnisse" },
          { value: "echos", label: "◉ Echos" },
        ],
      },
      ...(topTags.length > 0 ? [{
        id: "tag", label: "Tag", multi: false,
        options: topTags.map(({ tag, count }) => ({ value: tag, label: tag, count })),
      }] : []),
    ];
  }, [endpointCounts, topTags]);

  const activeFilters = useMemo<ActiveFilters>(() => ({
    endpoint: filterEndpoint !== "all" ? [filterEndpoint] : [],
    status: filterStatus === "kuratiert" ? ["kuratiert"] : [],
    relevanz: filterRelevanz !== "all" ? [filterRelevanz] : [],
    tag: filterTag ? [filterTag] : [],
  }), [filterEndpoint, filterStatus, filterRelevanz, filterTag]);

  const handleFiltersChange = (next: ActiveFilters) => {
    const ep = (next.endpoint?.[0] as EndpointKey | undefined) ?? "all";
    setFilterEndpoint(ep);
    setFilterStatus(next.status?.[0] === "kuratiert" ? "kuratiert" : "all");
    setFilterRelevanz((next.relevanz?.[0] as RelevanzKey | undefined) ?? "all");
    setFilterTag(next.tag?.[0] ?? null);
  };

  if (loadError) {
    return (
      <div style={{ position: "fixed", inset: 0, background: C.void, color: C.text, fontFamily: SERIF, padding: "2rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontStyle: "italic", color: C.textDim }}>Wissens-Index nicht erreichbar: {loadError}</p>
        <Link href="/" style={{ marginTop: "1rem", color: C.accentText, fontFamily: MONO, fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>← Zum Werk</Link>
      </div>
    );
  }

  return (
    // Eigener Scroll-Container — die App-weite index.css setzt overflow: hidden
    // auf body/#root für die Reader-Vollbild-UX. data-scroll erlaubt
    // touch-action: pan-y auf Mobile.
    <div
      data-scroll
      ref={setScrollRef}
      style={{
        position: "fixed", top: 48, right: 0, bottom: 0, left: 0, overflowY: "auto",
        background: C.void, color: C.text, fontFamily: SERIF,
        WebkitOverflowScrolling: "touch",
        // iOS-safe-area: Content wird unter Notch + Home-Indicator nicht abgeschnitten
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      {/* Header — kompakt, App-Frame-Style. Top-Right-Nav wurde entfernt,
          weil der globale AppFrame oben bereits Werk + Philosophie + Wissen
          verlinkt. */}
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: "0.8rem 1rem", maxWidth: 960, margin: "0 auto" }}>
        <h1 style={{ fontFamily: SERIF, fontSize: "1.3rem", color: C.textBright, margin: 0, fontWeight: 500, letterSpacing: "-0.01em" }}>
          Kollektives Wissen
        </h1>
        <p style={{ fontFamily: SERIF, fontSize: "0.78rem", color: C.textDim, margin: "0.3rem 0 0", lineHeight: 1.4 }}>
          {index ? `${index.count} Begegnungen aus dem kollektiven Wissen — was die Leserschaft fragt, was sich darin sammelt.` : "lädt …"}
        </p>
        {/* Reading-Mode-Toggle: phänomenologisch-responsive Verdichtung.
            Default 'depth'. 'surface' ist für Schnelldurchsicht, 'research'
            zeigt alles inkl. Provenance. Verdichtung wirkt auf Eintragsliste. */}
        {/* R2: Reading-Mode-Toggle Pills auf das nach R1 etablierte
            kompakte Format gebracht (28-30px statt 36px Mindesthöhe,
            0.52rem statt 0.55rem Font). */}
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
          <FilterInlineLabel c={C}>Tiefe:</FilterInlineLabel>
          {(["surface", "depth", "research"] as ReadingMode[]).map(m => {
            const active = readingMode === m;
            const label = m === "surface" ? "Oberfläche" : m === "depth" ? "Vertiefung" : "Forschung";
            return (
              <button
                key={m}
                onClick={() => setReadingMode(m)}
                style={{
                  fontFamily: MONO, fontSize: "0.52rem", letterSpacing: "0.08em", textTransform: "uppercase",
                  color: active ? C.textBright : C.muted,
                  background: active ? C.deep : "none",
                  border: `1px solid ${active ? C.accentDim : C.border}`,
                  padding: "0.35rem 0.6rem", cursor: "pointer", minHeight: 30,
                  borderRadius: 3,
                  transition: "all 0.15s",
                }}
              >{label}</button>
            );
          })}
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "0 1rem 4rem" }}>
        {/* ═══ STICKY-BLOCK: Suche + Filter laufen gemeinsam mit beim Scroll,
            damit der User auch tief in den Treffern noch filtern kann ohne
            hochzuscrollen. ═══ */}
        <div style={{ position: "sticky", top: 0, zIndex: 10 }}>
        {/* ═══ SUCH-HERO: zentrales Tool, sticky beim Scroll ═══ */}
        <section
          style={{
            background: `${C.void}f0`,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            padding: "1rem 0 0.6rem",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {/* M4: UnifiedSearch — primary = Resonanzen (kuratiert, prompt-fokussiert,
              keine related/echo-Falsch-Positive). extended = Werk + Begriffe +
              Philosophen unter "Weiterführend"-Trennlinie, mit Deep-Link-Navigation.
              Semantik-Toggle bleibt als opt-in Power-User-Feature daneben. */}
          <UnifiedSearch
            scope="page"
            scopeId="resonanzen"
            sources={[resonanzenSource]}
            extendedSources={extendedSources}
            filterGroups={filterGroups}
            filters={activeFilters}
            onFiltersChange={handleFiltersChange}
            enableSemantic
            inputRef={searchInputRef}
            onQueryChange={setSearch}
            onSelect={(hit: SearchHit) => {
              if (hit.type === "resonanz") {
                // Zuverlässig zur Permalink-Seite navigieren statt brüchigem
                // In-Page-Scroll (Ziel ist sonst evtl. nicht gerendert).
                navigate(`/resonanz/${encodeURIComponent(hit.id)}`);
              } else if (hit.type === "chapter") {
                navigate(`/?chapter=${encodeURIComponent(hit.id)}`);
              } else if (hit.type === "concept") {
                navigate(`/begriffsnetz?node=${encodeURIComponent(hit.id)}`);
              } else if (hit.type === "philosopher") {
                navigate(`/philosophie?id=${encodeURIComponent(hit.id)}`);
              }
            }}
            placeholder="Im kollektiven Wissen suchen … (Tastenkürzel: /)"
            limit={6}
          />

          {/* M8: Such-Historie, Live-Vorschläge und Semantik-Toggle entfernt.
              History läuft jetzt im UnifiedSearch-Dropdown (zuletzt-Pills wenn
              Suchfeld leer). Suggestions sind redundant zum Live-Dropdown.
              Semantik ist via enableSemantic+resonanzenSource always-on
              (Hybrid mit Lex + Sem parallel). */}

          {/* Live-Counter / Status */}
          <div style={{ marginTop: "0.5rem", fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", color: C.muted, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span>
              {search.trim() ? `${filtered.length} Treffer von ${index?.count ?? 0}`
                : `${index?.count ?? 0} Begegnungen insgesamt`}
            </span>
            {/* Filter sind jetzt als Chips im UnifiedSearch oben — kein
                separater Toggle mehr nötig. activeFilterCount bleibt als
                Info, falls Power-User per URL filtert. */}
            {activeFilterCount > 0 && (
              <span style={{
                fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em",
                textTransform: "uppercase", color: C.accentText,
              }}>
                {activeFilterCount} Filter aktiv
              </span>
            )}
          </div>
        </section>

        {/* M4-Followup: Die alte kollabierbare Filter-Section wurde durch
            den Chip-Builder im UnifiedSearch oben ersetzt. Endpoint, Status,
            Relevanz und Tags sind dort als ↹ Chips wählbar — viel weniger
            visueller Lärm als die vorher ~25 Filter-Buttons. */}
        </div>
        {/* ═══ ENDE STICKY-BLOCK ═══ */}

        {/* Spacer — damit der erste Eintrag nicht direkt unter dem Sticky-
            Block klebt sondern etwas Luft hat */}
        <div style={{ height: "1rem" }} />

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
              <SectionLabel c={C} size="sm" tracking="tight" marginBottom="0.4rem">
                Philosophen zu „{filterTag}"
              </SectionLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "baseline" }}>
                {linkedPhils.map(p => (
                  <a
                    key={p.id}
                    href={`/philosophie?id=${p.id}`}
                    style={{
                      fontFamily: SERIF, fontStyle: "italic", fontSize: "0.85rem",
                      color: C.accentText, textDecoration: "none",
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

        {/* Such-Engine: Ergebnis-Sektion nur wenn aktive Anfrage */}
        {!hasActiveQuery && index && (
          <section style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: "1.5rem 1.2rem",
            textAlign: "center",
            color: C.textDim,
            fontStyle: "italic",
            fontSize: "0.92rem",
            lineHeight: 1.55,
          }}>
            <SectionLabel c={C} marginBottom="0.7rem">
              {index.count} Begegnungen warten auf eine Frage
            </SectionLabel>
            Beginne mit einem Suchwort oben — oder wähle einen Begriff aus der
            Wortwolke darunter. Mit dem Filter rechts engst du die Suche auf
            Kategorien, Kuration oder verbundene Konzepte ein.
          </section>
        )}

        {/* Endpoint-Facets — Verteilung der Treffer pro Kategorie.
            Klick auf eine Facette setzt den Endpoint-Filter, Klick auf
            den aktiven Filter hebt ihn auf. Hilft beim Verengen der Suche. */}
        {hasActiveQuery && endpointFacets.length > 1 && (
          <section style={{ marginBottom: "0.8rem" }}>
            <SectionLabel c={C} size="sm" tracking="tight" marginBottom="0.4rem">
              Verteilung nach Kategorie:
            </SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {endpointFacets.map(({ endpoint, count }) => {
                const active = filterEndpoint === endpoint;
                const color = ENDPOINT_COLOR[endpoint];
                return (
                  <button
                    key={endpoint}
                    onClick={() => setFilterEndpoint(active ? "all" : endpoint)}
                    style={{
                      fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
                      color: active ? "#080808" : color,
                      background: active ? color : "none",
                      border: `1px solid ${color}`,
                      padding: "0.4rem 0.7rem", cursor: "pointer", minHeight: 32,
                      display: "inline-flex", alignItems: "center", gap: "0.4rem",
                    }}
                    title={active ? "Filter aufheben" : `Auf ${ENDPOINT_LABEL[endpoint]} eingrenzen`}
                  >
                    <span>{ENDPOINT_LABEL[endpoint]}</span>
                    <span style={{ opacity: 0.7, fontSize: "0.5rem" }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Sort-Toolbar — nur wenn Ergebnisse sichtbar sind */}
        {hasActiveQuery && filtered.length > 1 && (
          <section style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.8rem" }}>
            <span style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.12em", color: C.muted, textTransform: "uppercase" }}>
              {filtered.length} Treffer · sortieren:
            </span>
            {(["date", "relevance", "length"] as const).map(s => {
              const label = s === "date" ? "neueste" : s === "relevance" ? "relevanz" : "länge";
              const active = resultSort === s;
              return (
                <button
                  key={s}
                  onClick={() => setResultSort(s)}
                  style={{
                    fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
                    color: active ? "#080808" : C.muted,
                    background: active ? C.accent : "none",
                    border: `1px solid ${active ? C.accent : C.border}`,
                    padding: "0.3rem 0.6rem", cursor: "pointer", minHeight: 28,
                  }}
                >{label}</button>
              );
            })}
          </section>
        )}

        {/* Eintragsliste — nur wenn aktive Anfrage */}
        <section>
          {hasActiveQuery && filtered.length === 0 && index && (
            <div style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "2rem 1.5rem",
              textAlign: "center",
              color: C.textDim,
            }}>
              <SectionLabel c={C} marginBottom="0.6rem">
                keine Treffer
              </SectionLabel>
              <p style={{ fontFamily: SERIF_BODY, fontStyle: "italic", fontSize: "0.92rem", lineHeight: 1.5, margin: 0 }}>
                Keine Begegnungen mit diesen Filtern gefunden. Versuche ein anderes
                Wort, deaktiviere einen Filter oder schalte auf semantische Suche.
              </p>
            </div>
          )}
          {hasActiveQuery && sortedResults.slice(0, resultsLimit).map(entry => {
            const isExpanded = expandedId === entry.id;
            const showRelated = showRelatedFor === entry.id;
            const showVariations = showVariationsFor === entry.id || readingMode === "research";
            // Variations: Cluster-Geschwister, die im aktuellen Index existieren.
            // Wir filtern NICHT auf sortedResults — Cluster-Mitglieder können
            // auch außerhalb der aktuellen Suche liegen, das ist Teil der Aussage.
            const variationSiblings = readingMode !== "surface"
              ? (echoMembership.get(entry.id) ?? [])
                  .map(sid => index!.entries.find(e => e.id === sid))
                  .filter((e): e is NonNullable<typeof e> => !!e)
              : [];
            // Default-Minimal-Regel: Tags je nach Reading-Mode begrenzen
            const tagLimit = readingMode === "surface" ? 0 : readingMode === "depth" ? 3 : 99;
            const excerptLen = readingMode === "surface" ? 90 : readingMode === "depth" ? 220 : 500;
            // Verwandte Einträge zum Anzeigen aus dem Index ziehen
            const relatedEntries = (entry.related ?? [])
              .map(rid => index!.entries.find(e => e.id === rid))
              .filter((e): e is ResonanzEntry => !!e)
              .slice(0, readingMode === "research" ? 5 : 3);
            // Echo-Einträge: andere Resonanzen die diese Aussage im Kern
            // wiederholen (Cosine ≥0.88, vom Build-Step in nearDuplicates).
            // Separat vom related[]-Block weil semantisch anders: Echo =
            // "wiederholt", related = "verwandter Faden". Beide werden
            // nur in der expanded Card (depth/research) angezeigt.
            const echoEntries = (entry.nearDuplicates ?? [])
              .map(eid => index!.entries.find(e => e.id === eid))
              .filter((e): e is ResonanzEntry => !!e);
            return (
              <article
                key={entry.id}
                id={`entry-${entry.id}`}
                style={{
                  marginBottom: "0.7rem",
                  background: entry.is_master ? `${C.accent}06` : C.surface,
                  // Master-Cards: 2px-Accent-Border statt 1px (Hervorhebung)
                  border: entry.is_master ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                  borderRadius: RADIUS.card,
                  boxShadow: SHADOW.card,
                  padding: "0.9rem 1rem",
                  cursor: "pointer",
                  scrollMarginTop: "1rem",
                  transition: TRANSITION,
                }}
                onClick={() => setExpandedId(id => id === entry.id ? null : entry.id)}
              >
                <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: TRACKED.open, textTransform: "uppercase", color: ENDPOINT_COLOR[entry.endpoint] }}>
                    {ENDPOINT_LABEL[entry.endpoint]}
                    {entry.is_master && (
                      <span title={`Master-Synthese aus ${entry.variant_count ?? entry.master_of?.length ?? 0} Varianten`} style={{ color: "#7ab898", marginLeft: "0.5rem", fontWeight: 600 }}>
                        {ORNAMENT.middot} ◆ MASTER · {entry.variant_count ?? entry.master_of?.length ?? 0} Varianten
                      </span>
                    )}
                    {entry.status === "raw" && readingMode !== "surface" && <span style={{ color: C.muted, marginLeft: "0.5rem" }}>{ORNAMENT.middot} ungeprüft</span>}
                    {entry.novelty && (
                      <span title="Neue Erkenntnis — semantisch peripher (max Cosine zu anderen <0.70)" style={{ color: "#5aacb8", marginLeft: "0.5rem" }}>
                        {ORNAMENT.middot} ❖ neu
                      </span>
                    )}
                    {entry.nearDuplicates && entry.nearDuplicates.length > 0 && (
                      <span title={`Echo — ähnelt ${entry.nearDuplicates.length} anderen Einträgen (Cosine ≥0.88)`} style={{ color: C.muted, marginLeft: "0.5rem" }}>
                        {ORNAMENT.middot} ◉ Echo ({entry.nearDuplicates.length})
                      </span>
                    )}
                    {entry.related === undefined && (
                      <span title="Neu hinzugekommen — Querbezüge, Echos und Einordnung werden beim nächsten Korpus-Rebuild berechnet." style={{ color: C.muted, marginLeft: "0.5rem", opacity: 0.85 }}>
                        {ORNAMENT.middot} ↻ wird eingeordnet
                      </span>
                    )}
                    {/* M8: Cosine-Score-Badge entfällt — Resonanzen-Liste
                        zeigt nur Volltext-Treffer; semantische Treffer landen
                        im UnifiedSearch-Dropdown mit eigenem ↺-Marker. */}
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
                  {search.trim() ? highlightTerm(entry.prompt, search) : entry.prompt}
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
                  <div style={{ marginTop: "0.4rem" }}>
                    {/* Klassischer Frage-Antwort-Trenner: Fleuron zwischen
                        der gestellten Frage und der Resonanz-Antwort.
                        Der ❦ markiert die typografische Schwelle, an der
                        die KI-Stimme einsetzt — eine ehrlichere Geste als
                        eine bloße horizontale Linie. */}
                    <Ornament variant="rule" c={C} margin="0.2rem 0 0.9rem" />
                    {entry.response.split(/\n\n+/).map((para, i) => {
                      const trimmed = para.trim();
                      // DropCap nur auf dem ersten Absatz, und nur wenn
                      // der Absatz ausreichend Lesefläche hat (sonst
                      // wirkt die Versalie überdimensioniert).
                      if (i === 0 && trimmed.length > 80) {
                        return (
                          <p key={i} style={{ fontFamily: SERIF_BODY, fontSize: "0.95rem", color: C.text, lineHeight: 1.75, margin: "0 0 0.8rem" }}>
                            <DropCap c={C}>{trimmed.charAt(0)}</DropCap>
                            {trimmed.slice(1)}
                          </p>
                        );
                      }
                      return (
                        <p key={i} style={{ fontFamily: SERIF_BODY, fontSize: "0.92rem", color: C.text, lineHeight: 1.7, margin: "0 0 0.7rem" }}>
                          {trimmed}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontFamily: SERIF_BODY, fontSize: readingMode === "surface" ? "0.78rem" : "0.82rem", color: C.textDim, lineHeight: 1.6 }}>
                    {(() => {
                      const excerpt = entry.response.slice(0, excerptLen).trim() + (entry.response.length > excerptLen ? "…" : "");
                      return search.trim() ? highlightTerm(excerpt, search) : excerpt;
                    })()}
                  </div>
                )}

                {/* Variations — Echo-Cluster (Cosine ≥0.88). "Mehrere Stimmen
                    zur selben Frage", nicht "Duplikate". In depth eingeklappt
                    mit Counter, in research voll sichtbar, in surface verborgen.
                    Visuell näher zum Treffer als die `related`-Sektion unten. */}
                {readingMode !== "surface" && variationSiblings.length > 0 && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{ paddingTop: "0.5rem", marginTop: "0.5rem" }}
                  >
                    {readingMode === "depth" && !showVariations ? (
                      <button
                        onClick={() => setShowVariationsFor(entry.id)}
                        aria-label={`${variationSiblings.length} Variationen dieser Aussage anzeigen`}
                        style={{
                          fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase",
                          color: "#c8a87a", background: "none", border: "none",
                          padding: "0.3rem 0", cursor: "pointer",
                          display: "inline-flex", alignItems: "center", gap: "0.35rem",
                        }}
                      >
                        <span style={{ fontSize: "0.7rem", color: "#c8a87a" }}>❦</span>
                        {variationSiblings.length} Variationen dieser Aussage
                      </button>
                    ) : (
                      <>
                        <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#c8a87a", marginBottom: "0.4rem", display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                          <span style={{ fontSize: "0.7rem" }}>❦</span>
                          <span>Variationen dieser Aussage</span>
                          {readingMode === "depth" && (
                            <button
                              onClick={() => setShowVariationsFor(null)}
                              style={{ fontFamily: MONO, fontSize: "0.5rem", color: C.muted, background: "none", border: "none", marginLeft: "0.3rem", cursor: "pointer", padding: 0 }}
                            >einklappen</button>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", paddingLeft: "0.9rem", borderLeft: `1px solid ${C.muted}`, opacity: 0.85 }}>
                          {variationSiblings.map(s => (
                            <button
                              key={s.id}
                              onClick={() => navigate(`/resonanz/${encodeURIComponent(s.id)}`)}
                              style={{
                                fontFamily: SERIF, fontStyle: "italic", fontSize: "0.78rem",
                                color: C.textDim, textAlign: "left", background: "none",
                                border: "none", padding: "0.2rem 0", cursor: "pointer",
                                display: "flex", gap: "0.4rem", alignItems: "baseline",
                              }}
                            >
                              <span style={{ color: ENDPOINT_COLOR[s.endpoint], fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", flexShrink: 0 }}>
                                {ENDPOINT_LABEL[s.endpoint].slice(0, 5)}
                              </span>
                              <span style={{ flex: 1 }}>{s.prompt.slice(0, 90)}{s.prompt.length > 90 ? "…" : ""}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Echo-Cluster — andere Einträge, die diese Aussage im Kern
                    wiederholen (Cosine ≥0.88). Visuell abgesetzt vom related[]-
                    Block weil semantisch anders: Echo = "ist dasselbe", related =
                    "ist verwandt". Nur in expanded card sichtbar. */}
                {readingMode !== "surface" && expandedId === entry.id && echoEntries.length > 0 && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      borderTop: `1px solid ${C.border}`,
                      paddingTop: "0.5rem", marginTop: "0.5rem",
                      borderLeft: `2px solid ${C.accentDim}`,
                      paddingLeft: "0.6rem",
                      background: `linear-gradient(to right, ${C.accentDim}11, transparent 30%)`,
                    }}
                  >
                    <div style={{
                      fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.15em",
                      textTransform: "uppercase", color: C.accentText, marginBottom: "0.4rem",
                    }}>
                      ◉ Echos dieser Aussage — {echoEntries.length} nahezu identische Begegnungen
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                      {echoEntries.map(r => (
                        <button
                          key={r.id}
                          onClick={() => navigate(`/resonanz/${encodeURIComponent(r.id)}`)}
                          style={{
                            fontFamily: SERIF, fontStyle: "italic", fontSize: "0.74rem",
                            color: C.textDim, textAlign: "left", background: "none",
                            border: "none", padding: "0.25rem 0", cursor: "pointer",
                            display: "flex", gap: "0.4rem", alignItems: "baseline",
                          }}
                        >
                          <span style={{ color: ENDPOINT_COLOR[r.endpoint], fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", flexShrink: 0 }}>
                            {ENDPOINT_LABEL[r.endpoint].slice(0, 5)}
                          </span>
                          <span style={{ flex: 1, color: C.text }}>
                            {r.prompt.length > 90 ? r.prompt.slice(0, 90) + "…" : r.prompt}
                          </span>
                        </button>
                      ))}
                    </div>
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
                              onClick={() => navigate(`/resonanz/${encodeURIComponent(r.id)}`)}
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

                {/* Master-Footer: Toggle für „Varianten anzeigen" */}
                {entry.is_master && entry.anchor && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      borderTop: `1px solid ${C.accentDim}`,
                      marginTop: "0.7rem", paddingTop: "0.5rem",
                      display: "flex", justifyContent: "space-between",
                      alignItems: "center", flexWrap: "wrap", gap: "0.5rem",
                    }}
                  >
                    <span style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, letterSpacing: "0.08em" }}>
                      Synthese aus {entry.variant_count ?? entry.master_of?.length ?? 0} Varianten
                      {entry.ts && ` · ${new Date(entry.ts).toLocaleDateString("de-DE", { year: "numeric", month: "short", day: "numeric" })}`}
                    </span>
                    <button
                      onClick={() => toggleVariantsFor(entry.anchor)}
                      style={{
                        fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: showVariantsFor.has(entry.anchor) ? C.muted : C.accent,
                        background: "none",
                        border: `1px solid ${showVariantsFor.has(entry.anchor) ? C.border : C.accentDim}`,
                        padding: "0.35rem 0.6rem", cursor: "pointer", minHeight: 32,
                      }}
                    >
                      {showVariantsFor.has(entry.anchor) ? "↑ Varianten ausblenden" : `↻ ${entry.variant_count ?? entry.master_of?.length ?? 0} Varianten anzeigen`}
                    </button>
                  </div>
                )}

                {/* Bei aufgeklappten Varianten + Variant-Entry: Visual Marker
                    dass dies eine Variante zu einem Master ist. */}
                {!entry.is_master && entry.anchor && mastersByAnchor.has(entry.anchor) && (
                  <div style={{
                    marginTop: "0.5rem", paddingTop: "0.4rem",
                    borderTop: `1px dashed ${C.border}`,
                    fontFamily: MONO, fontSize: "0.5rem",
                    color: C.muted, letterSpacing: "0.05em",
                  }}>
                    Variante von Anker <code style={{ color: C.accentText }}>{entry.anchor}</code>
                    {" — "}
                    <a
                      href={`#entry-${mastersByAnchor.get(entry.anchor)!.id}`}
                      onClick={e => { e.stopPropagation(); }}
                      style={{ color: C.accentText, textDecoration: "none" }}
                    >
                      ↑ zum Master
                    </a>
                  </div>
                )}
              </article>
            );
          })}

          {/* Pagination — "noch X Treffer zeigen" statt Infinite Scroll */}
          {hasActiveQuery && sortedResults.length > resultsLimit && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: "1rem" }}>
              <button
                onClick={() => setResultsLimit(l => l + 20)}
                style={{
                  fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase",
                  color: C.accentText,
                  background: "none",
                  border: `1px solid ${C.accentDim}`,
                  padding: "0.7rem 1.2rem", cursor: "pointer", minHeight: 40,
                }}
              >
                + {Math.min(20, sortedResults.length - resultsLimit)} weitere von {sortedResults.length - resultsLimit} Treffern
              </button>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer style={{ marginTop: "3rem", paddingTop: "1.5rem", borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontSize: "0.5rem", color: C.muted, letterSpacing: "0.1em", textAlign: "center" }}>
          Index zuletzt erzeugt: {index ? new Date(index.generatedAt).toLocaleString("de-DE") : "—"}
          <br />
          © Markus Oehring · Inhalte unterliegen der <a href="https://github.com/marksen23/digitale-transformation-ebook/blob/main/LICENSE" style={{ color: C.accentText, textDecoration: "underline" }}>Werk-Lizenz</a>
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

      {/* Floating-Werkzeuge — auf jeder Sub-Seite gleich */}
      <PageNav scrollContainer={scrollRef} />
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

// ─── FilterInlineLabel (Sprint R1) ────────────────────────────────────────
// Mono-Caps-Mini-Label für Inline-Filter-Zeilen statt eigener SectionLabel-
// Reihen. Spart vertikalen Platz — die Pills sitzen direkt rechts davon.
function FilterInlineLabel({ c, children }: { c: Palette; children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: MONO, fontSize: "0.48rem", letterSpacing: "0.1em",
      textTransform: "uppercase", color: c.muted,
      marginRight: "0.15rem", flexShrink: 0,
    }}>
      {children}
    </span>
  );
}
