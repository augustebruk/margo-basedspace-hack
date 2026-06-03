import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import type {
  AggregatedGraph,
  AggregatedNode,
  GraphRange,
} from "./graphModel";
import { frequencyLabel, shareLabel } from "./graphModel";
import type { GraphNodeType } from "./useReflection";

/* ============================================================================
 * EntryGraph — a big, spacious, Obsidian-style "atom graph" of a person's life:
 * the specific people, situations, and feelings they keep mentioning, and how
 * those connect. It's meant to live on the background (full-bleed), not on a
 * card, and to reveal patterns a person can't see themselves.
 *
 *   • Force-directed auto-layout (spring links + charge repulsion + gravity)
 *     so the map self-organizes into clusters, then settles.
 *   • Node size grows with how often the entity recurs in the selected range.
 *   • Purple glow marks what GREW TODAY (new or reinforced by today's entry).
 *   • Drag a node to reposition · drag canvas to pan · scroll/pinch to zoom.
 *   • Tap a node → an insight sheet: what you actually said, who/what it
 *     connects to, and how often it's come up.
 * ==========================================================================*/

export type { GraphNodeType };

export interface EntryGraphProps {
  graph: AggregatedGraph;
  range: GraphRange;
  /** Pixel height of the interactive canvas. */
  height?: number;
  /** When true, show a loading state instead of the graph/empty placeholder. */
  loading?: boolean;
  /** When true, disable scroll/pinch zoom — only the +/- buttons can zoom. */
  disablePinchZoom?: boolean;
}

/* ---- Palette — Obsidian-style: small solid dots, muted by default, vivid
 * purple for the active/"grew today" nodes. Dots are flat fills (no thick
 * contrasting ring) so the map reads as a clean constellation. ------------- */
const COLORS: Record<GraphNodeType, { fill: string }> = {
  person: { fill: "#b9a3e0" },
  situation: { fill: "#a9bbdd" },
  feeling: { fill: "#dba9c6" },
};
const TODAY_FILL = "#8b5cf6"; // active / in-range (the slice you're looking at)
const TODAY_GLOW = "rgba(139,92,246,0.45)";
const LABEL_COLOR = "#9b96aa"; // muted resting label
const LABEL_ACTIVE = "#6d28d9";
const EDGE = "#d8d4e2";
const EDGE_TODAY = "#a78bdf";

const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

type Transform = { x: number; y: number; k: number };
type Pt = { x: number; y: number };
interface SimNode extends AggregatedNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Node radius grows with recurrence — but stays small and Obsidian-like:
 * a modest base dot, growing gently so frequent entities read as slightly
 * heavier without ballooning. */
function nodeRadius(count: number): number {
  return 3.5 + Math.min(count, 10) * 0.9;
}

/** Minimum tappable size for a node, regardless of how small its visible dot
 * is. The coloured circle keeps its true size, centered inside this invisible
 * hit target so even the smallest nodes are easy to tap/click. */
const HIT_TARGET = 30;

/* -------------------------------------------------------------------------- */
/* Force layout — a tiny deterministic simulation (no d3 dependency):         */
/*   • links pull connected nodes toward a rest length                        */
/*   • every pair repels (charge), so nodes don't overlap                     */
/*   • a gentle gravity keeps the whole map centered on the world origin      */
/* We run it for a fixed number of ticks up front so the graph opens already  */
/* settled, then keep positions stable (dragging nudges them live).           */
/* -------------------------------------------------------------------------- */
function simulate(
  nodes: SimNode[],
  links: { sourceId: string; targetId: string }[],
  ticks = 480,
): void {
  if (nodes.length === 0) return;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // A generous rest length + strong charge spread the map out like a "data
  // fountain" so nodes breathe. Gravity is gentle so the cloud doesn't collapse
  // back to the center.
  const linkRest = 132;
  const charge = 7200;
  const gravity = 0.009;
  // Labels sit to the RIGHT of each dot, so collisions are far more likely
  // horizontally than vertically. We bias repulsion along x and run a hard
  // anti-overlap pass that treats every node as a wide, label-sized box.
  const xBias = 1.85;
  // Approximate label footprint (world units, pre-zoom): dots get a wide slot
  // to the right for their text plus padding above/below.
  const labelW = 132;
  const labelH = 30;

  for (let t = 0; t < ticks; t++) {
    const alpha = 0.12 * (1 - t / ticks);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 0.01) {
          dx = (Math.random() - 0.5) * 0.5;
          dy = (Math.random() - 0.5) * 0.5;
          dist2 = dx * dx + dy * dy + 0.01;
        }
        const force = charge / dist2;
        const dist = Math.sqrt(dist2);
        const fx = (dx / dist) * force * xBias;
        const fy = (dy / dist) * force;
        a.vx += fx * alpha;
        a.vy += fy * alpha;
        b.vx -= fx * alpha;
        b.vy -= fy * alpha;
      }
    }
    for (const l of links) {
      const a = byId.get(l.sourceId);
      const b = byId.get(l.targetId);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const diff = (dist - linkRest) / dist;
      const fx = dx * diff * 0.5 * alpha;
      const fy = dy * diff * 0.5 * alpha;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
    for (const n of nodes) {
      n.vx += -n.x * gravity * alpha;
      n.vy += -n.y * gravity * alpha;
      n.vx *= 0.85;
      n.vy *= 0.85;
      n.x += n.vx;
      n.y += n.vy;
    }
  }

  // Hard de-overlap relaxation: treat each node + its right-hand label as an
  // axis-aligned box and push overlapping boxes apart. A few passes guarantee
  // labels never stack on top of each other, however dense the map gets.
  for (let pass = 0; pass < 14; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        // Box centers are offset to the right to cover the label.
        const acx = a.x + labelW / 2;
        const bcx = b.x + labelW / 2;
        const dx = acx - bcx;
        const dy = a.y - b.y;
        const overlapX = labelW - Math.abs(dx);
        const overlapY = labelH - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          moved = true;
          // Resolve along the axis of least penetration.
          if (overlapX < overlapY) {
            const push = (overlapX / 2 + 0.5) * (dx >= 0 ? 1 : -1);
            a.x += push;
            b.x -= push;
          } else {
            const push = (overlapY / 2 + 0.5) * (dy >= 0 ? 1 : -1);
            a.y += push;
            b.y -= push;
          }
        }
      }
    }
    if (!moved) break;
  }
}

export const EntryGraph = ({
  graph,
  range,
  height = 360,
  loading = false,
  disablePinchZoom = false,
}: EntryGraphProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Run the force layout whenever the graph data changes. Seed positions on a
  // loose ring so the simulation has something to relax from deterministically.
  const layout = useMemo(() => {
    const seeded: SimNode[] = graph.nodes.map((n, i) => {
      const angle = (i / Math.max(graph.nodes.length, 1)) * Math.PI * 2;
      const r = 60 + (i % 3) * 26;
      return {
        ...n,
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        vx: 0,
        vy: 0,
      };
    });
    simulate(seeded, graph.links);
    const out: Record<string, Pt> = {};
    for (const n of seeded) out[n.id] = { x: n.x, y: n.y };
    return out;
  }, [graph]);

  const [positions, setPositions] = useState<Record<string, Pt>>(layout);

  // View transform (pan x/y in screen px, zoom k). Auto-fit to frame all nodes.
  const [view, setView] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 360, h: height });

  // Track container size so we can keep the graph centered + zoom-anchored.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute the zoom/pan that frames the whole layout within the canvas with a
  // comfortable margin, so the map fills its space instead of clustering small
  // in the center with big empty bands. Returns the centered identity view when
  // there's nothing to fit yet.
  const computeFit = useCallback((): Transform => {
    const ids = Object.keys(layout);
    if (ids.length === 0 || size.w === 0 || size.h === 0)
      return { x: 0, y: 0, k: 1 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of ids) {
      const p = layout[id];
      const r = nodeRadius(graph.nodes.find((n) => n.id === id)?.count ?? 1);
      minX = Math.min(minX, p.x - r);
      minY = Math.min(minY, p.y - r);
      maxX = Math.max(maxX, p.x + r);
      maxY = Math.max(maxY, p.y + r);
    }
    // Pad for node labels (which sit to the right of each dot) and breathing
    // room. A touch extra on the sides so right-hand labels don't clip.
    const padX = 56;
    const padTop = 24;
    const padBottom = 24;
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const k = Math.min(
      MAX_SCALE,
      Math.max(
        MIN_SCALE,
        Math.min(
          (size.w - padX * 2) / spanX,
          (size.h - padTop - padBottom) / spanY,
        ),
      ),
    );
    // Center of the layout in world space.
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // toScreen maps world (0,0) to canvas center + view offset; we want the
    // layout center to land at the canvas center, so offset by -center * k.
    return { x: -cx * k, y: -cy * k, k };
  }, [layout, size.w, size.h, graph.nodes]);

  // Re-fit whenever the layout or canvas size changes (new graph, resize),
  // unless the user has taken over by panning/zooming this view.
  const userAdjusted = useRef(false);
  const [hasAdjusted, setHasAdjusted] = useState(false);
  useEffect(() => {
    setPositions(layout);
    setSelected(null);
    userAdjusted.current = false;
    setHasAdjusted(false);
  }, [layout]);

  useEffect(() => {
    if (userAdjusted.current) return;
    setView(computeFit());
  }, [computeFit]);

  // World → screen helper.
  const toScreen = useCallback(
    (p: Pt): Pt => ({
      x: size.w / 2 + view.x + p.x * view.k,
      y: size.h / 2 + view.y + p.y * view.k,
    }),
    [size.w, size.h, view],
  );

  /* ---- Pointer interaction: drag nodes, pan canvas ---- */
  const drag = useRef<
    | { mode: "node"; id: string; pointerId: number; last: Pt; moved: boolean }
    | { mode: "pan"; pointerId: number; last: Pt; moved: boolean }
    | null
  >(null);

  const onNodePointerDown = (e: ReactPointerEvent, id: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      mode: "node",
      id,
      pointerId: e.pointerId,
      last: { x: e.clientX, y: e.clientY },
      moved: false,
    };
  };

  const onCanvasPointerDown = (e: ReactPointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      mode: "pan",
      pointerId: e.pointerId,
      last: { x: e.clientX, y: e.clientY },
      moved: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.last.x;
    const dy = e.clientY - d.last.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) d.moved = true;
    d.last = { x: e.clientX, y: e.clientY };

    if (d.mode === "node") {
      setPositions((prev) => ({
        ...prev,
        [d.id]: {
          x: prev[d.id].x + dx / view.k,
          y: prev[d.id].y + dy / view.k,
        },
      }));
    } else {
      userAdjusted.current = true;
      setHasAdjusted(true);
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    // A click (no real movement) toggles selection / clears it.
    if (!d.moved) {
      if (d.mode === "node") {
        setSelected((s) => (s === d.id ? null : d.id));
      } else {
        setSelected(null);
      }
    }
    drag.current = null;
  };

  /* ---- Wheel / trackpad pinch zoom, anchored at the cursor ---- */
  const onWheel = (e: WheelEvent) => {
    if (disablePinchZoom) return;
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    userAdjusted.current = true;
    setHasAdjusted(true);
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    // Cursor position relative to the canvas center (where world origin sits).
    const cx = px - size.w / 2;
    const cy = py - size.h / 2;

    setView((v) => {
      const factor = Math.exp(-e.deltaY * 0.0015);
      const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.k * factor));
      const ratio = k / v.k;
      // Keep the world point under the cursor fixed while zooming.
      return {
        k,
        x: cx - (cx - v.x) * ratio,
        y: cy - (cy - v.y) * ratio,
      };
    });
  };

  // Attach the wheel listener as non-passive so preventDefault works (React's
  // JSX onWheel registers a passive listener, which silently ignores
  // preventDefault and logs a console warning).
  const onWheelRef = useRef(onWheel);
  onWheelRef.current = onWheel;
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => onWheelRef.current(e);
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const resetView = () => {
    userAdjusted.current = false;
    setHasAdjusted(false);
    setZooming(true);
    if (zoomTimer.current) window.clearTimeout(zoomTimer.current);
    zoomTimer.current = window.setTimeout(() => setZooming(false), 320);
    setView(computeFit());
  };

  // True briefly while a +/- button zoom is in flight, so we can apply a CSS
  // transition to the node/edge positions for a smooth animated zoom (pan,
  // drag and wheel stay instant for responsiveness).
  const [zooming, setZooming] = useState(false);
  const zoomTimer = useRef<number | null>(null);

  // Step-zoom from the +/- buttons, anchored on the canvas center so the map
  // grows/shrinks in place (mirrors the cursor-anchored wheel zoom).
  const zoomBy = (factor: number) => {
    userAdjusted.current = true;
    setHasAdjusted(true);
    setZooming(true);
    if (zoomTimer.current) window.clearTimeout(zoomTimer.current);
    zoomTimer.current = window.setTimeout(() => setZooming(false), 320);
    setView((v) => {
      const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.k * factor));
      const ratio = k / v.k;
      return { k, x: v.x * ratio, y: v.y * ratio };
    });
  };

  useEffect(
    () => () => {
      if (zoomTimer.current) window.clearTimeout(zoomTimer.current);
    },
    [],
  );

  // Neighbors of the selected node, for the highlight/dim interaction.
  const neighbors = useMemo(() => {
    const set = new Set<string>();
    if (!selected) return set;
    set.add(selected);
    for (const l of graph.links) {
      if (l.sourceId === selected) set.add(l.targetId);
      if (l.targetId === selected) set.add(l.sourceId);
    }
    return set;
  }, [selected, graph.links]);

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selected) ?? null,
    [graph.nodes, selected],
  );
  // The links + neighbor labels for the selected node, for the insight sheet.
  const selectedConnections = useMemo(() => {
    if (!selectedNode) return [];
    const out: { label: string; relation: string }[] = [];
    for (const l of graph.links) {
      if (l.sourceId !== selectedNode.id && l.targetId !== selectedNode.id)
        continue;
      const otherId =
        l.sourceId === selectedNode.id ? l.targetId : l.sourceId;
      const other = graph.nodes.find((n) => n.id === otherId);
      if (other) out.push({ label: other.label, relation: l.relations[0] ?? "" });
    }
    return out;
  }, [selectedNode, graph.links, graph.nodes]);

  const nodeDim = (id: string) => (selected && !neighbors.has(id) ? 0.18 : 1);
  const edgeOpacity = (l: { sourceId: string; targetId: string }) => {
    if (!selected) return 0.9;
    return l.sourceId === selected || l.targetId === selected ? 1 : 0.06;
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none select-none overflow-hidden"
      style={{ height, cursor: "grab" }}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="img"
      aria-label="Interactive map of the people, situations and feelings you keep mentioning, and how they connect. Drag to move, scroll to zoom, tap a node for details."
    >
      {loading ? (
        <GraphLoading range={range} />
      ) : graph.nodes.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center px-10 text-center">
          <p className="[font-family:'Inter',Helvetica] text-[14px] font-normal leading-[21px] text-[#1c2b33]/45">
            Your map starts here. As you journal, the people, situations and
            feelings you mention will connect into a living picture of your
            {range === "week" ? " week" : " month"}.
          </p>
        </div>
      ) : (
        <>
          {/* Edges */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {graph.links.map((l) => {
              const a = positions[l.sourceId];
              const b = positions[l.targetId];
              if (!a || !b) return null;
              const sa = toScreen(a);
              const sb = toScreen(b);
              // The connection lights up purple when it belongs to the slice of
              // time you're currently looking at; everything else is the grey
              // backdrop of the wider life map.
              const lit = l.inRange;
              return (
                <motion.line
                  key={l.id}
                  initial={false}
                  animate={{ x1: sa.x, y1: sa.y, x2: sb.x, y2: sb.y }}
                  transition={
                    zooming
                      ? { duration: 0.3, ease: [0.22, 1, 0.36, 1] }
                      : { duration: 0 }
                  }
                  stroke={lit ? EDGE_TODAY : EDGE}
                  strokeWidth={(lit ? 1.3 : 0.9) * view.k}
                  strokeLinecap="round"
                  style={{
                    opacity: edgeOpacity(l),
                    transition: "opacity 0.25s ease",
                  }}
                />
              );
            })}
          </svg>

          {/* Nodes + labels — DOM so labels never clip on the edge. Each node
              is a small solid dot with its label to the RIGHT, vertically
              centered on the dot (Obsidian style), so labels line up with the
              edges instead of stacking below. */}
          {graph.nodes.map((node) => {
            const p = positions[node.id];
            if (!p) return null;
            const s = toScreen(p);
            const isSel = selected === node.id;
            const grewToday = node.newToday || node.touchedToday;
            // "Lit" = this node belongs to the slice of time you're looking at.
            // The rest of the map is a grey backdrop. Selecting a node also lights
            // it. A glow is reserved for what actually grew today.
            const lit = isSel || node.inRange;
            const active = lit;
            const r = nodeRadius(node.count) * view.k;
            const palette = COLORS[node.type];
            // Lit nodes (the slice you're looking at) are purple; the wider
            // backdrop keeps its muted per-type colour.
            const fill = lit ? TODAY_FILL : palette.fill;
            // Label scales gently with zoom and grows slightly for heavier /
            // active nodes — mirroring Obsidian's size-by-weight labels.
            const labelSize =
              (active ? 11.5 : 10.5 + Math.min(node.count, 6) * 0.25) *
              Math.min(view.k, 1.5);
            return (
              <div
                key={node.id}
                className="absolute flex items-center"
                style={{
                  left: s.x,
                  top: s.y,
                  // Anchor on the dot's vertical center; the row lays the dot +
                  // label out horizontally so the label is centered on the line.
                  transform: "translate(-50%, -50%)",
                  opacity: nodeDim(node.id),
                  transition: zooming
                    ? "opacity 0.25s ease, left 0.3s cubic-bezier(0.22,1,0.36,1), top 0.3s cubic-bezier(0.22,1,0.36,1)"
                    : "opacity 0.25s ease",
                  zIndex: isSel ? 5 : lit ? 3 : 1,
                }}
              >
                <button
                  type="button"
                  aria-label={node.label}
                  onPointerDown={(e) => onNodePointerDown(e, node.id)}
                  className="flex shrink-0 items-center justify-center rounded-full bg-transparent"
                  style={{
                    // Generous, invisible hit target so small dots are easy to
                    // tap; the visible coloured circle stays its true size.
                    width: Math.max(r * 2, HIT_TARGET),
                    height: Math.max(r * 2, HIT_TARGET),
                    cursor: "grab",
                  }}
                >
                  <span
                    className="block rounded-full"
                    style={{
                      width: r * 2,
                      height: r * 2,
                      background: fill,
                      transition: zooming
                        ? "width 0.3s cubic-bezier(0.22,1,0.36,1), height 0.3s cubic-bezier(0.22,1,0.36,1)"
                        : undefined,
                      boxShadow: grewToday
                        ? `0 0 ${14 * view.k}px ${TODAY_GLOW}`
                        : isSel
                          ? `0 0 ${10 * view.k}px rgba(139,92,246,0.35)`
                          : "none",
                    }}
                  />
                </button>
                <span
                  className="pointer-events-none max-w-[140px] truncate whitespace-nowrap [font-family:'Inter',Helvetica]"
                  style={{
                    // Pull the label back toward the visible dot: the button's
                    // invisible hit padding would otherwise push it away. 6px
                    // keeps the original gap from the dot's edge.
                    marginLeft: 6 - Math.max(HIT_TARGET - r * 2, 0) / 2,
                    fontSize: labelSize,
                    lineHeight: 1,
                    fontWeight: active ? 600 : 500,
                    opacity: active ? 1 : 0.92,
                    color: active ? LABEL_ACTIVE : LABEL_COLOR,
                    transition: zooming
                      ? "font-size 0.3s cubic-bezier(0.22,1,0.36,1)"
                      : undefined,
                  }}
                >
                  {node.label}
                </span>
              </div>
            );
          })}

          {/* Zoom controls — top-left, symmetric with Recenter. Matches its
              pill style, blur, shadow and 11px scale. */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute left-3 top-3 z-10 flex items-center overflow-hidden rounded-full bg-white/80 text-[#1c2b33]/60 shadow-[0_2px_8px_rgba(28,43,51,0.08)] backdrop-blur-sm"
          >
            <button
              type="button"
              aria-label="Zoom out"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => zoomBy(1 / 1.3)}
              className="flex h-[38px] w-[44px] items-center justify-center text-[16px] font-medium leading-none transition hover:text-[#1c2b33]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                <path d="M5 12h14" />
              </svg>
            </button>
            <span className="h-4 w-px bg-[#1c2b33]/10" />
            <button
              type="button"
              aria-label="Zoom in"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => zoomBy(1.3)}
              className="flex h-[38px] w-[44px] items-center justify-center text-[16px] font-medium leading-none transition hover:text-[#1c2b33]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          {/* Recenter — only shown once the user has panned/zoomed. */}
          {hasAdjusted && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={resetView}
              aria-label="Recenter"
              className="absolute right-3 top-3 z-10 flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white/80 text-[#1c2b33]/60 shadow-[0_2px_8px_rgba(28,43,51,0.08)] backdrop-blur-sm transition hover:text-[#1c2b33]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
            </button>
          )}

          {/* Insight sheet — slides up when a node is tapped. */}
          <AnimatePresence>
            {selectedNode && (
              <motion.div
                key="insight"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute inset-x-3 bottom-3 z-20 rounded-[22px] border border-white/70 bg-white/90 p-4 shadow-[0_14px_40px_rgba(28,43,51,0.14)] backdrop-blur-md"
              >
                <NodeInsight
                  node={selectedNode}
                  range={range}
                  connections={selectedConnections}
                  onClose={() => setSelected(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
};

const TYPE_LABEL: Record<GraphNodeType, string> = {
  person: "Person",
  situation: "Situation",
  feeling: "Feeling",
};

/* -------------------------------------------------------------------------- */
/* GraphLoading — a calm "weaving your map" state shown while the reflection   */
/* (and its graph seed) is still being generated. A few faint nodes orbit and  */
/* pulse, with links drawing between them, so the area reads as alive rather   */
/* than empty or broken.                                                       */
/* -------------------------------------------------------------------------- */
function GraphLoading({ range }: { range: GraphRange }): JSX.Element {
  // Fixed seed positions (relative to center) for a gentle constellation —
  // small flat dots matching the live Obsidian-style graph.
  const nodes = [
    { x: 0, y: 0, r: 9, c: TODAY_FILL },
    { x: -74, y: -42, r: 5, c: "#a9bbdd" },
    { x: 70, y: -30, r: 5.5, c: "#dba9c6" },
    { x: 52, y: 58, r: 4.5, c: "#b9a3e0" },
    { x: -60, y: 56, r: 4, c: "#dba9c6" },
  ];
  const links: [number, number][] = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
  ];
  const span = range === "month" ? "month" : range === "today" ? "day" : "week";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5">
      <div className="relative" style={{ width: 220, height: 170 }}>
        <svg
          className="absolute inset-0"
          width={220}
          height={170}
          viewBox="-110 -85 220 170"
        >
          {links.map(([a, b], i) => (
            <motion.line
              key={i}
              x1={nodes[a].x}
              y1={nodes[a].y}
              x2={nodes[b].x}
              y2={nodes[b].y}
              stroke={EDGE}
              strokeWidth={1.2}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.45 }}
              transition={{
                duration: 1.1,
                ease: "easeInOut",
                repeat: Infinity,
                repeatType: "reverse",
                delay: i * 0.18,
              }}
            />
          ))}
        </svg>
        {nodes.map((n, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              left: 110 + n.x,
              top: 85 + n.y,
              width: n.r * 2,
              height: n.r * 2,
              transform: "translate(-50%, -50%)",
              background: n.c,
            }}
            animate={{ scale: [1, 1.12, 1], opacity: [0.45, 0.9, 0.45] }}
            transition={{
              duration: 1.6,
              ease: "easeInOut",
              repeat: Infinity,
              delay: i * 0.22,
            }}
          />
        ))}
      </div>
      <p className="[font-family:'Inter',Helvetica] text-[14px] font-normal leading-[21px] text-[#1c2b33]/45">
        Weaving your {span} into a map…
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* NodeInsight — the tap-to-read sheet. Surfaces the actual things the person  */
/* said about this node, how it connects, and how often it's come up — the     */
/* "insight you can't see yourself" payoff.                                    */
/* -------------------------------------------------------------------------- */
function NodeInsight({
  node,
  range,
  connections,
  onClose,
}: {
  node: AggregatedNode;
  range: GraphRange;
  connections: { label: string; relation: string }[];
  onClose: () => void;
}): JSX.Element {
  const freq = frequencyLabel(node.count, range);
  const share = shareLabel(node.share, node.entryCount);
  const hot = node.newToday || node.touchedToday;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className="[font-family:'Inter',Helvetica] text-[11px] font-semibold uppercase tracking-[1px]"
              style={{ color: hot ? "#7c3aed" : "#1c2b33" }}
            >
              {TYPE_LABEL[node.type]}
            </span>
            {node.newToday && (
              <span className="rounded-full bg-[#ede9fe] px-2 py-0.5 [font-family:'Inter',Helvetica] text-[10px] font-semibold text-[#7c3aed]">
                New today
              </span>
            )}
            {!node.newToday && node.touchedToday && (
              <span className="rounded-full bg-[#ede9fe] px-2 py-0.5 [font-family:'Inter',Helvetica] text-[10px] font-semibold text-[#7c3aed]">
                Came up again today
              </span>
            )}
          </div>
          <h3 className="[font-family:'Inter',Helvetica] text-[19px] font-semibold leading-[1.2] tracking-[-0.3px] text-[#1c2b33]">
            {node.label}
          </h3>
          {(freq || share) && (
            <p className="[font-family:'Inter',Helvetica] text-[12px] font-medium text-[#1c2b33]/45">
              {[freq, share].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="all-[unset] box-border flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#1c2b33]/40 transition hover:bg-black/5 hover:text-[#1c2b33]/70"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      {node.mentions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="[font-family:'Inter',Helvetica] text-[11px] font-medium uppercase tracking-[1px] text-[#1c2b33]/40">
            You said
          </p>
          <div className="flex flex-col gap-1.5">
            {node.mentions.slice(0, 3).map((m, i) => (
              <p
                key={i}
                className="rounded-[12px] bg-[rgba(244,231,255,0.45)] px-3 py-2 [font-family:'Inter',Helvetica] text-[13px] font-normal italic leading-[19px] text-[#1c2b33]/80"
              >
                “{m}”
              </p>
            ))}
          </div>
        </div>
      )}

      {connections.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="[font-family:'Inter',Helvetica] text-[11px] font-medium uppercase tracking-[1px] text-[#1c2b33]/40">
            Connects to
          </p>
          <div className="flex flex-wrap gap-1.5">
            {connections.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-baseline gap-1 rounded-full border border-[#ece3ff] bg-white px-2.5 py-1 [font-family:'Inter',Helvetica] text-[12px] font-medium text-[#1c2b33]/75"
              >
                {c.relation && (
                  <span className="text-[#a07ee0]">{c.relation}</span>
                )}
                {c.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
