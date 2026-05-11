import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { NODES, EDGES, LEITMOTIV_EDGES, CAT_COLOR, PRINZIP_GROUPS, PRINZIP_PAIRS, type ConceptNode, type NodeCategory, type UserEdge, loadUserEdges, saveUserEdges } from "@/data/conceptGraph";
import { useEbookTheme } from "@/hooks/useEbookTheme";
import { loadResonanzenIndexLazy, groupResonanzenByNode, ENDPOINT_LABEL, ENDPOINT_COLOR, type ResonanzEntry } from "@/lib/resonanzenIndex";
// Zentrale Palette + Fonts — gleiche Sprache wie die Sub-Pages.
import { SERIF, MONO, C_DARK as THEME_DARK, C_LIGHT as THEME_LIGHT } from "@/lib/theme";

const PR_COLOR = "#8ea8b8";
const PR_GLOW  = "#c4d6e0";

interface ConceptGraphPageProps {
  onClose: () => void;
}

// ─── Leitmotiv geometry (theme-independent) ───────────────────────────────────
const LM_AURA_R = 68;
const LM_RING_R = 34;

// ─── Paletten: Dunkel (Standard) und Hell ────────────────────────────────────
type Palette = { readonly [K in keyof typeof C_DARK]: string };

const C_DARK = {
  ...THEME_DARK,
  ghost:     "#555",
  lmColor:   "#c8b896",
  lmGlow:    "#e8dcc0",
  panelBg:   "rgba(10,10,10,0.96)",
  overlayBg: "rgba(8,8,8,0.80)",
  serif:     SERIF,
  mono:      MONO,
} as const;

const C_LIGHT = {
  ...THEME_LIGHT,
  ghost:     "#b4aea8",
  lmColor:   "#9a8468",
  lmGlow:    "#7a6448",
  panelBg:   "rgba(245,245,244,0.97)",
  overlayBg: "rgba(230,226,218,0.85)",
  serif:     SERIF,
  mono:      MONO,
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

// ─── Layout algorithms for view modes ─────────────────────────────────────────
const CANVAS_CX = 460, CANVAS_CY = 280;

function computeClusterLayout(): Map<string, {x: number, y: number}> {
  const result = new Map<string, {x: number, y: number}>();
  const byCategory = new Map<NodeCategory, string[]>();
  for (const node of NODES) {
    if (!byCategory.has(node.category)) byCategory.set(node.category, []);
    byCategory.get(node.category)!.push(node.id);
  }
  const cats = Array.from(byCategory.keys());
  cats.forEach((cat, i) => {
    const ids = byCategory.get(cat)!;
    const angle = (2 * Math.PI * i) / cats.length - Math.PI / 2;
    const cx = CANVAS_CX + 210 * Math.cos(angle);
    const cy = CANVAS_CY + 210 * 0.76 * Math.sin(angle);
    if (ids.length === 1) {
      result.set(ids[0], { x: cx, y: cy });
    } else {
      ids.forEach((id, j) => {
        const r = Math.min(16 * ids.length, 60);
        const a = (2 * Math.PI * j) / ids.length;
        result.set(id, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      });
    }
  });
  return result;
}

function computeBaumLayout(): Map<string, {x: number, y: number}> {
  const result = new Map<string, {x: number, y: number}>();
  const RADII = [0, 120, 225, 320, 395];
  const visited = new Set<string>();
  const levels: string[][] = [];
  const queue: { id: string; level: number }[] = [{ id: "resonanzvernunft", level: 0 }];
  while (queue.length) {
    const { id, level } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (!levels[level]) levels[level] = [];
    levels[level].push(id);
    for (const n of Array.from(ADJACENCY.get(id) ?? new Set<string>())) {
      if (!visited.has(n)) queue.push({ id: n, level: level + 1 });
    }
  }
  for (const node of NODES) {
    if (!visited.has(node.id)) {
      const last = levels.length;
      if (!levels[last]) levels[last] = [];
      levels[last].push(node.id);
    }
  }
  levels.forEach((ids, level) => {
    const r = RADII[Math.min(level, RADII.length - 1)];
    if (level === 0) { result.set(ids[0], { x: CANVAS_CX, y: CANVAS_CY }); return; }
    ids.forEach((id, j) => {
      const angle = (2 * Math.PI * j) / ids.length - Math.PI / 2;
      result.set(id, { x: CANVAS_CX + r * Math.cos(angle), y: CANVAS_CY + r * 0.65 * Math.sin(angle) });
    });
  });
  return result;
}

// ─── Path algorithms ──────────────────────────────────────────────────────────

function bfsPath(src: string, tgt: string): string[] | null {
  if (src === tgt) return [src];
  const prev = new Map<string, string>();
  const queue = [src];
  const visited = new Set([src]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of Array.from(ADJACENCY.get(cur) ?? new Set<string>())) {
      if (visited.has(n)) continue;
      visited.add(n);
      prev.set(n, cur);
      if (n === tgt) {
        const path = [tgt];
        let c = tgt;
        while (prev.has(c)) { c = prev.get(c)!; path.unshift(c); }
        return path;
      }
      queue.push(n);
    }
  }
  return null;
}

function dijkstraSurprisingPath(src: string, tgt: string): string[] | null {
  // Weight = degree of destination node — hubs are "expensive", rare nodes are cheap
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const pq: Array<[number, string]> = [[0, src]];
  dist.set(src, 0);
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, u] = pq.shift()!;
    if (u === tgt) {
      const path = [tgt];
      let c = tgt;
      while (prev.has(c)) { c = prev.get(c)!; path.unshift(c); }
      return path;
    }
    if (d > (dist.get(u) ?? Infinity)) continue;
    for (const n of Array.from(ADJACENCY.get(u) ?? new Set<string>())) {
      const w = (ADJACENCY.get(n)?.size ?? 1);
      const nd = d + w;
      if (nd < (dist.get(n) ?? Infinity)) {
        dist.set(n, nd);
        prev.set(n, u);
        pq.push([nd, n]);
      }
    }
  }
  return null;
}

// ─── Pre-computed graph metrics (concept-to-concept edges only) ───────────────
// Leitmotiv edges are excluded: they're structurally a separate resonance layer,
// not concept-to-concept relationships, so including them would skew statistics.
const CONCEPT_EDGE_COUNT = EDGES.length;
const CROSS_CAT_EDGE_COUNT = EDGES.filter(
  e => NODE_MAP.get(e.source)?.category !== NODE_MAP.get(e.target)?.category
).length;

const TOP_HUBS = NODES
  .filter(n => n.category !== "leitmotiv" && n.category !== "prinzip")
  .sort((a, b) => (ADJACENCY.get(b.id)?.size ?? 0) - (ADJACENCY.get(a.id)?.size ?? 0))
  .slice(0, 5)
  .map(n => ({ id: n.id, label: n.label.replace("\n", " "), degree: ADJACENCY.get(n.id)?.size ?? 0 }));

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ConceptGraphPage({ onClose }: ConceptGraphPageProps) {
  const isDark = useEbookTheme();
  const C: Palette = isDark ? C_DARK : C_LIGHT;

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

  // Mobile bottom sheet — resizable height via drag handle
  const [sheetHeight, setSheetHeight]   = useState(50); // dvh units (25–82)
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetDragRef = useRef<{ startY: number; startH: number } | null>(null);
  const nodeDragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // View mode + animated layout transitions
  const [viewMode, setViewMode] = useState<"netz" | "cluster" | "baum" | "matrix">("netz");
  const [viewPositions, setViewPositions] = useState<Map<string, {x: number, y: number}>>(new Map());
  const viewModeRef = useRef<"netz" | "cluster" | "baum" | "matrix">("netz");
  const transitionRef = useRef<number | null>(null);

  // Connect mode — user-drawn edges persisted in localStorage
  const [connectMode, setConnectMode] = useState(false);
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const [userEdges, setUserEdges] = useState<UserEdge[]>(() => loadUserEdges());
  const [showUserEdges, setShowUserEdges] = useState(true);
  const [notePopup, setNotePopup] = useState<{ sourceId: string; targetId: string } | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const connectModeRef = useRef(false);
  const connectSourceRef = useRef<string | null>(null);
  const userEdgesRef = useRef<UserEdge[]>([]);
  userEdgesRef.current = userEdges; // always in sync with latest state

  // Path explorer — select two nodes to find shortest + surprising path
  const [pathMode, setPathMode] = useState(false);
  const [pathNodes, setPathNodes] = useState<[string | null, string | null]>([null, null]);
  const [pathResult, setPathResult] = useState<{ shortest: string[]; surprising: string[] } | null>(null);
  const pathModeRef = useRef(false);
  const pathNodesRef = useRef<[string | null, string | null]>([null, null]);
  // Pfad-Analyse — KI-Reflexion über die gefundenen Pfade (Single oder Vergleich)
  const [pathAnalysis, setPathAnalysis] = useState<string | null>(null);
  const [pathAnalysisLoading, setPathAnalysisLoading] = useState(false);
  const [pathAnalysisError, setPathAnalysisError] = useState<string | null>(null);

  // Spannungsfeld-Analyse — select two nodes → Gemini analysis
  const [analyseMode, setAnalyseMode] = useState(false);
  // Cluster-Analyse: 2–5 Knoten. Array statt Tupel, manueller Start statt Auto.
  const [analyseNodes, setAnalyseNodes] = useState<string[]>([]);
  const [analyseResult, setAnalyseResult] = useState<string | null>(null);
  const [analyseLoading, setAnalyseLoading] = useState(false);
  const [analyseError, setAnalyseError] = useState<string | null>(null);
  const analyseModeRef = useRef(false);
  const analyseNodesRef = useRef<string[]>([]);

  // Lesepfad — session-only visit trail (no localStorage)
  const [visitedNodes, setVisitedNodes] = useState<string[]>([]);

  // Resonanzen-Korpus für Sidebar-Section "Resonanzen zu diesem Begriff".
  // Lazy geladen, kein blockierender Effect — Sidebar funktioniert auch ohne.
  const [resonanzenEntries, setResonanzenEntries] = useState<ResonanzEntry[] | null>(null);
  const [resonanzenExpanded, setResonanzenExpanded] = useState(false);
  useEffect(() => {
    loadResonanzenIndexLazy().then(idx => {
      if (idx) setResonanzenEntries(idx.entries);
    });
  }, []);
  const resonanzenByNode = useMemo(
    () => resonanzenEntries ? groupResonanzenByNode(resonanzenEntries) : null,
    [resonanzenEntries]
  );
  // Bei Knoten-Wechsel die Resonanzen-Sektion wieder auf "minimal" zurücksetzen,
  // damit jeder neue Knoten frisch mit der Default-Anzeige startet.
  useEffect(() => { setResonanzenExpanded(false); }, [selectedId]);

  // Graph-Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "model"; text: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Cluster-Analyse starten (manueller Trigger via Button im Panel).
  // Nimmt die aktuelle analyseNodes-Liste (2-5 Konzepte), schickt sie an
  // /api/analyse-cluster, schreibt das Resultat in analyseResult.
  const runClusterAnalysis = useCallback(() => {
    const ids = analyseNodesRef.current;
    if (ids.length < 2 || ids.length > 4) return;
    const nodes = ids.map(id => NODE_MAP.get(id)).filter(Boolean);
    if (nodes.length !== ids.length) return;
    setAnalyseLoading(true);
    setAnalyseError(null);
    setAnalyseResult(null);
    fetch("/api/analyse-cluster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodes: nodes.map(n => ({
          id: n!.id, label: n!.label, fullLabel: n!.fullLabel, description: n!.description,
        })),
      }),
    })
      .then(r => r.json())
      .then(data => {
        setAnalyseLoading(false);
        if (data.error) setAnalyseError(data.error);
        else setAnalyseResult(data.analysis ?? null);
      })
      .catch(err => {
        setAnalyseLoading(false);
        setAnalyseError(err instanceof Error ? err.message : "Verbindungsfehler");
      });
  }, []);

  // Pfad-Analyse starten — KI-Reflexion über shortest + (optional) surprising.
  // Wird nur enabled, wenn shortest 3-5 Knoten lang ist (siehe UI-Button-Logik).
  // Server entscheidet automatisch zwischen Einzelpfad und Vergleichs-Variante.
  const runPathAnalysis = useCallback((from: string, to: string, shortest: string[], surprising: string[]) => {
    if (shortest.length < 3 || shortest.length > 5) return;
    setPathAnalysisLoading(true);
    setPathAnalysisError(null);
    setPathAnalysis(null);
    const samePath = surprising.length === shortest.length && shortest.every((id, i) => id === surprising[i]);
    const body: { from: string; to: string; shortest: string[]; surprising?: string[] } = { from, to, shortest };
    if (surprising.length >= 3 && surprising.length <= 5 && !samePath) {
      body.surprising = surprising;
    }
    fetch("/api/analyse-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(r => r.json())
      .then(data => {
        setPathAnalysisLoading(false);
        if (data.error) setPathAnalysisError(data.error);
        else setPathAnalysis(data.analysis ?? null);
      })
      .catch(err => {
        setPathAnalysisLoading(false);
        setPathAnalysisError(err instanceof Error ? err.message : "Verbindungsfehler");
      });
  }, []);

  // Beim Wechsel des View-Modus alle Arbeitsfunktions-Panels schließen,
  // damit keine Stale-Overlays aus einem nicht mehr aktiven View bestehen
  // bleiben. Refs werden mitsynchronisiert, weil onClick-Handler sie lesen.
  useEffect(() => {
    setConnectMode(false); connectModeRef.current = false;
    setConnectSource(null); connectSourceRef.current = null;
    setPathMode(false); pathModeRef.current = false;
    setPathNodes([null, null]); pathNodesRef.current = [null, null];
    setPathResult(null);
    setPathAnalysis(null); setPathAnalysisError(null);
    setAnalyseMode(false); analyseModeRef.current = false;
    setAnalyseNodes([]); analyseNodesRef.current = [];
    setAnalyseResult(null);
    setAnalyseError(null);
    setChatOpen(false);
    setNotePopup(null);
  }, [viewMode]);

  // Clamp zoom
  const clampZoom = (z: number) => Math.max(0.4, Math.min(2.8, z));

  // ── Pan / Zoom handlers ────────────────────────────────────────────────────
  // onMouseDown lives on the <svg> (not a child rect) so it fires for clicks
  // anywhere — including on node circles, which are siblings of any background rect.
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    hasDraggedRef.current = false;
    if (viewModeRef.current === "matrix") return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: panRef.current.x, py: panRef.current.y };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (nodeDragRef.current) {
      if (viewModeRef.current !== "netz") { nodeDragRef.current = null; return; }
      const dx = (e.clientX - nodeDragRef.current.startClientX) / zoomRef.current;
      const dy = (e.clientY - nodeDragRef.current.startClientY) / zoomRef.current;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDraggedRef.current = true;
      // Capture before setNodePositions — updater runs async and nodeDragRef may be
      // null by then (stopDrag called between mousemove and the state flush).
      const id = nodeDragRef.current.id;
      const ox = nodeDragRef.current.origX;
      const oy = nodeDragRef.current.origY;
      setNodePositions(prev => new Map(prev).set(id, { x: ox + dx, y: oy + dy }));
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
      const ox = nodeDragRef.current.origX;
      const oy = nodeDragRef.current.origY;
      setNodePositions(prev => new Map(prev).set(id, { x: ox + dx, y: oy + dy }));
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
    dragRef.current     = null;
    pinchRef.current    = null;
    nodeDragRef.current = null;  // was missing — left stale node-drag state on touch
    setDraggingNodeId(null);
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

  // 2-Hop: nodes at distance 2 from focusId (excluding focusId and 1-hop neighbors)
  const nearIds: Set<string> = useMemo(() => {
    if (!focusId) return new Set<string>();
    const near = new Set<string>();
    for (const connId of Array.from(connectedIds)) {
      for (const n of Array.from(ADJACENCY.get(connId) ?? new Set<string>())) {
        if (n !== focusId && !connectedIds.has(n)) near.add(n);
      }
    }
    return near;
  }, [focusId, connectedIds]);

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

  // ── Kohärenz-Metrik: live stats for selected node ─────────────────────────
  const nodeMetrics = useMemo(() => {
    if (!selectedNode) return null;
    const id = selectedNode.id;
    // Degree: all direct connections (concept + leitmotiv, as visible in graph)
    const degree = ADJACENCY.get(id)?.size ?? 0;
    // Spannungsfelder: concept-to-concept edges where the other node is a different category
    // Only EDGES (not LEITMOTIV_EDGES) — leitmotiv connections are resonance, not conceptual tension
    const crossCat = EDGES.filter(
      e => (e.source === id || e.target === id) &&
           (() => {
             const other = e.source === id ? e.target : e.source;
             return NODE_MAP.get(other)?.category !== selectedNode.category;
           })()
    ).length;
    const ownEdges = userEdges.filter(e => e.source === id || e.target === id).length;
    return { degree, crossCat, ownEdges };
  }, [selectedNode, userEdges]);

  // ── Graph-Chat send ────────────────────────────────────────────────────────
  const sendChat = useCallback(async (msg: string) => {
    const text = msg.trim();
    if (!text || chatLoading) return;
    const userMsg = { role: "user" as const, text };
    const nextHistory = [...chatHistory, userMsg];
    setChatHistory(nextHistory);
    setChatInput("");
    setChatLoading(true);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    try {
      const r = await fetch("/api/graph-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: chatHistory }),
      });
      const data = await r.json();
      const reply = data.reply ?? data.error ?? "Keine Antwort.";
      setChatHistory(h => [...h, { role: "model", text: reply }]);
    } catch {
      setChatHistory(h => [...h, { role: "model", text: "Verbindungsfehler — bitte erneut versuchen." }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    }
  }, [chatHistory, chatLoading]);

  // ── Node click handler ─────────────────────────────────────────────────────
  const handleNodeClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (hasDraggedRef.current) return;

    if (pathModeRef.current) {
      const [src] = pathNodesRef.current;
      if (!src) {
        pathNodesRef.current = [id, null];
        setPathNodes([id, null]);
        setPathResult(null);
        setPathAnalysis(null); setPathAnalysisError(null);
      } else if (src === id) {
        pathNodesRef.current = [null, null];
        setPathNodes([null, null]);
        setPathResult(null);
        setPathAnalysis(null); setPathAnalysisError(null);
      } else {
        const shortest = bfsPath(src, id) ?? [];
        const surprising = dijkstraSurprisingPath(src, id) ?? [];
        pathNodesRef.current = [src, id];
        setPathNodes([src, id]);
        setPathResult({ shortest, surprising });
        setPathAnalysis(null); setPathAnalysisError(null);
      }
      return;
    }

    if (analyseModeRef.current) {
      // Multi-Node-Cluster-Auswahl (2–4 Knoten). Toggle-Logik:
      //   Knoten in Liste → entfernen
      //   Knoten neu, Liste < 4 → hinzufügen
      //   Liste === 4 → ignorieren (Quadratur ist die Obergrenze; bei 5+
      //   Konzepten verliert die KI-Analyse Fokus, siehe Phase-2.5-Diskussion)
      // Analyse wird nicht automatisch gestartet — der Nutzer drückt
      // explizit "Analyse starten" im Panel.
      const current = analyseNodesRef.current;
      let next: string[];
      if (current.includes(id)) {
        next = current.filter(x => x !== id);
      } else if (current.length >= 4) {
        return; // Limit erreicht — ignoriere
      } else {
        next = [...current, id];
      }
      analyseNodesRef.current = next;
      setAnalyseNodes(next);
      // Bei jeder Selektionsänderung das alte Ergebnis verwerfen
      setAnalyseResult(null);
      setAnalyseError(null);
      return;
    }

    if (connectModeRef.current) {
      if (!connectSourceRef.current) {
        connectSourceRef.current = id;
        setConnectSource(id);
      } else if (connectSourceRef.current === id) {
        connectSourceRef.current = null;
        setConnectSource(null);
      } else {
        const src = connectSourceRef.current;
        const tgt = id;
        const existsBook = ADJACENCY.get(src)?.has(tgt) || ADJACENCY.get(tgt)?.has(src);
        const existsUser = userEdgesRef.current.some(
          e => (e.source === src && e.target === tgt) || (e.source === tgt && e.target === src)
        );
        if (!existsBook && !existsUser && userEdgesRef.current.length < 30) {
          setNotePopup({ sourceId: src, targetId: tgt });
          setNoteInput("");
        }
        connectSourceRef.current = null;
        setConnectSource(null);
      }
      return;
    }

    setSelectedId(prev => {
      if (prev !== id) {
        setVisitedNodes(vp => {
          if (vp[vp.length - 1] === id) return vp;
          return [...vp, id].slice(-25);
        });
      }
      return prev === id ? null : id;
    });
    setSearchQuery("");
    setLegendOpen(false);
  }, []);

  // ── Mobile sheet drag — global move/end listeners ─────────────────────────
  const SHEET_SNAPS = [25, 50, 80] as const;
  useEffect(() => {
    const onMove = (e: TouchEvent | MouseEvent) => {
      if (!sheetDragRef.current) return;
      const clientY = 'touches' in e
        ? (e as TouchEvent).touches[0].clientY
        : (e as MouseEvent).clientY;
      const deltaDvh = ((sheetDragRef.current.startY - clientY) / window.innerHeight) * 100;
      setSheetHeight(Math.max(20, Math.min(85, sheetDragRef.current.startH + deltaDvh)));
    };
    const onEnd = () => {
      if (!sheetDragRef.current) return;
      sheetDragRef.current = null;
      setSheetDragging(false);
      setSheetHeight(h => SHEET_SNAPS.reduce((a, b) => Math.abs(b - h) < Math.abs(a - h) ? b : a));
    };
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend',  onEnd);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onEnd);
    return () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onEnd);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── View mode transition — animate positions via RAF lerp ─────────────────
  useEffect(() => {
    viewModeRef.current = viewMode;
    if (transitionRef.current !== null) cancelAnimationFrame(transitionRef.current);
    if (viewMode === "netz" || viewMode === "matrix") {
      setViewPositions(new Map());
      return;
    }
    const target = viewMode === "cluster" ? computeClusterLayout() : computeBaumLayout();
    // Snapshot start: prefer live drag positions, then current view positions, then defaults
    const start = new Map<string, {x: number, y: number}>();
    for (const node of NODES) {
      start.set(node.id,
        nodePositions.get(node.id) ??
        viewPositions.get(node.id) ??
        { x: node.x, y: node.y }
      );
    }
    let frame = 0;
    const FRAMES = 40;
    const tick = () => {
      frame++;
      const t = frame / FRAMES;
      const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const cur = new Map<string, {x: number, y: number}>();
      for (const node of NODES) {
        const s = start.get(node.id)!;
        const e = target.get(node.id) ?? { x: node.x, y: node.y };
        cur.set(node.id, { x: s.x + (e.x - s.x) * ease, y: s.y + (e.y - s.y) * ease });
      }
      setViewPositions(cur);
      if (frame < FRAMES) transitionRef.current = requestAnimationFrame(tick);
      else { setViewPositions(target); transitionRef.current = null; }
    };
    transitionRef.current = requestAnimationFrame(tick);
    return () => { if (transitionRef.current !== null) cancelAnimationFrame(transitionRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

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

  // Resolves live position: user drag > view-mode layout > design default
  const getPos = (id: string): {x: number, y: number} => {
    return nodePositions.get(id)
      ?? viewPositions.get(id)
      ?? { x: NODE_MAP.get(id)?.x ?? 0, y: NODE_MAP.get(id)?.y ?? 0 };
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
        background: C.panelBg, backdropFilter: "blur(12px)",
      }}>
        {/* Zeile 1: Titel + view-Switcher + Workfunc-Buttons + Legende + Schließen.
            flexWrap erlaubt Umbruch auf Mobile, wenn die 4 Workfunc-Buttons
            nicht mehr in eine Reihe passen — sie springen dann unter den Header. */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", rowGap: "0.4rem" }}>
          <span style={{ fontFamily: C.mono, fontSize: "0.72rem", letterSpacing: "0.18em", color: C.accent, textTransform: "uppercase", flexShrink: 0 }}>
            Begriffsnetz
          </span>

          {/* View mode switcher */}
          <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
            {([
              { mode: "netz",    icon: "◎", title: "Netz — Zusammenhänge"   },
              { mode: "cluster", icon: "⬡", title: "Cluster — Kategorien"   },
              { mode: "baum",    icon: "⌥", title: "Baum — Hierarchie"      },
              { mode: "matrix",  icon: "▦", title: "Matrix — Verbindungsdichte" },
            ] as const).map(({ mode, icon, title }) => {
              const active = viewMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  title={title}
                  style={{
                    fontFamily: C.mono, fontSize: "0.75rem",
                    width: 26, height: 26,
                    background: active ? "rgba(196,168,130,0.12)" : "none",
                    border: `1px solid ${active ? C.accentDim : C.border}`,
                    color: active ? C.accent : C.muted,
                    cursor: "pointer", padding: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s", borderRadius: 6,
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = C.muted; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; } }}
                >
                  {icon}
                </button>
              );
            })}
          </div>

          {/* Workfunc-Buttons als gruppierter Container — auf Mobile per CSS
              in eigene Zeile gezwungen, damit die langen deutschen Labels
              nicht den Header überlaufen lassen. */}
          <div className="concept-workfunc-group" style={{
            display: "flex", gap: "0.4rem", marginLeft: "auto", flexWrap: "wrap",
          }}>
          {/* Connect mode button — nur im Netz-Modus */}
          {viewMode === "netz" && (
            <button
              onClick={() => {
                const next = !connectMode;
                connectModeRef.current = next;
                setConnectMode(next);
                if (!next) { connectSourceRef.current = null; setConnectSource(null); }
              }}
              title={connectMode ? "Verbinden-Modus beenden" : "Eigene Verbindung hinzufügen (max. 30)"}
              style={{
                fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: connectMode ? C.accent : C.muted,
                background: connectMode ? "rgba(196,168,130,0.08)" : "none",
                border: `1px solid ${connectMode ? C.accentDim : C.border}`,
                padding: "0.3rem 0.65rem", cursor: "pointer",
                transition: "all 0.15s", flexShrink: 0, borderRadius: 6,
              }}
              onMouseEnter={e => { if (!connectMode) { e.currentTarget.style.color = C.accent; e.currentTarget.style.borderColor = C.accentDim; } }}
              onMouseLeave={e => { if (!connectMode) { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; } }}
            >
              {connectMode ? "✕ Verbinden" : "+ Verbinden"}
            </button>
          )}

          {/* Pfad-Explorer button */}
          {viewMode !== "matrix" && (
            <button
              onClick={() => {
                const next = !pathMode;
                pathModeRef.current = next;
                setPathMode(next);
                if (!next) {
                  pathNodesRef.current = [null, null];
                  setPathNodes([null, null]);
                  setPathResult(null);
                }
                // Deactivate connect mode when entering path mode
                if (next && connectModeRef.current) {
                  connectModeRef.current = false;
                  setConnectMode(false);
                  connectSourceRef.current = null;
                  setConnectSource(null);
                }
              }}
              title={pathMode ? "Pfad-Explorer beenden" : "Pfad zwischen zwei Konzepten finden"}
              style={{
                fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: pathMode ? "#7eb8c8" : C.muted,
                background: pathMode ? "rgba(126,184,200,0.08)" : "none",
                border: `1px solid ${pathMode ? "#4a8898" : C.border}`,
                padding: "0.3rem 0.65rem", cursor: "pointer",
                transition: "all 0.15s", flexShrink: 0, borderRadius: 6,
              }}
              onMouseEnter={e => { if (!pathMode) { e.currentTarget.style.color = "#7eb8c8"; e.currentTarget.style.borderColor = "#4a8898"; } }}
              onMouseLeave={e => { if (!pathMode) { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; } }}
            >
              {pathMode ? "✕ Pfad" : "◈ Pfad"}
            </button>
          )}

          {/* Spannungsfeld-Analyse button */}
          {viewMode !== "matrix" && (
            <button
              onClick={() => {
                const next = !analyseMode;
                analyseModeRef.current = next;
                setAnalyseMode(next);
                if (!next) {
                  analyseNodesRef.current = [];
                  setAnalyseNodes([]);
                  setAnalyseResult(null);
                  setAnalyseError(null);
                }
                // Deactivate other modes
                if (next) {
                  if (connectModeRef.current) { connectModeRef.current = false; setConnectMode(false); connectSourceRef.current = null; setConnectSource(null); }
                  if (pathModeRef.current) { pathModeRef.current = false; setPathMode(false); pathNodesRef.current = [null, null]; setPathNodes([null, null]); setPathResult(null); }
                }
              }}
              title={analyseMode ? "Spannungsfeld-Analyse beenden" : "Spannungsfeld zweier Konzepte analysieren (KI)"}
              style={{
                fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: analyseMode ? "#5aacb8" : C.muted,
                background: analyseMode ? "rgba(90,172,184,0.08)" : "none",
                border: `1px solid ${analyseMode ? "#3a8a96" : C.border}`,
                padding: "0.3rem 0.65rem", cursor: "pointer",
                transition: "all 0.15s", flexShrink: 0, borderRadius: 6,
              }}
              onMouseEnter={e => { if (!analyseMode) { e.currentTarget.style.color = "#5aacb8"; e.currentTarget.style.borderColor = "#3a8a96"; } }}
              onMouseLeave={e => { if (!analyseMode) { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; } }}
            >
              {analyseMode ? "✕ Analyse" : "⚡ Analyse"}
            </button>
          )}

          {/* Graph-Chat button */}
          {viewMode !== "matrix" && (
            <button
              onClick={() => setChatOpen(o => !o)}
              title={chatOpen ? "Dialog schließen" : "Freier Dialog über das Begriffsnetz (KI)"}
              style={{
                fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: chatOpen ? "#7ab898" : C.muted,
                background: chatOpen ? "rgba(122,184,152,0.08)" : "none",
                border: `1px solid ${chatOpen ? "#4a9870" : C.border}`,
                padding: "0.3rem 0.65rem", cursor: "pointer",
                transition: "all 0.15s", flexShrink: 0, borderRadius: 6,
              }}
              onMouseEnter={e => { if (!chatOpen) { e.currentTarget.style.color = "#7ab898"; e.currentTarget.style.borderColor = "#4a9870"; } }}
              onMouseLeave={e => { if (!chatOpen) { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; } }}
            >
              {chatOpen ? "✕ Dialog" : "◎ Dialog"}
            </button>
          )}
          </div>{/* /concept-workfunc-group */}

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
                transition: "all 0.15s", flexShrink: 0, borderRadius: 6,
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
            if (hasDraggedRef.current) return;
            if (pathModeRef.current) {
              pathNodesRef.current = [null, null];
              setPathNodes([null, null]);
              setPathResult(null);
              return;
            }
            if (analyseModeRef.current) {
              analyseNodesRef.current = [];
              setAnalyseNodes([]);
              return;
            }
            if (connectModeRef.current) {
              connectSourceRef.current = null;
              setConnectSource(null);
              return;
            }
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
                    fill={C.lmColor}
                    fillOpacity={dim ? 0.018 : 0.055}
                  />
                  {/* Mid dashed ring — Faltung suggestion */}
                  <circle
                    cx={x} cy={y} r={node.r + LM_RING_R}
                    fill="none"
                    stroke={C.lmColor}
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
                  stroke={C.lmColor}
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
              const bothNear = state === "dim" && nearIds.has(edge.source) && nearIds.has(edge.target);

              const opacity =
                state === "focus"   ? (isPrimary ? 0.80 : 0.65) :
                state === "neutral" ? (isPrimary ? 0.30 : 0.15) :
                bothNear            ? 0.10 :
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

            {/* ── User Edges — gestrichelte amber Linien über den Buch-Kanten ── */}
            {showUserEdges && userEdges.map((edge, i) => {
              const srcPos = getPos(edge.source);
              const tgtPos = getPos(edge.target);
              const mx = (srcPos.x + tgtPos.x) / 2;
              const my = (srcPos.y + tgtPos.y) / 2;
              const dx = tgtPos.x - srcPos.x;
              const dy = tgtPos.y - srcPos.y;
              const len = Math.hypot(dx, dy) || 1;
              const curve = Math.min(len * 0.18, 35);
              const cpx = mx + (-dy / len) * curve;
              const cpy = my + (dx / len) * curve;
              const focusSrc = edge.source === focusId || edge.source === connectSource;
              const focusTgt = edge.target === focusId || edge.target === connectSource;
              const isFocused = focusSrc || focusTgt;
              return (
                <g key={`user-edge-${i}`} style={{ pointerEvents: "none" }}>
                  <path
                    d={`M ${srcPos.x} ${srcPos.y} Q ${cpx} ${cpy} ${tgtPos.x} ${tgtPos.y}`}
                    fill="none"
                    stroke={C.accent}
                    strokeWidth={isFocused ? 1.8 : 1.3}
                    strokeDasharray="4 5"
                    opacity={isFocused ? 0.85 : 0.55}
                    strokeLinecap="round"
                  />
                  {edge.note && (
                    <text
                      x={cpx} y={cpy - 4}
                      textAnchor="middle"
                      fontSize="7"
                      fontFamily={C.serif}
                      fontStyle="italic"
                      fill={C.accent}
                      opacity={0.55}
                    >
                      {edge.note.length > 22 ? edge.note.slice(0, 22) + "…" : edge.note}
                    </text>
                  )}
                </g>
              );
            })}

            {/* ── Path highlight layer ── */}
            {pathResult && (() => {
              const renderPath = (path: string[], color: string, opacity: number, width: number) =>
                path.length < 2 ? null : path.slice(0, -1).map((nid, i) => {
                  const nextId = path[i + 1];
                  const p1 = getPos(nid);
                  const p2 = getPos(nextId);
                  const mx = (p1.x + p2.x) / 2;
                  const my = (p1.y + p2.y) / 2;
                  const dx = p2.x - p1.x, dy = p2.y - p1.y;
                  const len = Math.hypot(dx, dy) || 1;
                  const curve = Math.min(len * 0.14, 28);
                  const cpx = mx + (-dy / len) * curve;
                  const cpy = my + (dx / len) * curve;
                  return (
                    <path
                      key={`path-${color}-${nid}-${nextId}`}
                      d={`M ${p1.x} ${p1.y} Q ${cpx} ${cpy} ${p2.x} ${p2.y}`}
                      fill="none" stroke={color} strokeWidth={width}
                      opacity={opacity} strokeLinecap="round"
                      style={{ pointerEvents: "none" }}
                    />
                  );
                });
              const isSamePath = pathResult.shortest.join() === pathResult.surprising.join();
              return (
                <g>
                  {!isSamePath && renderPath(pathResult.surprising, "#7eb8c8", 0.55, 2.2)}
                  {renderPath(pathResult.shortest, "#e8d090", 0.80, 2.8)}
                </g>
              );
            })()}

            {/* ── Lesepfad Trail: straight dashed lines between visited nodes ── */}
            {visitedNodes.length >= 2 && visitedNodes.slice(0, -1).map((fromId, i) => {
              const toId = visitedNodes[i + 1];
              if (!NODE_MAP.has(fromId) || !NODE_MAP.has(toId)) return null;
              const a = getPos(fromId);
              const b = getPos(toId);
              return (
                <line
                  key={`trail-${i}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={C.textDim}
                  strokeWidth={0.7}
                  strokeDasharray="2 5"
                  opacity={0.25}
                  style={{ pointerEvents: "none" }}
                />
              );
            })}

            {/* ── Nodes (concept layer — skip leitmotiv & prinzip, rendered separately) ── */}
            {NODES.map(node => {
              if (node.category === "leitmotiv") return null; // rendered in leitmotiv pass below
              if (node.category === "prinzip")   return null; // rendered in prinzip pass below
              const state = nodeState(node.id);
              const isGhost = state === "hidden"; // deactivated via legend — render as ghost, not null
              const catColor = CAT_COLOR[node.category];
              const isFocus = state === "focus";
              const isConnected = state === "connected";
              const isDim = state === "dim";
              const isNear = isDim && nearIds.has(node.id);

              const fillOpacity =
                isGhost     ? 0.04 :
                isFocus     ? 1 :
                isConnected ? 0.85 :
                isNear      ? 0.55 :
                isDim       ? 0.4 :
                0.7;

              const fill = isFocus ? catColor : C.surface;
              const strokeColor = isGhost ? C.border : isFocus ? catColor : isConnected ? catColor : isNear ? catColor : isDim ? C.border : catColor;
              const strokeOpacity = isGhost ? 0.10 : isFocus ? 1 : isConnected ? 0.7 : isNear ? 0.40 : isDim ? 0.3 : 0.5;
              const strokeWidth = isFocus ? 2.5 : isConnected ? 1.8 : 1.2;

              const labelColor = isGhost ? C.muted : isFocus
                ? C.void
                : isConnected ? C.textBright : isNear ? "#aaa" : isDim ? C.textDim : C.text;
              const labelOpacity = isGhost ? 0.07 : isNear ? 0.55 : isDim ? 0.4 : 1;

              // Split label on \n
              const lines = node.label.split("\n");
              const {x, y} = getPos(node.id);

              return (
                <g
                  key={node.id}
                  style={{ cursor: isGhost ? "default" : "pointer", pointerEvents: isGhost ? "none" : undefined }}
                  onClick={isGhost ? undefined : e => handleNodeClick(e, node.id)}
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
                  {/* Connect-source indicator — amber pulsing ring */}
                  {connectSource === node.id && (
                    <circle
                      cx={x} cy={y} r={node.r + 11}
                      fill="none"
                      stroke={C.accent}
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      opacity={0.8}
                    />
                  )}

                  {/* Path-mode indicator — blue ring for selected start node */}
                  {pathNodes[0] === node.id && !pathNodes[1] && (
                    <circle
                      cx={x} cy={y} r={node.r + 11}
                      fill="none"
                      stroke="#7eb8c8"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      opacity={0.85}
                    />
                  )}
                  {/* Path-mode: endpoint ring */}
                  {pathResult && (pathNodes[0] === node.id || pathNodes[1] === node.id) && (
                    <circle
                      cx={x} cy={y} r={node.r + 8}
                      fill="none"
                      stroke="#e8d090"
                      strokeWidth={1.8}
                      opacity={0.75}
                    />
                  )}

                  {/* Analyse-mode: gewählte Knoten heben sich ab.
                      1 Knoten gewählt → gestrichelt (Andeutung: weitere möglich)
                      2+ Knoten gewählt → fester Ring (Cluster bereit) */}
                  {analyseNodes.includes(node.id) && (
                    <circle
                      cx={x} cy={y} r={node.r + (analyseNodes.length === 1 ? 11 : 8)}
                      fill="none"
                      stroke="#5aacb8"
                      strokeWidth={analyseNodes.length === 1 ? 1.5 : 1.8}
                      strokeDasharray={analyseNodes.length === 1 ? "5 4" : undefined}
                      opacity={analyseNodes.length === 1 ? 0.85 : 0.7}
                    />
                  )}

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
              const isGhost  = state === "hidden";
              const isFocus  = state === "focus";
              const isDim    = state === "dim";
              const isConn   = state === "connected";
              const isNear   = isDim && nearIds.has(node.id);

              const ringOpacity  = isGhost ? 0.07 : isNear ? 0.40 : isDim ? 0.25 : isFocus ? 1 : isConn ? 0.85 : 0.65;
              const fillOpacity  = isGhost ? 0.03 : isFocus ? 0.22 : isNear ? 0.07 : isDim ? 0.04 : 0.10;
              const labelOpacity = isGhost ? 0.05 : isNear ? 0.5 : isDim ? 0.3  : 1;
              const outerR       = node.r + (isFocus ? 8 : 4);
              const {x, y} = getPos(node.id);

              return (
                <g
                  key={node.id}
                  style={{ cursor: isGhost ? "default" : "pointer", pointerEvents: isGhost ? "none" : undefined }}
                  onClick={isGhost ? undefined : e => handleNodeClick(e, node.id)}
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
                      stroke={C.lmGlow}
                      strokeWidth={1.2}
                      opacity={0.3}
                    />
                  )}

                  {/* Übergeordnet corona — VERWANDLUNG only: second outer ring */}
                  {node.id === "lm-verwandlung" && (
                    <circle
                      cx={x} cy={y} r={outerR + 10}
                      fill="none"
                      stroke={C.lmGlow}
                      strokeWidth={0.6}
                      strokeDasharray="1 8"
                      opacity={isDim ? 0.1 : 0.45}
                    />
                  )}

                  {/* Outer decorative ring */}
                  <circle
                    cx={x} cy={y} r={outerR}
                    fill="none"
                    stroke={C.lmColor}
                    strokeWidth={isFocus ? 1.5 : node.id === "lm-verwandlung" ? 1.2 : 0.8}
                    strokeDasharray={isFocus ? "none" : "2 5"}
                    opacity={ringOpacity * 0.6}
                  />

                  {/* Inner filled circle */}
                  <circle
                    cx={x} cy={y} r={node.r}
                    fill={C.lmGlow}
                    fillOpacity={fillOpacity}
                    stroke={C.lmGlow}
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
                    fill={C.lmGlow}
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
              const bothGhost = sA === "hidden" && sB === "hidden";
              const pA = getPos(a);
              const pB = getPos(b);
              return (
                <line
                  key={`pr-pair-${i}`}
                  x1={pA.x} y1={pA.y} x2={pB.x} y2={pB.y}
                  stroke={PR_COLOR}
                  strokeWidth={0.7}
                  strokeDasharray="2 6"
                  opacity={bothGhost ? 0.04 : 0.35}
                  style={{ pointerEvents: "none" }}
                />
              );
            })}

            {/* ══ PRINZIP LAYER 2: Principle nodes (meta-overlay) ═══════════
                Small circles with dashed outer ring in cool blue-silver.
                Distinct from concept nodes and leitmotive by styling. */}
            {NODES.filter(n => n.category === "prinzip").map(node => {
              const state   = nodeState(node.id);
              const isGhost = state === "hidden";
              const isFocus = state === "focus";
              const isConn  = state === "connected";
              const isDim   = state === "dim";
              const isNear  = isDim && nearIds.has(node.id);
              const {x, y}  = getPos(node.id);
              const ringOpacity = isGhost ? 0.07 : isNear ? 0.40 : isDim ? 0.25 : isFocus ? 1 : isConn ? 0.8 : 0.55;
              const fillOpacity = isGhost ? 0.03 : isFocus ? 0.35 : isNear ? 0.08 : isDim ? 0.05 : 0.12;
              const labelOpacity = isGhost ? 0.05 : isNear ? 0.5 : isDim ? 0.35 : 1;
              const lines = node.label.split("\n");

              return (
                <g
                  key={node.id}
                  style={{ cursor: isGhost ? "default" : "pointer", pointerEvents: isGhost ? "none" : undefined }}
                  onClick={isGhost ? undefined : e => handleNodeClick(e, node.id)}
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
            // Höhe auf verfügbaren Raum begrenzen — verhindert Ausbrechen nach unten
            maxHeight: "calc(100% - 1.8rem)",
            overflowY: "auto",
            overscrollBehavior: "contain",
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
                    transition: "opacity 0.15s",
                  }}
                >
                  {/* Dot: filled = aktiv, leer = deaktiviert (Ghost-Modus) */}
                  <span style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: hidden ? "transparent" : color,
                    border: `1.5px solid ${hidden ? C.muted : color}`,
                    flexShrink: 0, transition: "all 0.2s",
                    opacity: hidden ? 0.45 : 1,
                  }} />
                  <span style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.85rem", color: hidden ? C.muted : C.text, flex: 1, textAlign: "left", transition: "color 0.2s" }}>
                    {categoryLabel(cat)}
                  </span>
                  {/* "aus"-Badge: zeigt explizit an, dass diese Ebene deaktiviert ist */}
                  {hidden && (
                    <span style={{ fontFamily: C.mono, fontSize: "0.5rem", letterSpacing: "0.08em", color: C.muted, border: `1px solid ${C.border}`, padding: "0.05rem 0.3rem", borderRadius: 2 }}>
                      aus
                    </span>
                  )}
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
              c={C}
              hiddenLeitmotive={hiddenLeitmotive}
              activeLeitmotive={new Set()}
              onToggle={id => setHiddenLeitmotive(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
              onReset={() => setHiddenLeitmotive(new Set())}
            />
            <PrinzipLegendSection
              c={C}
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
            <UserEdgesLegendSection
              c={C}
              userEdges={userEdges}
              showUserEdges={showUserEdges}
              onToggleShow={() => setShowUserEdges(v => !v)}
              onDelete={i => { const next = userEdges.filter((_, j) => j !== i); setUserEdges(next); saveUserEdges(next); }}
              onClear={() => { setUserEdges([]); saveUserEdges([]); }}
            />
          </div>
        )}

        {/* ── Matrix Overlay — ersetzt SVG-Graphen im Matrix-Modus ── */}
        {viewMode === "matrix" && (() => {
          const sorted = [...NODES].sort((a, b) => a.fullLabel.localeCompare(b.fullLabel, "de"));
          const CELL = 11, LABEL_W = 90, LABEL_H = 90;
          const total = sorted.length;
          const gridW = LABEL_W + total * CELL;
          const gridH = LABEL_H + total * CELL;
          return (
            <div style={{
              position: "absolute", inset: 0, zIndex: 10,
              background: C.void, overflow: "auto",
              padding: "1rem",
            }}
              onClick={e => e.stopPropagation()}
            >
              <svg
                width={gridW}
                height={gridH}
                style={{ display: "block", overflow: "visible" }}
              >
                {/* Column labels (rotated) */}
                {sorted.map((col, ci) => (
                  <text
                    key={`col-${col.id}`}
                    x={LABEL_W + ci * CELL + CELL / 2}
                    y={LABEL_H - 4}
                    textAnchor="start"
                    transform={`rotate(-60,${LABEL_W + ci * CELL + CELL / 2},${LABEL_H - 4})`}
                    fontSize="7"
                    fontFamily={C.mono}
                    fill={C.textDim}
                    style={{ cursor: "pointer" }}
                    onClick={() => { setViewMode("netz"); setSelectedId(col.id); }}
                  >
                    {col.label.replace("\n", " ")}
                  </text>
                ))}
                {/* Row labels */}
                {sorted.map((row, ri) => (
                  <text
                    key={`row-${row.id}`}
                    x={LABEL_W - 4}
                    y={LABEL_H + ri * CELL + CELL / 2 + 3}
                    textAnchor="end"
                    fontSize="7"
                    fontFamily={C.mono}
                    fill={C.textDim}
                    style={{ cursor: "pointer" }}
                    onClick={() => { setViewMode("netz"); setSelectedId(row.id); }}
                  >
                    {row.label.replace("\n", " ")}
                  </text>
                ))}
                {/* Cells */}
                {sorted.map((row, ri) =>
                  sorted.map((col, ci) => {
                    const connected = ADJACENCY.get(row.id)?.has(col.id) || ADJACENCY.get(col.id)?.has(row.id);
                    const isSelf = row.id === col.id;
                    const fill = isSelf ? C.border : connected ? C.accent : C.surface;
                    const opacity = isSelf ? 0.6 : connected ? 0.75 : 0.18;
                    return (
                      <rect
                        key={`${row.id}-${col.id}`}
                        x={LABEL_W + ci * CELL}
                        y={LABEL_H + ri * CELL}
                        width={CELL - 1}
                        height={CELL - 1}
                        fill={fill}
                        opacity={opacity}
                        style={{ cursor: connected && !isSelf ? "pointer" : "default" }}
                        onClick={() => {
                          if (connected && !isSelf) {
                            setViewMode("netz");
                            setSelectedId(row.id);
                          }
                        }}
                      >
                        {connected && !isSelf && (
                          <title>{row.fullLabel} ↔ {col.fullLabel}</title>
                        )}
                      </rect>
                    );
                  })
                )}
              </svg>
              <div style={{ marginTop: "0.8rem", fontFamily: C.mono, fontSize: "0.6rem", color: C.muted, letterSpacing: "0.08em" }}>
                Klick auf eine Zelle → Netz-Ansicht mit dem Begriffspaar ·{" "}
                <span style={{ color: C.accent }}>▪</span> = verbunden
              </div>
            </div>
          );
        })()}

        {/* ── Kohärenz-Metrik ── compact stats widget, bottom-right, above zoom controls ── */}
        <div className="concept-kohaerenz-panel" style={{
          position: "absolute", bottom: "calc(1.2rem + 142px)", right: "1.2rem",
          zIndex: 15, pointerEvents: "none",
          background: C.panelBg, border: `1px solid ${C.border}`,
          backdropFilter: "blur(6px)",
          padding: "0.55rem 0.7rem",
          width: 162,
          fontFamily: C.mono,
        }}>
          {/* Header */}
          <div style={{ fontSize: "0.5rem", letterSpacing: "0.18em", color: C.muted, textTransform: "uppercase", marginBottom: "0.45rem" }}>
            {selectedNode ? `${selectedNode.label.replace("\n", " ")}` : "Kohärenz-Metrik"}
          </div>

          {selectedNode && nodeMetrics ? (() => {
            const { degree, crossCat, ownEdges } = nodeMetrics;
            const integrationPct = degree > 0 ? Math.round((crossCat / degree) * 100) : 0;
            return (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {([
                    ["Verbindungen", String(degree), C.accent],
                    ["Spannungsfelder", `${crossCat}`, "#a882c4"],
                    ["Eigene", String(ownEdges), "#7eb8c8"],
                  ] as [string, string, string][]).map(([label, val, color]) => (
                    <tr key={label}>
                      <td style={{ fontSize: "0.52rem", color: C.textDim, paddingBottom: "0.22rem", paddingRight: "0.5rem" }}>{label}</td>
                      <td style={{ fontSize: "0.62rem", color: color, textAlign: "right", paddingBottom: "0.22rem", fontVariantNumeric: "tabular-nums" }}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })() : (() => {
            const ownPct = Math.round((userEdges.length / 30) * 100);
            const crossPct = CONCEPT_EDGE_COUNT > 0
              ? Math.round((CROSS_CAT_EDGE_COUNT / CONCEPT_EDGE_COUNT) * 100)
              : 0;
            return (
              <>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {([
                      ["Verbindungen", String(CONCEPT_EDGE_COUNT), C.accent],
                      ["Spannungsfelder", `${CROSS_CAT_EDGE_COUNT} (${crossPct}%)`, "#a882c4"],
                      ["Eigene", `${userEdges.length} / 30`, "#7eb8c8"],
                      ["Besucht", String(visitedNodes.length), C.textDim],
                    ] as [string, string, string][]).map(([label, val, color]) => (
                      <tr key={label}>
                        <td style={{ fontSize: "0.52rem", color: C.textDim, paddingBottom: "0.22rem", paddingRight: "0.5rem" }}>{label}</td>
                        <td style={{ fontSize: "0.62rem", color: color, textAlign: "right", paddingBottom: "0.22rem", fontVariantNumeric: "tabular-nums" }}>{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Einstiegspunkte — top hubs by degree */}
                <div style={{ marginTop: "0.55rem", borderTop: `1px solid ${C.border}`, paddingTop: "0.4rem" }}>
                  <div style={{ fontSize: "0.45rem", letterSpacing: "0.18em", color: C.muted, textTransform: "uppercase", marginBottom: "0.35rem" }}>
                    Einstiegspunkte
                  </div>
                  {TOP_HUBS.map(hub => (
                    <button
                      key={hub.id}
                      onClick={() => setSelectedId(hub.id)}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        width: "100%", background: "none", border: "none", padding: "0.12rem 0",
                        cursor: "pointer", pointerEvents: "auto",
                      }}
                    >
                      <span style={{ fontSize: "0.52rem", color: C.text, textAlign: "left" }}>{hub.label}</span>
                      <span style={{ fontSize: "0.55rem", color: C.accent, fontVariantNumeric: "tabular-nums", marginLeft: "0.5rem" }}>{hub.degree}</span>
                    </button>
                  ))}
                </div>
              </>
            );
          })()}

          {/* Integration bar — only when a node is selected */}
          {selectedNode && nodeMetrics && nodeMetrics.degree > 0 && (() => {
            const pct = Math.round((nodeMetrics.crossCat / nodeMetrics.degree) * 100);
            return (
              <div style={{ marginTop: "0.4rem", borderTop: `1px solid ${C.border}`, paddingTop: "0.35rem" }}>
                <div style={{ fontSize: "0.48rem", color: C.muted, marginBottom: "0.2rem", letterSpacing: "0.1em" }}>
                  INTEGRATION {pct}%
                </div>
                <div style={{ height: 3, background: C.border, borderRadius: 2 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "#a882c4", borderRadius: 2, transition: "width 0.3s ease" }} />
                </div>
              </div>
            );
          })()}
        </div>

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

            {/* Resonanzen zu diesem Begriff — aus dem FAQ-Korpus.
                Default-Minimal: max 3 sichtbar, "+ N weitere" zum Aufklappen.
                Klick auf Eintrag → Deep-Link zu /resonanzen?id=<id>. */}
            {selectedNode && resonanzenByNode && (() => {
              const all = resonanzenByNode.get(selectedNode.id) ?? [];
              if (all.length === 0) return null;
              const visible = resonanzenExpanded ? all : all.slice(0, 3);
              return (
                <>
                  <div style={{ height: 1, background: C.border, margin: "1.5rem 0 1.2rem" }} />
                  <div style={{ fontFamily: C.mono, fontSize: "0.6rem", letterSpacing: "0.15em", color: C.muted, textTransform: "uppercase", marginBottom: "0.8rem", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span>Begegnungen aus dem Wissen</span>
                    <span style={{ color: C.accent }}>{all.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {visible.map(entry => (
                      <a
                        key={entry.id}
                        href={`/resonanzen?id=${entry.id}`}
                        style={{
                          display: "block",
                          background: C.deep, border: `1px solid ${C.border}`,
                          padding: "0.5rem 0.7rem", textDecoration: "none",
                          transition: "border-color 0.15s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = C.accentDim)}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.2rem", gap: "0.3rem" }}>
                          <span style={{ fontFamily: C.mono, fontSize: "0.5rem", letterSpacing: "0.12em", textTransform: "uppercase", color: ENDPOINT_COLOR[entry.endpoint] }}>
                            {ENDPOINT_LABEL[entry.endpoint]}
                          </span>
                          <time style={{ fontFamily: C.mono, fontSize: "0.5rem", color: C.muted }}>
                            {new Date(entry.ts).toLocaleDateString("de-DE", { month: "short", day: "numeric" })}
                          </time>
                        </div>
                        <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.78rem", color: C.text, lineHeight: 1.4 }}>
                          {entry.prompt.length > 110 ? entry.prompt.slice(0, 110) + "…" : entry.prompt}
                        </div>
                      </a>
                    ))}
                  </div>
                  {all.length > 3 && (
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                      <button
                        onClick={() => setResonanzenExpanded(v => !v)}
                        style={{
                          fontFamily: C.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
                          color: C.muted, background: "none", border: `1px solid ${C.border}`,
                          padding: "0.3rem 0.6rem", cursor: "pointer",
                        }}
                      >
                        {resonanzenExpanded ? "einklappen" : `+ ${all.length - 3} weitere`}
                      </button>
                      <a
                        href={`/resonanzen?tag=${selectedNode.id}`}
                        style={{
                          fontFamily: C.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
                          color: C.accent, background: "none", border: `1px solid ${C.accentDim}`,
                          padding: "0.3rem 0.6rem", textDecoration: "none",
                        }}
                      >
                        alle in FAQ →
                      </a>
                    </div>
                  )}
                </>
              );
            })()}

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
                    transition: "opacity 0.15s",
                  }}
                >
                  <span style={{
                    width: 9, height: 9, borderRadius: "50%",
                    background: hidden ? "transparent" : color,
                    border: `1.5px solid ${hidden ? C.muted : color}`,
                    flexShrink: 0,
                    boxShadow: isActive && !hidden ? `0 0 7px ${color}66` : "none",
                    opacity: hidden ? 0.45 : 1,
                    transition: "all 0.2s",
                  }} />
                  <span style={{
                    fontFamily: C.serif, fontStyle: "italic",
                    fontSize: "0.82rem",
                    color: hidden ? C.muted : isActive ? C.textBright : C.textDim,
                    flex: 1, textAlign: "left",
                    transition: "color 0.2s",
                  }}>
                    {categoryLabel(cat)}
                  </span>
                  {hidden ? (
                    <span style={{ fontFamily: C.mono, fontSize: "0.48rem", letterSpacing: "0.08em", color: C.muted, border: `1px solid ${C.border}`, padding: "0.04rem 0.28rem", borderRadius: 2 }}>
                      aus
                    </span>
                  ) : isActive && (
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
              c={C}
              hiddenLeitmotive={hiddenLeitmotive}
              activeLeitmotive={activeLeitmotive}
              onToggle={id => setHiddenLeitmotive(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
              onReset={() => setHiddenLeitmotive(new Set())}
            />
            <PrinzipLegendSection
              c={C}
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
            <UserEdgesLegendSection
              c={C}
              userEdges={userEdges}
              showUserEdges={showUserEdges}
              onToggleShow={() => setShowUserEdges(v => !v)}
              onDelete={i => { const next = userEdges.filter((_, j) => j !== i); setUserEdges(next); saveUserEdges(next); }}
              onClear={() => { setUserEdges([]); saveUserEdges([]); }}
            />

            {/* ── Lesepfad ── */}
            <div style={{ height: 1, background: C.border, margin: "1.6rem 0 1.1rem" }} />
            <div style={{ fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.15em", color: C.muted, textTransform: "uppercase", marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Lesepfad</span>
              <span style={{ color: C.accent }}>{visitedNodes.length}</span>
            </div>
            {visitedNodes.length === 0 ? (
              <div style={{ fontSize: "0.6rem", color: C.textDim, fontStyle: "italic" }}>Noch kein Konzept besucht</div>
            ) : (
              <>
                {visitedNodes.map((vid, i) => {
                  const vNode = NODE_MAP.get(vid);
                  if (!vNode) return null;
                  return (
                    <div key={`${vid}-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                      <button
                        onClick={() => setSelectedId(vid)}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontSize: "0.62rem", color: vid === selectedId ? C.accent : C.text }}
                      >
                        {vNode.label.replace("\n", " ")}
                      </button>
                      <button
                        onClick={() => setVisitedNodes(vp => vp.filter((_, j) => j !== i))}
                        style={{ background: "none", border: "none", padding: "0 0 0 0.5rem", cursor: "pointer", fontSize: "0.55rem", color: C.muted, lineHeight: 1 }}
                        title="Entfernen"
                      >×</button>
                    </div>
                  );
                })}
                <button
                  onClick={() => setVisitedNodes([])}
                  style={{ marginTop: "0.5rem", background: "none", border: `1px solid ${C.border}`, padding: "0.25rem 0.6rem", cursor: "pointer", fontFamily: C.mono, fontSize: "0.52rem", color: C.muted, letterSpacing: "0.1em" }}
                >
                  Lesepfad löschen
                </button>
              </>
            )}

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
          style={{
            display: "none", // CSS media query overrides to block on mobile
            height: `${sheetHeight}dvh`,
            transition: sheetDragging ? "none" : "height 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* ── Drag handle ── */}
          <div
            onMouseDown={e => { e.stopPropagation(); sheetDragRef.current = { startY: e.clientY, startH: sheetHeight }; setSheetDragging(true); }}
            onTouchStart={e => { e.stopPropagation(); sheetDragRef.current = { startY: e.touches[0].clientY, startH: sheetHeight }; setSheetDragging(true); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0.55rem 0 0.45rem",
              cursor: "ns-resize", touchAction: "none", userSelect: "none",
              // negative margin to reach full sheet width past the 1.2rem padding
              margin: "-0.8rem -1.2rem 0.6rem",
            }}
          >
            <div style={{
              width: 38, height: 4, borderRadius: 2,
              background: sheetDragging ? C.muted : C.border,
              transition: "background 0.15s, width 0.15s",
            }} />
          </div>

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

          {/* ── Resonanzen zu diesem Begriff (Mobile) — Deep-Links zum
                kollektiven Wissen. Spiegelt die Desktop-Sidebar-Section. */}
          {resonanzenByNode && (() => {
            const all = resonanzenByNode.get(selectedNode.id) ?? [];
            if (all.length === 0) return null;
            const visible = resonanzenExpanded ? all : all.slice(0, 3);
            return (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "0.75rem", marginTop: "0.4rem", marginBottom: "0.6rem" }}>
                <div style={{
                  fontFamily: C.mono, fontSize: "0.54rem", letterSpacing: "0.15em",
                  color: C.muted, textTransform: "uppercase", marginBottom: "0.55rem",
                  display: "flex", justifyContent: "space-between", alignItems: "baseline",
                }}>
                  <span>Begegnungen aus dem Wissen</span>
                  <span style={{ color: C.accent }}>{all.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {visible.map(entry => (
                    <a
                      key={entry.id}
                      href={`/resonanzen?id=${entry.id}`}
                      style={{
                        display: "block",
                        background: C.deep, border: `1px solid ${C.border}`,
                        padding: "0.45rem 0.6rem", textDecoration: "none",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.18rem", gap: "0.3rem" }}>
                        <span style={{ fontFamily: C.mono, fontSize: "0.5rem", letterSpacing: "0.12em", textTransform: "uppercase", color: ENDPOINT_COLOR[entry.endpoint] }}>
                          {ENDPOINT_LABEL[entry.endpoint]}
                        </span>
                        <time style={{ fontFamily: C.mono, fontSize: "0.5rem", color: C.muted }}>
                          {new Date(entry.ts).toLocaleDateString("de-DE", { month: "short", day: "numeric" })}
                        </time>
                      </div>
                      <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.76rem", color: C.text, lineHeight: 1.4 }}>
                        {entry.prompt.length > 100 ? entry.prompt.slice(0, 100) + "…" : entry.prompt}
                      </div>
                    </a>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  {all.length > 3 && (
                    <button
                      onClick={() => setResonanzenExpanded(v => !v)}
                      style={{
                        fontFamily: C.mono, fontSize: "0.52rem", letterSpacing: "0.1em", textTransform: "uppercase",
                        color: C.muted, background: "none", border: `1px solid ${C.border}`,
                        padding: "0.28rem 0.55rem", cursor: "pointer",
                      }}
                    >
                      {resonanzenExpanded ? "einklappen" : `+ ${all.length - 3} weitere`}
                    </button>
                  )}
                  <a
                    href={`/resonanzen?tag=${selectedNode.id}`}
                    style={{
                      fontFamily: C.mono, fontSize: "0.52rem", letterSpacing: "0.1em", textTransform: "uppercase",
                      color: C.accent, background: "none", border: `1px solid ${C.accentDim}`,
                      padding: "0.28rem 0.55rem", textDecoration: "none",
                    }}
                  >
                    alle im Wissen →
                  </a>
                </div>
              </div>
            );
          })()}

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
                      transition: "opacity 0.15s",
                    }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: hidden ? "transparent" : color,
                      border: `1.5px solid ${hidden ? C.muted : color}`, flexShrink: 0,
                      opacity: hidden ? 0.45 : 1,
                      boxShadow: isActive && !hidden ? `0 0 5px ${color}55` : "none",
                    }} />
                    <span style={{
                      fontFamily: C.serif, fontStyle: "italic", fontSize: "0.76rem",
                      color: hidden ? C.muted : isActive ? C.textBright : C.textDim,
                      transition: "color 0.2s",
                    }}>
                      {categoryLabel(cat)}
                    </span>
                    {hidden && (
                      <span style={{ fontFamily: C.mono, fontSize: "0.46rem", color: C.muted, border: `1px solid ${C.border}`, padding: "0.03rem 0.22rem", borderRadius: 2 }}>
                        aus
                      </span>
                    )}
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
              c={C}
              hiddenLeitmotive={hiddenLeitmotive}
              activeLeitmotive={activeLeitmotive}
              onToggle={id => setHiddenLeitmotive(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
              onReset={() => setHiddenLeitmotive(new Set())}
              compact={true}
            />
            <PrinzipLegendSection
              c={C}
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

      {/* Hint text — Modus-abhängig, nur wenn nichts selektiert ist */}
      {!selectedNode && (
        <div style={{
          position: "fixed", bottom: "1.2rem", left: "50%", transform: "translateX(-50%)",
          fontFamily: C.mono, fontSize: "0.6rem", letterSpacing: "0.1em",
          color: C.muted, pointerEvents: "none", whiteSpace: "nowrap",
          zIndex: 150,
        }}>
          {viewMode === "matrix"
            ? "Zellen anklicken — zeigt Verbindung zwischen zwei Konzepten"
            : viewMode === "netz"
              ? "Knoten ziehen · Hintergrund ziehen zum Verschieben · Scrollen zum Zoomen"
              : "Hintergrund ziehen zum Verschieben · Scrollen zum Zoomen"}
        </div>
      )}


      {/* ── Pfad-Explorer Ergebnispanel ──
          Wichtig: bottom-anchored, maxHeight + overflowY damit
          längere KI-Analysen nicht nach oben hinter den Header rutschen. */}
      {pathMode && (
        <div className="concept-workfunc-panel" style={{
          position: "absolute", left: "1rem", bottom: "1rem", zIndex: 50,
          background: C.panelBg, border: `1px solid ${C.border}`,
          backdropFilter: "blur(8px)", padding: "0.85rem 1rem",
          maxWidth: 380, width: "calc(100vw - 2rem)",
          maxHeight: "calc(100vh - 6rem)", overflowY: "auto",
          fontFamily: C.mono, fontSize: "0.6rem",
          borderRadius: 10,
        }}>
          <div style={{ color: "#7eb8c8", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "0.6rem" }}>
            Pfad-Explorer
          </div>

          {!pathNodes[0] && (
            <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.82rem", color: C.textDim }}>
              Ersten Knoten anklicken …
            </div>
          )}
          {pathNodes[0] && !pathNodes[1] && (
            <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.82rem", color: C.textDim }}>
              <span style={{ color: "#e8d090" }}>{NODE_MAP.get(pathNodes[0])?.label.replace("\n", " ")}</span>
              {" "}→ Zweiten Knoten anklicken …
            </div>
          )}

          {pathResult && (() => {
            const same = pathResult.shortest.join() === pathResult.surprising.join();
            const formatPath = (path: string[]) =>
              path.map(id => NODE_MAP.get(id)?.label.replace("\n", " ") ?? id).join(" → ");
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                <div>
                  <div style={{ color: "#e8d090", letterSpacing: "0.1em", marginBottom: "0.3rem" }}>
                    Kürzester Pfad ({pathResult.shortest.length - 1} {pathResult.shortest.length - 1 === 1 ? "Schritt" : "Schritte"})
                  </div>
                  {pathResult.shortest.length === 0 ? (
                    <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.78rem", color: C.textDim }}>Kein Pfad gefunden</div>
                  ) : (
                    <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.78rem", color: C.text, lineHeight: 1.5 }}>
                      {formatPath(pathResult.shortest)}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ color: "#7eb8c8", letterSpacing: "0.1em", marginBottom: "0.3rem" }}>
                    Überraschender Pfad{same ? " (identisch)" : ` (${pathResult.surprising.length - 1} ${pathResult.surprising.length - 1 === 1 ? "Schritt" : "Schritte"})`}
                  </div>
                  {same ? (
                    <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.78rem", color: C.textDim }}>
                      Kein alternativer Pfad — die Verbindung ist eindeutig
                    </div>
                  ) : pathResult.surprising.length === 0 ? (
                    <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.78rem", color: C.textDim }}>Kein Pfad gefunden</div>
                  ) : (
                    <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.78rem", color: C.text, lineHeight: 1.5 }}>
                      {formatPath(pathResult.surprising)}
                    </div>
                  )}
                </div>

                {/* Pfad-Analyse-Button — nur wenn shortest 3-5 Knoten hat
                    (kürzere = direkte Verbindung, kein Bewegungs-Spielraum;
                    längere = beliebige Konstruktion durch BFS-Erzwingung) */}
                {(() => {
                  const len = pathResult.shortest.length;
                  const canAnalyse = len >= 3 && len <= 5;
                  if (!canAnalyse) {
                    return (
                      <div style={{ fontFamily: C.mono, fontSize: "0.52rem", color: C.muted, fontStyle: "italic" }}>
                        {len < 3 ? "Pfad zu kurz für Analyse — Spannungsfeld direkt nutzen." : "Pfad zu lang (>5) für sinnvolle Analyse."}
                      </div>
                    );
                  }
                  const variant = same ? "Einzelpfad" : "Vergleich";
                  const stars = len === 4 ? 4 : 3; // sweet spot bei 4
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      <div style={{ fontFamily: C.mono, fontSize: "0.5rem", color: C.muted, letterSpacing: "0.1em", display: "flex", gap: "0.3rem" }}>
                        <span style={{ color: "#7eb8c8" }}>{"★".repeat(stars)}{"☆".repeat(4 - stars)}</span>
                        <span>{variant}</span>
                      </div>
                      <button
                        disabled={pathAnalysisLoading}
                        onClick={() => {
                          const [from, to] = pathNodes;
                          if (!from || !to) return;
                          runPathAnalysis(from, to, pathResult.shortest, pathResult.surprising);
                        }}
                        style={{
                          alignSelf: "flex-start",
                          fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: pathAnalysisLoading ? C.muted : "#080808",
                          background: pathAnalysisLoading ? "transparent" : "#7eb8c8",
                          border: `1px solid #7eb8c8`,
                          padding: "0.3rem 0.7rem",
                          cursor: pathAnalysisLoading ? "not-allowed" : "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {pathAnalysisLoading ? "Analyse läuft …" : (same ? "⚡ Pfad analysieren" : "⚡ Beide Pfade vergleichen")}
                      </button>
                    </div>
                  );
                })()}

                {pathAnalysisError && (
                  <div style={{ fontFamily: C.mono, fontSize: "0.62rem", color: "#c48282" }}>
                    {pathAnalysisError}
                  </div>
                )}

                {pathAnalysis && (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "0.5rem" }}>
                    {pathAnalysis.split(/\n\n+/).map((para, i) => (
                      <p key={i} style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.78rem", color: C.text, lineHeight: 1.65, margin: "0 0 0.6rem" }}>
                        {para.trim()}
                      </p>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => { pathNodesRef.current = [null, null]; setPathNodes([null, null]); setPathResult(null); setPathAnalysis(null); setPathAnalysisError(null); }}
                  style={{ alignSelf: "flex-start", fontFamily: C.mono, fontSize: "0.54rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.2rem 0.5rem", cursor: "pointer" }}
                >
                  Zurücksetzen
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Spannungsfeld-Analyse Panel ── */}
      {analyseMode && (
        <div className="concept-workfunc-panel" style={{
          position: "absolute", left: "1rem", bottom: "1rem", zIndex: 50,
          background: C.panelBg, border: `1px solid ${C.border}`,
          backdropFilter: "blur(10px)", padding: "0.9rem 1rem",
          maxWidth: 380, width: "calc(100vw - 2rem)",
          maxHeight: "calc(100vh - 6rem)", overflowY: "auto",
          fontFamily: C.mono, fontSize: "0.6rem",
          borderRadius: 10,
        }}>
          {(() => {
            const n = analyseNodes.length;
            const formInfo =
              n === 0 ? { label: "Cluster-Analyse", stars: 0, hint: "" } :
              n === 1 ? { label: "1 Knoten gewählt", stars: 0, hint: "weitere wählen …" } :
              n === 2 ? { label: "Spannungsfeld", stars: 4, hint: "Dialektik" } :
              n === 3 ? { label: "Triade", stars: 4, hint: "sweet spot" } :
                        { label: "Quadratur", stars: 3, hint: "Vierfeldschema" };
            return (
              <>
                <div style={{ color: "#5aacb8", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "0.3rem", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span>{formInfo.label}{n >= 2 ? ` (${n})` : ""}</span>
                  {n > 0 && <span style={{ color: C.muted, fontSize: "0.5rem" }}>{n}/4</span>}
                </div>
                {n >= 2 && (
                  <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.7rem", color: C.muted, marginBottom: "0.6rem", display: "flex", gap: "0.4rem", alignItems: "baseline" }}>
                    <span style={{ color: "#5aacb8", letterSpacing: "0.1em" }}>{"★".repeat(formInfo.stars)}{"☆".repeat(4 - formInfo.stars)}</span>
                    <span>{formInfo.hint}</span>
                  </div>
                )}
              </>
            );
          })()}

          {analyseNodes.length === 0 && (
            <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.82rem", color: C.textDim }}>
              Knoten anklicken — 2 bis 4 für eine Cluster-Analyse.
            </div>
          )}

          {analyseNodes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {/* Chip-Reihe: gewählte Knoten, klickbar zum Entfernen */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                {analyseNodes.map(id => {
                  const meta = NODE_MAP.get(id);
                  if (!meta) return null;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        const next = analyseNodesRef.current.filter(x => x !== id);
                        analyseNodesRef.current = next;
                        setAnalyseNodes(next);
                        setAnalyseResult(null);
                        setAnalyseError(null);
                      }}
                      style={{
                        fontFamily: C.serif, fontStyle: "italic", fontSize: "0.7rem",
                        color: "#8accd8", background: "rgba(90,172,184,0.08)",
                        border: `1px solid #5aacb8`, padding: "0.2rem 0.5rem",
                        cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.3rem",
                      }}
                      title="Entfernen"
                    >
                      {meta.label.replace("\n", " ")}
                      <span style={{ color: C.muted, fontSize: "0.7rem" }}>×</span>
                    </button>
                  );
                })}
              </div>

              {/* Action-Bar: Analyse starten (ab 2 Knoten) + Reset */}
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button
                  disabled={analyseNodes.length < 2 || analyseLoading}
                  onClick={runClusterAnalysis}
                  style={{
                    fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: analyseNodes.length < 2 ? C.muted : "#080808",
                    background: analyseNodes.length < 2 || analyseLoading ? "transparent" : "#5aacb8",
                    border: `1px solid ${analyseNodes.length < 2 ? C.border : "#5aacb8"}`,
                    padding: "0.3rem 0.7rem",
                    cursor: analyseNodes.length < 2 || analyseLoading ? "not-allowed" : "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {analyseLoading ? "läuft …" : analyseNodes.length < 2 ? "weitere wählen" : "Analyse starten"}
                </button>
                <button
                  onClick={() => { analyseNodesRef.current = []; setAnalyseNodes([]); setAnalyseResult(null); setAnalyseError(null); }}
                  style={{ fontFamily: C.mono, fontSize: "0.54rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.3rem 0.5rem", cursor: "pointer" }}
                >
                  Reset
                </button>
              </div>

              {analyseError && (
                <div style={{ fontFamily: C.mono, fontSize: "0.62rem", color: "#c48282" }}>
                  {analyseError}
                </div>
              )}

              {analyseResult && (
                <div>
                  {analyseResult.split(/\n\n+/).map((para, i) => (
                    <p key={i} style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.8rem", color: C.text, lineHeight: 1.65, margin: "0 0 0.7rem" }}>
                      {para.trim()}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Graph-Chat Panel ── */}
      {chatOpen && (
        <div className="concept-workfunc-panel" style={{
          position: "absolute", left: "1rem", bottom: "1rem", zIndex: 50,
          background: C.panelBg, border: `1px solid ${C.border}`,
          backdropFilter: "blur(10px)",
          width: "min(400px, calc(100vw - 2rem))",
          maxHeight: "calc(100% - 5rem)",
          display: "flex", flexDirection: "column",
          fontFamily: C.mono,
          borderRadius: 10,
        }}>
          {/* Header */}
          <div style={{ padding: "0.65rem 0.9rem 0.5rem", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: "0.5rem", letterSpacing: "0.18em", color: "#7ab898", textTransform: "uppercase" }}>
              ◎ Dialog — Begriffsnetz
            </div>
          </div>

          {/* Message list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0.7rem 0.9rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {chatHistory.length === 0 && (
              <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.78rem", color: C.textDim, lineHeight: 1.6 }}>
                Stelle eine Frage zum Begriffsnetz — zu einzelnen Konzepten, Verbindungen, Spannungsfeldern oder dem Werk als Ganzem.
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
              }}>
                {msg.role === "user" ? (
                  <div style={{ fontFamily: C.mono, fontSize: "0.62rem", color: C.accent, background: "rgba(196,168,130,0.07)", border: `1px solid rgba(196,168,130,0.15)`, padding: "0.45rem 0.7rem", lineHeight: 1.55 }}>
                    {msg.text}
                  </div>
                ) : (
                  <div>
                    {msg.text.split(/\n\n+/).map((para, pi) => (
                      <p key={pi} style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.78rem", color: C.text, lineHeight: 1.65, margin: "0 0 0.55rem" }}>
                        {para.trim()}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "0.78rem", color: C.textDim }}>
                …
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{ borderTop: `1px solid ${C.border}`, padding: "0.55rem 0.7rem", flexShrink: 0, display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
            <textarea
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendChat(chatInput);
                }
              }}
              placeholder="Frage eingeben … (Enter zum Senden)"
              rows={2}
              style={{
                flex: 1, background: "none", border: `1px solid ${C.border}`,
                color: C.text, fontFamily: C.mono, fontSize: "0.62rem",
                padding: "0.4rem 0.5rem", resize: "none", lineHeight: 1.5,
                outline: "none",
              }}
            />
            <button
              onClick={() => sendChat(chatInput)}
              disabled={chatLoading || !chatInput.trim()}
              style={{
                background: "none", border: `1px solid ${chatInput.trim() && !chatLoading ? "#4a9870" : C.border}`,
                color: chatInput.trim() && !chatLoading ? "#7ab898" : C.muted,
                fontFamily: C.mono, fontSize: "0.6rem", padding: "0.4rem 0.65rem",
                cursor: chatInput.trim() && !chatLoading ? "pointer" : "default",
                transition: "all 0.15s", flexShrink: 0, alignSelf: "flex-end",
              }}
            >
              ▶
            </button>
          </div>

          {/* Reset */}
          {chatHistory.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.border}`, padding: "0.3rem 0.9rem", flexShrink: 0 }}>
              <button
                onClick={() => setChatHistory([])}
                style={{ background: "none", border: "none", fontFamily: C.mono, fontSize: "0.48rem", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", padding: 0 }}
              >
                Gespräch zurücksetzen
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Notiz-Popup für neue Verbindung ── */}
      {notePopup && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 500,
            background: C.overlayBg, backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "1.5rem",
          }}
          onClick={() => setNotePopup(null)}
        >
          <div
            style={{ background: C.deep, border: `1px solid ${C.accentDim}`, padding: "1.5rem", maxWidth: 360, width: "100%" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.18em", color: C.accent, textTransform: "uppercase", marginBottom: "0.8rem" }}>
              Verbindung hinzufügen
            </div>
            <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: "1rem", color: C.textBright, marginBottom: "1rem", lineHeight: 1.4 }}>
              {NODE_MAP.get(notePopup.sourceId)?.fullLabel}
              <span style={{ color: C.accentDim, margin: "0 0.4rem" }}>↔</span>
              {NODE_MAP.get(notePopup.targetId)?.fullLabel}
            </div>
            <textarea
              autoFocus
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              placeholder="Warum verbindest du diese Begriffe? (optional)"
              rows={3}
              style={{
                width: "100%", background: C.surface, border: `1px solid ${C.border}`,
                color: C.text, fontFamily: C.serif, fontStyle: "italic", fontSize: "0.88rem",
                padding: "0.5rem 0.7rem", resize: "none", outline: "none",
                boxSizing: "border-box", marginBottom: "1rem",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = C.accentDim)}
              onBlur={e => (e.currentTarget.style.borderColor = C.border)}
              onKeyDown={e => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  const edge: UserEdge = { source: notePopup.sourceId, target: notePopup.targetId, note: noteInput.trim() || undefined, createdAt: Date.now() };
                  const next = [...userEdges, edge]; setUserEdges(next); saveUserEdges(next); setNotePopup(null);
                }
                if (e.key === "Escape") setNotePopup(null);
              }}
            />
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button onClick={() => setNotePopup(null)} style={{ fontFamily: C.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, background: "none", border: `1px solid ${C.border}`, padding: "0.4rem 0.8rem", cursor: "pointer" }}>
                Abbrechen
              </button>
              <button
                onClick={() => {
                  const edge: UserEdge = { source: notePopup.sourceId, target: notePopup.targetId, note: noteInput.trim() || undefined, createdAt: Date.now() };
                  const next = [...userEdges, edge]; setUserEdges(next); saveUserEdges(next); setNotePopup(null);
                }}
                style={{ fontFamily: C.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.accent, background: "rgba(196,168,130,0.08)", border: `1px solid ${C.accentDim}`, padding: "0.4rem 0.8rem", cursor: "pointer" }}
              >
                Verbinden
              </button>
            </div>
          </div>
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
          .concept-kohaerenz-panel { display: none !important; }
          .concept-mobile-sheet {
            display: block !important;
            position: fixed;
            bottom: 0; left: 0; right: 0;
            background: ${C.deep};
            border-top: 1px solid ${C.border};
            /* padding-top: 0 — Drag-Handle übernimmt den oberen Abstand */
            padding: 0.8rem 1.2rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
            z-index: 160;
            /* height wird dynamisch via inline-style gesetzt (kein max-height hier) */
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: ${C.border} transparent;
          }
          /* Arbeitsfunktions-Panels (Pfad / Analyse / Dialog) als Bottom-Sheets.
             Override der Inline-Styles: voll breit, oberhalb des Detail-Sheets,
             max. 70dvh hoch, scrollbar Inhalt. */
          .concept-workfunc-panel {
            position: fixed !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            top: auto !important;
            width: 100% !important;
            max-width: none !important;
            min-width: 0 !important;
            max-height: 70dvh !important;
            border-left: none !important;
            border-right: none !important;
            border-bottom: none !important;
            border-top: 1px solid ${C.border} !important;
            padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px)) !important;
            z-index: 165 !important;
            overflow-y: auto;
          }
          /* Workfunc-Buttons in eigene Zeile — flex-basis 100% + order
             pushed sie unter Titel/View-Switcher/Legende/Schließen,
             damit deutsche Labels nicht den Header brechen. */
          .concept-workfunc-group {
            flex-basis: 100% !important;
            order: 99 !important;
            margin-left: 0 !important;
            justify-content: flex-start !important;
          }
          /* Header mehr Höhe, weil Workfunc-Bar als zweite Zeile */
          .concept-graph-body {
            margin-top: 7.2rem !important;
            height: calc(100dvh - 7.2rem) !important;
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
  c, hiddenLeitmotive, activeLeitmotive, onToggle, onReset, compact = false,
}: {
  c: Palette;
  hiddenLeitmotive: Set<string>;
  activeLeitmotive: Set<string>;
  onToggle: (id: string) => void;
  onReset: () => void;
  compact?: boolean;
}) {
  const lmNodes = NODES.filter(n => n.category === "leitmotiv");
  return (
    <>
      <div style={{
        fontFamily: c.mono, fontSize: compact ? "0.54rem" : "0.58rem",
        letterSpacing: "0.15em", color: c.muted, textTransform: "uppercase",
        marginBottom: compact ? "0.5rem" : "0.7rem", marginTop: compact ? "0.6rem" : 0,
        borderTop: compact ? `1px solid ${c.border}` : "none", paddingTop: compact ? "0.6rem" : 0,
      }}>
        Leitmotive
      </div>
      <div style={compact ? { display: "flex", flexWrap: "wrap", gap: "0.25rem 0.9rem" } : {}}>
        {lmNodes.map(node => {
          const hidden   = hiddenLeitmotive.has(node.id);
          const isActive = activeLeitmotive.has(node.id);
          return (
            <button key={node.id} onClick={() => onToggle(node.id)} style={{
              display: "flex", alignItems: "center", gap: compact ? "0.38rem" : "0.5rem",
              width: compact ? "auto" : "100%", background: "none", border: "none",
              cursor: "pointer", padding: compact ? "0.18rem 0" : "0.28rem 0", transition: "opacity 0.15s",
            }}>
              <span style={{
                width: compact ? 7 : 9, height: compact ? 7 : 9, borderRadius: "1px",
                background: hidden ? "transparent" : c.lmColor,
                border: `1.5px solid ${hidden ? c.ghost : c.lmGlow}`,
                flexShrink: 0, opacity: hidden ? 0.45 : 1,
                boxShadow: isActive && !hidden ? `0 0 6px ${c.lmColor}88` : "none",
                transition: "all 0.2s",
              }} />
              <span style={{
                fontFamily: c.mono, fontSize: compact ? "0.72rem" : "0.78rem",
                letterSpacing: "0.1em",
                color: hidden ? c.ghost : isActive ? c.textBright : c.textDim,
                flex: compact ? undefined : 1, textAlign: "left", transition: "color 0.2s",
              }}>
                {node.label}
                {node.id === "lm-verwandlung" && !compact && (
                  <span style={{ marginLeft: "0.35rem", fontSize: "0.58rem", opacity: 0.55, letterSpacing: "0.05em", verticalAlign: "middle" }}>◎</span>
                )}
              </span>
              {hidden ? (
                <span style={{ fontFamily: c.mono, fontSize: "0.48rem", letterSpacing: "0.08em", color: c.ghost, border: `1px solid ${c.border}`, padding: "0.04rem 0.26rem", borderRadius: 2 }}>aus</span>
              ) : isActive && !compact && (
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: c.lmColor, flexShrink: 0 }} />
              )}
            </button>
          );
        })}
      </div>
      {hiddenLeitmotive.size > 0 && (
        <button onClick={onReset} style={{
          marginTop: "0.5rem", width: compact ? "auto" : "100%", fontFamily: c.mono,
          fontSize: compact ? "0.54rem" : "0.56rem", letterSpacing: "0.1em",
          textTransform: "uppercase", color: c.accent, background: "none",
          border: `1px solid ${c.accentDim}`, padding: "0.25rem 0.5rem", cursor: "pointer",
        }}>
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
  c, hiddenPrinzipien, onToggleGroup, onToggleMember, onReset, compact = false,
}: {
  c: Palette;
  hiddenPrinzipien: Set<string>;
  onToggleGroup: (memberIds: string[]) => void;
  onToggleMember: (id: string) => void;
  onReset: () => void;
  compact?: boolean;
}) {
  return (
    <>
      <div style={{
        fontFamily: c.mono, fontSize: compact ? "0.54rem" : "0.58rem",
        letterSpacing: "0.15em", color: c.muted, textTransform: "uppercase",
        marginBottom: compact ? "0.5rem" : "0.7rem", marginTop: compact ? "0.6rem" : "0.9rem",
        borderTop: `1px solid ${c.border}`, paddingTop: compact ? "0.6rem" : "0.7rem",
      }}>
        Erkenntnisprinzipien
      </div>
      <div>
        {PRINZIP_GROUPS.map(group => {
          const allHidden = group.memberIds.every(id => hiddenPrinzipien.has(id));
          return (
            <div key={group.id} style={{ marginBottom: compact ? "0.3rem" : "0.55rem" }}>
              <button onClick={() => onToggleGroup(group.memberIds)} title={group.description} style={{
                display: "flex", alignItems: "center", gap: compact ? "0.38rem" : "0.5rem",
                width: "100%", background: "none", border: "none", cursor: "pointer",
                padding: compact ? "0.12rem 0" : "0.2rem 0", transition: "opacity 0.15s",
              }}>
                <span style={{
                  width: compact ? 7 : 9, height: compact ? 7 : 9,
                  background: allHidden ? "transparent" : PR_COLOR,
                  border: `1.5px solid ${allHidden ? c.ghost : PR_GLOW}`,
                  flexShrink: 0, opacity: allHidden ? 0.45 : 1,
                  transform: "rotate(45deg)", transition: "all 0.2s",
                }} />
                <span style={{
                  fontFamily: c.mono, fontSize: compact ? "0.7rem" : "0.76rem",
                  letterSpacing: "0.08em", color: allHidden ? c.ghost : c.text,
                  textAlign: "left", flex: 1, transition: "color 0.2s",
                }}>
                  {group.label}
                </span>
                {allHidden && (
                  <span style={{ fontFamily: c.mono, fontSize: "0.48rem", letterSpacing: "0.08em", color: c.ghost, border: `1px solid ${c.border}`, padding: "0.04rem 0.26rem", borderRadius: 2 }}>aus</span>
                )}
              </button>
              {group.memberIds.length > 1 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.15rem 0.6rem", paddingLeft: compact ? "0.9rem" : "1.2rem", marginTop: "0.1rem" }}>
                  {group.memberIds.map(mid => {
                    const node = NODES.find(n => n.id === mid);
                    if (!node) return null;
                    const hidden = hiddenPrinzipien.has(mid);
                    return (
                      <button key={mid} onClick={() => onToggleMember(mid)} style={{
                        display: "flex", alignItems: "center", gap: "0.3rem",
                        background: "none", border: "none", cursor: "pointer",
                        padding: "0.08rem 0", transition: "opacity 0.15s",
                      }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: hidden ? "transparent" : PR_COLOR,
                          border: `1px solid ${hidden ? c.ghost : PR_COLOR}`,
                          flexShrink: 0, opacity: hidden ? 0.45 : 1, transition: "all 0.2s",
                        }} />
                        <span style={{ fontFamily: c.mono, fontSize: compact ? "0.64rem" : "0.68rem", letterSpacing: "0.05em", color: hidden ? c.ghost : c.textDim, transition: "color 0.2s" }}>
                          {node.fullLabel}
                        </span>
                        {hidden && (
                          <span style={{ fontFamily: c.mono, fontSize: "0.44rem", color: c.ghost, border: `1px solid ${c.border}`, padding: "0.02rem 0.2rem", borderRadius: 2 }}>aus</span>
                        )}
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
        <button onClick={onReset} style={{
          marginTop: "0.5rem", width: compact ? "auto" : "100%", fontFamily: c.mono,
          fontSize: compact ? "0.54rem" : "0.56rem", letterSpacing: "0.1em",
          textTransform: "uppercase", color: PR_GLOW, background: "none",
          border: `1px solid ${PR_COLOR}`, padding: "0.25rem 0.5rem", cursor: "pointer",
        }}>
          Alle einblenden
        </button>
      )}
    </>
  );
}

function UserEdgesLegendSection({
  c, userEdges, showUserEdges, onToggleShow, onDelete, onClear,
}: {
  c: Palette;
  userEdges: UserEdge[];
  showUserEdges: boolean;
  onToggleShow: () => void;
  onDelete: (index: number) => void;
  onClear: () => void;
}) {
  return (
    <>
      <div style={{ fontFamily: c.mono, fontSize: "0.58rem", letterSpacing: "0.15em", color: c.muted, textTransform: "uppercase", borderTop: `1px solid ${c.border}`, paddingTop: "0.7rem", marginTop: "0.9rem", marginBottom: "0.6rem" }}>
        Meine Verbindungen {userEdges.length > 0 && `(${userEdges.length})`}
      </div>
      <button
        onClick={onToggleShow}
        style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", background: "none", border: "none", cursor: "pointer", padding: "0.28rem 0" }}
      >
        <span style={{ width: 22, height: 4, borderRadius: 2, background: showUserEdges ? c.accent : "transparent", border: `1.5px dashed ${showUserEdges ? c.accent : c.muted}`, flexShrink: 0, opacity: showUserEdges ? 1 : 0.45, transition: "all 0.2s" }} />
        <span style={{ fontFamily: c.serif, fontStyle: "italic", fontSize: "0.82rem", color: showUserEdges ? c.text : c.muted, flex: 1, textAlign: "left" }}>
          Eigene Verbindungen
        </span>
        {!showUserEdges && <span style={{ fontFamily: c.mono, fontSize: "0.48rem", color: c.muted, border: `1px solid ${c.border}`, padding: "0.04rem 0.28rem", borderRadius: 2 }}>aus</span>}
      </button>
      {userEdges.length === 0 ? (
        <div style={{ fontFamily: c.serif, fontStyle: "italic", fontSize: "0.76rem", color: c.muted, marginTop: "0.5rem", paddingLeft: "0.2rem" }}>
          Noch keine eigenen Verbindungen
        </div>
      ) : (
        <div style={{ marginTop: "0.4rem" }}>
          {userEdges.map((edge, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.3rem", marginBottom: "0.3rem" }}>
              <span style={{ fontFamily: c.serif, fontStyle: "italic", fontSize: "0.74rem", color: c.textDim, flex: 1, lineHeight: 1.4 }}>
                {NODE_MAP.get(edge.source)?.label.replace("\n", " ")}
                <span style={{ color: c.accentDim, margin: "0 0.3rem" }}>↔</span>
                {NODE_MAP.get(edge.target)?.label.replace("\n", " ")}
                {edge.note && <span style={{ display: "block", fontSize: "0.68rem", color: c.muted, marginTop: "0.1rem" }}>„{edge.note.length > 40 ? edge.note.slice(0, 40) + "…" : edge.note}"</span>}
              </span>
              <button onClick={() => onDelete(i)} title="Löschen" style={{ fontFamily: c.mono, fontSize: "0.7rem", color: c.muted, background: "none", border: "none", cursor: "pointer", padding: "0.1rem 0.2rem", flexShrink: 0 }}>×</button>
            </div>
          ))}
          <button onClick={onClear} style={{ marginTop: "0.4rem", fontFamily: c.mono, fontSize: "0.54rem", letterSpacing: "0.1em", textTransform: "uppercase", color: c.accent, background: "none", border: `1px solid ${c.accentDim}`, padding: "0.25rem 0.5rem", cursor: "pointer" }}>
            Alle löschen
          </button>
        </div>
      )}
    </>
  );
}
