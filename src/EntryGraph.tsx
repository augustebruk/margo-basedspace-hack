import { useMemo, useState, type JSX } from "react";
import { motion } from "motion/react";

/* ============================================================================
 * EntryGraph — a tiny, Obsidian-style "atom graph" for the Reflection screen.
 * Visualizes how the current entry connects to emotions, topics and people.
 *
 * Structured for future AI output: pass real `nodes` + `links` later; for now
 * it ships with a small demo graph derived from the entry's patterns.
 * ==========================================================================*/
export type GraphNodeType = "entry" | "emotion" | "topic" | "person";

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
}

export interface GraphLink {
  sourceId: string;
  targetId: string;
}

export interface EntryGraphProps {
  nodes?: GraphNode[];
  links?: GraphLink[];
}

// Demo graph (small, tidy cluster) based on the entry's patterns.
const DEMO_NODES: GraphNode[] = [
  { id: "entry", label: "Tonight's entry", type: "entry" },
  { id: "overwhelm", label: "Overwhelm", type: "emotion" },
  { id: "work", label: "Work", type: "topic" },
  { id: "sleep", label: "Sleep", type: "topic" },
  { id: "tired", label: "Tired", type: "emotion" },
  { id: "hopeful", label: "Hopeful", type: "emotion" },
  { id: "manager", label: "Manager", type: "person" },
];

const DEMO_LINKS: GraphLink[] = [
  { sourceId: "entry", targetId: "overwhelm" },
  { sourceId: "entry", targetId: "work" },
  { sourceId: "entry", targetId: "sleep" },
  { sourceId: "entry", targetId: "tired" },
  { sourceId: "entry", targetId: "hopeful" },
  { sourceId: "entry", targetId: "manager" },
  // A couple of related-to-related links for an interesting cluster.
  { sourceId: "overwhelm", targetId: "work" },
  { sourceId: "tired", targetId: "sleep" },
];

// Canvas (viewBox) geometry.
const VW = 320;
const VH = 184;
const CX = 160;
const CY = 92;
const RADIUS = 58;

// Minimal purple palette (kept very light, Obsidian-style).
const EDGE = "#c7a6f5";
const NODE_RING = "#c7a6f5";
const ENTRY_FILL = "#b6a0e0";

const EASE = [0.22, 1, 0.36, 1] as const;

export const EntryGraph = ({
  nodes = DEMO_NODES,
  links = DEMO_LINKS,
}: EntryGraphProps): JSX.Element => {
  const [selected, setSelected] = useState<string | null>(null);

  // Radial layout: entry at the center, the rest evenly around it.
  const positions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    const satellites = nodes.filter((n) => n.type !== "entry");
    map["entry"] = { x: CX, y: CY };
    const n = satellites.length;
    satellites.forEach((node, i) => {
      const angle = ((-90 + (360 / n) * i) * Math.PI) / 180;
      const r = RADIUS + (i % 2 === 0 ? -4 : 6);
      map[node.id] = { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
    });
    return map;
  }, [nodes]);

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

  const nodeOpacity = (id: string) =>
    !selected || neighbors.has(id) ? 1 : 0.3;
  const edgeOpacity = (l: GraphLink) => {
    const base = l.sourceId === "entry" || l.targetId === "entry" ? 0.45 : 0.3;
    if (!selected) return base;
    return l.sourceId === selected || l.targetId === selected ? 0.7 : 0.08;
  };

  return (
    <motion.svg
      viewBox={`0 0 ${VW} ${VH}`}
      className="h-[180px] w-full"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
      role="img"
      aria-label="Graph of how this entry connects to emotions, topics and people"
    >
      {/* Background catch — tap empty space to clear the selection. */}
      <rect
        x="0"
        y="0"
        width={VW}
        height={VH}
        fill="transparent"
        onClick={() => setSelected(null)}
      />

      {/* Edges — very light purple lines that draw in. */}
      {links.map((l, i) => {
        const a = positions[l.sourceId];
        const b = positions[l.targetId];
        if (!a || !b) return null;
        return (
          <motion.line
            key={`${l.sourceId}-${l.targetId}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={EDGE}
            strokeWidth={1}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, delay: 0.15 + i * 0.05, ease: EASE }}
            style={{ opacity: edgeOpacity(l), transition: "opacity 0.25s ease" }}
          />
        );
      })}

      {/* Nodes + labels. */}
      {nodes.map((node) => {
        const pos = positions[node.id];
        if (!pos) return null;
        const isEntry = node.type === "entry";
        const isSel = selected === node.id;
        const r = isEntry ? 8 : 4.5;

        // Label placement based on which side of the center the node sits.
        const dx = pos.x - CX;
        let anchor: "start" | "middle" | "end" = "middle";
        let lx = pos.x;
        let ly = pos.y < CY ? pos.y - 11 : pos.y + 17;
        if (Math.abs(dx) >= 14) {
          anchor = dx < 0 ? "end" : "start";
          lx = pos.x + (dx < 0 ? -(r + 5) : r + 5);
          ly = pos.y + 3.5;
        }

        return (
          <g key={node.id} className="cursor-pointer">
            <circle
              cx={pos.x}
              cy={pos.y}
              r={isSel && !isEntry ? r + 1 : r}
              fill={isEntry || isSel ? ENTRY_FILL : "#ffffff"}
              stroke={isEntry ? "none" : NODE_RING}
              strokeWidth={1.3}
              onClick={() => setSelected((s) => (s === node.id ? null : node.id))}
              style={{ opacity: nodeOpacity(node.id), transition: "opacity 0.25s ease, r 0.2s ease" }}
            />
            <text
              x={lx}
              y={ly}
              textAnchor={anchor}
              onClick={() => setSelected((s) => (s === node.id ? null : node.id))}
              style={{
                fontFamily: "Inter, Helvetica, sans-serif",
                fontSize: isEntry ? 11 : 10,
                fontWeight: isSel || isEntry ? 600 : 400,
                fill: "#1c2b33",
                opacity: (nodeOpacity(node.id) === 1 ? 0.78 : 0.3),
                transition: "opacity 0.25s ease",
              }}
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </motion.svg>
  );
};
