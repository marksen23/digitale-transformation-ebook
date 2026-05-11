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
import {
  PHILOSOPHERS, TRADITIONS, SCIENCE_LINKS,
  RESONANZVERNUNFT_PFAD, POSITION_LABEL,
  philosophersByBirth, getPhilosopher, getTradition, getScienceLink,
  type Philosopher, type TraditionId,
} from "@/data/philosophyMap";

const SERIF = "'EB Garamond', Georgia, serif";
const MONO  = "'Courier Prime', 'Courier New', monospace";

interface Palette {
  void: string; deep: string; surface: string; border: string;
  muted: string; textDim: string; text: string; textBright: string;
  accent: string; accentDim: string;
}

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

const TIMELINE_FROM = 1620;
const TIMELINE_TO = 2030;
const PFAD_SET = new Set(RESONANZVERNUNFT_PFAD);

type ViewMode = "timeline" | "network" | "constellation" | "spotlight" | "book" | "roots";

function yearToY(year: number): number {
  return ((year - TIMELINE_FROM) / (TIMELINE_TO - TIMELINE_FROM)) * 100;
}

// Tradition-Reihenfolge (Spalten im Netz) — chronologisch nach spanFrom
const TRADITIONS_ORDERED = [...TRADITIONS].sort((a, b) => a.spanFrom - b.spanFrom);
const TRADITION_INDEX: Record<TraditionId, number> = {} as Record<TraditionId, number>;
TRADITIONS_ORDERED.forEach((t, i) => { TRADITION_INDEX[t.id] = i; });

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

  return (
    <div
      data-scroll
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
          {/* View-Mode */}
          <div style={{ display: "flex", gap: 0, border: `1px solid ${C.border}` }}>
            <ToolbarBtn active={viewMode === "timeline"} label="Strahl" onClick={() => setViewMode("timeline")} c={C} />
            <ToolbarBtn active={viewMode === "network"} label="Netz" onClick={() => setViewMode("network")} c={C} />
            <ToolbarBtn active={viewMode === "constellation"} label="Sternbild" onClick={() => setViewMode("constellation")} c={C} />
            <ToolbarBtn active={viewMode === "spotlight"} label="Spotlight" onClick={() => setViewMode("spotlight")} c={C} />
            <ToolbarBtn active={viewMode === "book"} label="Buch" onClick={() => setViewMode("book")} c={C} />
            <ToolbarBtn active={viewMode === "roots"} label="Wurzeln" onClick={() => setViewMode("roots")} c={C} />
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
          ) : (
            <RootsView
              philosophers={visible}
              allPhilosophers={sorted}
              selectedId={selectedId}
              onSelect={id => { setSelectedId(id); setPathPlaying(false); }}
              showPath={showPath}
              c={C}
              isDark={isDark}
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
    </div>
  );
}

// ─── Toolbar-Button (View-Mode) ────────────────────────────────────────────

function ToolbarBtn({ active, label, onClick, c }: { active: boolean; label: string; onClick: () => void; c: Palette }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase",
        color: active ? "#080808" : c.text,
        background: active ? c.accent : "none",
        border: "none",
        padding: "0.5rem 0.9rem", cursor: "pointer",
        minHeight: 36,
        transition: "all 0.15s",
      }}
    >{label}</button>
  );
}

function FilterPill({ active, label, color, onClick }: { active: boolean; label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase",
        color: active ? "#080808" : color,
        background: active ? color : "none",
        border: `1px solid ${color}`,
        padding: "0.45rem 0.7rem", cursor: "pointer",
        minHeight: 32,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >{label}</button>
  );
}

function navLinkStyle(c: Palette): React.CSSProperties {
  return { color: c.accent, fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", textDecoration: "none" };
}

// ─── Timeline-View ─────────────────────────────────────────────────────────

function Timeline({ philosophers, allPhilosophers, selectedId, onSelect, showPath, c, isMobile }: {
  philosophers: Philosopher[];
  allPhilosophers: Philosopher[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showPath: boolean;
  c: Palette;
  isMobile: boolean;
}) {
  const visibleIds = new Set(philosophers.map(p => p.id));
  const selectedPhil = selectedId ? allPhilosophers.find(p => p.id === selectedId) : null;

  const pathPoints = RESONANZVERNUNFT_PFAD
    .map(id => allPhilosophers.find(p => p.id === id))
    .filter((p): p is Philosopher => !!p)
    .map(p => ({ id: p.id, y: yearToY(p.born) }));

  // Connection-Linien: receives + critiques des selektierten Philosophen
  const connectionsFromSelected: Array<{ to: Philosopher; type: "receives" | "critiques"; y1: number; y2: number; }> = [];
  if (selectedPhil) {
    const fromY = yearToY(selectedPhil.born);
    for (const id of selectedPhil.receives ?? []) {
      const target = allPhilosophers.find(p => p.id === id);
      if (target) connectionsFromSelected.push({ to: target, type: "receives", y1: fromY, y2: yearToY(target.born) });
    }
    for (const id of selectedPhil.critiques ?? []) {
      const target = allPhilosophers.find(p => p.id === id);
      if (target) connectionsFromSelected.push({ to: target, type: "critiques", y1: fromY, y2: yearToY(target.born) });
    }
  }

  return (
    <div style={{
      position: "relative",
      height: "100%", minHeight: 600,
      background: c.surface, border: `1px solid ${c.border}`,
      padding: isMobile ? "0.8rem 0.5rem 0.8rem 3.4rem" : "1rem 0.8rem 1rem 4rem",
      overflow: "hidden",
    }}>
      {/* Tradition-Bänder */}
      {TRADITIONS.map(t => {
        const yFrom = Math.max(0, yearToY(t.spanFrom));
        const yTo = Math.min(100, yearToY(t.spanTo));
        return (
          <div
            key={t.id}
            style={{
              position: "absolute", left: isMobile ? 50 : 60, right: 0,
              top: `${yFrom}%`, height: `${yTo - yFrom}%`,
              background: t.color, opacity: 0.08,
            }}
            title={`${t.name} (${t.spanFrom}–${t.spanTo})`}
          />
        );
      })}

      {/* Zeitachsen-Beschriftungen alle 50 Jahre */}
      {Array.from({ length: Math.floor((TIMELINE_TO - TIMELINE_FROM) / 50) + 1 }, (_, i) => TIMELINE_FROM + i * 50).map(y => (
        <div
          key={y}
          style={{
            position: "absolute", left: 0, right: 0,
            top: `${yearToY(y)}%`,
            borderTop: `1px dashed ${c.border}`,
            pointerEvents: "none",
          }}
        >
          <span style={{ position: "absolute", left: 0, top: "-0.5em", fontFamily: MONO, fontSize: "0.55rem", color: c.muted }}>
            {y}
          </span>
        </div>
      ))}

      {/* SVG-Overlay: Pfad + Verbindungen */}
      <svg
        style={{
          position: "absolute",
          left: isMobile ? 40 : 50,
          top: 0, bottom: 0,
          width: 30, height: "100%",
          pointerEvents: "none",
        }}
        preserveAspectRatio="none" viewBox="0 0 30 100"
      >
        {/* Resonanzvernunft-Pfad */}
        {showPath && pathPoints.length > 1 && (
          <polyline
            points={pathPoints.map(p => `15,${p.y}`).join(" ")}
            fill="none"
            stroke={c.accent}
            strokeWidth="1.2"
            strokeDasharray="2,1.5"
            opacity="0.65"
          />
        )}

        {/* Verbindungs-Linien ab Selektion (Bezier nach links als Bogen) */}
        {connectionsFromSelected.map((conn, i) => {
          // Bogen nach links: ControlPoint links der Achse, mid-y
          const cy = (conn.y1 + conn.y2) / 2;
          const cx = 4;  // links der Linie
          const d = `M 15,${conn.y1} Q ${cx},${cy} 15,${conn.y2}`;
          const isReceives = conn.type === "receives";
          const tradColor = getTradition(conn.to.tradition)?.color ?? c.accent;
          return (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={isReceives ? tradColor : "#c48282"}
              strokeWidth="0.8"
              strokeDasharray={isReceives ? undefined : "1.5,1"}
              opacity="0.7"
            />
          );
        })}
      </svg>

      {/* Philosophen als Buttons */}
      {allPhilosophers.map(p => {
        const tradColor = getTradition(p.tradition)?.color ?? c.accent;
        const isVisible = visibleIds.has(p.id);
        const isSelected = selectedId === p.id;
        const isOnPath = showPath && PFAD_SET.has(p.id);
        const isConnected = selectedPhil && (
          selectedPhil.receives?.includes(p.id) || selectedPhil.critiques?.includes(p.id)
        );
        const y = yearToY(p.born);
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            disabled={!isVisible}
            title={`${p.name} (${p.born}${p.died ? `–${p.died}` : "*"})`}
            style={{
              position: "absolute",
              left: isMobile ? 40 : 50,
              top: `${y}%`,
              transform: "translateY(-50%)",
              display: "flex", alignItems: "center", gap: "0.4rem",
              padding: isMobile ? "0.25rem 0.4rem 0.25rem 0" : "0.15rem 0.4rem 0.15rem 0",
              background: isSelected ? tradColor : "none",
              border: "none",
              cursor: isVisible ? "pointer" : "default",
              opacity: isVisible ? 1 : 0.2,
              fontFamily: SERIF, fontStyle: "italic",
              fontSize: isOnPath ? (isMobile ? "0.82rem" : "0.85rem") : (isMobile ? "0.74rem" : "0.78rem"),
              color: isSelected ? "#080808" : isOnPath ? tradColor : isConnected ? c.textBright : c.text,
              fontWeight: isOnPath || isConnected ? 500 : 400,
              minHeight: isMobile ? 28 : 24,
              maxWidth: "calc(100% - 50px)",
              textAlign: "left",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            <span style={{
              display: "inline-block",
              width: isOnPath ? 9 : isConnected ? 8 : 7,
              height: isOnPath ? 9 : isConnected ? 8 : 7,
              background: tradColor,
              borderRadius: "50%",
              flexShrink: 0,
              border: isOnPath ? `1.5px solid ${c.accent}` : isConnected ? `1.5px solid ${c.textBright}` : "none",
            }} />
            <span>{p.name}</span>
          </button>
        );
      })}

      {/* Legende — kompakte Inline-Angabe wenn Verbindungen sichtbar */}
      {connectionsFromSelected.length > 0 && (
        <div style={{
          position: "absolute", bottom: "0.5rem", right: "0.5rem",
          fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.05em", color: c.muted,
          background: c.deep, padding: "0.3rem 0.5rem", border: `1px solid ${c.border}`,
        }}>
          ── rezipiert · ┄┄ kritisiert
        </div>
      )}
    </div>
  );
}

// ─── Network-View ──────────────────────────────────────────────────────────

interface NetworkPos { x: number; y: number; }

function networkLayout(philosophers: Philosopher[], width: number, height: number): Map<string, NetworkPos> {
  const map = new Map<string, NetworkPos>();
  const nCols = TRADITIONS_ORDERED.length;

  // Gruppiere Philosophen pro Tradition, sortiere nach Geburt
  const byTradition: Record<string, Philosopher[]> = {};
  for (const p of philosophers) {
    if (!byTradition[p.tradition]) byTradition[p.tradition] = [];
    byTradition[p.tradition].push(p);
  }

  for (const trad of TRADITIONS_ORDERED) {
    const list = (byTradition[trad.id] ?? []).sort((a, b) => a.born - b.born);
    const colIndex = TRADITION_INDEX[trad.id];
    const x = ((colIndex + 0.5) / nCols) * width;
    for (const p of list) {
      const y = ((p.born - TIMELINE_FROM) / (TIMELINE_TO - TIMELINE_FROM)) * height;
      map.set(p.id, { x, y });
    }
  }
  return map;
}

function NetworkView({ philosophers, allPhilosophers, selectedId, onSelect, showPath, c }: {
  philosophers: Philosopher[];
  allPhilosophers: Philosopher[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showPath: boolean;
  c: Palette;
}) {
  const W = 800, H = 700;
  const layout = useMemo(() => networkLayout(allPhilosophers, W, H), [allPhilosophers]);
  const visibleIds = new Set(philosophers.map(p => p.id));

  // Kanten extrahieren
  const edges = useMemo(() => {
    const list: Array<{ fromId: string; toId: string; type: "receives" | "critiques" }> = [];
    for (const p of allPhilosophers) {
      for (const id of p.receives ?? []) list.push({ fromId: p.id, toId: id, type: "receives" });
      for (const id of p.critiques ?? []) list.push({ fromId: p.id, toId: id, type: "critiques" });
    }
    return list;
  }, [allPhilosophers]);

  // Pfad als Polyline
  const pathCoords = RESONANZVERNUNFT_PFAD
    .map(id => layout.get(id))
    .filter((p): p is NetworkPos => !!p);

  return (
    <div style={{
      position: "relative",
      height: "100%", minHeight: 600,
      background: c.surface, border: `1px solid ${c.border}`,
      overflow: "hidden",
    }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <defs>
          {TRADITIONS_ORDERED.map(t => (
            <marker key={t.id} id={`arrow-${t.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={t.color} />
            </marker>
          ))}
          <marker id="arrow-critique" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#c48282" />
          </marker>
        </defs>

        {/* Tradition-Spalten als vertikale Akzentstreifen */}
        {TRADITIONS_ORDERED.map(t => {
          const colIndex = TRADITION_INDEX[t.id];
          const x = ((colIndex + 0.5) / TRADITIONS_ORDERED.length) * W;
          return (
            <g key={t.id}>
              <rect
                x={x - 30} y={0} width={60} height={H}
                fill={t.color} opacity="0.05"
              />
              <text
                x={x} y={H - 8}
                textAnchor="middle"
                fontFamily={MONO}
                fontSize="9"
                fill={c.muted}
                style={{ letterSpacing: "0.05em", textTransform: "uppercase" }}
              >
                {t.name.length > 18 ? t.name.slice(0, 16) + "…" : t.name}
              </text>
            </g>
          );
        })}

        {/* Resonanzvernunft-Pfad */}
        {showPath && pathCoords.length > 1 && (
          <polyline
            points={pathCoords.map(p => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={c.accent}
            strokeWidth="2"
            strokeDasharray="6,4"
            opacity="0.5"
          />
        )}

        {/* Kanten — eingehende/ausgehende des selektierten gehoben, Rest gedimmt */}
        {edges.map((edge, i) => {
          const from = layout.get(edge.fromId);
          const to = layout.get(edge.toId);
          if (!from || !to) return null;

          const isHighlighted = !selectedId
            || edge.fromId === selectedId
            || edge.toId === selectedId;

          // Bezier-Kurve mit lateraler Auslenkung
          const cx = (from.x + to.x) / 2 + (from.x === to.x ? 60 : 0);
          const cy = (from.y + to.y) / 2;
          const d = `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;

          const tradColor = getTradition(getPhilosopher(edge.toId)?.tradition ?? "wissenschaft")?.color ?? c.accent;
          const stroke = edge.type === "receives" ? tradColor : "#c48282";
          const opacity = isHighlighted ? 0.65 : 0.12;
          const markerEnd = edge.type === "receives"
            ? `url(#arrow-${getPhilosopher(edge.toId)?.tradition ?? "wissenschaft"})`
            : "url(#arrow-critique)";

          return (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={isHighlighted ? 1.5 : 1}
              strokeDasharray={edge.type === "receives" ? undefined : "4,3"}
              opacity={opacity}
              markerEnd={markerEnd}
            />
          );
        })}

        {/* Knoten */}
        {allPhilosophers.map(p => {
          const pos = layout.get(p.id);
          if (!pos) return null;
          const isVisible = visibleIds.has(p.id);
          const isSelected = selectedId === p.id;
          const isOnPath = showPath && PFAD_SET.has(p.id);
          const tradColor = getTradition(p.tradition)?.color ?? c.accent;
          const r = isOnPath ? 7 : isSelected ? 8 : 5;

          return (
            <g key={p.id} opacity={isVisible ? 1 : 0.2}>
              <circle
                cx={pos.x} cy={pos.y} r={r}
                fill={tradColor}
                stroke={isSelected ? c.textBright : isOnPath ? c.accent : "none"}
                strokeWidth={isSelected ? 2.5 : isOnPath ? 1.8 : 0}
                style={{ cursor: isVisible ? "pointer" : "default" }}
                onClick={() => isVisible && onSelect(p.id)}
              />
              <text
                x={pos.x + r + 3}
                y={pos.y + 3}
                fontFamily={SERIF}
                fontSize={isOnPath ? 11 : 10}
                fill={isSelected ? c.textBright : isOnPath ? tradColor : c.text}
                fontStyle="italic"
                fontWeight={isOnPath || isSelected ? 500 : 400}
                style={{ cursor: isVisible ? "pointer" : "default", userSelect: "none" }}
                onClick={() => isVisible && onSelect(p.id)}
              >
                {p.name.split(" ").slice(-1)[0]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Inline-Legende */}
      <div style={{
        position: "absolute", top: "0.5rem", right: "0.5rem",
        fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.05em", color: c.muted,
        background: c.deep, padding: "0.3rem 0.5rem", border: `1px solid ${c.border}`,
      }}>
        ── rezipiert · ┄┄ kritisiert
      </div>
    </div>
  );
}

// ─── Detail-Panel (Inhalt — nutzbar in Side-Panel und Bottom-Sheet) ───────

function PhilosopherDetail({ philosopher, c, onSelect }: { philosopher: Philosopher; c: Palette; onSelect: (id: string) => void }) {
  const tradition = getTradition(philosopher.tradition);
  const tradColor = tradition?.color ?? c.accent;
  const lifespan = `${philosopher.born}${philosopher.died ? `–${philosopher.died}` : "*"}`;
  const isOnPath = PFAD_SET.has(philosopher.id);

  return (
    <article style={{ background: c.surface, border: `1px solid ${c.border}`, padding: "1.2rem 1.3rem" }}>
      <header style={{ marginBottom: "1.1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", flexWrap: "wrap", marginBottom: "0.4rem" }}>
          <span style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.15em", textTransform: "uppercase", color: tradColor }}>
            {tradition?.name}
          </span>
          <span style={{ fontFamily: MONO, fontSize: "0.55rem", color: c.muted }}>
            · {POSITION_LABEL[philosopher.position]}
          </span>
          {isOnPath && (
            <span style={{ fontFamily: MONO, fontSize: "0.55rem", color: c.accent, letterSpacing: "0.1em" }}>
              · auf dem Resonanzvernunft-Pfad
            </span>
          )}
        </div>
        <h2 style={{ fontFamily: SERIF, fontSize: "1.6rem", fontStyle: "italic", color: c.textBright, margin: 0, fontWeight: 400 }}>
          {philosopher.name}
        </h2>
        <div style={{ fontFamily: MONO, fontSize: "0.7rem", color: c.muted, marginTop: "0.2rem" }}>
          {lifespan}
        </div>
      </header>

      <div style={{ marginBottom: "1.2rem", padding: "0.8rem 1rem", background: c.deep, border: `1px solid ${c.border}`, borderLeft: `3px solid ${tradColor}` }}>
        <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.15em", textTransform: "uppercase", color: c.muted, marginBottom: "0.4rem" }}>
          Bezug zu Resonanzvernunft
        </div>
        <p style={{ fontFamily: SERIF, fontSize: "0.92rem", color: c.text, lineHeight: 1.55, margin: 0, fontStyle: "italic" }}>
          {philosopher.resonanzNote}
        </p>
      </div>

      <div style={{ marginBottom: "1.1rem" }}>
        <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.15em", textTransform: "uppercase", color: c.muted, marginBottom: "0.5rem" }}>
          Hauptwerke ({philosopher.keyWorks.length})
        </div>
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {[...philosopher.keyWorks].sort((a, b) => a.year - b.year).map((w, i) => (
            <li key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.6rem", alignItems: "baseline" }}>
              <span style={{
                fontFamily: MONO, fontSize: "0.55rem", color: c.muted,
                background: c.deep, border: `1px solid ${c.border}`,
                padding: "0.1rem 0.4rem", borderRadius: 2,
                minWidth: 38, textAlign: "center", letterSpacing: "0.05em",
              }}>{w.year}</span>
              <span style={{ fontFamily: SERIF, fontSize: "0.88rem", color: c.text, lineHeight: 1.4, fontStyle: "italic" }}>
                {w.title}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {(philosopher.receives?.length || philosopher.critiques?.length) ? (
        <div style={{ marginBottom: "1.1rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.8rem" }}>
          {philosopher.receives && philosopher.receives.length > 0 && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.15em", textTransform: "uppercase", color: c.muted, marginBottom: "0.4rem" }}>
                rezipiert
              </div>
              {philosopher.receives.map(id => (
                <ConnectionLink key={id} id={id} c={c} onSelect={onSelect} />
              ))}
            </div>
          )}
          {philosopher.critiques && philosopher.critiques.length > 0 && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.15em", textTransform: "uppercase", color: c.muted, marginBottom: "0.4rem" }}>
                kritisiert
              </div>
              {philosopher.critiques.map(id => (
                <ConnectionLink key={id} id={id} c={c} onSelect={onSelect} />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {philosopher.scienceLinks && philosopher.scienceLinks.length > 0 && (
        <div style={{ marginBottom: "1.1rem" }}>
          <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.15em", textTransform: "uppercase", color: c.muted, marginBottom: "0.4rem" }}>
            wissenschaftlich anschlussfähig
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {philosopher.scienceLinks.map(id => {
              const s = getScienceLink(id);
              if (!s) return null;
              return (
                <span key={id} style={{
                  fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.05em",
                  color: c.accent, background: c.deep,
                  border: `1px solid ${c.border}`,
                  padding: "0.3rem 0.5rem",
                }} title={s.description}>
                  {s.name}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {philosopher.concepts && philosopher.concepts.length > 0 && (
        <div>
          <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.15em", textTransform: "uppercase", color: c.muted, marginBottom: "0.4rem" }}>
            verbundene Begriffe — zum Korpus springen
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {philosopher.concepts.map(conceptId => (
              <a
                key={conceptId}
                href={`/resonanzen?tag=${encodeURIComponent(conceptId)}`}
                title={`Begegnungen zu '${conceptId}' anzeigen`}
                style={{
                  fontFamily: SERIF, fontStyle: "italic", fontSize: "0.78rem",
                  color: c.accent, background: "none",
                  border: `1px solid ${c.border}`,
                  padding: "0.3rem 0.6rem",
                  textDecoration: "none",
                  minHeight: 28,
                  display: "inline-flex", alignItems: "center",
                }}
              >
                {conceptId}
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function ConnectionLink({ id, c, onSelect }: { id: string; c: Palette; onSelect: (id: string) => void }) {
  const p = getPhilosopher(id);
  if (!p) return null;
  return (
    <button
      onClick={() => onSelect(id)}
      style={{
        display: "block",
        fontFamily: SERIF, fontStyle: "italic", fontSize: "0.82rem",
        color: c.accent, background: "none", border: "none",
        padding: "0.3rem 0", cursor: "pointer", textAlign: "left",
        textDecoration: "underline", textUnderlineOffset: "0.2em",
        minHeight: 32,
      }}
    >
      → {p.name}
    </button>
  );
}

// ─── Bottom-Sheet (Mobile) ─────────────────────────────────────────────────

function BottomSheet({ philosopher, expanded, onToggle, onClose, onSelect, c }: {
  philosopher: Philosopher | null;
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  c: Palette;
}) {
  const peekHeight = 64;
  const tradition = philosopher ? getTradition(philosopher.tradition) : null;
  const tradColor = tradition?.color ?? c.accent;

  // Wenn kein Philosoph gewählt: kompakter Hint im peek-Bar
  if (!philosopher) {
    return (
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
          height: peekHeight,
          background: c.deep, borderTop: `1px solid ${c.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 1rem",
          fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        Philosoph wählen für Details
      </div>
    );
  }

  return (
    <>
      {expanded && (
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 99,
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
          }}
        />
      )}
      <div
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded ? "true" : undefined}
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
          background: c.deep, borderTop: `1px solid ${tradColor}`,
          maxHeight: expanded ? "70vh" : peekHeight,
          overflow: expanded ? "auto" : "hidden",
          transition: "max-height 0.25s ease",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Peek-Bar (immer sichtbar, klickbar zum Toggle) */}
        <button
          onClick={onToggle}
          aria-label={expanded ? "Detail-Panel schließen" : "Detail-Panel öffnen"}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", height: peekHeight,
            padding: "0 1rem",
            background: "none", border: "none",
            color: c.text, cursor: "pointer",
            borderBottom: expanded ? `1px solid ${c.border}` : "none",
            position: expanded ? "sticky" : "static",
            top: 0,
            zIndex: 1,
            backgroundColor: c.deep,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.15rem", overflow: "hidden", flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.12em", textTransform: "uppercase", color: tradColor, whiteSpace: "nowrap" }}>
              {tradition?.name}
            </span>
            <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "1rem", color: c.textBright, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
              {philosopher.name}
            </span>
          </div>
          <span style={{ fontFamily: MONO, fontSize: "0.7rem", color: c.muted, marginLeft: "0.6rem" }}>
            {expanded ? "▾" : "▴"}
          </span>
        </button>

        {/* Voller Detail-Inhalt nur im expanded-Modus */}
        {expanded && (
          <div style={{ padding: "0.5rem 1rem 1.5rem" }}>
            <PhilosopherDetail philosopher={philosopher} c={c} onSelect={onSelect} />
          </div>
        )}
      </div>
    </>
  );
}

// ─── Constellation-View (Sternbild) ────────────────────────────────────────

// Deterministische RNG für Stern-Streuung. Inline statt Import, da klein.
function constellationRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Narrative Anker-Positionen für die acht Konstellationen auf 1000×700.
// Nicht random — die Lage trägt die Geschichte: Resonanz in der Mitte unten,
// Wissenschaft als Anschluss-Region rechts, Frühe-Vorläufer links oben.
const CONSTELLATION_ANCHORS: Record<TraditionId, { cx: number; cy: number; r: number }> = {
  "vorlaeufer":         { cx: 170, cy: 130, r: 70 },
  "idealismus":         { cx: 430, cy: 160, r: 80 },
  "phaenomenologie":    { cx: 740, cy: 200, r: 95 },
  "hermeneutik":        { cx: 830, cy: 410, r: 75 },
  "frankfurter-schule": { cx: 200, cy: 530, r: 100 },
  "lebensphilosophie":  { cx: 110, cy: 350, r: 70 },
  "resonanz":           { cx: 500, cy: 540, r: 110 },
  "wissenschaft":       { cx: 800, cy: 580, r: 110 },
};

function ConstellationView({ philosophers, allPhilosophers, selectedId, onSelect, showPath, c, pathPlaying, pathStep }: {
  philosophers: Philosopher[];
  allPhilosophers: Philosopher[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showPath: boolean;
  c: Palette;
  pathPlaying: boolean;
  pathStep: number;
}) {
  const W = 1000, H = 700;
  const visibleIds = new Set(philosophers.map(p => p.id));

  // Stern-Positionen berechnen: pro Tradition Anker + scattering nach
  // Geburtsjahr (radialer Winkel) und Seed (radius).
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; tradition: TraditionId }>();
    // Gruppe pro Tradition + chronologisch sortieren
    const byTrad = new Map<TraditionId, Philosopher[]>();
    for (const p of allPhilosophers) {
      const arr = byTrad.get(p.tradition) ?? [];
      arr.push(p);
      byTrad.set(p.tradition, arr);
    }
    byTrad.forEach((list: Philosopher[], trad: TraditionId) => {
      list.sort((a, b) => a.born - b.born);
      const anchor = CONSTELLATION_ANCHORS[trad];
      if (!anchor) return;
      const n = list.length;
      const seed = trad.split("").reduce((s: number, ch: string) => s + ch.charCodeAt(0), 0);
      const rng = constellationRng(seed);
      list.forEach((p, i) => {
        // Verteilung: Winkel gleichmäßig + leichte Streuung, Radius variabel
        const baseAngle = (i / Math.max(n, 1)) * Math.PI * 2;
        const jitterAngle = (rng() - 0.5) * 0.4;
        const angle = baseAngle + jitterAngle;
        const radiusFraction = 0.35 + rng() * 0.65;  // 35-100% des Konstellations-Radius
        const x = anchor.cx + Math.cos(angle) * anchor.r * radiusFraction;
        const y = anchor.cy + Math.sin(angle) * anchor.r * radiusFraction;
        map.set(p.id, { x, y, tradition: trad });
      });
    });
    return map;
  }, [allPhilosophers]);

  const selectedPhil = selectedId ? allPhilosophers.find(p => p.id === selectedId) : null;
  const currentPathId = pathPlaying ? RESONANZVERNUNFT_PFAD[pathStep] : null;

  // Konstellations-Linien: Polyline pro Tradition durch chronologisch sortierte Mitglieder
  const constellationLines = useMemo(() => {
    const lines: Array<{ tradition: TraditionId; points: string }> = [];
    const byTrad = new Map<TraditionId, Philosopher[]>();
    for (const p of allPhilosophers) {
      const arr = byTrad.get(p.tradition) ?? [];
      arr.push(p);
      byTrad.set(p.tradition, arr);
    }
    byTrad.forEach((list: Philosopher[], trad: TraditionId) => {
      const sorted = [...list].sort((a, b) => a.born - b.born);
      const points = sorted
        .map(p => positions.get(p.id))
        .filter((pos): pos is { x: number; y: number; tradition: TraditionId } => !!pos)
        .map(pos => `${pos.x},${pos.y}`)
        .join(" ");
      if (points) lines.push({ tradition: trad, points });
    });
    return lines;
  }, [allPhilosophers, positions]);

  // Cross-Verbindungen vom selektierten zu seinen receives/critiques
  const crossLinks = selectedPhil
    ? [
        ...(selectedPhil.receives ?? []).map(id => ({ id, type: "receives" as const })),
        ...(selectedPhil.critiques ?? []).map(id => ({ id, type: "critiques" as const })),
      ]
    : [];

  return (
    <div style={{
      position: "relative",
      height: "100%", minHeight: 600,
      background: "#040408",   // tiefe Sternenhimmel-Dunkelheit, unabhängig vom Theme
      border: `1px solid ${c.border}`,
      overflow: "hidden",
    }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <defs>
          {/* Glow-Filter für Sterne */}
          <filter id="star-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Stärkerer Glow für Pfad-Sterne */}
          <filter id="path-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Radial-Hintergrund-Glow für die Resonanz-Konstellation */}
          <radialGradient id="resonanz-glow">
            <stop offset="0%" stopColor="#c4a882" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#c4a882" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Subtiler Hintergrund-Glow um die Resonanz-Konstellation (das Zentrum) */}
        <circle
          cx={CONSTELLATION_ANCHORS["resonanz"].cx}
          cy={CONSTELLATION_ANCHORS["resonanz"].cy}
          r={CONSTELLATION_ANCHORS["resonanz"].r * 2.2}
          fill="url(#resonanz-glow)"
        />

        {/* Konstellations-Linien: dünn, Tradition-Farbe, niedrige Opazität */}
        {constellationLines.map(line => {
          const tradColor = TRADITIONS.find(t => t.id === line.tradition)?.color ?? "#888";
          return (
            <polyline
              key={line.tradition}
              points={line.points}
              fill="none"
              stroke={tradColor}
              strokeWidth="0.8"
              opacity={0.28}
            />
          );
        })}

        {/* Cross-Linien: vom selektierten Philosophen zu rezipiert/kritisiert */}
        {crossLinks.map((link, i) => {
          const fromPos = selectedPhil ? positions.get(selectedPhil.id) : null;
          const toPos = positions.get(link.id);
          if (!fromPos || !toPos) return null;
          return (
            <line
              key={i}
              x1={fromPos.x} y1={fromPos.y}
              x2={toPos.x} y2={toPos.y}
              stroke={link.type === "receives" ? "#c4a882" : "#c48282"}
              strokeWidth="0.7"
              strokeDasharray={link.type === "receives" ? undefined : "3,2"}
              opacity={0.5}
            />
          );
        })}

        {/* Tradition-Labels — dezent in der Mitte */}
        {TRADITIONS.map(t => {
          const anchor = CONSTELLATION_ANCHORS[t.id];
          if (!anchor) return null;
          return (
            <text
              key={t.id}
              x={anchor.cx}
              y={anchor.cy - anchor.r - 4}
              textAnchor="middle"
              fontFamily={MONO}
              fontSize="9"
              fill={t.color}
              opacity={0.5}
              style={{ letterSpacing: "0.18em", textTransform: "uppercase", pointerEvents: "none" }}
            >
              {t.name}
            </text>
          );
        })}

        {/* Sterne */}
        {allPhilosophers.map(p => {
          const pos = positions.get(p.id);
          if (!pos) return null;
          const isVisible = visibleIds.has(p.id);
          const isSelected = selectedId === p.id;
          const isOnPath = showPath && PFAD_SET.has(p.id);
          const isCurrentPathStep = currentPathId === p.id;
          const isConnected = selectedPhil && (
            selectedPhil.receives?.includes(p.id) || selectedPhil.critiques?.includes(p.id)
          );
          const tradColor = TRADITIONS.find(t => t.id === p.tradition)?.color ?? "#aaa";

          // Stern-Eigenschaften
          const baseRadius = isOnPath ? 5 : 3.5;
          const radius = isSelected ? 7 : isCurrentPathStep ? 8 : baseRadius;
          const starColor = isSelected ? "#fff" : isOnPath ? "#c4a882" : isConnected ? "#e8e2d4" : "#c8c2b4";
          const filter = isOnPath || isSelected || isCurrentPathStep ? "url(#path-glow)" : "url(#star-glow)";
          const labelOpacity = isVisible ? (isSelected || isOnPath || isConnected ? 1 : 0.7) : 0.2;

          return (
            <g key={p.id} opacity={isVisible ? 1 : 0.2} style={{ cursor: isVisible ? "pointer" : "default" }}>
              {/* Unsichtbare Touch-Hit-Box */}
              <circle
                cx={pos.x} cy={pos.y} r={16}
                fill="transparent"
                onClick={() => isVisible && onSelect(p.id)}
              />
              {/* Stern */}
              <circle
                cx={pos.x} cy={pos.y} r={radius}
                fill={starColor}
                filter={filter}
                style={{ pointerEvents: "none" }}
              >
                {isCurrentPathStep && (
                  <animate
                    attributeName="r"
                    values={`${radius};${radius + 2};${radius}`}
                    dur="2s"
                    repeatCount="indefinite"
                  />
                )}
              </circle>
              {/* Outline ring für Pfad-Sterne */}
              {isOnPath && !isSelected && (
                <circle
                  cx={pos.x} cy={pos.y} r={radius + 3}
                  fill="none"
                  stroke="#c4a882"
                  strokeWidth="0.5"
                  opacity={0.5}
                  style={{ pointerEvents: "none" }}
                />
              )}
              {/* Namens-Label, leicht versetzt */}
              <text
                x={pos.x + radius + 4}
                y={pos.y + 3}
                fontFamily={SERIF}
                fontSize={isOnPath ? 11 : 9.5}
                fill={starColor}
                fontStyle="italic"
                fontWeight={isOnPath || isSelected ? 500 : 400}
                opacity={labelOpacity}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {p.name.split(" ").slice(-1)[0]}
              </text>
              {/* SR-Title */}
              <title>{p.name} ({p.born}{p.died ? `–${p.died}` : "*"})</title>
            </g>
          );
        })}
      </svg>

      {/* Inline-Legende oben links */}
      <div style={{
        position: "absolute", top: "0.6rem", left: "0.6rem",
        fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", color: "#888",
        background: "rgba(0,0,0,0.4)", padding: "0.3rem 0.5rem",
        border: `1px solid #2a2a2a`,
      }}>
        Tradition · Konstellation
      </div>
      {selectedPhil && (
        <div style={{
          position: "absolute", bottom: "0.5rem", right: "0.5rem",
          fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.05em", color: "#888",
          background: "rgba(0,0,0,0.4)", padding: "0.3rem 0.5rem",
          border: `1px solid #2a2a2a`,
        }}>
          ── rezipiert · ┄┄ kritisiert
        </div>
      )}
    </div>
  );
}


// ─── Spotlight-View ────────────────────────────────────────────────────────
// Themenleiste unten, Philosophen schweben darüber. Hover/Tap auf einen
// Philosophen sendet einen Lichtstrahl nach unten und beleuchtet die
// Themen, mit denen er verbunden ist (concepts-Feld).

function SpotlightView({ philosophers, allPhilosophers, selectedId, onSelect, showPath, c, isMobile }: {
  philosophers: Philosopher[];
  allPhilosophers: Philosopher[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showPath: boolean;
  c: Palette;
  isMobile: boolean;
}) {
  const W = 1000, H = 600;
  const BAR_HEIGHT = 90;
  const BAR_Y = H - BAR_HEIGHT;
  const TOP_PAD = 40, BOTTOM_PAD = 10;
  const visibleIds = new Set(philosophers.map(p => p.id));

  const [hoverId, setHoverId] = useState<string | null>(null);
  const spotlightId = isMobile ? selectedId : (hoverId ?? selectedId);
  const spotlightPhil = spotlightId ? allPhilosophers.find(p => p.id === spotlightId) : null;
  const spotlightConcepts = new Set(spotlightPhil?.concepts ?? []);

  // Konzept-Universum aus allen concepts-Tags, häufigste zuerst
  const conceptList = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of allPhilosophers) {
      for (const concept of p.concepts ?? []) {
        counts[concept] = (counts[concept] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ id, count }));
  }, [allPhilosophers]);

  const conceptX = useMemo(() => {
    const map = new Map<string, number>();
    const n = conceptList.length;
    const padding = 30;
    const usable = W - 2 * padding;
    conceptList.forEach((cn, i) => {
      const x = padding + ((i + 0.5) / n) * usable;
      map.set(cn.id, x);
    });
    return map;
  }, [conceptList]);

  const philosopherPos = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const usableY = BAR_Y - TOP_PAD - BOTTOM_PAD;
    for (const p of allPhilosophers) {
      const xs = (p.concepts ?? []).map(cn => conceptX.get(cn)).filter((x): x is number => x !== undefined);
      const x = xs.length > 0 ? xs.reduce((s, v) => s + v, 0) / xs.length : W / 2;
      const y = TOP_PAD + ((p.born - TIMELINE_FROM) / (TIMELINE_TO - TIMELINE_FROM)) * usableY;
      map.set(p.id, { x, y });
    }
    return map;
  }, [allPhilosophers, conceptX]);

  // Vermeide y-Überlappung durch x-Jitter
  const adjustedPos = useMemo(() => {
    const arr = Array.from(philosopherPos.entries()).map(([id, p]) => ({ id, ...p }));
    arr.sort((a, b) => a.y - b.y);
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].y - arr[i - 1].y < 22) {
        const offset = ((i % 2 === 0) ? 1 : -1) * 30;
        arr[i] = { ...arr[i], x: Math.min(W - 30, Math.max(30, arr[i].x + offset)) };
      }
    }
    const result = new Map<string, { x: number; y: number }>();
    arr.forEach(p => result.set(p.id, { x: p.x, y: p.y }));
    return result;
  }, [philosopherPos]);

  return (
    <div style={{
      position: "relative",
      height: "100%", minHeight: 600,
      background: "linear-gradient(to bottom, #050810 0%, #0a0d18 70%, #14182a 100%)",
      border: `1px solid ${c.border}`,
      overflow: "hidden",
    }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <defs>
          <filter id="spot-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="spot-strong-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="beam-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c4a882" stopOpacity="0" />
            <stop offset="20%" stopColor="#c4a882" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#c4a882" stopOpacity="0.05" />
          </linearGradient>
          <radialGradient id="bar-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c4a882" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#c4a882" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect x={0} y={BAR_Y} width={W} height={BAR_HEIGHT} fill="rgba(20,24,40,0.6)" />
        <line x1={0} y1={BAR_Y} x2={W} y2={BAR_Y} stroke="#2a2a2a" strokeWidth="0.5" />

        {spotlightPhil && (() => {
          const pos = adjustedPos.get(spotlightPhil.id);
          if (!pos) return null;
          return (
            <g style={{ pointerEvents: "none" }}>
              <rect x={pos.x - 30} y={pos.y} width={60} height={BAR_Y - pos.y + BAR_HEIGHT} fill="url(#beam-gradient)" />
              <line x1={pos.x} y1={pos.y} x2={pos.x} y2={BAR_Y + BAR_HEIGHT} stroke="#c4a882" strokeWidth="0.5" opacity="0.7" />
            </g>
          );
        })()}

        {conceptList.map(({ id, count }) => {
          const x = conceptX.get(id);
          if (x === undefined) return null;
          const isHighlighted = spotlightConcepts.has(id);
          const fontSize = isHighlighted ? 12 : 9 + Math.min(2, count / 4);
          const opacity = spotlightPhil ? (isHighlighted ? 1 : 0.25) : 0.7;
          return (
            <g key={id}>
              {isHighlighted && (
                <circle cx={x} cy={BAR_Y + BAR_HEIGHT / 2} r={28} fill="url(#bar-glow)" style={{ pointerEvents: "none" }} />
              )}
              <a href={`/resonanzen?tag=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">
                <text
                  x={x}
                  y={BAR_Y + BAR_HEIGHT / 2 + fontSize / 3}
                  textAnchor="middle"
                  fontFamily={MONO}
                  fontSize={fontSize}
                  fill={isHighlighted ? "#fff" : "#c8c2b4"}
                  opacity={opacity}
                  fontWeight={isHighlighted ? 600 : 400}
                  style={{ letterSpacing: "0.05em", cursor: "pointer" }}
                >
                  {id}
                </text>
              </a>
            </g>
          );
        })}

        {allPhilosophers.map(p => {
          const pos = adjustedPos.get(p.id);
          if (!pos) return null;
          const isVisible = visibleIds.has(p.id);
          const isSelected = selectedId === p.id;
          const isSpotlight = spotlightId === p.id;
          const isOnPath = showPath && PFAD_SET.has(p.id);
          const radius = isSpotlight ? 6 : isSelected ? 5 : isOnPath ? 4.5 : 3.5;
          const color = isSpotlight ? "#fff" : isOnPath ? "#c4a882" : "#c8c2b4";
          const filter = isSpotlight ? "url(#spot-strong-glow)" : "url(#spot-glow)";
          const labelOpacity = isVisible ? (spotlightPhil ? (isSpotlight ? 1 : 0.45) : 0.85) : 0.2;

          return (
            <g
              key={p.id}
              opacity={isVisible ? 1 : 0.2}
              style={{ cursor: isVisible ? "pointer" : "default" }}
              onMouseEnter={() => !isMobile && isVisible && setHoverId(p.id)}
              onMouseLeave={() => !isMobile && setHoverId(null)}
              onClick={() => isVisible && onSelect(p.id)}
            >
              <circle cx={pos.x} cy={pos.y} r={14} fill="transparent" />
              <circle cx={pos.x} cy={pos.y} r={radius} fill={color} filter={filter} style={{ pointerEvents: "none" }} />
              {isOnPath && !isSpotlight && (
                <circle cx={pos.x} cy={pos.y} r={radius + 3} fill="none" stroke="#c4a882" strokeWidth="0.4" opacity="0.5" style={{ pointerEvents: "none" }} />
              )}
              <text
                x={pos.x + radius + 4}
                y={pos.y + 3}
                fontFamily={SERIF}
                fontSize={isSpotlight ? 12 : isOnPath ? 11 : 10}
                fill={color}
                fontStyle="italic"
                fontWeight={isOnPath || isSpotlight ? 500 : 400}
                opacity={labelOpacity}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {p.name.split(" ").slice(-1)[0]}
              </text>
              <title>{p.name} ({p.born}{p.died ? `–${p.died}` : "*"})</title>
            </g>
          );
        })}
      </svg>

      <div style={{
        position: "absolute", top: "0.6rem", left: "0.6rem",
        fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", color: "#888",
        background: "rgba(0,0,0,0.4)", padding: "0.3rem 0.5rem",
        border: `1px solid #2a2a2a`,
      }}>
        {isMobile ? "Tippe einen Denker" : "Bewege die Maus über einen Denker"} · der Strahl beleuchtet seine Themen
      </div>
    </div>
  );
}

// ─── Book-View (Buch der Einflüsse) ───────────────────────────────────────
//
// Aufgeschlagenes Buch — links Philosophen, rechts Wissenschaftler.
// Jeder Denker erscheint als handschriftliches Fragment (signaturePhrase).
// Themen-Filter (Tradition + Konzept) bringt zugehörige Fragmente in den
// Vordergrund; andere fadeen leicht zurück. Lebendige Bibliothek.

const BOOK_THEMES: Array<{ id: string; label: string; matches: (p: Philosopher) => boolean }> = [
  { id: "all", label: "alle", matches: () => true },
  { id: "resonanz", label: "Resonanz", matches: p => !!p.concepts?.some(c => ["resonanz", "resonanzvernunft", "stimme", "antwort", "öffnung"].includes(c)) },
  { id: "dasein",   label: "Dasein",   matches: p => !!p.concepts?.some(c => ["dasein", "sein", "welt", "bewusstsein"].includes(c)) },
  { id: "vernunft", label: "Vernunft", matches: p => !!p.concepts?.some(c => ["vernunft", "erkenntnis", "denken", "dialog"].includes(c)) },
  { id: "sprache",  label: "Sprache",  matches: p => !!p.concepts?.some(c => ["sprache", "schweigen", "antwort"].includes(c)) },
  { id: "zeit",     label: "Zeit",     matches: p => !!p.concepts?.some(c => ["zeit", "moment", "werden", "gegenwart"].includes(c)) },
  { id: "selbst",   label: "Selbst",   matches: p => !!p.concepts?.some(c => ["selbst", "andere", "ich-du", "freiheit"].includes(c)) },
  { id: "drift",    label: "Spätmoderne", matches: p => !!p.concepts?.some(c => ["entfremdung", "echo-kammer", "spannung", "unverfuegbarkeit"].includes(c)) },
];

// Deterministische Fragment-Anordnung pro Seite — Position, Rotation, Größe
function bookFragmentLayout(
  philosophers: Philosopher[],
  pageWidthPct: number,
  pageHeightPct: number,
  seed: number,
): Map<string, { x: number; y: number; rotation: number; size: number }> {
  const map = new Map<string, { x: number; y: number; rotation: number; size: number }>();
  // Reuse constellationRng pattern
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  philosophers.forEach(p => {
    // Streuung in einem Raster mit jitter, damit Fragmente sich überlagern aber lesbar bleiben
    const x = 8 + rng() * (pageWidthPct - 16);   // % der Seite, mit Rand
    const y = 8 + rng() * (pageHeightPct - 12);
    const rotation = (rng() - 0.5) * 14;          // -7° bis +7°
    const size = 0.9 + rng() * 0.5;               // 0.9 bis 1.4 em base
    map.set(p.id, { x, y, rotation, size });
  });
  return map;
}

function BookView({ allPhilosophers, selectedId, onSelect, traditionFilter, c, isMobile, isDark }: {
  allPhilosophers: Philosopher[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  traditionFilter: TraditionId | "all";
  c: Palette;
  isMobile: boolean;
  isDark: boolean;
}) {
  const [theme, setTheme] = useState<string>("all");

  // Aufteilung: links Philosophen (alles außer wissenschaft), rechts Wissenschaftler
  const leftPagePhils = useMemo(
    () => allPhilosophers.filter(p => p.tradition !== "wissenschaft" && p.signaturePhrase),
    [allPhilosophers]
  );
  const rightPagePhils = useMemo(
    () => allPhilosophers.filter(p => p.tradition === "wissenschaft" && p.signaturePhrase),
    [allPhilosophers]
  );

  // Fragment-Layout je Seite — deterministisch via Seed
  const leftLayout = useMemo(() => bookFragmentLayout(leftPagePhils, 100, 100, 1337), [leftPagePhils]);
  const rightLayout = useMemo(() => bookFragmentLayout(rightPagePhils, 100, 100, 4242), [rightPagePhils]);

  const themeMatcher = BOOK_THEMES.find(t => t.id === theme) ?? BOOK_THEMES[0];
  const isMatch = (p: Philosopher) => {
    if (traditionFilter !== "all" && p.tradition !== traditionFilter) return false;
    return themeMatcher.matches(p);
  };

  // Buchaufschlag-Farben — Pergament hell/dunkel
  const pageBg = isDark ? "#1a1612" : "#f5efe2";
  const pageInk = isDark ? "#c8c2b4" : "#3a3530";
  const inkDim = isDark ? "#5a5040" : "#8a7a60";
  const spineColor = isDark ? "#0a0805" : "#a8966a";

  return (
    <div style={{
      position: "relative",
      height: "100%", minHeight: 600,
      background: isDark ? "#0a0805" : "#d4c8a0",
      border: `1px solid ${c.border}`,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Themen-Toggle-Leiste */}
      <div style={{
        display: "flex", gap: "0.3rem",
        flexWrap: isMobile ? "nowrap" : "wrap",
        overflowX: isMobile ? "auto" : "visible",
        padding: "0.5rem 0.7rem",
        background: isDark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.2)",
        borderBottom: `1px solid ${c.border}`,
      }}>
        {BOOK_THEMES.map(t => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              style={{
                fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
                color: active ? "#080808" : pageInk,
                background: active ? "#c4a882" : "none",
                border: `1px solid ${active ? "#c4a882" : inkDim}`,
                padding: "0.4rem 0.65rem", cursor: "pointer", minHeight: 32,
                whiteSpace: "nowrap", flexShrink: 0,
              }}
            >{t.label}</button>
          );
        })}
      </div>

      {/* Buch-Aufschlag */}
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 14px 1fr",
        gridTemplateRows: isMobile ? "auto auto" : "1fr",
        gap: 0,
        overflow: isMobile ? "auto" : "hidden",
        background: pageBg,
        position: "relative",
      }}>
        {/* Linke Seite — Philosophen */}
        <BookPage
          philosophers={leftPagePhils}
          layout={leftLayout}
          isMatch={isMatch}
          selectedId={selectedId}
          onSelect={onSelect}
          title="Philosophen"
          pageInk={pageInk}
          inkDim={inkDim}
        />

        {/* Buchnaht — nur Desktop */}
        {!isMobile && (
          <div style={{
            background: spineColor,
            boxShadow: isDark
              ? "inset 5px 0 8px -3px rgba(0,0,0,0.6), inset -5px 0 8px -3px rgba(0,0,0,0.6)"
              : "inset 5px 0 8px -3px rgba(80,60,30,0.4), inset -5px 0 8px -3px rgba(80,60,30,0.4)",
          }} />
        )}
        {/* Mobile Naht: oberhalb der rechten Seite eine horizontale Linie */}
        {isMobile && (
          <div style={{
            height: 12, background: spineColor,
            boxShadow: isDark
              ? "inset 0 5px 8px -3px rgba(0,0,0,0.6), inset 0 -5px 8px -3px rgba(0,0,0,0.6)"
              : "inset 0 5px 8px -3px rgba(80,60,30,0.4), inset 0 -5px 8px -3px rgba(80,60,30,0.4)",
          }} />
        )}

        {/* Rechte Seite — Wissenschaftler */}
        <BookPage
          philosophers={rightPagePhils}
          layout={rightLayout}
          isMatch={isMatch}
          selectedId={selectedId}
          onSelect={onSelect}
          title="Wissenschaftler"
          pageInk={pageInk}
          inkDim={inkDim}
        />
      </div>

      {/* Hint */}
      <div style={{
        position: "absolute", top: "0.6rem", right: "0.6rem",
        fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em", color: inkDim,
        background: isDark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.5)",
        padding: "0.3rem 0.5rem",
        border: `1px solid ${inkDim}`,
        pointerEvents: "none",
      }}>
        wähle ein Thema · die Stimmen treten hervor
      </div>
    </div>
  );
}

function BookPage({ philosophers, layout, isMatch, selectedId, onSelect, title, pageInk, inkDim }: {
  philosophers: Philosopher[];
  layout: Map<string, { x: number; y: number; rotation: number; size: number }>;
  isMatch: (p: Philosopher) => boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  title: string;
  pageInk: string;
  inkDim: string;
}) {
  return (
    <div style={{
      position: "relative",
      padding: "1.2rem 1.5rem",
      minHeight: 500,
      overflow: "hidden",
    }}>
      {/* Seitenkopf */}
      <div style={{
        fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase",
        color: inkDim, marginBottom: "0.5rem",
        position: "relative", zIndex: 10,
      }}>
        — {title} —
      </div>

      {/* Fragmente */}
      <div style={{ position: "relative", minHeight: "calc(100% - 30px)" }}>
        {philosophers.map(p => {
          const pos = layout.get(p.id);
          if (!pos || !p.signaturePhrase) return null;
          const match = isMatch(p);
          const isSelected = selectedId === p.id;
          const isOnPath = PFAD_SET.has(p.id);
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              title={`${p.name} (${p.born}${p.died ? `–${p.died}` : "*"})`}
              style={{
                position: "absolute",
                left: `${pos.x}%`, top: `${pos.y}%`,
                transform: `translate(-50%, -50%) rotate(${pos.rotation}deg) scale(${match ? pos.size + (isSelected ? 0.2 : 0) : pos.size * 0.85})`,
                background: "none", border: "none", padding: "0.3rem 0.5rem",
                cursor: "pointer",
                fontFamily: "'Caveat', 'Cormorant Garamond', cursive",
                fontSize: "1.15rem",
                color: pageInk,
                opacity: match ? (isSelected ? 1 : isOnPath ? 0.95 : 0.85) : 0.18,
                textAlign: "left",
                lineHeight: 1.25,
                maxWidth: "220px",
                whiteSpace: "normal",
                fontWeight: isOnPath ? 600 : 400,
                transition: "opacity 0.4s ease, transform 0.4s ease",
                zIndex: isSelected ? 50 : isOnPath ? 20 : match ? 10 : 1,
                textShadow: isSelected ? "0 0 8px rgba(196,168,130,0.5)" : "none",
              }}
            >
              "{p.signaturePhrase}"
              <span style={{
                display: "block",
                fontFamily: "'Cormorant Garamond', serif",
                fontStyle: "italic",
                fontSize: "0.65rem",
                color: inkDim,
                marginTop: "0.15rem",
              }}>— {p.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Roots-View (Wurzelgeflecht) ──────────────────────────────────────────
//
// Zentrales Thema (Resonanzvernunft) als Stamm oben, von dem aus acht
// Hauptwurzeln die Traditionen darstellen. Philosophen sitzen als Knoten
// entlang ihrer Tradition-Wurzel; chronologisch geordnet — älteste an
// der Wurzelspitze (unten), jüngste nahe am Stamm.

function rootBezier(fromX: number, fromY: number, toX: number, toY: number): string {
  const midY = fromY + (toY - fromY) * 0.45;
  const cp1 = `${fromX},${midY}`;
  const cp2 = `${toX},${fromY + (toY - fromY) * 0.75}`;
  return `M ${fromX} ${fromY} C ${cp1} ${cp2} ${toX} ${toY}`;
}

function pointOnCubicBezier(
  fromX: number, fromY: number,
  cp1x: number, cp1y: number,
  cp2x: number, cp2y: number,
  toX: number, toY: number,
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  const x = u * u * u * fromX + 3 * u * u * t * cp1x + 3 * u * t * t * cp2x + t * t * t * toX;
  const y = u * u * u * fromY + 3 * u * u * t * cp1y + 3 * u * t * t * cp2y + t * t * t * toY;
  return { x, y };
}

function RootsView({ philosophers, allPhilosophers, selectedId, onSelect, showPath, c, isDark }: {
  philosophers: Philosopher[];
  allPhilosophers: Philosopher[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showPath: boolean;
  c: Palette;
  isDark: boolean;
}) {
  const W = 1000, H = 800;
  const TRUNK_TOP = 0;
  const TRUNK_BOTTOM = 130;
  const TRUNK_X = 500;
  const visibleIds = new Set(philosophers.map(p => p.id));
  const selectedPhil = selectedId ? allPhilosophers.find(p => p.id === selectedId) : null;
  const [hoverRoot, setHoverRoot] = useState<TraditionId | null>(null);

  const rootTargets = useMemo(() => {
    const map = new Map<TraditionId, { x: number; y: number }>();
    TRADITIONS_ORDERED.forEach((t, i) => {
      const x = 60 + (i / Math.max(TRADITIONS_ORDERED.length - 1, 1)) * (W - 120);
      const y = H - 40;
      map.set(t.id, { x, y });
    });
    return map;
  }, []);

  const byTradition = useMemo(() => {
    const map = new Map<TraditionId, Philosopher[]>();
    for (const p of allPhilosophers) {
      const arr = map.get(p.tradition) ?? [];
      arr.push(p);
      map.set(p.tradition, arr);
    }
    map.forEach((arr: Philosopher[]) => arr.sort((a, b) => a.born - b.born));
    return map;
  }, [allPhilosophers]);

  const philosopherPos = useMemo(() => {
    const map = new Map<string, { x: number; y: number; tradition: TraditionId }>();
    TRADITIONS_ORDERED.forEach(t => {
      const target = rootTargets.get(t.id);
      const list = byTradition.get(t.id) ?? [];
      if (!target || list.length === 0) return;
      const midY = TRUNK_BOTTOM + (target.y - TRUNK_BOTTOM) * 0.45;
      const cp1x = TRUNK_X, cp1y = midY;
      const cp2x = target.x, cp2y = TRUNK_BOTTOM + (target.y - TRUNK_BOTTOM) * 0.75;
      list.forEach((p, i) => {
        const tParam = list.length === 1
          ? 0.6
          : 0.95 - (i / Math.max(list.length - 1, 1)) * 0.7;
        const point = pointOnCubicBezier(TRUNK_X, TRUNK_BOTTOM, cp1x, cp1y, cp2x, cp2y, target.x, target.y, tParam);
        map.set(p.id, { x: point.x, y: point.y, tradition: t.id });
      });
    });
    return map;
  }, [byTradition, rootTargets]);

  const crossRoots = selectedPhil
    ? [
        ...(selectedPhil.receives ?? []).map(id => ({ id, type: "receives" as const })),
        ...(selectedPhil.critiques ?? []).map(id => ({ id, type: "critiques" as const })),
      ]
    : [];

  const bgColor = isDark ? "#0c0a08" : "#f0ebe2";
  const trunkColor = isDark ? "#6a5034" : "#7a6a52";
  const trunkDarker = isDark ? "#3a2a1c" : "#5a4a32";

  return (
    <div style={{
      position: "relative",
      height: "100%", minHeight: 600,
      background: bgColor,
      border: `1px solid ${c.border}`,
      overflow: "hidden",
    }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <defs>
          <linearGradient id="trunk-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={trunkDarker} />
            <stop offset="100%" stopColor={trunkColor} />
          </linearGradient>
          <filter id="root-glow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Stamm */}
        <rect x={TRUNK_X - 28} y={TRUNK_TOP} width={56} height={TRUNK_BOTTOM} fill="url(#trunk-gradient)" />
        <line x1={TRUNK_X - 12} y1={20} x2={TRUNK_X - 8} y2={TRUNK_BOTTOM - 20} stroke={trunkDarker} strokeWidth="0.7" opacity="0.6" />
        <line x1={TRUNK_X + 5} y1={10} x2={TRUNK_X + 9} y2={TRUNK_BOTTOM - 10} stroke={trunkDarker} strokeWidth="0.6" opacity="0.6" />
        <text
          x={TRUNK_X} y={TRUNK_BOTTOM / 2 + 5}
          textAnchor="middle"
          fontFamily={MONO}
          fontSize="11"
          fill={isDark ? "#c8c2b4" : "#fff"}
          fontWeight={600}
          style={{ letterSpacing: "0.15em", textTransform: "uppercase" }}
        >
          Resonanzvernunft
        </text>
        <ellipse cx={TRUNK_X} cy={TRUNK_BOTTOM} rx={44} ry={12} fill={trunkColor} />

        {/* Hauptwurzeln */}
        {TRADITIONS_ORDERED.map(t => {
          const target = rootTargets.get(t.id);
          if (!target) return null;
          const list = byTradition.get(t.id) ?? [];
          const isHover = hoverRoot === t.id;
          const tradColor = t.color;
          const path = rootBezier(TRUNK_X, TRUNK_BOTTOM, target.x, target.y);
          const tipR = 4 + Math.min(list.length, 4);
          return (
            <g key={t.id}
               onMouseEnter={() => setHoverRoot(t.id)}
               onMouseLeave={() => setHoverRoot(null)}
               style={{ cursor: "pointer" }}
            >
              <path
                d={path}
                stroke={tradColor}
                strokeWidth={isHover ? 3.2 : 2}
                fill="none"
                opacity={isHover ? 0.95 : 0.55}
                strokeLinecap="round"
              />
              <circle
                cx={target.x} cy={target.y} r={tipR}
                fill={tradColor}
                opacity={isHover ? 0.95 : 0.7}
              />
              <text
                x={target.x}
                y={target.y + tipR + 14}
                textAnchor="middle"
                fontFamily={MONO}
                fontSize="9"
                fill={tradColor}
                opacity={0.85}
                style={{ letterSpacing: "0.1em", textTransform: "uppercase", pointerEvents: "none" }}
              >
                {t.name.length > 16 ? t.name.slice(0, 14) + "…" : t.name}
              </text>
            </g>
          );
        })}

        {/* Cross-Wurzeln */}
        {crossRoots.map((link, i) => {
          const fromPos = selectedPhil ? philosopherPos.get(selectedPhil.id) : null;
          const toPos = philosopherPos.get(link.id);
          if (!fromPos || !toPos) return null;
          const midX = (fromPos.x + toPos.x) / 2;
          const midY = Math.max(fromPos.y, toPos.y) + 60;
          const d = `M ${fromPos.x} ${fromPos.y} Q ${midX} ${midY} ${toPos.x} ${toPos.y}`;
          return (
            <path
              key={i}
              d={d}
              stroke={link.type === "receives" ? "#c4a882" : "#c48282"}
              strokeWidth="1"
              strokeDasharray={link.type === "receives" ? "4,2" : "2,2"}
              fill="none"
              opacity="0.55"
            />
          );
        })}

        {/* Philosophen-Knoten */}
        {allPhilosophers.map(p => {
          const pos = philosopherPos.get(p.id);
          if (!pos) return null;
          const isVisible = visibleIds.has(p.id);
          const isSelected = selectedId === p.id;
          const isOnPath = showPath && PFAD_SET.has(p.id);
          const isConnected = selectedPhil && (
            selectedPhil.receives?.includes(p.id) || selectedPhil.critiques?.includes(p.id)
          );
          const tradColor = TRADITIONS.find(t => t.id === p.tradition)?.color ?? c.accent;
          const r = isSelected ? 7 : isOnPath ? 6 : isConnected ? 5.5 : 4.5;
          const labelColor = isDark
            ? (isSelected || isOnPath ? "#e8e2d4" : "#a8a29e")
            : (isSelected || isOnPath ? "#1c1917" : "#5a5040");

          return (
            <g key={p.id} opacity={isVisible ? 1 : 0.2} style={{ cursor: isVisible ? "pointer" : "default" }}>
              <circle cx={pos.x} cy={pos.y} r={14} fill="transparent" onClick={() => isVisible && onSelect(p.id)} />
              <circle
                cx={pos.x} cy={pos.y} r={r}
                fill={tradColor}
                stroke={isSelected ? labelColor : isOnPath ? "#c4a882" : "none"}
                strokeWidth={isSelected ? 2 : isOnPath ? 1.5 : 0}
                filter={isSelected || isOnPath ? "url(#root-glow)" : undefined}
                style={{ pointerEvents: "none" }}
              />
              <text
                x={pos.x + r + 4}
                y={pos.y + 3}
                fontFamily={SERIF}
                fontSize={isOnPath ? 11 : 10}
                fill={labelColor}
                fontStyle="italic"
                fontWeight={isOnPath || isSelected ? 600 : 400}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {p.name.split(" ").slice(-1)[0]}
              </text>
              <title>{p.name} ({p.born}{p.died ? `–${p.died}` : "*"})</title>
            </g>
          );
        })}
      </svg>

      <div style={{
        position: "absolute", top: "0.6rem", left: "0.6rem",
        fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.08em",
        color: isDark ? "#888" : "#5a5040",
        background: isDark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.6)",
        padding: "0.3rem 0.5rem",
        border: `1px solid ${c.border}`,
      }}>
        Resonanzvernunft als Stamm · acht Wurzel-Strömungen · Philosophen als Knoten
      </div>
      {selectedPhil && (
        <div style={{
          position: "absolute", bottom: "0.5rem", right: "0.5rem",
          fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.05em",
          color: isDark ? "#888" : "#5a5040",
          background: isDark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.6)",
          padding: "0.3rem 0.5rem",
          border: `1px solid ${c.border}`,
        }}>
          ─ ─ rezipiert · ┄┄ kritisiert
        </div>
      )}
    </div>
  );
}

