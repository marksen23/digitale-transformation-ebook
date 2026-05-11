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
import { Link } from "wouter";
import { useEbookTheme } from "@/hooks/useEbookTheme";
import PageNav from "@/components/PageNav";
import {
  TRADITIONS, SCIENCE_LINKS,
  RESONANZVERNUNFT_PFAD,
  philosophersByBirth, getPhilosopher, getTradition,
  type TraditionId,
} from "@/data/philosophyMap";
import { SERIF, MONO, C_DARK, C_LIGHT, type Palette } from "@/lib/theme";
import {
  ToolbarBtn, FilterPill, navLinkStyle,
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
        position: "fixed", inset: 0, overflowY: "auto",
        background: C.void, color: C.text, fontFamily: SERIF,
        WebkitOverflowScrolling: "touch",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* ─── Header ─── */}
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: isMobile ? "0.8rem 0.8rem 0.6rem" : "1.5rem 1rem", maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: SERIF, fontSize: isMobile ? "1.3rem" : "1.8rem", fontStyle: "italic", color: C.textBright, margin: 0, fontWeight: 400 }}>
              Philosophische Karte
            </h1>
            {!isMobile && (
              <p style={{ fontStyle: "italic", fontSize: "0.9rem", color: C.textDim, margin: "0.3rem 0 0 0" }}>
                Resonanzvernunft im Geflecht ihrer Vorgänger, Zeitgenossen und wissenschaftlichen Anschlüsse.
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "baseline", flexWrap: "wrap" }}>
            <Link href="/" style={navLinkStyle(C)}>← Zum Werk</Link>
            <Link href="/resonanzen" style={navLinkStyle(C)}>Wissen</Link>
          </div>
        </div>

        {/* Toolbar: View-Mode-Toggle + Filter-Toggle (Mobile) + Pfad-Toggle */}
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.6rem" }}>
          {/* View-Mode — horizontal scrollbar auf Mobile (7 Sichten passen sonst nicht in 375px) */}
          <div style={{
            display: "flex", gap: 0,
            border: `1px solid ${C.border}`,
            overflowX: isMobile ? "auto" : "visible",
            maxWidth: isMobile ? "100%" : "none",
            WebkitOverflowScrolling: "touch",
          }}>
            <ToolbarBtn active={viewMode === "timeline"} label="Strahl" onClick={() => setViewMode("timeline")} c={C} />
            <ToolbarBtn active={viewMode === "network"} label="Netz" onClick={() => setViewMode("network")} c={C} />
            <ToolbarBtn active={viewMode === "constellation"} label="Sternbild" onClick={() => setViewMode("constellation")} c={C} />
            <ToolbarBtn active={viewMode === "spotlight"} label="Spotlight" onClick={() => setViewMode("spotlight")} c={C} />
            <ToolbarBtn active={viewMode === "book"} label="Buch" onClick={() => setViewMode("book")} c={C} />
            <ToolbarBtn active={viewMode === "roots"} label="Wurzeln" onClick={() => setViewMode("roots")} c={C} />
            <ToolbarBtn active={viewMode === "river"} label="Fluss" onClick={() => setViewMode("river")} c={C} />
          </div>

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
                    color: C.accent, background: "none",
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
            {/* Suchfeld */}
            <div style={{ marginTop: "0.6rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Philosoph suchen …"
                style={{
                  flex: 1,
                  fontFamily: SERIF, fontSize: "0.85rem", fontStyle: "italic",
                  color: C.text, background: C.surface,
                  border: `1px solid ${C.border}`,
                  padding: "0.55rem 0.8rem", outline: "none",
                  minHeight: 36,
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Suche löschen"
                  style={{
                    fontFamily: MONO, fontSize: "0.6rem",
                    color: C.muted, background: "none",
                    border: `1px solid ${C.border}`,
                    padding: "0.4rem 0.7rem", cursor: "pointer", minHeight: 36,
                  }}
                >×</button>
              )}
              {searchLower && (
                <span style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, whiteSpace: "nowrap" }}>
                  {visible.length} Treffer
                </span>
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
        maxWidth: 1400, margin: "0 auto",
        padding: isMobile ? "0.5rem 0.5rem 0" : "1rem",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "minmax(280px, 45%) 1fr",
        gap: isMobile ? 0 : "1.5rem",
      }}>
        {/* Visualisierung */}
        <section style={{
          minHeight: isMobile ? "calc(100vh - 220px)" : 600,
          height: isMobile ? "calc(100vh - 220px)" : "auto",
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

        {/* Detail-Panel — nur Desktop */}
        {!isMobile && (
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

      {/* ─── Wissenschaftliche Anschlüsse ─── */}
      <section style={{
        maxWidth: 1400, margin: "2rem auto 0",
        padding: isMobile ? "1.5rem 0.8rem 8rem" : "1.5rem 1rem 4rem",
        borderTop: `1px solid ${C.border}`,
      }}>
        <h2 style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.18em", color: C.muted, textTransform: "uppercase", marginBottom: "1rem", fontWeight: 400 }}>
          Wissenschaftliche Anschlüsse
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
          {SCIENCE_LINKS.map(s => (
            <div key={s.id} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "1rem 1.2rem" }}>
              <h3 style={{ fontFamily: SERIF, fontSize: "1.05rem", fontStyle: "italic", color: C.textBright, fontWeight: 400, margin: "0 0 0.5rem 0" }}>
                {s.name}
              </h3>
              <p style={{ fontFamily: SERIF, fontSize: "0.85rem", color: C.text, lineHeight: 1.5, margin: "0 0 0.7rem 0" }}>
                {s.description}
              </p>
              <div style={{ fontFamily: MONO, fontSize: "0.55rem", color: C.muted, letterSpacing: "0.05em" }}>
                exemplarisch: {s.exemplars.join(" · ")}
              </div>
            </div>
          ))}
        </div>
      </section>

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
