import type { JSX } from "react";
import type { ReflectionPattern } from "./ReflectionView";
import type { AggregatedGraph, GraphRange } from "./graphModel";
import { frequencyLabel, shareLabel } from "./graphModel";
import { cx } from "./cx";
import styles from "./PatternTags.module.css";

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
  <div className={styles.root}>
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
          className={cx(styles.chip, hot && styles.chipHot)}
        >
          <span className={styles.label}>{p.label}</span>
          {detail && (
            <span className={cx(styles.detail, hot && styles.detailHot)}>
              {detail}
            </span>
          )}
        </span>
      );
    })}
  </div>
);
