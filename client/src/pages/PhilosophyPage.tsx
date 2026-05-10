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

type ViewMode = "timeline" | "network";

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

  const [selectedId, setSelectedId] = useState<string | null>(null);
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
          ) : (
            <NetworkView
              philosophers={visible}
              allPhilosophers={sorted}
              selectedId={selectedId}
              onSelect={id => { setSelectedId(id); setPathPlaying(false); }}
              showPath={showPath}
              c={C}
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
