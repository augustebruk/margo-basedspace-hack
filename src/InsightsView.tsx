import { useEffect, useMemo, useState, type JSX } from "react";
import { motion, type Variants } from "motion/react";
import { EntryGraph } from "./EntryGraph";
import { RangeToggle } from "./RangeToggle";
import { PatternTags } from "./PatternTags";
import type { GraphRange } from "./graphModel";
import type { Entry } from "./useEntries";
import type { ReflectionPattern } from "./ReflectionView";
import { useInsights } from "./useInsights";
import {
  buildInsightsDigest,
  computeRangeInsights,
  rangeLabel,
  type TopEntity,
} from "./insightsModel";
import { cx } from "./cx";
import styles from "./InsightsView.module.css";

/* ============================================================================
 * InsightsView — the cross-entry "trends" screen, symmetric to the History
 * tab. A range selector (Today / Week / Month / All time) at the top, an
 * AI-generated period reflection, computed stats, the period's recurring
 * patterns + people / feelings, and the aggregated atom graph.
 * ==========================================================================*/
export interface InsightsViewProps {
  entries: Entry[];
  /** The user's name, for a more personal AI narrative. */
  name?: string;
  onBack: () => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

const SectionTitle = ({ children }: { children: string }): JSX.Element => (
  <p className={styles.sectionTitle}>
    {children}
  </p>
);

const Stat = ({
  value,
  label,
}: {
  value: string;
  label: string;
}): JSX.Element => (
  <div className={styles.stat}>
    <span className={styles.statValue}>
      {value}
    </span>
    <span className={styles.statLabel}>
      {label}
    </span>
  </div>
);

/** A row of small entity chips (people / feelings) under a label. */
const EntityRow = ({
  title,
  entities,
}: {
  title: string;
  entities: TopEntity[];
}): JSX.Element | null => {
  if (entities.length === 0) return null;
  return (
    <div className={styles.entityRow}>
      <SectionTitle>{title}</SectionTitle>
      <div className={styles.entityChips}>
        {entities.map((e) => (
          <span
            key={e.label}
            className={styles.entityChip}
          >
            <span className={styles.entityLabel}>
              {e.label}
            </span>
            {e.detail && (
              <span className={styles.entityDetail}>
                · {e.detail}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
};

/** Aggregate the most common pattern labels across the in-range entries. */
function topPatterns(entries: Entry[], max: number): ReflectionPattern[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const e of entries) {
    for (const p of e.reflection?.patterns ?? []) {
      const key = p.label.trim().toLowerCase();
      if (!key) continue;
      const prev = counts.get(key);
      if (prev) prev.count += 1;
      else counts.set(key, { label: p.label.trim(), count: 1 });
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
    .map((p) => ({ label: p.label }));
}

export const InsightsView = ({
  entries,
  name,
  onBack,
}: InsightsViewProps): JSX.Element => {
  const [range, setRange] = useState<GraphRange>("week");

  const data = useMemo(
    () => computeRangeInsights(entries, range),
    [entries, range],
  );
  const patterns = useMemo(
    () => topPatterns(data.entries, 6),
    [data.entries],
  );

  // The exact payload sent to the AI endpoint for this range. Memoized so it
  // doubles as the cache key + the seed for `useInsights` (flash-free remount).
  const digest = useMemo(
    () => (data.entryCount > 0 ? buildInsightsDigest(data.entries) : ""),
    [data.entries, data.entryCount],
  );

  // Seed the hook from the module cache so returning to a range whose narrative
  // was already generated this session paints it on the first frame.
  const { insights, generating, resultKey, generate } = useInsights(
    digest ? { digest, name, key: range } : undefined,
  );

  // (Re)generate the AI period reflection whenever the range (and thus the set
  // of in-range entries) changes. `useInsights` is guarded by a request id so a
  // slower earlier range can't clobber a newer one, caches results so revisited
  // ranges are instant, and we tag each result with the range so the view can
  // tell a fresh narrative for the *current* range from a stale leftover.
  useEffect(() => {
    if (!digest) return;
    void generate(digest, name, range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, digest]);

  const hasEntries = data.entryCount > 0;
  // Only show the narrative (real or fallback) once we have a *finished* result
  // tagged to the *current* range. While generating — or while still holding a
  // stale result from the previous range — fall through to the skeleton so a
  // range switch always shows a visible loading state and never lingers on the
  // old period's text. (`usedFallback` content is still a valid, finished
  // narrative — the gentle generic copy — so we render it too.)
  const showNarrative = hasEntries && resultKey === range && !generating;

  return (
    <motion.div
      key="insights"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={styles.screen}
    >
      {/* Same washed-out pastel orb background as the other screens. */}
      <div
        aria-hidden="true"
        className={styles.bg}
      />

      {/* Header + range selector. */}
      <div className={styles.header}>
        <button
          type="button"
          onClick={onBack}
          className={cx("btnReset", "focusRing", styles.backBtn)}
          aria-label="Back home"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 6-6 6 6 6" />
          </svg>
          Home
        </button>
        <h1 className={styles.title}>
          Insights
        </h1>
        <div className={styles.rangeWrap}>
          <RangeToggle value={range} onChange={setRange} />
        </div>
      </div>

      {!hasEntries ? (
        <div className={styles.empty}>
          <span
            aria-hidden="true"
            className={styles.emptyIcon}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1c2b33"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="6" y1="20" x2="6" y2="13" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="18" y1="20" x2="18" y2="9" />
            </svg>
          </span>
          <p className={styles.emptyTitle}>
            Nothing here yet
          </p>
          <p className={styles.emptyBody}>
            No entries in {rangeLabel(range).toLowerCase()}. Finish a session, or
            widen the range to see your patterns.
          </p>
        </div>
      ) : (
        <motion.div
          key={range}
          variants={container}
          initial="hidden"
          animate="show"
          className={styles.scroll}
        >
          {/* AI period reflection. */}
          <motion.section variants={item} className={styles.narrativeSection}>
            {showNarrative ? (
              <>
                <p className={styles.headline}>
                  {insights.headline}
                </p>
                <p className={styles.throughLine}>
                  {insights.throughLine}
                </p>
                {insights.shift && (
                  <p className={styles.shift}>
                    {insights.shift}
                  </p>
                )}
                {insights.question && (
                  <p className={styles.question}>
                    {insights.question}
                  </p>
                )}
              </>
            ) : (
              // Soft skeleton standing in for the narrative while it generates,
              // mirroring its shape: a bold headline, a couple of through-line
              // rows, and the purple closing question.
              <div
                className={styles.skeleton}
                role="status"
                aria-label="Generating insights"
              >
                {/* headline (text-[20px] font-medium) */}
                <div className={cx(styles.skelHeadline, styles.pulse)} />
                {/* throughLine (text-[16px], 2 rows) */}
                <div className={cx(styles.skelLine, styles.pulse)} />
                <div className={cx(styles.skelLineNarrow, styles.pulse)} />
                {/* shift (text-[15px]) */}
                <div className={cx(styles.skelShift, styles.pulse)} />
                {/* question (text-[16px] purple) */}
                <div className={cx(styles.skelQuestion, styles.pulse)} />
                <span className={styles.srOnly}>Generating insights…</span>
              </div>
            )}
          </motion.section>

          {/* Computed stats. */}
          <motion.div variants={item} className={styles.statsRow}>
            <Stat value={String(data.entryCount)} label="Entries" />
            <Stat value={String(data.totalMinutes)} label="Minutes" />
            <Stat value={data.totalWords.toLocaleString()} label="Words" />
          </motion.div>

          {/* Streak + busiest time, when meaningful. */}
          {(data.streak > 1 || data.busiestTime) && (
            <motion.div variants={item} className={styles.statsRowSecondary}>
              {data.streak > 1 && (
                <Stat value={`${data.streak} days`} label="Streak" />
              )}
              {data.busiestTime && (
                <Stat value={data.busiestTime.label} label="Most active" />
              )}
            </motion.div>
          )}

          {/* Recurring patterns across the period. */}
          {patterns.length > 0 && (
            <motion.section variants={item} className={styles.patternsSection}>
              <SectionTitle>Recurring patterns</SectionTitle>
              <PatternTags patterns={patterns} graph={data.graph} range={range} />
            </motion.section>
          )}

          {/* Top people. */}
          {data.topPeople.length > 0 && (
            <motion.section variants={item} className={styles.peopleSection}>
              <EntityRow title="People who came up" entities={data.topPeople} />
            </motion.section>
          )}

          {/* The aggregated atom graph — the full life map as a grey backdrop,
              with the selected range lit up in purple. */}
          <motion.section variants={item} className={styles.mapSection}>
            <SectionTitle>Your map</SectionTitle>
            <p className={styles.mapDesc}>
              {range === "today" ? (
                <>
                  <span className={styles.mapDescHighlight}>Today</span> is
                  lit up in purple against your wider map. Tap any node to see what
                  you said and how it connects.
                </>
              ) : (
                <>
                  <span className={styles.mapDescHighlight}>
                    {rangeLabel(range)}
                  </span>{" "}
                  is lit up in purple — the rest is the grey backdrop of your
                  wider map. Tap any node to see what you said and how it
                  connects.
                </>
              )}
            </p>
            <div className={styles.graphWrap}>
              <EntryGraph graph={data.graph} range={range} height={420} disablePinchZoom />
            </div>
          </motion.section>
        </motion.div>
      )}
    </motion.div>
  );
};
