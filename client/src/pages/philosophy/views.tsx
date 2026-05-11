/**
 * views.tsx — alle Visualisierungs-Sichten der Philosophischen Karte.
 *
 *   Timeline     — vertikaler Zeitstrahl
 *   NetworkView  — stratifiziertes Netz
 *   Constellation — Sternenhimmel mit Konstellationen
 *   Spotlight    — Lichtstrahl über Themenleiste
 *   BookView     — aufgeschlagenes Buch der Stimmen
 *   RootsView    — Resonanzvernunft als Stamm + Wurzelgeflecht
 *   RiverView    — Flussdelta
 *
 * Plus: ToolbarBtn, FilterPill, navLinkStyle, PhilosopherDetail,
 * ConnectionLink, BottomSheet — gemeinsam genutzte UI-Bausteine.
 *
 * Gemeinsame Konstanten / Helpers liegen in shared.ts.
 */
import { useEffect, useMemo, useState } from "react";
import {
  TRADITIONS, SCIENCE_LINKS,
  RESONANZVERNUNFT_PFAD, POSITION_LABEL,
  getPhilosopher, getTradition, getScienceLink,
  type Philosopher, type TraditionId,
} from "@/data/philosophyMap";
import {
  SERIF, MONO, TIMELINE_FROM, TIMELINE_TO, PFAD_SET,
  TRADITIONS_ORDERED, TRADITION_INDEX,
  yearToY, pointOnCubicBezier, seededRng,
  type Palette,
} from "./shared";
import { SERIF_BODY } from "@/lib/theme";
import { useInteractiveCanvas } from "@/hooks/useInteractiveCanvas";

export function ToolbarBtn({ active, label, onClick, c }: { active: boolean; label: string; onClick: () => void; c: Palette }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
        color: active ? "#080808" : c.text,
        background: active ? c.accent : "none",
        border: "none",
        padding: "0.5rem 0.75rem", cursor: "pointer",
        minHeight: 36,
        whiteSpace: "nowrap",
        flexShrink: 0,
        transition: "all 0.15s",
      }}
    >{label}</button>
  );
}

export function FilterPill({ active, label, color, onClick }: { active: boolean; label: string; color: string; onClick: () => void }) {
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

export function navLinkStyle(c: Palette): React.CSSProperties {
  return { color: c.accent, fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", textDecoration: "none" };
}

// ─── Timeline-View ─────────────────────────────────────────────────────────

export function Timeline({ philosophers, allPhilosophers, selectedId, onSelect, showPath, c, isMobile }: {
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

  // Y-Position pro Philosoph mit Kollisions-Vermeidung:
  // Bei nah beieinander liegenden Geburtsjahren (z.B. Hegel 1770 + Schelling
  // 1775) würden die Labels überlappen. Lösung: chronologisch sortieren,
  // dann jeden Label um mindestens MIN_GAP% nach unten schieben, falls
  // der Vorgänger zu nah ist. Chronologie bleibt erhalten, Lesbarkeit auch.
  const adjustedY = useMemo(() => {
    const MIN_GAP = 2.6;  // % der Strahl-Höhe (entspricht ~16px auf 600px)
    const sorted = [...allPhilosophers].sort((a, b) => a.born - b.born);
    const map = new Map<string, number>();
    let lastY = -Infinity;
    for (const p of sorted) {
      const raw = yearToY(p.born);
      const y = Math.max(raw, lastY + MIN_GAP);
      map.set(p.id, y);
      lastY = y;
    }
    return map;
  }, [allPhilosophers]);
  const yOf = (id: string, fallbackYear: number) => adjustedY.get(id) ?? yearToY(fallbackYear);

  const pathPoints = RESONANZVERNUNFT_PFAD
    .map(id => allPhilosophers.find(p => p.id === id))
    .filter((p): p is Philosopher => !!p)
    .map(p => ({ id: p.id, y: yOf(p.id, p.born) }));

  // Connection-Linien: receives + critiques des selektierten Philosophen
  const connectionsFromSelected: Array<{ to: Philosopher; type: "receives" | "critiques"; y1: number; y2: number; }> = [];
  if (selectedPhil) {
    const fromY = yOf(selectedPhil.id, selectedPhil.born);
    for (const id of selectedPhil.receives ?? []) {
      const target = allPhilosophers.find(p => p.id === id);
      if (target) connectionsFromSelected.push({ to: target, type: "receives", y1: fromY, y2: yOf(target.id, target.born) });
    }
    for (const id of selectedPhil.critiques ?? []) {
      const target = allPhilosophers.find(p => p.id === id);
      if (target) connectionsFromSelected.push({ to: target, type: "critiques", y1: fromY, y2: yOf(target.id, target.born) });
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
        const y = yOf(p.id, p.born);
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

  // Kollisionsvermeidung innerhalb der Spalte: aufeinanderfolgende
  // Philosophen mit nahem Geburtsjahr werden um MIN_GAP_Y nach unten
  // geschoben (Pixel — bei H=700 entspricht 20px etwa 11 Jahren).
  const MIN_GAP_Y = 20;
  for (const trad of TRADITIONS_ORDERED) {
    const list = (byTradition[trad.id] ?? []).sort((a, b) => a.born - b.born);
    const colIndex = TRADITION_INDEX[trad.id];
    const x = ((colIndex + 0.5) / nCols) * width;
    let lastY = -Infinity;
    for (const p of list) {
      const raw = ((p.born - TIMELINE_FROM) / (TIMELINE_TO - TIMELINE_FROM)) * height;
      const y = Math.max(raw, lastY + MIN_GAP_Y);
      map.set(p.id, { x, y });
      lastY = y;
    }
  }
  return map;
}

export function NetworkView({ philosophers, allPhilosophers, selectedId, onSelect, showPath, c }: {
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
  const canvas = useInteractiveCanvas({ minZoom: 0.5, maxZoom: 3.0 });

  // Liefert die aktuelle Position eines Knotens — gedraggt > Layout-Default.
  const getPos = (id: string) => {
    const dragged = canvas.nodePos(id);
    if (dragged) return dragged;
    return layout.get(id) ?? null;
  };

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
        style={{
          width: "100%", height: "100%", display: "block",
          cursor: canvas.dragging ? "grabbing" : "grab",
          touchAction: "none",
        }}
        {...canvas.bind}
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

        {/* Hintergrund-Rect — fängt Pan-Klicks auch über leeren Bereichen */}
        <rect x={0} y={0} width={W} height={H} fill="transparent" />

        <g transform={canvas.transform}>

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
          const from = getPos(edge.fromId);
          const to = getPos(edge.toId);
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
          const pos = getPos(p.id);
          if (!pos) return null;
          const isVisible = visibleIds.has(p.id);
          const isSelected = selectedId === p.id;
          const isOnPath = showPath && PFAD_SET.has(p.id);
          const tradColor = getTradition(p.tradition)?.color ?? c.accent;
          const r = isOnPath ? 7 : isSelected ? 8 : 5;
          const handleClick = () => {
            if (canvas.justDragged()) return;
            if (isVisible) onSelect(p.id);
          };
          const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
            if (!isVisible) return;
            canvas.startNodeDrag(e, p.id, pos);
          };

          return (
            <g key={p.id} opacity={isVisible ? 1 : 0.2}>
              <circle
                cx={pos.x} cy={pos.y} r={r}
                fill={tradColor}
                stroke={isSelected ? c.textBright : isOnPath ? c.accent : "none"}
                strokeWidth={isSelected ? 2.5 : isOnPath ? 1.8 : 0}
                style={{ cursor: isVisible ? (canvas.draggingNodeId === p.id ? "grabbing" : "grab") : "default" }}
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
                onClick={handleClick}
              />
              {/* unsichtbarer größerer Hit-Bereich für Mobile (≥32 px Tap-Ziel) */}
              <circle
                cx={pos.x} cy={pos.y} r={Math.max(r + 10, 16)}
                fill="transparent"
                style={{ cursor: isVisible ? "grab" : "default" }}
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
                onClick={handleClick}
              />
              <text
                x={pos.x + r + 3}
                y={pos.y + 3}
                fontFamily={SERIF}
                fontSize={isOnPath ? 11 : 10}
                fill={isSelected ? c.textBright : isOnPath ? tradColor : c.text}
                fontStyle="italic"
                fontWeight={isOnPath || isSelected ? 500 : 400}
                style={{ cursor: isVisible ? "pointer" : "default", userSelect: "none", pointerEvents: "none" }}
              >
                {p.name.split(" ").slice(-1)[0]}
              </text>
            </g>
          );
        })}
        </g>
      </svg>

      {/* Inline-Legende */}
      <div style={{
        position: "absolute", top: "0.5rem", right: "0.5rem",
        fontFamily: MONO, fontSize: "0.5rem", letterSpacing: "0.05em", color: c.muted,
        background: c.deep, padding: "0.3rem 0.5rem", border: `1px solid ${c.border}`,
      }}>
        ── rezipiert · ┄┄ kritisiert
      </div>

      {/* Zoom/Reset-Controls */}
      <div style={{
        position: "absolute", bottom: "0.5rem", right: "0.5rem",
        display: "flex", gap: "0.25rem",
      }}>
        <button
          onClick={() => canvas.setZoom(canvas.zoom * 1.2)}
          aria-label="Zoom in"
          style={{ fontFamily: MONO, fontSize: "0.75rem", color: c.text, background: c.deep, border: `1px solid ${c.border}`, width: 28, height: 28, cursor: "pointer", lineHeight: 1 }}
        >+</button>
        <button
          onClick={() => canvas.setZoom(canvas.zoom * 0.83)}
          aria-label="Zoom out"
          style={{ fontFamily: MONO, fontSize: "0.75rem", color: c.text, background: c.deep, border: `1px solid ${c.border}`, width: 28, height: 28, cursor: "pointer", lineHeight: 1 }}
        >−</button>
        <button
          onClick={() => canvas.resetView()}
          aria-label="Ansicht zurücksetzen"
          title="Ansicht zurücksetzen"
          style={{ fontFamily: MONO, fontSize: "0.55rem", color: c.muted, background: c.deep, border: `1px solid ${c.border}`, padding: "0 0.5rem", height: 28, cursor: "pointer", letterSpacing: "0.1em" }}
        >RESET</button>
      </div>
    </div>
  );
}

// ─── Detail-Panel (Inhalt — nutzbar in Side-Panel und Bottom-Sheet) ───────

export function PhilosopherDetail({ philosopher, c, onSelect }: { philosopher: Philosopher; c: Palette; onSelect: (id: string) => void }) {
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
        <p style={{ fontFamily: SERIF_BODY, fontSize: "0.95rem", color: c.text, lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
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
              <span style={{ fontFamily: SERIF_BODY, fontSize: "0.92rem", color: c.text, lineHeight: 1.4, fontStyle: "italic" }}>
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

export function BottomSheet({ philosopher, expanded, onToggle, onClose, onSelect, c }: {
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

export function ConstellationView({ philosophers, allPhilosophers, selectedId, onSelect, showPath, c, pathPlaying, pathStep }: {
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
      const rng = seededRng(seed);
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
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
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
              stroke={link.type === "receives" ? "#f59e0b" : "#c48282"}
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
          const starColor = isSelected ? "#fff" : isOnPath ? "#f59e0b" : isConnected ? "#e8e2d4" : "#c8c2b4";
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
                  stroke="#f59e0b"
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

export function SpotlightView({ philosophers, allPhilosophers, selectedId, onSelect, showPath, c, isMobile }: {
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

  // Vermeide y-Überlappung durch y-Versatz (statt x-Jitter — der reichte
  // bei dichten Clustern wie Habermas/Honneth/Adorno/Ricœur nicht aus).
  // Algorithmus: nach y sortieren, jeden zu nahen Nachfolger so weit nach
  // unten schieben, dass MIN_GAP_Y eingehalten wird. Chronologie verschiebt
  // sich leicht, dafür sind alle Labels lesbar.
  const adjustedPos = useMemo(() => {
    const MIN_GAP_Y = 24;
    const arr = Array.from(philosopherPos.entries()).map(([id, p]) => ({ id, ...p }));
    arr.sort((a, b) => a.y - b.y);
    let lastY = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      const targetY = Math.max(arr[i].y, lastY + MIN_GAP_Y);
      arr[i] = { ...arr[i], y: targetY };
      lastY = targetY;
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
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0" />
            <stop offset="20%" stopColor="#f59e0b" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.05" />
          </linearGradient>
          <radialGradient id="bar-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
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
              <line x1={pos.x} y1={pos.y} x2={pos.x} y2={BAR_Y + BAR_HEIGHT} stroke="#f59e0b" strokeWidth="0.5" opacity="0.7" />
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
          const color = isSpotlight ? "#fff" : isOnPath ? "#f59e0b" : "#c8c2b4";
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
                <circle cx={pos.x} cy={pos.y} r={radius + 3} fill="none" stroke="#f59e0b" strokeWidth="0.4" opacity="0.5" style={{ pointerEvents: "none" }} />
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

export function BookView({ allPhilosophers, selectedId, onSelect, traditionFilter, c, isMobile, isDark }: {
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
                background: active ? "#f59e0b" : "none",
                border: `1px solid ${active ? "#f59e0b" : inkDim}`,
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

      {/* Hint — unten rechts, nicht oben (überlappte sonst die Themen-Toggles) */}
      <div style={{
        position: "absolute", bottom: "0.6rem", right: "0.6rem",
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

export function RootsView({ philosophers, allPhilosophers, selectedId, onSelect, showPath, c, isDark }: {
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
              stroke={link.type === "receives" ? "#f59e0b" : "#c48282"}
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
                stroke={isSelected ? labelColor : isOnPath ? "#f59e0b" : "none"}
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

// ─── River-View (Flussdelta) ──────────────────────────────────────────────
//
// Zentrales Thema als Quell-Strömung oben, fließt nach unten, verzweigt
// sich in feinere Arme (8 Traditionen als Hauptarme). Philosophen sitzen
// als Siedlungen an den Ufern, Konzepte treiben als Glyphen mit der
// Strömung. Animation respektiert prefers-reduced-motion.

export function RiverView({ philosophers, allPhilosophers, selectedId, onSelect, showPath, c, isDark, isMobile }: {
  philosophers: Philosopher[];
  allPhilosophers: Philosopher[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showPath: boolean;
  c: Palette;
  isDark: boolean;
  isMobile?: boolean;
}) {
  const W = 1000, H = 800;
  const SOURCE_BOTTOM = 120;
  const SOURCE_X = 500;
  const visibleIds = new Set(philosophers.map(p => p.id));
  const selectedPhil = selectedId ? allPhilosophers.find(p => p.id === selectedId) : null;
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  // Auch auf Mobile keine Animationen — Performance + Battery
  const reducedMotion = prefersReducedMotion || isMobile === true;

  // Stream-Targets am unteren Rand, leicht ungleichmäßig (organisch)
  const streamTargets = useMemo(() => {
    const map = new Map<TraditionId, { x: number; y: number }>();
    TRADITIONS_ORDERED.forEach((t, i) => {
      const evenX = 80 + (i / Math.max(TRADITIONS_ORDERED.length - 1, 1)) * (W - 160);
      // leichter Versatz für organische Anmutung — deterministisch
      const jitter = ((t.id.charCodeAt(0) * 7) % 40) - 20;
      map.set(t.id, { x: evenX + jitter, y: H - 30 });
    });
    return map;
  }, []);

  // Helper: pro Tradition ein eigener Source-Attach-Punkt entlang des
  // unteren Quellrand-Bereichs — sonst clustern alle ältesten Philosophen
  // (Spinoza/Kant/Husserl/Bergson) am einzigen Source-Punkt.
  function sourceAttachX(trad: TraditionId): number {
    const idx = TRADITIONS_ORDERED.findIndex(t => t.id === trad);
    if (idx < 0) return SOURCE_X;
    const n = TRADITIONS_ORDERED.length;
    return SOURCE_X - 90 + (idx / Math.max(n - 1, 1)) * 180;
  }

  // Stream-Paths: organische Bezier von Quelle zu Target mit zwei Wellen
  const streamPaths = useMemo(() => {
    const map = new Map<TraditionId, string>();
    streamTargets.forEach((target, trad) => {
      const fromX = sourceAttachX(trad);
      const midX = (fromX + target.x) / 2;
      const t1y = SOURCE_BOTTOM + (target.y - SOURCE_BOTTOM) * 0.35;
      const t2y = SOURCE_BOTTOM + (target.y - SOURCE_BOTTOM) * 0.7;
      const sway = ((trad.charCodeAt(0) * 13) % 80) - 40;
      const cp1x = fromX + sway;
      const cp2x = midX - sway / 2;
      map.set(trad, `M ${fromX} ${SOURCE_BOTTOM} C ${cp1x} ${t1y} ${cp2x} ${t2y} ${target.x} ${target.y}`);
    });
    return map;
  }, [streamTargets]);

  // Philosophen-Positionen am Ufer der Stream-Paths
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
    const map = new Map<string, { x: number; y: number; side: "left" | "right" }>();
    TRADITIONS_ORDERED.forEach(trad => {
      const target = streamTargets.get(trad.id);
      const list = byTradition.get(trad.id) ?? [];
      if (!target || list.length === 0) return;
      const fromX = sourceAttachX(trad.id);
      const midX = (fromX + target.x) / 2;
      const t1y = SOURCE_BOTTOM + (target.y - SOURCE_BOTTOM) * 0.35;
      const t2y = SOURCE_BOTTOM + (target.y - SOURCE_BOTTOM) * 0.7;
      const sway = ((trad.id.charCodeAt(0) * 13) % 80) - 40;
      const cp1x = fromX + sway;
      const cp2x = midX - sway / 2;
      list.forEach((p, i) => {
        // tParam-Range verschoben von 0.2..0.85 auf 0.32..0.92 — die
        // ältesten Philosophen sitzen nicht mehr direkt am Quell-Band
        // sondern schon weiter unten, wo sich die Streams räumlich
        // gefächert haben. Vermeidet Cluster oben.
        const tParam = list.length === 1
          ? 0.6
          : 0.32 + (i / Math.max(list.length - 1, 1)) * 0.6;
        const point = pointOnCubicBezier(
          fromX, SOURCE_BOTTOM,
          cp1x, t1y,
          cp2x, t2y,
          target.x, target.y,
          tParam
        );
        const side: "left" | "right" = i % 2 === 0 ? "left" : "right";
        const offset = side === "left" ? -28 : 28;
        map.set(p.id, { x: point.x + offset, y: point.y, side });
      });
    });

    // Zweite Pass: y-Kollisionsvermeidung. Wenn nach dem Layout zwei
    // Philosophen y-Abstand < MIN_GAP haben, schieben wir den jüngeren
    // (= zweiten in chronologischer Order) nach unten. So überschneiden
    // sich die Label-Boxen nicht mehr.
    const MIN_GAP_Y = 26;
    const arr = Array.from(map.entries()).map(([id, p]) => ({ id, ...p }));
    arr.sort((a, b) => a.y - b.y);
    let lastY = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      const adjustedY = Math.max(arr[i].y, lastY + MIN_GAP_Y);
      arr[i] = { ...arr[i], y: adjustedY };
      lastY = adjustedY;
    }
    const adjusted = new Map<string, { x: number; y: number; side: "left" | "right" }>();
    arr.forEach(p => adjusted.set(p.id, { x: p.x, y: p.y, side: p.side }));
    return adjusted;
  }, [byTradition, streamTargets]);

  // Konzept-Glyphen: die häufigsten Konzepte schwimmen die Streams hinunter
  const flowingConcepts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of allPhilosophers) {
      for (const c of p.concepts ?? []) counts[c] = (counts[c] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([id, count]) => ({ id, count }));
  }, [allPhilosophers]);

  const waterDeep = isDark ? "#0a1822" : "#5a8aa8";
  const waterLight = isDark ? "#1a3a5a" : "#a8c8d8";
  const bgColor = isDark ? "#04080c" : "#e8f0f5";
  const settlementBg = isDark ? "#1a1612" : "#fdf8f0";
  const settlementInk = isDark ? "#c8c2b4" : "#3a3530";

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
          <linearGradient id="water-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={waterLight} stopOpacity="0.85" />
            <stop offset="100%" stopColor={waterDeep} stopOpacity="0.65" />
          </linearGradient>
          <linearGradient id="source-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={waterLight} stopOpacity="0.95" />
            <stop offset="100%" stopColor={waterDeep} stopOpacity="0.7" />
          </linearGradient>
          <filter id="river-glow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Per Stream eine Animation-Path für die treibenden Konzepte */}
          {!reducedMotion && Array.from(streamPaths.entries()).map(([trad, path], i) => (
            <path key={trad} id={`flow-${i}`} d={path} fill="none" />
          ))}
        </defs>

        {/* Quelle — breite Strömung oben */}
        <rect x={SOURCE_X - 110} y={0} width={220} height={SOURCE_BOTTOM} fill="url(#source-gradient)" />
        <text
          x={SOURCE_X} y={SOURCE_BOTTOM / 2 + 5}
          textAnchor="middle"
          fontFamily={MONO}
          fontSize="11"
          fill={isDark ? "#e8f0f5" : "#0a1822"}
          fontWeight={600}
          style={{ letterSpacing: "0.15em", textTransform: "uppercase" }}
        >
          Resonanzvernunft
        </text>

        {/* Stream-Pfade — die acht Strömungen */}
        {TRADITIONS_ORDERED.map((t, i) => {
          const path = streamPaths.get(t.id);
          if (!path) return null;
          const list = byTradition.get(t.id) ?? [];
          const width = 8 + Math.min(list.length * 2, 16);
          return (
            <g key={t.id}>
              <path
                d={path}
                stroke="url(#water-gradient)"
                strokeWidth={width}
                fill="none"
                strokeLinecap="round"
                opacity={0.78}
              />
              {/* dezenter Highlight-Stroke */}
              <path
                d={path}
                stroke={waterLight}
                strokeWidth={1}
                fill="none"
                opacity={0.5}
                strokeLinecap="round"
              />
              <text
                x={streamTargets.get(t.id)!.x}
                y={H - 8}
                textAnchor="middle"
                fontFamily={MONO}
                fontSize="9"
                fill={t.color}
                opacity={0.85}
                style={{ letterSpacing: "0.1em", textTransform: "uppercase", pointerEvents: "none" }}
              >
                {t.name.length > 16 ? t.name.slice(0, 14) + "…" : t.name}
              </text>

              {/* Treibende Konzept-Glyphen je Stream — nur bei !reducedMotion */}
              {!reducedMotion && flowingConcepts.slice(i % 3, i % 3 + 2).map((cn, ci) => (
                <text
                  key={`flow-${t.id}-${cn.id}-${ci}`}
                  fontFamily={MONO}
                  fontSize="8"
                  fill={isDark ? "#e8f0f5" : "#1a3a5a"}
                  opacity="0.65"
                  style={{ letterSpacing: "0.05em" }}
                >
                  <textPath href={`#flow-${i}`} startOffset="0%">
                    {cn.id}
                    <animate
                      attributeName="startOffset"
                      from="-5%"
                      to="105%"
                      dur={`${22 + ci * 7 + (i % 3) * 3}s`}
                      repeatCount="indefinite"
                      begin={`${ci * 4 + i * 1.5}s`}
                    />
                  </textPath>
                </text>
              ))}
            </g>
          );
        })}

        {/* Statische Konzept-Glyphen bei reduced motion */}
        {reducedMotion && flowingConcepts.slice(0, 6).map((cn, i) => {
          const x = 100 + (i % 6) * 140;
          const y = 250 + Math.floor(i / 6) * 200;
          return (
            <text key={cn.id} x={x} y={y}
              fontFamily={MONO} fontSize="8"
              fill={isDark ? "#e8f0f5" : "#1a3a5a"}
              opacity="0.5"
              style={{ letterSpacing: "0.05em" }}
            >
              {cn.id}
            </text>
          );
        })}

        {/* Siedlungen (Philosophen) am Ufer */}
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
          const squareSize = isSelected ? 10 : isOnPath ? 9 : 7;
          const labelDX = pos.side === "left" ? -(squareSize + 4) : (squareSize + 4);

          return (
            <g key={p.id} opacity={isVisible ? 1 : 0.2} style={{ cursor: isVisible ? "pointer" : "default" }}>
              <rect
                x={pos.x - 14} y={pos.y - 14}
                width={28} height={28}
                fill="transparent"
                onClick={() => isVisible && onSelect(p.id)}
              />
              {/* Siedlung: kleines Quadrat */}
              <rect
                x={pos.x - squareSize / 2} y={pos.y - squareSize / 2}
                width={squareSize} height={squareSize}
                fill={tradColor}
                stroke={isSelected || isOnPath ? "#f59e0b" : settlementInk}
                strokeWidth={isSelected ? 1.5 : 0.5}
                filter={isSelected || isOnPath || isConnected ? "url(#river-glow)" : undefined}
                style={{ pointerEvents: "none" }}
              />
              <text
                x={pos.x + labelDX}
                y={pos.y + 3}
                textAnchor={pos.side === "left" ? "end" : "start"}
                fontFamily={SERIF}
                fontSize={isOnPath ? 11 : 10}
                fill={settlementInk}
                fontStyle="italic"
                fontWeight={isSelected || isOnPath ? 600 : 400}
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
        Quelle Resonanzvernunft · acht Strömungen · Philosophen als Siedlungen · Konzepte treiben mit
      </div>
    </div>
  );
}
