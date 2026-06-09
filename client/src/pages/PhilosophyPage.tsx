/**
 * PhilosophyPage (/philosophie) — verortet Resonanzvernunft im Geflecht
 * ihrer Vorgänger, Zeitgenossen und wissenschaftlichen Anschlüsse.
 *
 * Zwei Visualisierungs-Modi:
 *   timeline — vertikaler Zeitstrahl 1620-2030 mit Tradition-Bändern
 *   network  — stratifiziertes Netz: Spalte pro Tradition, Geburtsjahr
 *              vertikal, Bezier-Kanten für rezipiert/kritisiert
 *
 * Layouts:
 *   Desktop: Visualisierung links, Detail-Panel rechts
 *   Mobile (<768px): Visualisierung füllt Viewport, Detail-Panel als
 *                    Bottom-Sheet (peek/expanded), Filter kollabierbar
 *
 * Quelle: handkurierte TS-Daten in client/src/data/philosophyMap.ts
 */
import { useEffect, useMemo, useState } from "react";
import { useEbookTheme } from "@/hooks/useEbookTheme";
import PageNav from "@/components/PageNav";
import {
  TRADITIONS,
  RESONANZVERNUNFT_PFAD,
  philosophersByBirth, getPhilosopher, getTradition,
  type TraditionId,
} from "@/data/philosophyMap";
import { UnifiedSearch } from "@/components/search/UnifiedSearch";
import { philosophersSource, conceptsSource } from "@/lib/search/sources";
import type { SearchHit } from "@/lib/search/types";
import { useLocation as useWouterLocation } from "wouter";
import { SERIF, MONO, C_DARK, C_LIGHT, type Palette } from "@/lib/theme";
import {
  ToolbarBtn, FilterPill,
  Timeline, NetworkView, ConstellationView, SpotlightView,
  BookView, RootsView, RiverView,
  PhilosopherDetail, BottomSheet,
} from "./philosophy/views";

type ViewMode = "timeline" | "network" | "constellation" | "spotlight" | "book" | "roots" | "river";

// ─── Hauptkomponente ───────────────────────────────────────────────────────

export default function PhilosophyPage() {
  const isDark = useEbookTheme();
  const C = isDark ? C_DARK : C_LIGHT;
  const sorted = useMemo(() => philosophersByBirth(), []);

  // Viewport-Erkennung — entscheidet zwischen Desktop-Side-Panel und Mobile-Bottom-Sheet
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Deep-Link: ?id=<philosopher-id> setzt initial die Selektion
  // (z.B. von /resonanzen Cross-Link "Philosophen zu '<tag>'")
  const initialId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    return id && getPhilosopher(id) ? id : null;
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [, navigate] = useWouterLocation();
  const [traditionFilter, setTraditionFilter] = useState<TraditionId | "all">("all");
  const [showPath, setShowPath] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [pathHintOpen, setPathHintOpen] = useState(false);
  const [pathPlaying, setPathPlaying] = useState(false);
  const [pathStep, setPathStep] = useState(0);

  // Pfad-Abspielen: alle 4.5s zur nächsten Station; manuelle Selektion stoppt.
  useEffect(() => {
    if (!pathPlaying) return;
    const id = RESONANZVERNUNFT_PFAD[pathStep];
    if (id) setSelectedId(id);
    if (pathStep >= RESONANZVERNUNFT_PFAD.length - 1) {
      const t = setTimeout(() => setPathPlaying(false), 4500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPathStep(s => s + 1), 4500);
    return () => clearTimeout(t);
  }, [pathPlaying, pathStep]);

  // ESC stoppt Wiedergabe
  useEffect(() => {
    if (!pathPlaying) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setPathPlaying(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pathPlaying]);

  // Tasten 1-7 schalten die Sichten — nur wenn kein Input-Element fokussiert ist.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Tippt jemand in ein Suchfeld? Dann keine Shortcuts.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, ViewMode> = {
        "1": "timeline", "2": "network", "3": "constellation", "4": "spotlight",
        "5": "book", "6": "roots", "7": "river",
      };
      if (map[e.key]) {
        setViewMode(map[e.key]);
        setPathPlaying(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function togglePathPlay() {
    if (pathPlaying) {
      setPathPlaying(false);
    } else {
      setPathStep(0);
      setShowPath(true);
      setPathPlaying(true);
    }
  }

  // Default-Selection auf Desktop = Rosa, auf Mobile keine (Sheet bleibt zu)
  useEffect(() => {
    if (!isMobile && selectedId === null) setSelectedId("rosa");
  }, [isMobile, selectedId]);

  // Beim Wechsel der Selektion auf Mobile: Sheet öffnen
  useEffect(() => {
    if (isMobile && selectedId) setSheetExpanded(true);
  }, [selectedId, isMobile]);

  // Esc schließt Sheet
  useEffect(() => {
    if (!sheetExpanded) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSheetExpanded(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sheetExpanded]);

  const selected = selectedId ? getPhilosopher(selectedId) : null;
  const searchLower = search.trim().toLowerCase();
  const visible = useMemo(() => {
    let arr = traditionFilter === "all" ? sorted : sorted.filter(p => p.tradition === traditionFilter);
    if (searchLower) {
      arr = arr.filter(p =>
        p.name.toLowerCase().includes(searchLower)
        || (getTradition(p.tradition)?.name.toLowerCase().includes(searchLower) ?? false)
        || p.keyWorks.some(w => w.title.toLowerCase().includes(searchLower))
        || (p.concepts?.some(c => c.toLowerCase().includes(searchLower)) ?? false)
      );
    }
    return arr;
  }, [sorted, traditionFilter, searchLower]);

  const activeFilterCount = (traditionFilter !== "all" ? 1 : 0) + (searchLower ? 1 : 0);
  const [scrollRef, setScrollRef] = useState<HTMLElement | null>(null);

  return (
    <div
      data-scroll
      ref={setScrollRef}
      style={{
        position: "fixed", top: 48, right: 0, bottom: 0, left: 0, overflowY: "auto",
        background: C.void, color: C.text, fontFamily: SERIF,
        WebkitOverflowScrolling: "touch",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* ─── Header — kompakt, App-Frame-Style ─── */}
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: "0.8rem 1rem", maxWidth: 1400, margin: "0 auto" }}>
        <div>
          <h1 style={{ fontFamily: SERIF, fontSize: isMobile ? "1.15rem" : "1.3rem", color: C.textBright, margin: 0, fontWeight: 500, letterSpacing: "-0.01em" }}>
            Philosophische Karte
          </h1>
          {!isMobile && (
            <p style={{ fontFamily: SERIF, fontSize: "0.78rem", color: C.textDim, margin: "0.2rem 0 0 0", lineHeight: 1.4 }}>
              Resonanzvernunft im Geflecht ihrer Vorgänger, Zeitgenossen und wissenschaftlichen Anschlüsse.
            </p>
          )}
        </div>

        {/* Toolbar: View-Mode-Toggle + Filter-Toggle (Mobile) + Pfad-Toggle */}
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.6rem" }}>
          {/* View-Mode P1: primäre Sichten (Strahl, Netz) sind immer
              sichtbar — die fünf experimentellen Sichten liegen hinter
              einem „Mehr ▾"-Disclosure. Reduziert Toolbar-Lärm von
              7 Pills auf 2+1. Tasten 1-7 funktionieren weiter. */}
          <div style={{ display: "flex", gap: 0, border: `1px solid ${C.border}`, flexShrink: 0 }}>
            <ToolbarBtn active={viewMode === "timeline"} label="Strahl" onClick={() => setViewMode("timeline")} c={C} />
            <ToolbarBtn active={viewMode === "network"} label="Netz" onClick={() => setViewMode("network")} c={C} />
          </div>
          <MoreViewsDisclosure viewMode={viewMode} setViewMode={setViewMode} c={C} />

          {/* Filter-Toggle (Mobile: kollabiert, Desktop: immer offen) */}
          {isMobile ? (
            <button
              onClick={() => setFiltersExpanded(v => !v)}
              style={{
                fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
                color: C.muted, background: "none",
                border: `1px solid ${C.border}`,
                padding: "0.5rem 0.7rem", cursor: "pointer", minHeight: 36,
              }}
            >
              {filtersExpanded ? "▾" : "▸"} Filter{activeFilterCount > 0 ? ` (${activeFilterCount} aktiv)` : ""}
            </button>
          ) : null}

          {/* Pfad-Toggle + Erklär-Button */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginLeft: "auto" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showPath}
                onChange={e => setShowPath(e.target.checked)}
                style={{ accentColor: C.accent }}
              />
              Pfad
            </label>
            {showPath && (
              <>
                <button
                  onClick={togglePathPlay}
                  aria-label={pathPlaying ? "Pfad-Wiedergabe stoppen" : "Pfad abspielen"}
                  title={pathPlaying ? `Station ${pathStep + 1}/${RESONANZVERNUNFT_PFAD.length}` : "Pfad als Erzählung abspielen"}
                  style={{
                    fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em",
                    color: pathPlaying ? "#080808" : C.accent,
                    background: pathPlaying ? C.accent : "none",
                    border: `1px solid ${C.accent}`,
                    padding: "0.25rem 0.6rem",
                    cursor: "pointer", lineHeight: 1, minHeight: 22,
                    display: "flex", alignItems: "center", gap: "0.25rem",
                  }}
                >
                  {pathPlaying ? "⏸" : "▶"}
                  {pathPlaying && <span style={{ fontFamily: MONO, fontSize: "0.5rem" }}>{pathStep + 1}/{RESONANZVERNUNFT_PFAD.length}</span>}
                </button>
                <button
                  onClick={() => setPathHintOpen(v => !v)}
                  aria-label="Pfad-Erklärung"
                  title="Was ist der Resonanzvernunft-Pfad?"
                  style={{
                    fontFamily: MONO, fontSize: "0.65rem",
                    color: C.accentText, background: "none",
                    border: `1px solid ${C.border}`,
                    width: 22, height: 22, padding: 0,
                    cursor: "pointer", borderRadius: "50%",
                    lineHeight: 1,
                  }}
                >ⓘ</button>
              </>
            )}
          </div>
        </div>

        {/* Pfad-Erklärung — klappt aus, wenn ⓘ geklickt */}
        {showPath && pathHintOpen && (
          <div style={{
            background: C.deep, border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${C.accent}`,
            padding: "0.7rem 0.9rem", marginTop: "0.6rem",
            fontFamily: SERIF, fontSize: "0.85rem", color: C.text, lineHeight: 1.55,
          }}>
            <span style={{ fontStyle: "italic" }}>
              Der Pfad zeichnet die direkteste Linie von Spinozas substanzlosem Welt-Bezug
              über Schellings Identität von Geist und Natur, Hegels Geist als Beziehung,
              Heideggers Sein-in-der-Welt, Merleau-Pontys Leibphänomenologie und Gadamers
              Hermeneutik bis zu Waldenfels' Responsivität und Rosas Resonanzsoziologie.
              Acht Stationen, acht Beziehungs-Modi der Vernunft.
            </span>
          </div>
        )}

        {/* Filter-Pills + Suchfeld (Mobile: kollabierbar; Desktop: immer offen) */}
        {(filtersExpanded || !isMobile) && (
          <>
            {/* M3: UnifiedSearch ersetzt das alte Input. search-State bleibt
                via onQueryChange synchronisiert (filtert die Liste/Timeline).
                Klick im Dropdown → setSelectedId für Detail-Panel-Anzeige. */}
            <div style={{ marginTop: "0.6rem" }}>
              <UnifiedSearch
                scope="page"
                scopeId="philosophie"
                sources={[philosophersSource]}
                extendedSources={[conceptsSource]}
                onQueryChange={setSearch}
                onSelect={(hit: SearchHit) => {
                  if (hit.type === "philosopher") {
                    setSelectedId(hit.id);
                    setSearch("");
                  } else if (hit.type === "concept") {
                    navigate(`/begriffsnetz?node=${encodeURIComponent(hit.id)}`);
                  }
                }}
                placeholder="Philosoph suchen …"
                limit={8}
              />
              {searchLower && (
                <div style={{ marginTop: "0.3rem", fontFamily: MONO, fontSize: "0.55rem", color: C.muted }}>
                  {visible.length} in Liste
                </div>
              )}
            </div>

            <div style={{
              display: "flex", gap: "0.3rem",
              flexWrap: isMobile ? "nowrap" : "wrap",
              overflowX: isMobile ? "auto" : "visible",
              marginTop: "0.5rem",
              paddingBottom: isMobile ? "0.3rem" : 0,
            }}>
              <FilterPill active={traditionFilter === "all"} label="alle" color={C.muted} onClick={() => setTraditionFilter("all")} />
              {TRADITIONS.map(t => (
                <FilterPill
                  key={t.id}
                  active={traditionFilter === t.id}
                  label={t.name}
                  color={t.color}
                  onClick={() => setTraditionFilter(t.id)}
                />
              ))}
            </div>
          </>
        )}
      </header>

      {/* ─── Hauptbereich: Visualisierung + (Desktop: Detail-Panel) ─── */}
      <main style={{
        maxWidth: viewMode === "book" ? "none" : 1400, margin: "0 auto",
        padding: isMobile ? "0.5rem 0.5rem 0" : "1rem",
        display: "grid",
        // Buch-View: Detail-Panel ausblenden, Buchaufschlag bekommt die
        // volle Breite — beide Seiten (Philosophen + Wissenschaftler)
        // werden gut lesbar. Hover-Overlay zeigt die jeweilige Phrase.
        // minmax(0, ...) statt 1fr verhindert, dass intrinsisches Content-
        // Min-Width die Spalte über den Viewport hinaus expandiert
        // (sonst überfließt der Buchaufschlag auf Mobile auf >900 px).
        gridTemplateColumns: isMobile || viewMode === "book"
          ? "minmax(0, 1fr)"
          : "minmax(280px, 45%) minmax(0, 1fr)",
        gap: isMobile ? 0 : "1.5rem",
      }}>
        {/* Visualisierung */}
        <section style={{
          minHeight: isMobile ? "calc(100vh - 220px)" : viewMode === "book" ? "calc(100vh - 180px)" : 600,
          height: isMobile ? "calc(100vh - 220px)" : viewMode === "book" ? "calc(100vh - 180px)" : "auto",
        }}>
          {viewMode === "timeline" ? (
            <Timeline
              philosophers={visible}
              allPhilosophers={sorted}
              selectedId={selectedId}
              onSelect={id => { setSelectedId(id); setPathPlaying(false); }}
              showPath={showPath}
              c={C}
              isMobile={isMobile}
            />
          ) : viewMode === "network" ? (
            <NetworkView
              philosophers={visible}
              allPhilosophers={sorted}
              selectedId={selectedId}
              onSelect={id => { setSelectedId(id); setPathPlaying(false); }}
              showPath={showPath}
              c={C}
            />
          ) : viewMode === "constellation" ? (
            <ConstellationView
              philosophers={visible}
              allPhilosophers={sorted}
              selectedId={selectedId}
              onSelect={id => { setSelectedId(id); setPathPlaying(false); }}
              showPath={showPath}
              c={C}
              pathPlaying={pathPlaying}
              pathStep={pathStep}
            />
          ) : viewMode === "spotlight" ? (
            <SpotlightView
              philosophers={visible}
              allPhilosophers={sorted}
              selectedId={selectedId}
              onSelect={id => { setSelectedId(id); setPathPlaying(false); }}
              showPath={showPath}
              c={C}
              isMobile={isMobile}
            />
          ) : viewMode === "book" ? (
            <BookView
              allPhilosophers={sorted}
              selectedId={selectedId}
              onSelect={id => { setSelectedId(id); setPathPlaying(false); }}
              traditionFilter={traditionFilter}
              c={C}
              isMobile={isMobile}
              isDark={isDark}
            />
          ) : viewMode === "roots" ? (
            <RootsView
              philosophers={visible}
              allPhilosophers={sorted}
              selectedId={selectedId}
              onSelect={id => { setSelectedId(id); setPathPlaying(false); }}
              showPath={showPath}
              c={C}
              isDark={isDark}
            />
          ) : (
            <RiverView
              philosophers={visible}
              allPhilosophers={sorted}
              selectedId={selectedId}
              onSelect={id => { setSelectedId(id); setPathPlaying(false); }}
              showPath={showPath}
              c={C}
              isDark={isDark}
              isMobile={isMobile}
            />
          )}
        </section>

        {/* Detail-Panel — nur Desktop, nicht im Buch-View (dort übernimmt
            das Hover-Overlay die Aussage-Anzeige, und die volle Breite
            gehört dem Buchaufschlag). */}
        {!isMobile && viewMode !== "book" && (
          <section>
            {selected ? (
              <PhilosopherDetail philosopher={selected} c={C} onSelect={setSelectedId} />
            ) : (
              <div style={{ padding: "2rem", color: C.textDim, fontStyle: "italic", textAlign: "center" }}>
                Wähle einen Philosophen aus dem Strahl oder Netz.
              </div>
            )}
          </section>
        )}
      </main>

      {/* "Wissenschaftliche Anschlüsse"-Boxen entfernt (2026-05-26) —
          die Information ist bereits per Philosoph in der PhilosopherDetail-
          View als kompakte Pills mit Hover-Tooltip (title={s.description})
          zugänglich, siehe views.tsx PhilosopherDetail. Die großen Boxen
          unten verdoppelten die Information und zogen die UI unnötig in
          die Tiefe — alles darüber ist sauber aligned. */}

      {/* ─── Mobile Bottom-Sheet ─── */}
      {isMobile && (
        <BottomSheet
          philosopher={selected ?? null}
          expanded={sheetExpanded}
          onToggle={() => setSheetExpanded(v => !v)}
          onClose={() => setSheetExpanded(false)}
          onSelect={setSelectedId}
          c={C}
        />
      )}

      <PageNav scrollContainer={scrollRef} />
    </div>
  );
}

// ─── MoreViewsDisclosure (Sprint P1) ─────────────────────────────────────
// Disclosure-Toggle für die 5 experimentellen Sichten (Sternbild, Spotlight,
// Buch, Wurzeln, Fluss). Hält die Toolbar ruhig, weil die meisten User die
// primären Strahl/Netz-Sichten brauchen.
type SecondaryView = "constellation" | "spotlight" | "book" | "roots" | "river";
const SECONDARY_VIEWS: Array<{ mode: SecondaryView; label: string; emoji: string }> = [
  { mode: "constellation", label: "Sternbild", emoji: "✦" },
  { mode: "spotlight",     label: "Spotlight", emoji: "◉" },
  { mode: "book",          label: "Buch",      emoji: "❦" },
  { mode: "roots",         label: "Wurzeln",   emoji: "⌥" },
  { mode: "river",         label: "Fluss",     emoji: "~" },
];

function MoreViewsDisclosure({
  viewMode, setViewMode, c,
}: {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  c: Palette;
}) {
  const [open, setOpen] = useState(false);
  const activeSecondary = SECONDARY_VIEWS.find(v => v.mode === viewMode);

  // Wenn der User eine sekundäre Sicht aktiv hat aber nicht aufgeklappt,
  // zeigen wir das aktive Label inline statt nur „Mehr ▾".
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: activeSecondary ? c.accent : c.muted,
          background: activeSecondary ? `${c.accent}10` : "none",
          border: `1px solid ${activeSecondary ? c.accent : c.border}`,
          padding: "0.5rem 0.7rem", cursor: "pointer", minHeight: 36,
          display: "flex", alignItems: "center", gap: "0.3rem",
        }}
        aria-expanded={open}
        title="Weitere Sichten"
      >
        {activeSecondary ? `${activeSecondary.emoji} ${activeSecondary.label}` : "Mehr"} {open ? "▴" : "▾"}
      </button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0,
            zIndex: 60,
            background: c.surface, border: `1px solid ${c.border}`,
            boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
            display: "flex", flexDirection: "column", minWidth: 140,
          }}
        >
          {SECONDARY_VIEWS.map(v => {
            const active = viewMode === v.mode;
            return (
              <button
                key={v.mode}
                onClick={() => { setViewMode(v.mode); setOpen(false); }}
                style={{
                  fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: active ? c.accent : c.text,
                  background: active ? `${c.accent}10` : "none",
                  border: "none", borderBottom: `1px solid ${c.border}`,
                  padding: "0.55rem 0.8rem", cursor: "pointer", textAlign: "left",
                  display: "flex", alignItems: "center", gap: "0.4rem",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = c.deep; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "none"; }}
              >
                <span style={{ width: 14, color: c.muted }}>{v.emoji}</span>
                {v.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
