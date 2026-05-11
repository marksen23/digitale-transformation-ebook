/**
 * useInteractiveCanvas — wiederverwendbares Pan/Zoom/Drag-Verhalten
 * für SVG-Visualisierungen.
 *
 * Extrahiert aus ConceptGraphPage.tsx, damit alle Sub-Pages (Philosophie,
 * Enkidu, Resonanzen-Heatmaps etc.) das gleiche navigierbare Erlebnis
 * bekommen — zoom via Wheel/Pinch, pan via Drag, plus optionales
 * Knoten-Verschieben (drag-to-move).
 *
 * Verwendung:
 *
 *   const canvas = useInteractiveCanvas({ minZoom: 0.5, maxZoom: 2.5 });
 *   ...
 *   <svg
 *     {...canvas.bind}
 *     style={{ cursor: canvas.dragging ? "grabbing" : "grab", touchAction: "none" }}
 *   >
 *     <g transform={canvas.transform}>
 *       {nodes.map(n => {
 *         const pos = canvas.nodePos(n.id) ?? { x: n.x, y: n.y };
 *         return (
 *           <circle
 *             cx={pos.x} cy={pos.y} r={8}
 *             onMouseDown={e => canvas.startNodeDrag(e, n.id, pos)}
 *             onClick={() => { if (!canvas.justDragged()) selectNode(n.id); }}
 *           />
 *         );
 *       })}
 *     </g>
 *   </svg>
 *
 * Hinweise:
 *  - `justDragged()` unterscheidet echten Drag (≥4 px Bewegung) von Klick —
 *    Click-Handler sollten früh returnen, wenn true.
 *  - `nodePos(id)` liefert die *aktuell gedraggte* Position oder null.
 *  - `resetView()` setzt pan/zoom zurück (z.B. nach View-Mode-Wechsel).
 *  - Pinch-Zoom funktioniert nur, wenn `touchAction: "none"` auf dem SVG
 *    gesetzt ist (Browser-Default-Gesten würden sonst die Page zoomen).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface NodePos { x: number; y: number }

export interface UseInteractiveCanvasOptions {
  /** Minimaler Zoom-Faktor (default: 0.4) */
  minZoom?: number;
  /** Maximaler Zoom-Faktor (default: 2.8) */
  maxZoom?: number;
  /** Drag-Schwellwert in px, bis Klick als Drag gilt (default: 4) */
  dragThreshold?: number;
  /** Wenn true, ist Node-Dragging deaktiviert (z.B. in nicht-editierbaren Sichten) */
  disableNodeDrag?: boolean;
  /** Initial-Zoom (default: 1.0) */
  initialZoom?: number;
}

export interface InteractiveCanvas {
  /** Aktueller Pan-Offset (in SVG-User-Units) */
  pan: NodePos;
  /** Aktueller Zoom-Faktor */
  zoom: number;
  /** SVG-Transform-String: "translate(...) scale(...)" */
  transform: string;
  /** Setze Pan + Zoom zurück auf (0,0) und initialZoom. */
  resetView: () => void;
  /** Setze Zoom manuell (z.B. via Buttons) */
  setZoom: (z: number) => void;
  /** Setze Pan manuell */
  setPan: (p: NodePos) => void;
  /** Liefert die User-gedraggte Position eines Knotens, oder null. */
  nodePos: (id: string) => NodePos | null;
  /** Starte Knoten-Drag (rufen via onMouseDown/onTouchStart auf dem Knoten). */
  startNodeDrag: (e: React.MouseEvent | React.TouchEvent, id: string, origin: NodePos) => void;
  /** ID des aktuell gedraggten Knotens, oder null. */
  draggingNodeId: string | null;
  /** True, wenn aktuell Pan oder Node-Drag läuft. */
  dragging: boolean;
  /** Nach einem mouseup/touchend: true, wenn der vorige Drag den Threshold überschritt. Click-Handler sollten dann returnen. */
  justDragged: () => boolean;
  /** Event-Binder für das SVG-Element. */
  bind: {
    onMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onWheel: (e: React.WheelEvent<SVGSVGElement>) => void;
    onTouchStart: (e: React.TouchEvent<SVGSVGElement>) => void;
    onTouchMove: (e: React.TouchEvent<SVGSVGElement>) => void;
    onTouchEnd: () => void;
  };
}

export function useInteractiveCanvas(
  opts: UseInteractiveCanvasOptions = {}
): InteractiveCanvas {
  const {
    minZoom = 0.4,
    maxZoom = 2.8,
    dragThreshold = 4,
    disableNodeDrag = false,
    initialZoom = 1.0,
  } = opts;

  const [pan, setPanState] = useState<NodePos>({ x: 0, y: 0 });
  const [zoom, setZoomState] = useState(initialZoom);
  const [nodePositions, setNodePositions] = useState<Map<string, NodePos>>(new Map());
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const pinchRef = useRef<number | null>(null);
  const hasDraggedRef = useRef(false);
  const nodeDragRef = useRef<{ id: string; startClientX: number; startClientY: number; origX: number; origY: number } | null>(null);

  const clampZoom = useCallback((z: number) => Math.max(minZoom, Math.min(maxZoom, z)), [minZoom, maxZoom]);

  const setPan = useCallback((p: NodePos) => { panRef.current = p; setPanState(p); }, []);
  const setZoom = useCallback((z: number) => { const c = clampZoom(z); zoomRef.current = c; setZoomState(c); }, [clampZoom]);

  const resetView = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setZoom(initialZoom);
    setNodePositions(new Map());
  }, [setPan, setZoom, initialZoom]);

  const nodePos = useCallback((id: string): NodePos | null => {
    return nodePositions.get(id) ?? null;
  }, [nodePositions]);

  const startNodeDrag = useCallback((e: React.MouseEvent | React.TouchEvent, id: string, origin: NodePos) => {
    if (disableNodeDrag) return;
    e.stopPropagation();
    const point = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    nodeDragRef.current = {
      id,
      startClientX: point.clientX,
      startClientY: point.clientY,
      origX: origin.x,
      origY: origin.y,
    };
    setDraggingNodeId(id);
    hasDraggedRef.current = false;
  }, [disableNodeDrag]);

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    hasDraggedRef.current = false;
    if (nodeDragRef.current) return; // node-drag already started
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: panRef.current.x, py: panRef.current.y };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (nodeDragRef.current) {
      const nd = nodeDragRef.current;
      const dx = (e.clientX - nd.startClientX) / zoomRef.current;
      const dy = (e.clientY - nd.startClientY) / zoomRef.current;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDraggedRef.current = true;
      setNodePositions(prev => new Map(prev).set(nd.id, { x: nd.origX + dx, y: nd.origY + dy }));
      return;
    }
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    if (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold) hasDraggedRef.current = true;
    setPan({ x: dragRef.current.px + dx, y: dragRef.current.py + dy });
  }, [setPan, dragThreshold]);

  const stopDrag = useCallback(() => {
    dragRef.current = null;
    nodeDragRef.current = null;
    setDraggingNodeId(null);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    setZoom(zoomRef.current * delta);
  }, [setZoom]);

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
    if (nodeDragRef.current && e.touches.length === 1) {
      e.preventDefault();
      const t = e.touches[0];
      const nd = nodeDragRef.current;
      const dx = (t.clientX - nd.startClientX) / zoomRef.current;
      const dy = (t.clientY - nd.startClientY) / zoomRef.current;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDraggedRef.current = true;
      setNodePositions(prev => new Map(prev).set(nd.id, { x: nd.origX + dx, y: nd.origY + dy }));
      return;
    }
    if (e.touches.length === 1 && dragRef.current) {
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - dragRef.current.sx;
      const dy = t.clientY - dragRef.current.sy;
      if (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold) hasDraggedRef.current = true;
      setPan({ x: dragRef.current.px + dx, y: dragRef.current.py + dy });
    } else if (e.touches.length === 2 && pinchRef.current !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchRef.current;
      pinchRef.current = dist;
      setZoom(zoomRef.current * ratio);
    }
  }, [setPan, setZoom, dragThreshold]);

  const onTouchEnd = useCallback(() => {
    dragRef.current = null;
    pinchRef.current = null;
    nodeDragRef.current = null;
    setDraggingNodeId(null);
  }, []);

  // Reset hasDragged flag on the next tick (after click handlers fire).
  // We expose justDragged() for click handlers to check synchronously.
  useEffect(() => {
    if (!draggingNodeId && !dragRef.current) {
      const t = setTimeout(() => { hasDraggedRef.current = false; }, 0);
      return () => clearTimeout(t);
    }
  }, [draggingNodeId]);

  const justDragged = useCallback(() => hasDraggedRef.current, []);

  const dragging = draggingNodeId !== null || dragRef.current !== null;
  const transform = `translate(${pan.x},${pan.y}) scale(${zoom})`;

  return {
    pan,
    zoom,
    transform,
    resetView,
    setZoom,
    setPan,
    nodePos,
    startNodeDrag,
    draggingNodeId,
    dragging,
    justDragged,
    bind: {
      onMouseDown,
      onMouseMove,
      onMouseUp: stopDrag,
      onMouseLeave: stopDrag,
      onWheel,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
}
