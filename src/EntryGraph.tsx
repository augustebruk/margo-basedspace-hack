import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

/* ============================================================================
 * EntryGraph — an interactive, Obsidian-style "atom graph" for the Reflection
 * screen. Visualizes how the themes of an entry — emotions, topics and people —
 * relate to *each other* (the entry itself is the title above the graph, not a
 * node inside it).
 *
 * Interaction:
 *   • drag a node      → reposition it (Obsidian-style)
 *   • drag the canvas  → pan
 *   • scroll / pinch   → zoom in/out (anchored at the cursor)
 *   • tap a node       → highlight it + its neighbors
 *   • tap empty space  → clear the selection
 *
 * Labels are real DOM text positioned over the SVG, so they never clip on the
 * viewBox edge — they simply pan/zoom with everything else.
 *
 * Structured for future AI output: pass real `nodes` + `links` later; for now
 * it ships with a small demo graph derived from the entry's patterns.
 * ==========================================================================*/
export type GraphNodeType = "emotion" | "topic" | "person";

type Pt = { x: number; y: number };

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  /** Optional fixed world position; otherwise auto-laid-out in a loose cluster. */
  pos?: Pt;
}

export interface GraphLink {
  sourceId: string;
  targetId: string;
}

export interface EntryGraphProps {
  nodes?: GraphNode[];
  links?: GraphLink[];
  /** Title shown above the graph (the entry the graph belongs to). */
  title?: string;
  /** Pixel height of the interactive canvas. */
  height?: number;
}

/* Demo graph — meaningful, hand-placed themes that relate to each other.
 * Each node has a sensible world position so the layout reads as clusters:
 *   • a "Work" cluster (Work · Manager · Pressure · Overwhelm) on the left
 *   • a "rest" cluster (Sleep · Tired) on the right
 *   • "Hopeful" sitting loosely on its own, only lightly tied in
 * Not everything is connected — that's intentional. */
const DEMO_NODES: GraphNode[] = [
  { id: "work", label: "Work", type: "topic", pos: { x: -78, y: -50 } },
  { id: "manager", label: "Manager", type: "person", pos: { x: -118, y: 28 } },
  { id: "pressure", label: "Pressure", type: "emotion", pos: { x: -26, y: 8 } },
  { id: "overwhelm", label: "Overwhelm", type: "emotion", pos: { x: -52, y: -110 } },
  { id: "sleep", label: "Sleep", type: "topic", pos: { x: 92, y: -34 } },
  { id: "tired", label: "Tired", type: "emotion", pos: { x: 116, y: 44 } },
  { id: "hopeful", label: "Hopeful", type: "emotion", pos: { x: 36, y: 100 } },
];

const DEMO_LINKS: GraphLink[] = [
  // Work cluster: the manager applies pressure at work, which overwhelms.
  { sourceId: "work", targetId: "manager" },
  { sourceId: "work", targetId: "pressure" },
  { sourceId: "manager", targetId: "pressure" },
  { sourceId: "pressure", targetId: "overwhelm" },
  { sourceId: "work", targetId: "overwhelm" },
  // Rest cluster: poor sleep leaves you tired.
  { sourceId: "sleep", targetId: "tired" },
  // A single bridge between the two worlds: being tired feeds the pressure.
  { sourceId: "tired", targetId: "pressure" },
  // "Hopeful" stays loose — only a faint tie to overwhelm (the turn).
  { sourceId: "hopeful", targetId: "overwhelm" },
];

// Minimal purple palette (kept very light, Obsidian-style).
const EDGE = "#c7a6f5";
const NODE_RING = "#c7a6f5";
const SELECTED_FILL = "#b6a0e0";

const MIN_SCALE = 0.45;
const MAX_SCALE = 3;

type Transform = { x: number; y: number; k: number };

/* -------------------------------------------------------------------------- */
/* Layout — honor each node's hand-placed `pos`; otherwise drop it onto a      */
/* loose ring so unknown/AI-generated nodes still read as a tidy cluster.      */
/* Coordinates live in an abstract "world" space; the view transform handles   */
/* pan/zoom.                                                                   */
/* -------------------------------------------------------------------------- */
function clusterLayout(nodes: GraphNode[]): Record<string, Pt> {
  const map: Record<string, Pt> = {};
  const unplaced = nodes.filter((n) => !n.pos);
  const n = Math.max(unplaced.length, 1);
  const radius = 96;
  let i = 0;
  for (const node of nodes) {
    if (node.pos) {
      map[node.id] = { ...node.pos };
    } else {
      const angle = ((-90 + (360 / n) * i) * Math.PI) / 180;
      const r = radius + (i % 2 === 0 ? -8 : 10);
      map[node.id] = { x: r * Math.cos(angle), y: r * Math.sin(angle) };
      i += 1;
    }
  }
  return map;
}

export const EntryGraph = ({
  nodes = DEMO_NODES,
  links = DEMO_LINKS,
  title = "Tonight's entry",
  height = 240,
}: EntryGraphProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Node positions in world space (mutable via dragging).
  const [positions, setPositions] = useState<Record<string, Pt>>(() =>
    clusterLayout(nodes),
  );
  useEffect(() => {
    setPositions(clusterLayout(nodes));
  }, [nodes]);

  // View transform (pan x/y in screen px, zoom k). Centered on mount.
  const [view, setView] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 320, h: height });

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
  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
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

  const resetView = () => setView({ x: 0, y: 0, k: 1 });

  // Neighbors of the selected node (for the highlight/dim interaction).
  const neighbors = useMemo(() => {
    const set = new Set<string>();
    if (!selected) return set;
    set.add(selected);
    for (const l of links) {
      if (l.sourceId === selected) set.add(l.targetId);
      if (l.targetId === selected) set.add(l.sourceId);
    }
    return set;
  }, [selected, links]);

  const nodeDim = (id: string) => (selected && !neighbors.has(id) ? 0.28 : 1);
  const edgeOpacity = (l: GraphLink) => {
    const base = 0.4;
    if (!selected) return base;
    return l.sourceId === selected || l.targetId === selected ? 0.75 : 0.07;
  };

  return (
    <div className="flex flex-col">
      {/* The entry this graph belongs to — its title sits above the canvas. */}
      {title && (
        <div className="flex items-center gap-2 px-3 pb-1 pt-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: SELECTED_FILL }}
          />
          <span className="[font-family:'Inter',Helvetica] text-[13px] font-semibold text-[#1c2b33]/85">
            {title}
          </span>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative w-full touch-none select-none overflow-hidden rounded-[16px]"
        style={{ height, cursor: "grab" }}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        role="img"
        aria-label="Interactive graph of how the themes of this entry — emotions, topics and people — relate to each other. Drag to move, scroll to zoom."
      >
        {/* Edges — drawn in SVG so they scale crisply. */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {links.map((l) => {
            const a = positions[l.sourceId];
            const b = positions[l.targetId];
            if (!a || !b) return null;
            const sa = toScreen(a);
            const sb = toScreen(b);
            return (
              <line
                key={`${l.sourceId}-${l.targetId}`}
                x1={sa.x}
                y1={sa.y}
                x2={sb.x}
                y2={sb.y}
                stroke={EDGE}
                strokeWidth={1.2 * view.k}
                strokeLinecap="round"
                style={{ opacity: edgeOpacity(l), transition: "opacity 0.25s ease" }}
              />
            );
          })}
        </svg>

        {/* Nodes + labels — DOM elements so labels never clip on the edge. */}
        {nodes.map((node) => {
          const p = positions[node.id];
          if (!p) return null;
          const s = toScreen(p);
          const isSel = selected === node.id;
          const baseR = 5;
          const r = (isSel ? baseR + 1.5 : baseR) * view.k;
          const dim = nodeDim(node.id);

          return (
            <div
              key={node.id}
              className="absolute"
              style={{
                left: s.x,
                top: s.y,
                transform: "translate(-50%, -50%)",
                opacity: dim,
                transition: "opacity 0.25s ease",
              }}
            >
              <div className="relative flex flex-col items-center">
                <button
                  type="button"
                  aria-label={node.label}
                  onPointerDown={(e) => onNodePointerDown(e, node.id)}
                  className="block rounded-full"
                  style={{
                    width: r * 2,
                    height: r * 2,
                    cursor: "grab",
                    background: isSel ? SELECTED_FILL : "#ffffff",
                    border: `${1.3 * view.k}px solid ${NODE_RING}`,
                    boxShadow: isSel
                      ? `0 ${4 * view.k}px ${12 * view.k}px rgba(182,160,224,0.45)`
                      : "none",
                    transition: "width 0.18s ease, height 0.18s ease",
                  }}
                />
                <span
                  className="pointer-events-none mt-1 whitespace-nowrap [font-family:'Inter',Helvetica] text-[#1c2b33]"
                  style={{
                    fontSize: 10 * Math.min(view.k, 1.4),
                    fontWeight: isSel ? 600 : 400,
                    opacity: 0.82,
                  }}
                >
                  {node.label}
                </span>
              </div>
            </div>
          );
        })}

        {/* Reset view — only shown once the user has panned/zoomed. */}
        {(view.x !== 0 || view.y !== 0 || view.k !== 1) && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={resetView}
            className="absolute bottom-2 right-2 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-medium text-[#1c2b33]/60 shadow-[0_2px_8px_rgba(28,43,51,0.08)] backdrop-blur-sm transition hover:text-[#1c2b33]"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
};
