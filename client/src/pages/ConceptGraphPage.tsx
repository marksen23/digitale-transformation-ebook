import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { NODES, EDGES, CAT_COLOR, CANVAS_W, CANVAS_H, type ConceptNode, type NodeCategory } from "@/data/conceptGraph";

interface ConceptGraphPageProps {
  onClose: () => void;
}

// ─── Style constants (match Enkidu palette) ────────────────────────────────────
const C = {
  void:       "#080808",
  deep:       "#0f0f0f",
  surface:    "#161616",
  border:     "#2a2a2a",
  muted:      "#444",
  textDim:    "#888",
  text:       "#c8c2b4",
  textBright: "#e8e2d4",
  accent:     "#c4a882",
  accentDim:  "#7a6a52",
  serif:      "'EB Garamond', Georgia, serif",
  mono:       "'Courier Prime', 'Courier New', monospace",
} as const;

// ─── Pre-build adjacency index ─────────────────────────────────────────────────
const ADJACENCY = new Map<string, Set<string>>();
for (const node of NODES) ADJACENCY.set(node.id, new Set());
for (const edge of EDGES) {
  ADJACENCY.get(edge.source)?.add(edge.target);
  ADJACENCY.get(edge.target)?.add(edge.source);
}

// Build node lookup
const NODE_MAP = new Map<string, ConceptNode>(NODES.map(n => [n.id, n]));

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ConceptGraphPage({ onClose }: ConceptGraphPageProps) {
  // Pan / Zoom state
  const [pan,  setPan]  = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.0);

  // Interaction state
  const [hoveredId,  setHoveredId]  = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Search + filter
  const [searchQuery, setSearchQuery] = useState("");
  const [hiddenCats, setHiddenCats] = useState<Set<NodeCategory>>(new Set());
  const [legendOpen, setLegendOpen] = useState(false);

  // Touch tracking
  const dragRef      = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const pinchRef     = useRef<number | null>(null); // initial touch distance for pinch
  const hasDraggedRef = useRef(false);              // true if mouse moved ≥ 4 px after mousedown
  const svgRef    = useRef<SVGSVGElement>(null);
  const panRef    = useRef(pan);
  const zoomRef   = useRef(zoom);
  // Sync refs synchronously alongside state updates (avoids stale-ref race via useEffect)
  const setPanSync  = useCallback((p: { x: number; y: number }) => { panRef.current = p;  setPan(p);  }, []);
  const setZoomSync = useCallback((z: number)                   => { zoomRef.current = z; setZoom(z); }, []);

  // Clamp zoom
  const clampZoom = (z: number) => Math.max(0.4, Math.min(2.8, z));

  // ── Pan / Zoom handlers ────────────────────────────────────────────────────
  // onMouseDown lives on the <svg> (not a child rect) so it fires for clicks
  // anywhere — including on node circles, which are siblings of any background rect.
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    hasDraggedRef.current = false;
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: panRef.current.x, py: panRef.current.y };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    // Mark as real drag once threshold exceeded (distinguishes click from drag)
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasDraggedRef.current = true;
    setPanSync({ x: dragRef.current.px + dx, y: dragRef.current.py + dy });
  }, [setPanSync]);

  const stopDrag = useCallback(() => { dragRef.current = null; }, []);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    setZoomSync(clampZoom(zoomRef.current * delta));
  }, [setZoomSync]);

  // Touch events
  const onTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    hasDraggedRef.current = false;
    if (e.touches.length === 1) {
      const t = e.touches[0];
      dragRef.current = { sx: t.clientX, sy: t.clientY, px: panRef.current.x, py: panRef.current.y };
      pinchRef.current = null;
    } else if (e.touches.length === 2) {
      dragRef.current = null;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = Math.hypot(dx, dy);
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (e.touches.length === 1 && dragRef.current) {
      const t = e.touches[0];
      const dx = t.clientX - dragRef.current.sx;
      const dy = t.clientY - dragRef.current.sy;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasDraggedRef.current = true;
      setPanSync({ x: dragRef.current.px + dx, y: dragRef.current.py + dy });
    } else if (e.touches.length === 2 && pinchRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchRef.current;
      pinchRef.current = dist;
      setZoomSync(clampZoom(zoomRef.current * ratio));
    }
  }, [setPanSync, setZoomSync]);

  const onTouchEnd = useCallback(() => {
    dragRef.current  = null;
    pinchRef.current = null;
  }, []);

  // ── Search match set ─────────────────────────────────────────────────────
  const searchLower = searchQuery.toLowerCase().trim();
  const searchMatchIds: Set<string> = useMemo(() => {
    if (!searchLower) return new Set();
    return new Set(
      NODES
        .filter(n => n.label.toLowerCase().includes(searchLower) ||
                     n.fullLabel.toLowerCase().includes(searchLower) ||
                     n.description.toLowerCase().includes(searchLower))
        .map(n => n.id)
    );
  }, [searchLower]);

  // ── Derived highlight sets ─────────────────────────────────────────────────
  const focusId = selectedId ?? hoveredId ?? (searchMatchIds.size === 1 ? Array.from(searchMatchIds)[0] : null);
  const connectedIds: Set<string> = useMemo(() => {
    if (!focusId) return new Set();
    return ADJACENCY.get(focusId) ?? new Set();
  }, [focusId]);

  const selectedNode = selectedId ? NODE_MAP.get(selectedId) ?? null : null;
  const connectedNodes = selectedNode
    ? Array.from(ADJACENCY.get(selectedNode.id) ?? [])
        .map(id => NODE_MAP.get(id))
        .filter(Boolean) as ConceptNode[]
    : [];

  // ── Node click handler ─────────────────────────────────────────────────────
  const handleNodeClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (hasDraggedRef.current) return; // war ein Drag, kein Klick
    setSelectedId(prev => prev === id ? null : id);
    setSearchQuery("");
  }, []);

  // ── Determine visual state of a node (search-aware) ───────────────────────
  function nodeState(id: string): "focus" | "connected" | "dim" | "neutral" | "hidden" {
    const node = NODE_MAP.get(id);
    if (node && hiddenCats.has(node.category)) return "hidden";

    // Search active
    if (searchLower) {
      if (searchMatchIds.has(id)) return "focus";
      // direct neighbours of search matches
      const matchArr = Array.from(searchMatchIds);
      for (let i = 0; i < matchArr.length; i++) {
        if ((ADJACENCY.get(matchArr[i]) ?? new Set()).has(id)) return "connected";
      }
      return "dim";
    }

    if (!focusId) return "neutral";
    if (id === focusId)         return "focus";
    if (connectedIds.has(id))   return "connected";
    return "dim";
  }

  function edgeState(srcId: string, tgtId: string): "focus" | "dim" | "neutral" {
    const sNode = NODE_MAP.get(srcId);
    const tNode = NODE_MAP.get(tgtId);
    if ((sNode && hiddenCats.has(sNode.category)) || (tNode && hiddenCats.has(tNode.category))) return "dim";
    if (searchLower) {
      if (searchMatchIds.has(srcId) || searchMatchIds.has(tgtId)) return "focus";
      return "dim";
    }
    if (!focusId) return "neutral";
    if (srcId === focusId || tgtId === focusId) return "focus";
    return "dim";
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const transform = `translate(${pan.x},${pan.y}) scale(${zoom})`;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: C.void, color: C.text,
        fontFamily: C.serif, display: "flex", flexDirection: "column",
        overflowX: "hidden",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Grain overlay */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 100, opacity: 0.6,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`,
      }} />

      {/* Nav — zwei explizite Zeilen, kein flexWrap-Trick */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
        display: "flex", flexDirection: "column", gap: "0.4rem",
        padding: "0.65rem 1rem 0.6rem",
        borderBottom: `1px solid ${C.border}`,
        background: "rgba(8,8,8,0.92)", backdropFilter: "blur(12px)",
      }}>
        {/* Zeile 1: Titel + Legende + Schließen */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontFamily: C.mono, fontSize: "0.72rem", letterSpacing: "0.18em", color: C.accent, textTransform: "uppercase", flexShrink: 0 }}>
            Begriffsnetz
          </span>

          <div style={{ flex: 1 }} />

          {/* Legend toggle */}
          <button
            onClick={() => setLegendOpen(o => !o)}
            title="Legende / Kategorien"
            style={{
              fontFamily: C.mono, fontSize: "0.6rem", letterSpacing: "0.1em",
              textTransform: "uppercase", color: legendOpen ? C.accent : C.muted,
              background: legendOpen ? "rgba(196,168,130,0.08)" : "none",
              border: `1px solid ${legendOpen ? C.accentDim : C.border}`,
              padding: "0.3rem 0.7rem", cursor: "pointer",
              transition: "all 0.15s", flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = C.accent; e.currentTarget.style.borderColor = C.accentDim; }}
            onMouseLeave={e => {
              e.currentTarget.style.color = legendOpen ? C.accent : C.muted;
              e.currentTarget.style.borderColor = legendOpen ? C.accentDim : C.border;
            }}
          >
            Legende
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            title="Schließen"
            style={{
              fontFamily: "monospace", fontSize: "1.2rem", lineHeight: 1,
              color: C.textDim, background: "none", border: "none",
              cursor: "pointer", padding: "0.3rem 0.4rem",
              transition: "color 0.2s", flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = C.textBright)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textDim)}
          >×</button>
        </div>

        {/* Zeile 2: Suche — immer volle Breite, kein CSS-Trick nötig */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ flex: 1, position: "relative", maxWidth: 400 }}>
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSelectedId(null); }}
              placeholder="Begriff suchen …"
              style={{
                width: "100%", background: C.surface,
                border: `1px solid ${searchQuery ? C.accentDim : C.border}`,
                color: C.textBright, fontFamily: C.serif, fontStyle: "italic",
                fontSize: "0.88rem", padding: "0.3rem 1.8rem 0.3rem 0.7rem",
                outline: "none", transition: "border-color 0.2s", boxSizing: "border-box",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = C.accentDim)}
              onBlur={e => (e.currentTarget.style.borderColor = searchQuery ? C.accentDim : C.border)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute", right: "0.4rem", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: C.muted, cursor: "pointer",
                  fontFamily: "monospace", fontSize: "0.85rem", lineHeight: 1, padding: "0.1rem",
                }}
              >×</button>
            )}
          </div>
          {searchQuery && (
            <span style={{ fontFamily: C.mono, fontSize: "0.6rem", color: C.accentDim, flexShrink: 0 }}>
              {searchMatchIds.size} Treffer
            </span>
          )}
        </div>
      </nav>

      {/* Legend / category filter panel */}
      {legendOpen && (
        <div style={{
          position: "fixed", top: "5.2rem", right: "1.2rem", zIndex: 190,
          background: C.deep, border: `1px solid ${C.border}`,
          padding: "1rem 1.1rem", minWidth: 200,
          backdropFilter: "blur(8px)",
        }}>
          <div style={{ fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.15em", color: C.muted, textTransform: "uppercase", marginBottom: "0.75rem" }}>
            Kategorien
          </div>
          {(Object.entries(CAT_COLOR) as [NodeCategory, string][]).map(([cat, color]) => {
            const hidden = hiddenCats.has(cat);
            return (
              <button
                key={cat}
                onClick={() => setHiddenCats(prev => {
                  const next = new Set(prev);
                  if (next.has(cat)) next.delete(cat); else next.add(cat);
                  return next;
                })}
                style={{
                  display: "flex", alignItems: "center", gap: "0.55rem",
                  width: "100%", background: "none", border: "none",
                  cursor: "pointer", padding: "0.3rem 0",
                  opacity: hidden ? 0.4 : 1, transition: "opacity 0.15s",
                }}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: hidden ? "transparent" : color,
                  border: `1.5px solid ${color}`,
                  flexShrink: 0, transition: "background 0.15s",
                }} />
                <span style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.85rem", color: hidden ? C.muted : C.text }}>
                  {categoryLabel(cat)}
                </span>
              </button>
            );
          })}
          {hiddenCats.size > 0 && (
            <button
              onClick={() => setHiddenCats(new Set())}
              style={{
                marginTop: "0.75rem", width: "100%",
                fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.1em",
                textTransform: "uppercase", color: C.accent,
                background: "none", border: `1px solid ${C.accentDim}`,
                padding: "0.3rem 0.5rem", cursor: "pointer",
              }}
            >
              Alle einblenden
            </button>
          )}
        </div>
      )}

      {/* Main area: SVG graph + detail panel */}
      <div className="concept-graph-body" style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* SVG Graph */}
        <svg
          ref={svgRef}
          style={{ flex: 1, display: "block", cursor: dragRef.current ? "grabbing" : "grab", touchAction: "none" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={() => {
            if (hasDraggedRef.current) return; // drag end — kein Reset
            setSelectedId(null); setSearchQuery(""); setLegendOpen(false);
          }}
          preserveAspectRatio="xMidYMid meet"
        >

          <g transform={transform}>
            {/* ── Edges ── */}
            {EDGES.map((edge, i) => {
              const src = NODE_MAP.get(edge.source);
              const tgt = NODE_MAP.get(edge.target);
              if (!src || !tgt) return null;

              const state = edgeState(edge.source, edge.target);
              const isPrimary = edge.weight === "primary";

              const opacity =
                state === "focus"   ? (isPrimary ? 0.80 : 0.65) :
                state === "neutral" ? (isPrimary ? 0.30 : 0.15) :
                0.06;

              const strokeWidth = isPrimary ? (state === "focus" ? 1.8 : 1.2) : (state === "focus" ? 1.2 : 0.8);

              // Slight bezier curve: control point offset perpendicular to edge
              const mx = (src.x + tgt.x) / 2;
              const my = (src.y + tgt.y) / 2;
              const dx = tgt.x - src.x;
              const dy = tgt.y - src.y;
              const len = Math.hypot(dx, dy) || 1;
              const curveAmount = Math.min(len * 0.12, 22);
              const cx = mx + (-dy / len) * curveAmount;
              const cy_ = my + (dx / len) * curveAmount;

              const focusSrc = edge.source === focusId;
              const focusTgt = edge.target === focusId;
              const stroke = state === "focus"
                ? (focusSrc || focusTgt ? C.accent : C.text)
                : C.border;

              return (
                <path
                  key={i}
                  d={`M ${src.x} ${src.y} Q ${cx} ${cy_} ${tgt.x} ${tgt.y}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  opacity={opacity}
                  strokeLinecap="round"
                />
              );
            })}

            {/* ── Nodes ── */}
            {NODES.map(node => {
              const state = nodeState(node.id);
              if (state === "hidden") return null;
              const catColor = CAT_COLOR[node.category];
              const isFocus = state === "focus";
              const isConnected = state === "connected";
              const isDim = state === "dim";

              const fillOpacity =
                isFocus     ? 1 :
                isConnected ? 0.85 :
                isDim       ? 0.4 :
                0.7;

              const fill = isFocus ? catColor : C.surface;
              const strokeColor = isFocus ? catColor : isConnected ? catColor : isDim ? C.border : catColor;
              const strokeOpacity = isFocus ? 1 : isConnected ? 0.7 : isDim ? 0.3 : 0.5;
              const strokeWidth = isFocus ? 2.5 : isConnected ? 1.8 : 1.2;

              const labelColor = isFocus
                ? C.void
                : isConnected ? C.textBright : isDim ? C.textDim : C.text;
              const labelOpacity = isDim ? 0.4 : 1;

              // Split label on \n
              const lines = node.label.split("\n");

              return (
                <g
                  key={node.id}
                  style={{ cursor: "pointer" }}
                  onClick={e => handleNodeClick(e, node.id)}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Glow ring for focus/connected */}
                  {(isFocus || isConnected) && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.r + (isFocus ? 9 : 5)}
                      fill="none"
                      stroke={catColor}
                      strokeWidth={isFocus ? 1 : 0.5}
                      opacity={isFocus ? 0.25 : 0.12}
                    />
                  )}

                  {/* Node circle */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r}
                    fill={fill}
                    fillOpacity={fillOpacity}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeOpacity={strokeOpacity}
                  />

                  {/* Label */}
                  {lines.length === 1 ? (
                    <text
                      x={node.x}
                      y={node.y + 1}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={Math.max(9, Math.min(13, node.r * 0.48))}
                      fill={labelColor}
                      opacity={labelOpacity}
                      fontFamily={C.serif}
                      fontStyle="italic"
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      {node.label}
                    </text>
                  ) : (
                    <text
                      x={node.x}
                      y={node.y - 6}
                      textAnchor="middle"
                      fontSize={Math.max(9, Math.min(13, node.r * 0.42))}
                      fill={labelColor}
                      opacity={labelOpacity}
                      fontFamily={C.serif}
                      fontStyle="italic"
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      {lines.map((line, li) => (
                        <tspan key={li} x={node.x} dy={li === 0 ? 0 : "1.2em"}>{line}</tspan>
                      ))}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* ── Detail Panel (right sidebar on desktop only) ── */}
        {selectedNode && (
          <aside className="concept-detail-sidebar" style={{
            width: "clamp(240px, 28vw, 320px)",
            background: C.deep,
            borderLeft: `1px solid ${C.border}`,
            overflowY: "auto",
            padding: "1.5rem 1.25rem",
            flexShrink: 0,
            scrollbarWidth: "thin",
            scrollbarColor: `${C.border} transparent`,
          }}>
            {/* Category label */}
            <div style={{ fontFamily: C.mono, fontSize: "0.6rem", letterSpacing: "0.2em", color: CAT_COLOR[selectedNode.category], textTransform: "uppercase", marginBottom: "0.6rem" }}>
              {categoryLabel(selectedNode.category)}
            </div>

            {/* Title */}
            <h2 style={{ fontFamily: C.serif, fontSize: "1.6rem", fontWeight: 400, fontStyle: "italic", color: C.textBright, lineHeight: 1.2, marginBottom: "1.2rem" }}>
              {selectedNode.fullLabel}
            </h2>

            {/* Description */}
            <p style={{ fontSize: "0.92rem", lineHeight: 1.85, color: C.text, marginBottom: "1.5rem" }}>
              {selectedNode.description}
            </p>

            {/* Connected concepts */}
            {connectedNodes.length > 0 && (
              <>
                <div style={{ height: 1, background: C.border, marginBottom: "1.2rem" }} />
                <div style={{ fontFamily: C.mono, fontSize: "0.6rem", letterSpacing: "0.15em", color: C.muted, textTransform: "uppercase", marginBottom: "0.8rem" }}>
                  Verbundene Begriffe
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {connectedNodes.map(cn => (
                    <button
                      key={cn.id}
                      onClick={() => setSelectedId(cn.id)}
                      style={{
                        fontFamily: C.serif, fontStyle: "italic",
                        fontSize: "0.82rem", color: C.accent,
                        background: "none",
                        border: `1px solid ${C.accentDim}`,
                        padding: "0.2rem 0.6rem",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(196,168,130,0.08)"; e.currentTarget.style.color = C.textBright; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = C.accent; }}
                    >
                      {cn.label.replace("\n", " ")}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Close detail */}
            <div style={{ marginTop: "2rem" }}>
              <button
                onClick={() => setSelectedId(null)}
                style={{
                  fontFamily: C.mono, fontSize: "0.6rem", letterSpacing: "0.12em",
                  textTransform: "uppercase", color: C.muted, background: "none",
                  border: `1px solid ${C.border}`, padding: "0.4rem 0.8rem",
                  cursor: "pointer", transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = C.muted; }}
                onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}
              >
                Schließen
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* ── Mobile bottom sheet (detail panel on small screens) ── */}
      {selectedNode && (
        <div
          className="concept-mobile-sheet"
          style={{ display: "none" }} // shown via CSS media query
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8rem" }}>
            <div>
              <div style={{ fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.18em", color: CAT_COLOR[selectedNode.category], textTransform: "uppercase", marginBottom: "0.2rem" }}>
                {categoryLabel(selectedNode.category)}
              </div>
              <h2 style={{ fontFamily: C.serif, fontSize: "1.3rem", fontWeight: 400, fontStyle: "italic", color: C.textBright }}>
                {selectedNode.fullLabel}
              </h2>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              style={{ fontFamily: "monospace", fontSize: "1.1rem", color: C.textDim, background: "none", border: "none", cursor: "pointer", padding: "0.3rem 0.5rem" }}
            >×</button>
          </div>
          <p style={{ fontSize: "0.88rem", lineHeight: 1.7, color: C.text, marginBottom: "0.8rem" }}>
            {selectedNode.description}
          </p>
          {connectedNodes.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              {connectedNodes.map(cn => (
                <button
                  key={cn.id}
                  onClick={() => setSelectedId(cn.id)}
                  style={{
                    fontFamily: C.serif, fontStyle: "italic",
                    fontSize: "0.78rem", color: C.accent,
                    background: "none", border: `1px solid ${C.accentDim}`,
                    padding: "0.18rem 0.5rem", cursor: "pointer",
                  }}
                >
                  {cn.label.replace("\n", " ")}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hint text (only when nothing selected) */}
      {!selectedNode && (
        <div style={{
          position: "fixed", bottom: "1.2rem", left: "50%", transform: "translateX(-50%)",
          fontFamily: C.mono, fontSize: "0.6rem", letterSpacing: "0.1em",
          color: C.muted, pointerEvents: "none", whiteSpace: "nowrap",
          zIndex: 150,
        }}>
          Ziehen zum Verschieben · Scrollen zum Zoomen · Begriff anklicken
        </div>
      )}

      {/* Zoom controls */}
      <div style={{
        position: "fixed", bottom: "1.2rem", right: "1.2rem",
        display: "flex", flexDirection: "column", gap: "2px",
        zIndex: 150,
      }}>
        {[
          { label: "+", delta: 1.2,  aria: "Vergrößern" },
          { label: "−", delta: 0.83, aria: "Verkleinern" },
          { label: "↺", reset: true, aria: "Zoom zurücksetzen" },
        ].map(btn => (
          <button
            key={btn.label}
            aria-label={btn.aria}
            title={btn.aria}
            onClick={() => {
              if (btn.reset) { setZoomSync(1); setPanSync({ x: 0, y: 0 }); }
              else setZoomSync(clampZoom(zoomRef.current * (btn.delta ?? 1)));
            }}
            style={{
              fontFamily: C.mono, fontSize: "0.9rem",
              width: 30, height: 30,
              background: C.surface, border: `1px solid ${C.border}`,
              color: C.textDim, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = C.accent; e.currentTarget.style.borderColor = C.accentDim; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.textDim; e.currentTarget.style.borderColor = C.border; }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <style>{`
        /* Nav: two-row layout — row 1: title/controls, row 2: search */
        .concept-graph-body {
          /* Nav: Zeile 1 (~1.7rem) + gap (0.4rem) + Zeile 2 (~1.6rem) + padding (~1.25rem) ≈ 5rem */
          margin-top: 5rem;
          height: calc(100dvh - 5rem);
        }

        /* Mobile (≤ 640 px): only bottom sheet, sidebar hidden */
        @media (max-width: 640px) {
          .concept-detail-sidebar { display: none !important; }
          .concept-mobile-sheet {
            display: block !important;
            position: fixed;
            bottom: 0; left: 0; right: 0;
            background: ${C.deep};
            border-top: 1px solid ${C.border};
            padding: 1rem 1.2rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
            z-index: 160;
            max-height: 55dvh;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: ${C.border} transparent;
          }
        }
        /* Desktop (> 640 px): only right sidebar, bottom sheet hidden */
        @media (min-width: 641px) {
          .concept-mobile-sheet { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    core:           "Kern",
    ontological:    "Ontologie",
    relational:     "Relation",
    language:       "Sprache & Klang",
    knowledge:      "Erkenntnis",
    temporal:       "Zeit & Raum",
    transformation: "Transformation",
  };
  return labels[cat] ?? cat;
}
