import type {
  EntryGraphSeed,
  GraphNodeType,
} from "./useReflection";
import type { Entry } from "./useEntries";

/* ============================================================================
 * graphModel — turns many entries' per-entry graph seeds into ONE cumulative
 * "atom graph" of a person's life: the specific people, situations, and
 * feelings they keep mentioning, and how those connect.
 *
 * The whole point is insight a person can't see themselves: which person keeps
 * showing up, which feeling everything ties back to, what's grown most this
 * week vs. this month. So every node/link carries:
 *   • a frequency count within the selected time range
 *   • the share of entries it appears in (for the "% of your entries" tag)
 *   • whether it's brand new or grew from TODAY's entry (for the purple glow)
 *   • the actual things the person said (mentions) for the tap-to-read insight
 * ==========================================================================*/

export type GraphRange = "today" | "week" | "month" | "all";

export interface AggregatedNode {
  id: string; // normalized (lowercased) label key
  label: string; // display label (the most recent casing seen)
  type: GraphNodeType;
  /** Times this entity was mentioned across entries in the range. */
  count: number;
  /** Distinct entries it appeared in (in range). */
  entryCount: number;
  /** Share of in-range entries it shows up in, 0–1. */
  share: number;
  /** Verbatim snippets the person said about it (most recent first). */
  mentions: string[];
  /** Epoch ms of the most recent entry that mentioned it. */
  lastSeen: number;
  /** True if it first appeared in today's entry (grew today). */
  newToday: boolean;
  /** True if today's entry mentioned it again (reinforced today). */
  touchedToday: boolean;
}

export interface AggregatedLink {
  id: string;
  sourceId: string;
  targetId: string;
  /** Times this exact connection appeared across entries in range. */
  count: number;
  /** The human relation phrases seen for this pair (most recent first). */
  relations: string[];
  newToday: boolean;
  touchedToday: boolean;
}

export interface AggregatedGraph {
  nodes: AggregatedNode[];
  links: AggregatedLink[];
  /** How many entries fed this graph (within the range). */
  entryCount: number;
  /** How many nodes are new today. */
  grewTodayCount: number;
}

const DAY_MS = 86_400_000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** A node/link "belongs to today" if its entry is on the same calendar day. */
function isToday(ts: number, now: number): boolean {
  return startOfDay(ts) === startOfDay(now);
}

function rangeStart(range: GraphRange, now: number): number {
  if (range === "all") return 0;
  const days = range === "today" ? 1 : range === "week" ? 7 : 30;
  return startOfDay(now) - (days - 1) * DAY_MS;
}

const linkKey = (a: string, b: string): string => {
  // Undirected: normalize order so "a→b" and "b→a" merge.
  const [x, y] = [a, b].sort();
  return `${x}__${y}`;
};

interface SeededEntry {
  createdAt: number;
  graph: EntryGraphSeed;
}

/**
 * Build the cumulative graph from a list of entries (each carrying its
 * per-entry graph seed), filtered to the selected time range. `extra` lets the
 * live reflection screen fold in the just-finished entry before it's persisted.
 */
export function buildAggregatedGraph(
  entries: Entry[],
  range: GraphRange,
  options: { now?: number; extra?: SeededEntry | null } = {},
): AggregatedGraph {
  const now = options.now ?? Date.now();
  const from = rangeStart(range, now);

  const seeded: SeededEntry[] = [
    ...entries
      .filter((e) => e.reflection?.graph?.nodes?.length)
      .map((e) => ({ createdAt: e.createdAt, graph: e.reflection.graph })),
  ];
  if (options.extra && options.extra.graph?.nodes?.length) {
    seeded.push(options.extra);
  }

  const inRange = seeded.filter((e) => e.createdAt >= from && e.createdAt <= now);
  const entryCount = inRange.length;

  const nodeMap = new Map<string, AggregatedNode>();
  const linkMap = new Map<string, AggregatedLink>();
  // Track which entries (by createdAt) each node appeared in, for entryCount.
  const nodeEntrySets = new Map<string, Set<number>>();

  // Process oldest → newest so "most recent first" arrays end correctly when we
  // unshift, and lastSeen lands on the latest.
  const ordered = [...inRange].sort((a, b) => a.createdAt - b.createdAt);

  for (const entry of ordered) {
    const today = isToday(entry.createdAt, now);
    const labelToId = new Map<string, string>();

    for (const seed of entry.graph.nodes) {
      const id = seed.label.trim().toLowerCase();
      if (!id) continue;
      labelToId.set(seed.label, id);

      let node = nodeMap.get(id);
      if (!node) {
        node = {
          id,
          label: seed.label.trim(),
          type: seed.type,
          count: 0,
          entryCount: 0,
          share: 0,
          mentions: [],
          lastSeen: entry.createdAt,
          newToday: today, // first appearance is today ⇒ brand new today
          touchedToday: false,
        };
        nodeMap.set(id, node);
        nodeEntrySets.set(id, new Set());
      }
      node.count += 1;
      node.label = seed.label.trim(); // keep latest casing
      node.lastSeen = Math.max(node.lastSeen, entry.createdAt);
      if (today) node.touchedToday = true;
      const m = seed.mention?.trim();
      if (m && !node.mentions.includes(m)) node.mentions.unshift(m);
      nodeEntrySets.get(id)!.add(entry.createdAt);
    }

    for (const link of entry.graph.links) {
      const s = link.source.trim().toLowerCase();
      const t = link.target.trim().toLowerCase();
      if (!nodeMap.has(s) || !nodeMap.has(t)) continue;
      const key = linkKey(s, t);
      let agg = linkMap.get(key);
      if (!agg) {
        agg = {
          id: key,
          sourceId: s,
          targetId: t,
          count: 0,
          relations: [],
          newToday: today,
          touchedToday: false,
        };
        linkMap.set(key, agg);
      }
      agg.count += 1;
      if (today) agg.touchedToday = true;
      const rel = link.relation?.trim();
      if (rel && !agg.relations.includes(rel)) agg.relations.unshift(rel);
    }
  }

  // Finalize entryCount + share.
  for (const [id, node] of nodeMap) {
    node.entryCount = nodeEntrySets.get(id)?.size ?? 0;
    node.share = entryCount > 0 ? node.entryCount / entryCount : 0;
  }

  const nodes = Array.from(nodeMap.values()).sort((a, b) => b.count - a.count);
  const links = Array.from(linkMap.values());
  const grewTodayCount = nodes.filter((n) => n.newToday).length;

  return { nodes, links, entryCount, grewTodayCount };
}

/** A short, human frequency label for a node/pattern within a range, e.g.
 * "4× this week" or "in 80% of entries". Returns "" when there's nothing
 * meaningful to say (single mention). */
export function frequencyLabel(
  count: number,
  range: GraphRange,
): string {
  if (count <= 1) return "";
  const span =
    range === "today"
      ? "today"
      : range === "all"
        ? "so far"
        : range === "week"
          ? "this week"
          : "this month";
  return `${count}× ${span}`;
}

/** Share-of-entries label, e.g. "in 75% of entries". Only when it recurs. */
export function shareLabel(share: number, entryCount: number): string {
  if (entryCount < 2) return "";
  const pct = Math.round(share * 100);
  if (pct < 25) return "";
  return `in ${pct}% of entries`;
}
// end graphModel
