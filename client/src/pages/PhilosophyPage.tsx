/**
 * PhilosophyPage (/philosophie) — vertikaler Zeitstrahl mit Detail-Panel,
 * der die philosophische Verortung von Resonanzvernunft sichtbar macht.
 *
 * Layout:
 *   Desktop: links Zeitstrahl (40%), rechts Detail-Panel (60%)
 *   Mobile:  Zeitstrahl oben, Detail unten (gestapelt)
 *
 * Interaktion:
 *   Klick auf Philosophen → Detail-Panel füllt sich
 *   Resonanzvernunft-Pfad ist als Highlight-Linie sichtbar
 *   Tradition-Bänder im Hintergrund des Strahls
 */
import { useMemo, useState } from "react";
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

function yearToY(year: number): number {
  return ((year - TIMELINE_FROM) / (TIMELINE_TO - TIMELINE_FROM)) * 100;
}

export default function PhilosophyPage() {
  const isDark = useEbookTheme();
  const C = isDark ? C_DARK : C_LIGHT;
  const sorted = useMemo(() => philosophersByBirth(), []);
  const [selectedId, setSelectedId] = useState<string>("rosa");
  const [traditionFilter, setTraditionFilter] = useState<TraditionId | "all">("all");
  const [showPath, setShowPath] = useState(true);

  const selected = selectedId ? getPhilosopher(selectedId) : null;
  const visible = traditionFilter === "all"
    ? sorted
    : sorted.filter(p => p.tradition === traditionFilter);

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
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: "1.5rem 1rem", maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: SERIF, fontSize: "1.8rem", fontStyle: "italic", color: C.textBright, margin: 0, fontWeight: 400 }}>
              Philosophische Karte
            </h1>
            <p style={{ fontStyle: "italic", fontSize: "0.9rem", color: C.textDim, margin: "0.3rem 0 0 0" }}>
              Resonanzvernunft im Geflecht ihrer Vorgänger, Zeitgenossen und wissenschaftlichen Anschlüsse.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "baseline", flexWrap: "wrap" }}>
            <Link href="/" style={{ color: C.accent, fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", textDecoration: "none" }}>← Zum Werk</Link>
            <Link href="/resonanzen" style={{ color: C.accent, fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", textDecoration: "none" }}>Kollektives Wissen</Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "1rem", display: "grid", gridTemplateColumns: "minmax(280px, 40%) 1fr", gap: "1.5rem" }}>
        {/* ─── Zeitstrahl ─── */}
        <section style={{ minHeight: 600 }}>
          {/* Filter-Leiste: Traditionen */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: "0.8rem" }}>
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

          {/* Pfad-Toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.8rem", fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showPath}
              onChange={e => setShowPath(e.target.checked)}
              style={{ accentColor: C.accent }}
            />
            Resonanzvernunft-Pfad hervorheben
          </label>

          {/* Vertical Timeline */}
          <Timeline
            philosophers={visible}
            allPhilosophers={sorted}
            selectedId={selectedId}
            onSelect={setSelectedId}
            showPath={showPath}
            c={C}
          />
        </section>

        {/* ─── Detail-Panel ─── */}
        <section style={{ minHeight: 600 }}>
          {selected ? (
            <PhilosopherDetail philosopher={selected} c={C} onSelect={setSelectedId} />
          ) : (
            <div style={{ padding: "2rem", color: C.textDim, fontStyle: "italic", textAlign: "center" }}>
              Wähle einen Philosophen aus dem Zeitstrahl.
            </div>
          )}
        </section>
      </main>

      {/* ─── Wissenschaftliche Anschlüsse als Footer-Sektion ─── */}
      <section style={{ maxWidth: 1400, margin: "2rem auto 0", padding: "1.5rem 1rem 4rem", borderTop: `1px solid ${C.border}` }}>
        <h2 style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.18em", color: C.muted, textTransform: "uppercase", marginBottom: "1rem", fontWeight: 400 }}>
          Wissenschaftliche Anschlüsse
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
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

      {/* Mobile-Anpassung — Grid-Spalten kollabieren */}
      <style>{`
        @media (max-width: 768px) {
          [data-scroll] main { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────

function FilterPill({ active, label, color, onClick }: { active: boolean; label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase",
        color: active ? "#080808" : color,
        background: active ? color : "none",
        border: `1px solid ${color}`,
        padding: "0.35rem 0.55rem", cursor: "pointer", minHeight: 28,
      }}
    >{label}</button>
  );
}

function Timeline({ philosophers, allPhilosophers, selectedId, onSelect, showPath, c }: {
  philosophers: Philosopher[];
  allPhilosophers: Philosopher[];
  selectedId: string;
  onSelect: (id: string) => void;
  showPath: boolean;
  c: Palette;
}) {
  // SVG-Koordinaten: ViewBox 100 breit, 100 hoch (in % der Spanne)
  // Umsetzung als positionierte HTML-Elemente, damit Klicks robust sind
  const visibleIds = new Set(philosophers.map(p => p.id));

  // Pfad als Polyline: von oben nach unten durch die Pfad-IDs
  const pathPoints = RESONANZVERNUNFT_PFAD
    .map(id => allPhilosophers.find(p => p.id === id))
    .filter((p): p is Philosopher => !!p)
    .map(p => ({ id: p.id, y: yearToY(p.born) }));

  return (
    <div style={{ position: "relative", height: "calc(100vh - 240px)", minHeight: 600, background: c.surface, border: `1px solid ${c.border}`, padding: "1rem 0.8rem 1rem 4rem", overflow: "hidden" }}>
      {/* Tradition-Bänder (Hintergrund) */}
      {TRADITIONS.map(t => {
        const yFrom = Math.max(0, yearToY(t.spanFrom));
        const yTo = Math.min(100, yearToY(t.spanTo));
        return (
          <div
            key={t.id}
            style={{
              position: "absolute", left: 60, right: 0,
              top: `${yFrom}%`, height: `${yTo - yFrom}%`,
              background: t.color,
              opacity: 0.08,
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

      {/* Resonanzvernunft-Pfad als verbindende Linie */}
      {showPath && pathPoints.length > 1 && (
        <svg
          style={{ position: "absolute", left: 50, top: 0, bottom: 0, width: 30, height: "100%", pointerEvents: "none" }}
          preserveAspectRatio="none" viewBox="0 0 30 100"
        >
          <polyline
            points={pathPoints.map(p => `15,${p.y}`).join(" ")}
            fill="none"
            stroke={c.accent}
            strokeWidth="1.2"
            strokeDasharray="2,1.5"
            opacity="0.65"
          />
        </svg>
      )}

      {/* Philosophen als Punkte + Labels */}
      {allPhilosophers.map(p => {
        const tradColor = getTradition(p.tradition)?.color ?? c.accent;
        const isVisible = visibleIds.has(p.id);
        const isSelected = selectedId === p.id;
        const isOnPath = showPath && PFAD_SET.has(p.id);
        const y = yearToY(p.born);
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            disabled={!isVisible}
            title={`${p.name} (${p.born}${p.died ? `–${p.died}` : "*"})`}
            style={{
              position: "absolute",
              left: 50, top: `${y}%`,
              transform: "translateY(-50%)",
              display: "flex", alignItems: "center", gap: "0.4rem",
              padding: "0.15rem 0.4rem 0.15rem 0",
              background: isSelected ? tradColor : "none",
              border: "none",
              cursor: isVisible ? "pointer" : "default",
              opacity: isVisible ? 1 : 0.2,
              fontFamily: SERIF, fontStyle: "italic",
              fontSize: isOnPath ? "0.85rem" : "0.78rem",
              color: isSelected ? "#080808" : isOnPath ? tradColor : c.text,
              fontWeight: isOnPath ? 500 : 400,
              minHeight: 24,
              maxWidth: "calc(100% - 50px)",
              textAlign: "left",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            <span style={{
              display: "inline-block",
              width: isOnPath ? 9 : 7, height: isOnPath ? 9 : 7,
              background: tradColor,
              borderRadius: "50%",
              flexShrink: 0,
              border: isOnPath ? `1.5px solid ${c.accent}` : "none",
            }} />
            <span>{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function PhilosopherDetail({ philosopher, c, onSelect }: { philosopher: Philosopher; c: Palette; onSelect: (id: string) => void }) {
  const tradition = getTradition(philosopher.tradition);
  const tradColor = tradition?.color ?? c.accent;
  const lifespan = `${philosopher.born}${philosopher.died ? `–${philosopher.died}` : "*"}`;
  const isOnPath = PFAD_SET.has(philosopher.id);

  return (
    <article style={{ background: c.surface, border: `1px solid ${c.border}`, padding: "1.5rem 1.6rem" }}>
      {/* Header */}
      <header style={{ marginBottom: "1.2rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", flexWrap: "wrap", marginBottom: "0.5rem" }}>
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
        <h2 style={{ fontFamily: SERIF, fontSize: "2rem", fontStyle: "italic", color: c.textBright, margin: 0, fontWeight: 400 }}>
          {philosopher.name}
        </h2>
        <div style={{ fontFamily: MONO, fontSize: "0.7rem", color: c.muted, marginTop: "0.2rem" }}>
          {lifespan}
        </div>
      </header>

      {/* Resonanz-Note */}
      <div style={{ marginBottom: "1.4rem", padding: "0.8rem 1rem", background: c.deep, border: `1px solid ${c.border}`, borderLeft: `3px solid ${tradColor}` }}>
        <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.15em", textTransform: "uppercase", color: c.muted, marginBottom: "0.4rem" }}>
          Bezug zu Resonanzvernunft
        </div>
        <p style={{ fontFamily: SERIF, fontSize: "0.95rem", color: c.text, lineHeight: 1.55, margin: 0, fontStyle: "italic" }}>
          {philosopher.resonanzNote}
        </p>
      </div>

      {/* Werke */}
      <div style={{ marginBottom: "1.2rem" }}>
        <div style={{ fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.15em", textTransform: "uppercase", color: c.muted, marginBottom: "0.5rem" }}>
          Hauptwerke
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          {philosopher.keyWorks.map((w, i) => (
            <li key={i} style={{ fontFamily: SERIF, fontSize: "0.85rem", color: c.text, lineHeight: 1.4 }}>
              <em>{w.title}</em>
              <span style={{ fontFamily: MONO, fontSize: "0.6rem", color: c.muted, marginLeft: "0.5rem" }}>{w.year}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Verbindungen */}
      {(philosopher.receives?.length || philosopher.critiques?.length) ? (
        <div style={{ marginBottom: "1.2rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.8rem" }}>
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

      {/* Wissenschaftliche Anschlüsse */}
      {philosopher.scienceLinks && philosopher.scienceLinks.length > 0 && (
        <div>
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
        padding: "0.2rem 0", cursor: "pointer", textAlign: "left",
        textDecoration: "underline", textUnderlineOffset: "0.2em",
      }}
    >
      → {p.name}
    </button>
  );
}
