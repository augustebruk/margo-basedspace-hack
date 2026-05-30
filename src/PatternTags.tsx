import type { JSX } from "react";
import type { ReflectionPattern } from "./ReflectionView";
import type { AggregatedGraph, GraphRange } from "./graphModel";
import { frequencyLabel, shareLabel } from "./graphModel";

/* PatternTags — bigger, more insightful pattern chips. Instead of a bare label
 * + a vague "recurring" hint, each chip surfaces real frequency: how many times
 * it's come up this week/month and the share of entries it appears in. The
 * counts are pulled from the aggregated atom graph when the pattern matches a
 * tracked entity; otherwise we fall back to the model's own recurrence hint.
 * ==========================================================================*/
export interface PatternTagsProps {
  patterns: ReflectionPattern[];
  graph: AggregatedGraph;
  range: GraphRange;
}

/** Find the aggregated node whose label best matches a pattern label, so the
 * chip can show a precise count. Tolerant substring match either direction. */
function matchNode(label: string, graph: AggregatedGraph) {
  const l = label.trim().toLowerCase();
  if (!l) return null;
  let best: AggregatedGraph["nodes"][number] | null = null;
  for (const n of graph.nodes) {
    const nl = n.label.toLowerCase();
    if (nl === l) return n;
    if (nl.includes(l) || l.includes(nl)) {
      if (!best || n.count > best.count) best = n;
    }
  }
  return best;
}

export const PatternTags = ({
  patterns,
  graph,
  range,
}: PatternTagsProps): JSX.Element => (
  <div className="flex flex-wrap gap-2">
    {patterns.map((p) => {
      const node = matchNode(p.label, graph);
      const freq = node ? frequencyLabel(node.count, range) : "";
      const share = node ? shareLabel(node.share, node.entryCount) : "";
      // Prefer the precise computed labels; fall back to the model's hint.
      const detail =
        freq || share
          ? [freq, share].filter(Boolean).join(" · ")
          : p.recurrenceLabel ?? "";
      const hot = node ? node.touchedToday || node.newToday : false;
      return (
        <span
          key={p.label}
          className="inline-flex flex-col gap-0.5 rounded-[16px] px-4 py-2.5"
          style={{
            background: hot
              ? "rgba(237,233,254,0.85)"
              : "rgba(244,231,255,0.5)",
            border: hot
              ? "1px solid rgba(139,92,246,0.35)"
              : "1px solid transparent",
          }}
        >
          <span className="[font-family:'Inter',Helvetica] text-[15px] font-semibold tracking-[-0.2px] text-[#1c2b33]">
            {p.label}
          </span>
          {detail && (
            <span
              className="[font-family:'Inter',Helvetica] text-[12px] font-medium"
              style={{ color: hot ? "#7c3aed" : "rgba(28,43,51,0.45)" }}
            >
              {detail}
            </span>
          )}
        </span>
      );
    })}
  </div>
);
