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
}

/* ---- Palette: light by default, vivid purple for "grew today". ---------- */
const COLORS: Record<GraphNodeType, { ring: string; fill: string }> = {
  person: { ring: "#c7a6f5", fill: "#f3ecff" },
  situation: { ring: "#9db8e8", fill: "#eef3fd" },
  feeling: { ring: "#ec9fc4", fill: "#fdeef5" },
};
const TODAY_RING = "#8b5cf6";
const TODAY_FILL = "#a78bfa";
const TODAY_GLOW = "rgba(139,92,246,0.55)";
const EDGE = "#c7a6f5";
const EDGE_TODAY = "#8b5cf6";

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

/** Node radius grows with recurrence — the things they keep returning to read
 * as the heaviest nodes on the map. */
function nodeRadius(count: number): number {
  return 7 + Math.min(count, 8) * 2.1;
}

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
  ticks = 320,
): void {
  if (nodes.length === 0) return;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const linkRest = 78;
  const charge = 2600;
  const gravity = 0.012;

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
        const fx = (dx / dist) * force;
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
}

export const EntryGraph = ({
  graph,
  range,
  height = 360,
  loading = false,
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
  useEffect(() => {
    setPositions(layout);
    setSelected(null);
  }, [layout]);

  // View transform (pan x/y in screen px, zoom k). Centered on mount.
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

  const nodeDim = (id: string) => (selected && !neighbors.has(id) ? 0.22 : 1);
  const edgeOpacity = (l: { sourceId: string; targetId: string }) => {
    if (!selected) return 0.32;
    return l.sourceId === selected || l.targetId === selected ? 0.85 : 0.05;
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
      onWheel={onWheel}
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
              const today = l.touchedToday || l.newToday;
              return (
                <line
                  key={l.id}
                  x1={sa.x}
                  y1={sa.y}
                  x2={sb.x}
                  y2={sb.y}
                  stroke={today ? EDGE_TODAY : EDGE}
                  strokeWidth={(today ? 1.8 : 1.1) * view.k}
                  strokeLinecap="round"
                  style={{
                    opacity: edgeOpacity(l),
                    transition: "opacity 0.25s ease",
                  }}
                />
              );
            })}
          </svg>

          {/* Nodes + labels — DOM so labels never clip on the edge. */}
          {graph.nodes.map((node) => {
            const p = positions[node.id];
            if (!p) return null;
            const s = toScreen(p);
            const isSel = selected === node.id;
            const today = node.newToday || node.touchedToday;
            const r = nodeRadius(node.count) * view.k;
            const palette = COLORS[node.type];
            const ring = today ? TODAY_RING : palette.ring;
            const fill = isSel || today ? TODAY_FILL : palette.fill;
            return (
              <div
                key={node.id}
                className="absolute"
                style={{
                  left: s.x,
                  top: s.y,
                  transform: "translate(-50%, -50%)",
                  opacity: nodeDim(node.id),
                  transition: "opacity 0.25s ease",
                  zIndex: isSel ? 5 : today ? 3 : 1,
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
                      background: fill,
                      border: `${(isSel ? 2.2 : today ? 1.8 : 1.3) * view.k}px solid ${ring}`,
                      boxShadow: today
                        ? `0 0 ${16 * view.k}px ${TODAY_GLOW}`
                        : isSel
                          ? `0 ${4 * view.k}px ${12 * view.k}px rgba(182,160,224,0.45)`
                          : "none",
                    }}
                  />
                  <span
                    className="pointer-events-none mt-1 max-w-[130px] truncate whitespace-nowrap text-center [font-family:'Inter',Helvetica]"
                    style={{
                      fontSize: (today ? 11.5 : 10.5) * Math.min(view.k, 1.4),
                      fontWeight: isSel || today ? 600 : 500,
                      opacity: today ? 0.95 : 0.78,
                      color: today ? "#6d28d9" : "#1c2b33",
                    }}
                  >
                    {node.label}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Recenter — only shown once the user has panned/zoomed. */}
          {(view.x !== 0 || view.y !== 0 || view.k !== 1) && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={resetView}
              className="absolute right-3 top-3 z-10 rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-[#1c2b33]/60 shadow-[0_2px_8px_rgba(28,43,51,0.08)] backdrop-blur-sm transition hover:text-[#1c2b33]"
            >
              Recenter
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
  // Fixed seed positions (relative to center) for a gentle constellation.
  const nodes = [
    { x: 0, y: 0, r: 17, c: "#f3ecff", ring: "#c7a6f5" },
    { x: -74, y: -42, r: 12, c: "#eef3fd", ring: "#9db8e8" },
    { x: 70, y: -30, r: 13, c: "#fdeef5", ring: "#ec9fc4" },
    { x: 52, y: 58, r: 11, c: "#f3ecff", ring: "#c7a6f5" },
    { x: -60, y: 56, r: 10, c: "#fdeef5", ring: "#ec9fc4" },
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
              border: `1.3px solid ${n.ring}`,
            }}
            animate={{ scale: [1, 1.12, 1], opacity: [0.55, 1, 0.55] }}
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
