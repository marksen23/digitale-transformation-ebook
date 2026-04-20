import { useState, useRef, useCallback, useMemo } from "react";
import { NODES, EDGES, LEITMOTIV_EDGES, CAT_COLOR, PRINZIP_GROUPS, PRINZIP_PAIRS, type ConceptNode, type NodeCategory } from "@/data/conceptGraph";

const PR_COLOR = "#8ea8b8";
const PR_GLOW  = "#c4d6e0";

interface ConceptGraphPageProps {
  onClose: () => void;
}

// ─── Leitmotiv visual constants (Schattenlicht / Faltung) ─────────────────────
const LM_COLOR      = "#c8b896"; // parchment-gold — same as CAT_COLOR.leitmotiv
const LM_GLOW       = "#e8dcc0"; // brighter variant for labels + inner ring
const LM_AURA_R     = 68;        // outer glow radius added to node.r
const LM_RING_R     = 34;        // dashed mid-ring radius added to node.r

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
// Also index leitmotiv resonance edges so clicking a Leitmotiv shows its
// connected concept nodes in the sidebar.
for (const edge of LEITMOTIV_EDGES) {
  if (!ADJACENCY.has(edge.source)) ADJACENCY.set(edge.source, new Set());
  ADJACENCY.get(edge.source)!.add(edge.target);
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
  const [hiddenLeitmotive, setHiddenLeitmotive] = useState<Set<string>>(new Set());
  const [hiddenPrinzipien, setHiddenPrinzipien] = useState<Set<string>>(new Set());
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

  // Node drag state
  const [nodePositions, setNodePositions] = useState<Map<string, {x: number, y: number}>>(new Map());
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const nodeDragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

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
    if (nodeDragRef.current) {
      const dx = (e.clientX - nodeDragRef.current.startClientX) / zoomRef.current;
      const dy = (e.clientY - nodeDragRef.current.startClientY) / zoomRef.current;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDraggedRef.current = true;
      const id = nodeDragRef.current.id;
      setNodePositions(prev => new Map(prev).set(id, {
        x: nodeDragRef.current!.origX + dx,
        y: nodeDragRef.current!.origY + dy,
      }));
      return;
    }
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    // Mark as real drag once threshold exceeded (distinguishes click from drag)
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasDraggedRef.current = true;
    setPanSync({ x: dragRef.current.px + dx, y: dragRef.current.py + dy });
  }, [setPanSync]);

  const stopDrag = useCallback(() => {
    dragRef.current = null;
    nodeDragRef.current = null;
    setDraggingNodeId(null);
  }, []);

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
    if (e.touches.length === 1 && nodeDragRef.current) {
      const t = e.touches[0];
      const dx = (t.clientX - nodeDragRef.current.startClientX) / zoomRef.current;
      const dy = (t.clientY - nodeDragRef.current.startClientY) / zoomRef.current;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDraggedRef.current = true;
      const id = nodeDragRef.current.id;
      setNodePositions(prev => new Map(prev).set(id, {
        x: nodeDragRef.current!.origX + dx,
        y: nodeDragRef.current!.origY + dy,
      }));
      return;
    }
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

  // ── Categories active for the current selection ────────────────────────────
  // Includes the selected node's own category + all connected nodes' categories.
  // Used to highlight relevant legend rows automatically.
  const activeCats = useMemo((): Set<NodeCategory> => {
    if (!selectedNode) return new Set();
    const cats = new Set<NodeCategory>([selectedNode.category]);
    connectedNodes.forEach(n => cats.add(n.category));
    return cats;
  }, [selectedNode, connectedNodes]);

  // Which leitmotiv nodes are relevant to the current selection
  const activeLeitmotive = useMemo((): Set<string> => {
    if (!selectedNode) return new Set();
    const active = new Set<string>();
    NODES.filter(n => n.category === "leitmotiv").forEach(lm => {
      if (lm.id === selectedNode.id || connectedIds.has(lm.id)) active.add(lm.id);
    });
    return active;
  }, [selectedNode, connectedIds]);

  // ── Node click handler ─────────────────────────────────────────────────────
  const handleNodeClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (hasDraggedRef.current) return; // war ein Drag, kein Klick
    setSelectedId(prev => prev === id ? null : id);
    setSearchQuery("");
    setLegendOpen(false); // sidebar übernimmt die Legende beim Auswählen
  }, []);

  // ── Determine visual state of a node (search-aware) ───────────────────────
  function nodeState(id: string): "focus" | "connected" | "dim" | "neutral" | "hidden" {
    const node = NODE_MAP.get(id);
    if (node) {
      if (node.category === "leitmotiv") {
        if (hiddenLeitmotive.has(id)) return "hidden";
      } else if (node.category === "prinzip") {
        if (hiddenPrinzipien.has(id)) return "hidden";
      } else {
        if (hiddenCats.has(node.category)) return "hidden";
      }
    }

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

  // Resolves live/dragged position for any node id
  const getPos = (id: string): {x: number, y: number} => {
    const override = nodePositions.get(id);
    if (override) return override;
    const n = NODE_MAP.get(id);
    return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
  };

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

          {/* Legend toggle — only shown when no node is selected (sidebar carries the legend then) */}
          {!selectedId && (
            <button
              onClick={() => setLegendOpen(o => !o)}
              title="Legende / Kohärenzfelder"
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
          )}

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


      {/* Main area: SVG graph + detail panel */}
      <div className="concept-graph-body" style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* SVG Graph — in relativem Container für absolute Overlays */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex" }}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ flex: 1, display: "block", cursor: draggingNodeId ? "grabbing" : dragRef.current ? "grabbing" : "grab", touchAction: "none" }}
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

            {/* ══ LEITMOTIV LAYER 1: Background aura glows ══════════════════
                Large translucent halos placed behind all concept nodes.
                Schattenlicht principle: light emerges from the deep background. */}
            {NODES.filter(n => n.category === "leitmotiv").map(node => {
              const state  = nodeState(node.id);
              const hidden = state === "hidden";
              if (hidden) return null;
              const dim    = state === "dim";
              const {x, y} = getPos(node.id);
              return (
                <g key={`aura-${node.id}`} style={{ pointerEvents: "none" }}>
                  {/* Outer soft glow — very faint filled circle */}
                  <circle
                    cx={x} cy={y} r={node.r + LM_AURA_R}
                    fill={LM_COLOR}
                    fillOpacity={dim ? 0.018 : 0.055}
                  />
                  {/* Mid dashed ring — Faltung suggestion */}
                  <circle
                    cx={x} cy={y} r={node.r + LM_RING_R}
                    fill="none"
                    stroke={LM_COLOR}
                    strokeWidth={0.6}
                    strokeDasharray="3 9"
                    opacity={dim ? 0.12 : 0.32}
                  />
                </g>
              );
            })}

            {/* ══ LEITMOTIV LAYER 2: Resonance connection lines ══════════════
                Thin dashed curves from leitmotiv nodes to resonating concepts.
                Drawn before regular edges so they form the base layer. */}
            {LEITMOTIV_EDGES.map((edge, i) => {
              const src = NODE_MAP.get(edge.source);
              const tgt = NODE_MAP.get(edge.target);
              if (!src || !tgt) return null;

              const srcState = nodeState(edge.source);
              const tgtState = nodeState(edge.target);
              if (srcState === "hidden" || tgtState === "hidden") return null;

              const isFocused = srcState === "focus" || tgtState === "focus" ||
                                srcState === "connected" || tgtState === "connected";
              const isDim     = srcState === "dim" && tgtState === "dim";

              const opacity   = isDim ? 0.05 : isFocused ? 0.55 : 0.18;
              const strokeW   = isFocused ? 1.0 : 0.6;

              // Gentle bezier — control point pushed away from center
              const srcPos = getPos(edge.source);
              const tgtPos = getPos(edge.target);
              const mx = (srcPos.x + tgtPos.x) / 2;
              const my = (srcPos.y + tgtPos.y) / 2;
              const dx = tgtPos.x - srcPos.x;
              const dy = tgtPos.y - srcPos.y;
              const len = Math.hypot(dx, dy) || 1;
              const curve = Math.min(len * 0.18, 38);
              const cx = mx + (-dy / len) * curve;
              const cy_ = my + (dx / len) * curve;

              return (
                <path
                  key={`lm-edge-${i}`}
                  d={`M ${srcPos.x} ${srcPos.y} Q ${cx} ${cy_} ${tgtPos.x} ${tgtPos.y}`}
                  fill="none"
                  stroke={LM_COLOR}
                  strokeWidth={strokeW}
                  strokeDasharray="5 7"
                  opacity={opacity}
                  strokeLinecap="round"
                  style={{ pointerEvents: "none" }}
                />
              );
            })}

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
              const srcPos = getPos(edge.source);
              const tgtPos = getPos(edge.target);
              const mx = (srcPos.x + tgtPos.x) / 2;
              const my = (srcPos.y + tgtPos.y) / 2;
              const dx = tgtPos.x - srcPos.x;
              const dy = tgtPos.y - srcPos.y;
              const len = Math.hypot(dx, dy) || 1;
              const curveAmount = Math.min(len * 0.12, 22);
              const cx = mx + (-dy / len) * curveAmount;
              const cy_ = my + (dx / len) * curveAmount;

              const focusSrc = edge.source === focusId;
              const focusTgt = edge.target === focusId;
              // Same-category edges get their category color (subtly); cross-category stay neutral
              const sameCategory = src.category === tgt.category && src.category !== "leitmotiv" && src.category !== "prinzip";
              const stroke = state === "focus"
                ? (focusSrc || focusTgt ? C.accent : sameCategory ? CAT_COLOR[src.category] : C.text)
                : state === "neutral" && sameCategory ? CAT_COLOR[src.category]
                : C.border;

              return (
                <path
                  key={i}
                  d={`M ${srcPos.x} ${srcPos.y} Q ${cx} ${cy_} ${tgtPos.x} ${tgtPos.y}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  opacity={opacity}
                  strokeLinecap="round"
                />
              );
            })}

            {/* ── Nodes (concept layer — skip leitmotiv & prinzip, rendered separately) ── */}
            {NODES.map(node => {
              if (node.category === "leitmotiv") return null; // rendered in leitmotiv pass below
              if (node.category === "prinzip")   return null; // rendered in prinzip pass below
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
              const {x, y} = getPos(node.id);

              return (
                <g
                  key={node.id}
                  style={{ cursor: "pointer" }}
                  onClick={e => handleNodeClick(e, node.id)}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    hasDraggedRef.current = false;
                    const pos = getPos(node.id);
                    nodeDragRef.current = {
                      id: node.id,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      origX: pos.x,
                      origY: pos.y,
                    };
                    setDraggingNodeId(node.id);
                  }}
                  onTouchStart={(e) => {
                    if (e.touches.length === 1) {
                      e.stopPropagation();
                      hasDraggedRef.current = false;
                      const t = e.touches[0];
                      const pos = getPos(node.id);
                      nodeDragRef.current = {
                        id: node.id,
                        startClientX: t.clientX,
                        startClientY: t.clientY,
                        origX: pos.x,
                        origY: pos.y,
                      };
                      setDraggingNodeId(node.id);
                    }
                  }}
                >
                  {/* Glow ring for focus/connected */}
                  {(isFocus || isConnected) && (
                    <circle
                      cx={x}
                      cy={y}
                      r={node.r + (isFocus ? 9 : 5)}
                      fill="none"
                      stroke={catColor}
                      strokeWidth={isFocus ? 1 : 0.5}
                      opacity={isFocus ? 0.25 : 0.12}
                    />
                  )}

                  {/* Node circle */}
                  <circle
                    cx={x}
                    cy={y}
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
                      x={x}
                      y={y + 1}
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
                      x={x}
                      y={y - 6}
                      textAnchor="middle"
                      fontSize={Math.max(9, Math.min(13, node.r * 0.42))}
                      fill={labelColor}
                      opacity={labelOpacity}
                      fontFamily={C.serif}
                      fontStyle="italic"
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      {lines.map((line, li) => (
                        <tspan key={li} x={x} dy={li === 0 ? 0 : "1.2em"}>{line}</tspan>
                      ))}
                    </text>
                  )}
                </g>
              );
            })}

            {/* ══ LEITMOTIV LAYER 3: Node rings + labels ═════════════════════
                Drawn on top of all concept nodes. Each Leitmotiv appears as
                a double-ring with a cap-label — archetypal, luminous, distinct. */}
            {NODES.filter(n => n.category === "leitmotiv").map(node => {
              const state    = nodeState(node.id);
              if (state === "hidden") return null;
              const isFocus  = state === "focus";
              const isDim    = state === "dim";
              const isConn   = state === "connected";

              const ringOpacity  = isDim ? 0.25 : isFocus ? 1 : isConn ? 0.85 : 0.65;
              const fillOpacity  = isFocus ? 0.22 : isDim ? 0.04 : 0.10;
              const labelOpacity = isDim ? 0.3  : 1;
              const outerR       = node.r + (isFocus ? 8 : 4);
              const {x, y} = getPos(node.id);

              return (
                <g
                  key={node.id}
                  style={{ cursor: "pointer" }}
                  onClick={e => handleNodeClick(e, node.id)}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    hasDraggedRef.current = false;
                    const pos = getPos(node.id);
                    nodeDragRef.current = {
                      id: node.id,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      origX: pos.x,
                      origY: pos.y,
                    };
                    setDraggingNodeId(node.id);
                  }}
                  onTouchStart={(e) => {
                    if (e.touches.length === 1) {
                      e.stopPropagation();
                      hasDraggedRef.current = false;
                      const t = e.touches[0];
                      const pos = getPos(node.id);
                      nodeDragRef.current = {
                        id: node.id,
                        startClientX: t.clientX,
                        startClientY: t.clientY,
                        origX: pos.x,
                        origY: pos.y,
                      };
                      setDraggingNodeId(node.id);
                    }
                  }}
                >
                  {/* Outer glow ring (focus state only) */}
                  {isFocus && (
                    <circle
                      cx={x} cy={y} r={outerR + 14}
                      fill="none"
                      stroke={LM_GLOW}
                      strokeWidth={1.2}
                      opacity={0.3}
                    />
                  )}

                  {/* Outer decorative ring */}
                  <circle
                    cx={x} cy={y} r={outerR}
                    fill="none"
                    stroke={LM_COLOR}
                    strokeWidth={isFocus ? 1.5 : 0.8}
                    strokeDasharray={isFocus ? "none" : "2 5"}
                    opacity={ringOpacity * 0.6}
                  />

                  {/* Inner filled circle */}
                  <circle
                    cx={x} cy={y} r={node.r}
                    fill={LM_GLOW}
                    fillOpacity={fillOpacity}
                    stroke={LM_GLOW}
                    strokeWidth={isFocus ? 1.8 : 1.2}
                    strokeOpacity={ringOpacity}
                  />

                  {/* Label — small-caps, spaced, above/below node for edge positions */}
                  <text
                    x={x}
                    y={y + (node.y < 100 ? node.r + 14 : node.y > 480 ? -(node.r + 8) : 0)}
                    textAnchor="middle"
                    dominantBaseline={node.y < 100 ? "hanging" :
                                      node.y > 480 ? "auto"    : "middle"}
                    fontSize={9}
                    fill={LM_GLOW}
                    opacity={labelOpacity}
                    fontFamily="'Courier Prime', 'Courier New', monospace"
                    letterSpacing="0.18em"
                    style={{ userSelect: "none", pointerEvents: "none" }}
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}

            {/* ══ PRINZIP LAYER 1: Complementary pair connection lines ═══════
                Thin dashed lines between complementary principles
                (Schatten↔Licht, Wirklichkeit↔Möglichkeit) — visualising
                the polar tension at the meta-layer. */}
            {PRINZIP_PAIRS.map(([a, b], i) => {
              const sA = nodeState(a);
              const sB = nodeState(b);
              if (sA === "hidden" || sB === "hidden") return null;
              const pA = getPos(a);
              const pB = getPos(b);
              return (
                <line
                  key={`pr-pair-${i}`}
                  x1={pA.x} y1={pA.y} x2={pB.x} y2={pB.y}
                  stroke={PR_COLOR}
                  strokeWidth={0.7}
                  strokeDasharray="2 6"
                  opacity={0.35}
                  style={{ pointerEvents: "none" }}
                />
              );
            })}

            {/* ══ PRINZIP LAYER 2: Principle nodes (meta-overlay) ═══════════
                Small circles with dashed outer ring in cool blue-silver.
                Distinct from concept nodes and leitmotive by styling. */}
            {NODES.filter(n => n.category === "prinzip").map(node => {
              const state = nodeState(node.id);
              if (state === "hidden") return null;
              const isFocus = state === "focus";
              const isConn  = state === "connected";
              const isDim   = state === "dim";
              const {x, y}  = getPos(node.id);
              const ringOpacity = isDim ? 0.25 : isFocus ? 1 : isConn ? 0.8 : 0.55;
              const fillOpacity = isFocus ? 0.35 : isDim ? 0.05 : 0.12;
              const labelOpacity = isDim ? 0.35 : 1;
              const lines = node.label.split("\n");

              return (
                <g
                  key={node.id}
                  style={{ cursor: "pointer" }}
                  onClick={e => handleNodeClick(e, node.id)}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    hasDraggedRef.current = false;
                    const pos = getPos(node.id);
                    nodeDragRef.current = {
                      id: node.id,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      origX: pos.x,
                      origY: pos.y,
                    };
                    setDraggingNodeId(node.id);
                  }}
                  onTouchStart={(e) => {
                    if (e.touches.length === 1) {
                      e.stopPropagation();
                      hasDraggedRef.current = false;
                      const t = e.touches[0];
                      const pos = getPos(node.id);
                      nodeDragRef.current = {
                        id: node.id,
                        startClientX: t.clientX,
                        startClientY: t.clientY,
                        origX: pos.x,
                        origY: pos.y,
                      };
                      setDraggingNodeId(node.id);
                    }
                  }}
                >
                  {/* Dashed outer ring — principle signature */}
                  <circle
                    cx={x} cy={y} r={node.r + 6}
                    fill="none"
                    stroke={PR_COLOR}
                    strokeWidth={isFocus ? 1.2 : 0.6}
                    strokeDasharray="1.5 3"
                    opacity={ringOpacity * 0.7}
                  />
                  {/* Inner circle */}
                  <circle
                    cx={x} cy={y} r={node.r}
                    fill={PR_GLOW}
                    fillOpacity={fillOpacity}
                    stroke={PR_GLOW}
                    strokeWidth={isFocus ? 1.6 : 1}
                    strokeOpacity={ringOpacity}
                  />
                  {/* Label */}
                  {lines.length === 1 ? (
                    <text
                      x={x} y={y + 1}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={Math.max(8, Math.min(11, node.r * 0.55))}
                      fill={PR_GLOW}
                      opacity={labelOpacity}
                      fontFamily={C.mono}
                      letterSpacing="0.08em"
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      {node.label}
                    </text>
                  ) : (
                    <text
                      x={x} y={y - 4}
                      textAnchor="middle"
                      fontSize={Math.max(8, Math.min(10, node.r * 0.5))}
                      fill={PR_GLOW}
                      opacity={labelOpacity}
                      fontFamily={C.mono}
                      letterSpacing="0.08em"
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      {lines.map((line, li) => (
                        <tspan key={li} x={x} dy={li === 0 ? 0 : "1.15em"}>{line}</tspan>
                      ))}
                    </text>
                  )}
                </g>
              );
            })}

          </g>
        </svg>

        {/* ── Legende — absolut oben rechts im Graph-Canvas ── */}
        {legendOpen && (
          <div style={{
            position: "absolute", top: "0.9rem", right: "0.9rem", zIndex: 20,
            background: C.deep, border: `1px solid ${C.border}`,
            padding: "0.9rem 1rem", minWidth: 190,
            backdropFilter: "blur(8px)",
            pointerEvents: "auto",
          }}>
            <div style={{ fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.15em", color: C.muted, textTransform: "uppercase", marginBottom: "0.75rem" }}>
              Kohärenzfelder
            </div>
            {(Object.entries(CAT_COLOR) as [NodeCategory, string][]).filter(([cat]) => cat !== "leitmotiv" && cat !== "prinzip").map(([cat, color]) => {
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
                    opacity: hidden ? 0.25 : 1,
                    filter: hidden ? "grayscale(1)" : "none",
                    transition: "opacity 0.15s, filter 0.15s",
                  }}
                >
                  <span style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: hidden ? "transparent" : color,
                    border: `1.5px solid ${hidden ? "#3a3a3a" : color}`,
                    flexShrink: 0, transition: "background 0.15s, border-color 0.15s",
                  }} />
                  <span style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.85rem", color: hidden ? "#3a3a3a" : C.text }}>
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
            <LeitmotivLegendSection
              hiddenLeitmotive={hiddenLeitmotive}
              activeLeitmotive={new Set()}
              onToggle={id => setHiddenLeitmotive(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
              onReset={() => setHiddenLeitmotive(new Set())}
            />
            <PrinzipLegendSection
              hiddenPrinzipien={hiddenPrinzipien}
              onToggleGroup={(memberIds) => setHiddenPrinzipien(prev => {
                const n = new Set(prev);
                const allHidden = memberIds.every(id => n.has(id));
                if (allHidden) memberIds.forEach(id => n.delete(id));
                else memberIds.forEach(id => n.add(id));
                return n;
              })}
              onToggleMember={id => setHiddenPrinzipien(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
              onReset={() => setHiddenPrinzipien(new Set())}
            />
          </div>
        )}

        {/* ── Zoom Controls — absolut unten rechts im Graph-Canvas ── */}
        <div style={{
          position: "absolute", bottom: "1.2rem", right: "1.2rem",
          display: "flex", flexDirection: "column", gap: "2px",
          zIndex: 20, pointerEvents: "auto",
        }}>
          {[
            { label: "+", delta: 1.2,  aria: "Vergrößern",         resetLayout: false, reset: false },
            { label: "−", delta: 0.83, aria: "Verkleinern",        resetLayout: false, reset: false },
            { label: "↺", delta: 1,   aria: "Zoom zurücksetzen",   resetLayout: false, reset: true  },
            { label: "⊙", delta: 1,   aria: "Layout zurücksetzen", resetLayout: true,  reset: false },
          ].map(btn => (
            <button
              key={btn.label}
              aria-label={btn.aria}
              title={btn.aria}
              onClick={() => {
                if (btn.resetLayout) {
                  setNodePositions(new Map());
                  setZoomSync(1);
                  setPanSync({ x: 0, y: 0 });
                } else if (btn.reset) {
                  setZoomSync(1);
                  setPanSync({ x: 0, y: 0 });
                } else {
                  setZoomSync(clampZoom(zoomRef.current * (btn.delta ?? 1)));
                }
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

        </div>{/* end SVG-Container */}

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

            {/* ── Kategorien-Legende ─────────────────────────────────────────────
                Aktive Kategorien (ausgewählter Begriff + verbundene Begriffe)
                werden hervorgehoben. Alle Kategorien bleiben manuell schaltbar. */}
            <div style={{ height: 1, background: C.border, margin: "1.6rem 0 1.1rem" }} />
            <div style={{ fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.15em", color: C.muted, textTransform: "uppercase", marginBottom: "0.7rem" }}>
              Kohärenzfelder
            </div>
            {(Object.entries(CAT_COLOR) as [NodeCategory, string][]).filter(([cat]) => cat !== "leitmotiv" && cat !== "prinzip").map(([cat, color]) => {
              const hidden   = hiddenCats.has(cat);
              const isActive = activeCats.has(cat);
              return (
                <button
                  key={cat}
                  onClick={() => setHiddenCats(prev => {
                    const next = new Set(prev);
                    if (next.has(cat)) next.delete(cat); else next.add(cat);
                    return next;
                  })}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.5rem",
                    width: "100%", background: "none", border: "none",
                    cursor: "pointer", padding: "0.28rem 0",
                    opacity: hidden ? 0.22 : 1,
                    filter: hidden ? "grayscale(1)" : "none",
                    transition: "opacity 0.15s, filter 0.15s",
                  }}
                >
                  <span style={{
                    width: 9, height: 9, borderRadius: "50%",
                    background: hidden ? "transparent" : color,
                    border: `1.5px solid ${hidden ? "#3a3a3a" : color}`,
                    flexShrink: 0,
                    boxShadow: isActive && !hidden ? `0 0 7px ${color}66` : "none",
                    transition: "all 0.2s",
                  }} />
                  <span style={{
                    fontFamily: C.serif, fontStyle: "italic",
                    fontSize: "0.82rem",
                    color: hidden ? "#3a3a3a" : isActive ? C.textBright : C.textDim,
                    flex: 1, textAlign: "left",
                    transition: "color 0.2s",
                  }}>
                    {categoryLabel(cat)}
                  </span>
                  {/* Active indicator — small dot in category color */}
                  {isActive && !hidden && (
                    <span style={{
                      width: 3, height: 3, borderRadius: "50%",
                      background: color, flexShrink: 0,
                    }} />
                  )}
                </button>
              );
            })}
            {hiddenCats.size > 0 && (
              <button
                onClick={() => setHiddenCats(new Set())}
                style={{
                  marginTop: "0.65rem", width: "100%",
                  fontFamily: C.mono, fontSize: "0.56rem", letterSpacing: "0.1em",
                  textTransform: "uppercase", color: C.accent,
                  background: "none", border: `1px solid ${C.accentDim}`,
                  padding: "0.3rem 0.5rem", cursor: "pointer",
                }}
              >
                Alle einblenden
              </button>
            )}
            <LeitmotivLegendSection
              hiddenLeitmotive={hiddenLeitmotive}
              activeLeitmotive={activeLeitmotive}
              onToggle={id => setHiddenLeitmotive(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
              onReset={() => setHiddenLeitmotive(new Set())}
            />
            <PrinzipLegendSection
              hiddenPrinzipien={hiddenPrinzipien}
              onToggleGroup={(memberIds) => setHiddenPrinzipien(prev => {
                const n = new Set(prev);
                const allHidden = memberIds.every(id => n.has(id));
                if (allHidden) memberIds.forEach(id => n.delete(id));
                else memberIds.forEach(id => n.add(id));
                return n;
              })}
              onToggleMember={id => setHiddenPrinzipien(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
              onReset={() => setHiddenPrinzipien(new Set())}
            />

            {/* Close detail */}
            <div style={{ marginTop: "1.8rem" }}>
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem" }}>
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

          {/* ── Kompakte Legende im Mobile-Sheet ── */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "0.75rem", marginTop: "0.4rem" }}>
            <div style={{ fontFamily: C.mono, fontSize: "0.54rem", letterSpacing: "0.15em", color: C.muted, textTransform: "uppercase", marginBottom: "0.55rem" }}>
              Kohärenzfelder
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem 0.9rem" }}>
              {(Object.entries(CAT_COLOR) as [NodeCategory, string][]).filter(([cat]) => cat !== "leitmotiv" && cat !== "prinzip").map(([cat, color]) => {
                const hidden   = hiddenCats.has(cat);
                const isActive = activeCats.has(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => setHiddenCats(prev => {
                      const next = new Set(prev);
                      if (next.has(cat)) next.delete(cat); else next.add(cat);
                      return next;
                    })}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.38rem",
                      background: "none", border: "none", cursor: "pointer",
                      padding: "0.18rem 0",
                      opacity: hidden ? 0.22 : 1,
                      filter: hidden ? "grayscale(1)" : "none",
                      transition: "opacity 0.15s, filter 0.15s",
                    }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: hidden ? "transparent" : color,
                      border: `1.5px solid ${hidden ? "#3a3a3a" : color}`, flexShrink: 0,
                      boxShadow: isActive && !hidden ? `0 0 5px ${color}55` : "none",
                    }} />
                    <span style={{
                      fontFamily: C.serif, fontStyle: "italic", fontSize: "0.76rem",
                      color: hidden ? "#3a3a3a" : isActive ? C.textBright : C.textDim,
                    }}>
                      {categoryLabel(cat)}
                    </span>
                  </button>
                );
              })}
            </div>
            {hiddenCats.size > 0 && (
              <button
                onClick={() => setHiddenCats(new Set())}
                style={{
                  marginTop: "0.5rem",
                  fontFamily: C.mono, fontSize: "0.54rem", letterSpacing: "0.1em",
                  textTransform: "uppercase", color: C.accent,
                  background: "none", border: `1px solid ${C.accentDim}`,
                  padding: "0.22rem 0.5rem", cursor: "pointer",
                }}
              >
                Alle einblenden
              </button>
            )}
            <LeitmotivLegendSection
              hiddenLeitmotive={hiddenLeitmotive}
              activeLeitmotive={activeLeitmotive}
              onToggle={id => setHiddenLeitmotive(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
              onReset={() => setHiddenLeitmotive(new Set())}
              compact={true}
            />
            <PrinzipLegendSection
              hiddenPrinzipien={hiddenPrinzipien}
              onToggleGroup={(memberIds) => setHiddenPrinzipien(prev => {
                const n = new Set(prev);
                const allHidden = memberIds.every(id => n.has(id));
                if (allHidden) memberIds.forEach(id => n.delete(id));
                else memberIds.forEach(id => n.add(id));
                return n;
              })}
              onToggleMember={id => setHiddenPrinzipien(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
              onReset={() => setHiddenPrinzipien(new Set())}
              compact={true}
            />
          </div>
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
          Knoten ziehen · Hintergrund ziehen zum Verschieben · Scrollen zum Zoomen
        </div>
      )}


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

function LeitmotivLegendSection({
  hiddenLeitmotive,
  activeLeitmotive,
  onToggle,
  onReset,
  compact = false,
}: {
  hiddenLeitmotive: Set<string>;
  activeLeitmotive: Set<string>;
  onToggle: (id: string) => void;
  onReset: () => void;
  compact?: boolean;
}) {
  const lmNodes = NODES.filter(n => n.category === "leitmotiv");
  const LM_GLOW_LOCAL = "#e8dcc0";
  const LM_COLOR_LOCAL = "#c8b896";
  return (
    <>
      <div style={{
        fontFamily: "'Courier Prime','Courier New',monospace",
        fontSize: compact ? "0.54rem" : "0.58rem",
        letterSpacing: "0.15em", color: "#444",
        textTransform: "uppercase",
        marginBottom: compact ? "0.5rem" : "0.7rem",
        marginTop: compact ? "0.6rem" : 0,
        borderTop: compact ? "1px solid #2a2a2a" : "none",
        paddingTop: compact ? "0.6rem" : 0,
      }}>
        Leitmotive
      </div>
      <div style={compact ? { display: "flex", flexWrap: "wrap", gap: "0.25rem 0.9rem" } : {}}>
        {lmNodes.map(node => {
          const hidden   = hiddenLeitmotive.has(node.id);
          const isActive = activeLeitmotive.has(node.id);
          return (
            <button
              key={node.id}
              onClick={() => onToggle(node.id)}
              style={{
                display: "flex", alignItems: "center",
                gap: compact ? "0.38rem" : "0.5rem",
                width: compact ? "auto" : "100%",
                background: "none", border: "none",
                cursor: "pointer",
                padding: compact ? "0.18rem 0" : "0.28rem 0",
                opacity: hidden ? 0.22 : 1,
                filter: hidden ? "grayscale(1)" : "none",
                transition: "opacity 0.15s, filter 0.15s",
              }}
            >
              <span style={{
                width: compact ? 7 : 9,
                height: compact ? 7 : 9,
                borderRadius: "1px",           /* square dot — distinguishes from round category dots */
                background: hidden ? "transparent" : LM_COLOR_LOCAL,
                border: `1.5px solid ${hidden ? "#3a3a3a" : LM_GLOW_LOCAL}`,
                flexShrink: 0,
                boxShadow: isActive && !hidden ? `0 0 6px ${LM_COLOR_LOCAL}88` : "none",
                transition: "all 0.2s",
              }} />
              <span style={{
                fontFamily: "'Courier Prime','Courier New',monospace",
                fontSize: compact ? "0.72rem" : "0.78rem",
                letterSpacing: "0.1em",
                color: hidden ? "#3a3a3a" : isActive ? "#e8e2d4" : "#888",
                flex: compact ? undefined : 1,
                textAlign: "left",
                transition: "color 0.2s",
              }}>
                {node.label}
              </span>
              {isActive && !hidden && !compact && (
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: LM_COLOR_LOCAL, flexShrink: 0 }} />
              )}
            </button>
          );
        })}
      </div>
      {hiddenLeitmotive.size > 0 && (
        <button
          onClick={onReset}
          style={{
            marginTop: "0.5rem",
            width: compact ? "auto" : "100%",
            fontFamily: "'Courier Prime','Courier New',monospace",
            fontSize: compact ? "0.54rem" : "0.56rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#c4a882",
            background: "none",
            border: "1px solid #7a6a52",
            padding: "0.25rem 0.5rem",
            cursor: "pointer",
          }}
        >
          Alle einblenden
        </button>
      )}
    </>
  );
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    core:           "Resonanzkern",
    ontological:    "Daseinsfeld",
    relational:     "Zwischenfeld",
    language:       "Sprachfeld",
    knowledge:      "Denkfeld",
    temporal:       "Zeitraumfeld",
    transformation: "Wandlungsfeld",
    leitmotiv:      "Leitmotive",
    prinzip:        "Erkenntnisprinzipien",
  };
  return labels[cat] ?? cat;
}

function PrinzipLegendSection({
  hiddenPrinzipien,
  onToggleGroup,
  onToggleMember,
  onReset,
  compact = false,
}: {
  hiddenPrinzipien: Set<string>;
  onToggleGroup: (memberIds: string[]) => void;
  onToggleMember: (id: string) => void;
  onReset: () => void;
  compact?: boolean;
}) {
  const PR = "#8ea8b8";
  const PR_BRIGHT = "#c4d6e0";
  return (
    <>
      <div style={{
        fontFamily: "'Courier Prime','Courier New',monospace",
        fontSize: compact ? "0.54rem" : "0.58rem",
        letterSpacing: "0.15em", color: "#444",
        textTransform: "uppercase",
        marginBottom: compact ? "0.5rem" : "0.7rem",
        marginTop: compact ? "0.6rem" : "0.9rem",
        borderTop: "1px solid #2a2a2a",
        paddingTop: compact ? "0.6rem" : "0.7rem",
      }}>
        Erkenntnisprinzipien
      </div>
      <div>
        {PRINZIP_GROUPS.map(group => {
          const allHidden = group.memberIds.every(id => hiddenPrinzipien.has(id));
          return (
            <div key={group.id} style={{ marginBottom: compact ? "0.3rem" : "0.55rem" }}>
              <button
                onClick={() => onToggleGroup(group.memberIds)}
                title={group.description}
                style={{
                  display: "flex", alignItems: "center",
                  gap: compact ? "0.38rem" : "0.5rem",
                  width: "100%", background: "none", border: "none",
                  cursor: "pointer",
                  padding: compact ? "0.12rem 0" : "0.2rem 0",
                  opacity: allHidden ? 0.22 : 1,
                  filter: allHidden ? "grayscale(1)" : "none",
                  transition: "opacity 0.15s, filter 0.15s",
                }}
              >
                <span style={{
                  width: compact ? 7 : 9,
                  height: compact ? 7 : 9,
                  background: allHidden ? "transparent" : PR,
                  border: `1.5px solid ${allHidden ? "#3a3a3a" : PR_BRIGHT}`,
                  flexShrink: 0,
                  transform: "rotate(45deg)",
                }} />
                <span style={{
                  fontFamily: "'Courier Prime','Courier New',monospace",
                  fontSize: compact ? "0.7rem" : "0.76rem",
                  letterSpacing: "0.08em",
                  color: allHidden ? "#3a3a3a" : "#c8c2b4",
                  textAlign: "left",
                }}>
                  {group.label}
                </span>
              </button>
              {group.memberIds.length > 1 && (
                <div style={{
                  display: "flex", flexWrap: "wrap",
                  gap: "0.15rem 0.6rem",
                  paddingLeft: compact ? "0.9rem" : "1.2rem",
                  marginTop: "0.1rem",
                }}>
                  {group.memberIds.map(mid => {
                    const node = NODES.find(n => n.id === mid);
                    if (!node) return null;
                    const hidden = hiddenPrinzipien.has(mid);
                    return (
                      <button
                        key={mid}
                        onClick={() => onToggleMember(mid)}
                        style={{
                          display: "flex", alignItems: "center",
                          gap: "0.3rem",
                          background: "none", border: "none", cursor: "pointer",
                          padding: "0.08rem 0",
                          opacity: hidden ? 0.22 : 1,
                          filter: hidden ? "grayscale(1)" : "none",
                          transition: "opacity 0.15s, filter 0.15s",
                        }}
                      >
                        <span style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: hidden ? "transparent" : PR,
                          border: `1px solid ${hidden ? "#3a3a3a" : PR}`,
                          flexShrink: 0,
                        }} />
                        <span style={{
                          fontFamily: "'Courier Prime','Courier New',monospace",
                          fontSize: compact ? "0.64rem" : "0.68rem",
                          letterSpacing: "0.05em",
                          color: hidden ? "#3a3a3a" : "#888",
                        }}>
                          {node.fullLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {hiddenPrinzipien.size > 0 && (
        <button
          onClick={onReset}
          style={{
            marginTop: "0.5rem",
            width: compact ? "auto" : "100%",
            fontFamily: "'Courier Prime','Courier New',monospace",
            fontSize: compact ? "0.54rem" : "0.56rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: PR_BRIGHT,
            background: "none",
            border: `1px solid ${PR}`,
            padding: "0.25rem 0.5rem",
            cursor: "pointer",
          }}
        >
          Alle einblenden
        </button>
      )}
    </>
  );
}
