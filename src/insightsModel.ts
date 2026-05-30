import type { Entry } from "./useEntries";
import {
  buildAggregatedGraph,
  frequencyLabel,
  type AggregatedGraph,
  type AggregatedNode,
  type GraphRange,
} from "./graphModel";
import type { GraphNodeType } from "./useReflection";

/* ============================================================================
 * insightsModel — pure, no-API helpers that derive cross-entry stats for the
 * Insights screen from the persisted entries. Everything here is computed
 * locally (instant, offline-friendly); the AI narrative is layered on top by
 * `useInsights`.
 * ==========================================================================*/

const DAY_MS = 86_400_000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function rangeStart(range: GraphRange, now: number): number {
  if (range === "all") return 0;
  const days = range === "today" ? 1 : range === "week" ? 7 : 30;
  return startOfDay(now) - (days - 1) * DAY_MS;
}

/** The entries that fall inside a range, oldest → newest. */
export function entriesInRange(
  entries: Entry[],
  range: GraphRange,
  now: number = Date.now(),
): Entry[] {
  const from = rangeStart(range, now);
  return entries
    .filter((e) => e.createdAt >= from && e.createdAt <= now)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** A recurring entity surfaced as a "top mention" chip. */
export interface TopEntity {
  label: string;
  type: GraphNodeType;
  count: number;
  /** Human frequency hint, e.g. "4× this week". */
  detail: string;
}

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

const TIME_LABEL: Record<TimeOfDay, string> = {
  morning: "Mornings",
  afternoon: "Afternoons",
  evening: "Evenings",
  night: "Late nights",
};

function bucketForHour(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/** Longest run of consecutive calendar days ending at the most recent entry. */
function dayStreak(entries: Entry[], now: number): number {
  if (entries.length === 0) return 0;
  const days = new Set(entries.map((e) => startOfDay(e.createdAt)));
  const today = startOfDay(now);
  // The streak only counts if the most recent entry is today or yesterday.
  let cursor: number;
  if (days.has(today)) cursor = today;
  else if (days.has(today - DAY_MS)) cursor = today - DAY_MS;
  else return 0;

  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

export interface RangeInsights {
  range: GraphRange;
  entries: Entry[];
  graph: AggregatedGraph;
  entryCount: number;
  totalMinutes: number;
  totalWords: number;
  streak: number;
  /** Most-active time of day across the range, or null when there's nothing. */
  busiestTime: { bucket: TimeOfDay; label: string; count: number } | null;
  topPeople: TopEntity[];
  topFeelings: TopEntity[];
  topSituations: TopEntity[];
}

function topByType(
  nodes: AggregatedNode[],
  type: GraphNodeType,
  range: GraphRange,
  max: number,
): TopEntity[] {
  return nodes
    .filter((n) => n.type === type)
    .sort((a, b) => b.count - a.count || b.entryCount - a.entryCount)
    .slice(0, max)
    .map((n) => ({
      label: n.label,
      type: n.type,
      count: n.count,
      detail: frequencyLabel(n.count, range),
    }));
}

/** Compute the full set of computed insights for a range. */
export function computeRangeInsights(
  allEntries: Entry[],
  range: GraphRange,
  now: number = Date.now(),
): RangeInsights {
  const inRange = entriesInRange(allEntries, range, now);
  // The map shows the full life graph as a grey backdrop and lights up the
  // slice that belongs to the selected range (purple). Stats / top entities
  // below read off the in-range slice of that same graph.
  const graph = buildAggregatedGraph(allEntries, range, {
    now,
    highlightRange: range,
  });
  const rangeNodes = graph.nodes.filter((n) => n.inRange);

  const totalMs = inRange.reduce((sum, e) => sum + (e.durationMs || 0), 0);
  const totalWords = inRange.reduce((sum, e) => sum + (e.wordCount || 0), 0);

  // Busiest time-of-day bucket.
  const buckets = new Map<TimeOfDay, number>();
  for (const e of inRange) {
    const b = bucketForHour(new Date(e.createdAt).getHours());
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  let busiestTime: RangeInsights["busiestTime"] = null;
  for (const [bucket, count] of buckets) {
    if (!busiestTime || count > busiestTime.count) {
      busiestTime = { bucket, label: TIME_LABEL[bucket], count };
    }
  }

  return {
    range,
    entries: inRange,
    graph,
    entryCount: inRange.length,
    totalMinutes: Math.round(totalMs / 60000),
    totalWords,
    streak: dayStreak(inRange, now),
    busiestTime,
    topPeople: topByType(rangeNodes, "person", range, 3),
    topFeelings: topByType(rangeNodes, "feeling", range, 3),
    topSituations: topByType(rangeNodes, "situation", range, 3),
  };
}

/**
 * Build the compact text digest sent to the AI `insights` endpoint: each
 * in-range entry's date, topic, reflection summary, and a short transcript
 * excerpt. Kept bounded so the prompt stays small even over long ranges.
 */
export function buildInsightsDigest(entries: Entry[]): string {
  // Cap how many entries (most recent ones) and how much text per entry we send.
  const MAX_ENTRIES = 12;
  const EXCERPT_CHARS = 320;
  const recent = entries.slice(-MAX_ENTRIES);

  return recent
    .map((e, i) => {
      const date = new Date(e.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      const spoken = e.transcript
        .split("\n")
        .filter((line) => !/^\s*Q:/.test(line))
        .join(" ")
        .replace(/^\s*A:\s*/gm, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, EXCERPT_CHARS);
      const summary = e.reflection?.summary?.trim();
      return [
        `Entry ${i + 1} (${date}) — ${e.topic || "Journal entry"}`,
        summary ? `Reflection: ${summary}` : "",
        spoken ? `They said: ${spoken}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

/** A short, human label like "This week" / "Today" for headings. */
export function rangeLabel(range: GraphRange): string {
  switch (range) {
    case "today":
      return "Today";
    case "week":
      return "This week";
    case "month":
      return "This month";
    case "all":
      return "All time";
  }
}
