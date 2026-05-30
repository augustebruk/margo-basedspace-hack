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
  <p className="[font-family:'Inter',Helvetica] text-[12px] font-medium uppercase tracking-[1.4px] text-[#1c2b33]/40">
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
  <div className="flex flex-1 flex-col items-center gap-0.5 rounded-[16px] bg-white/70 px-3 py-3">
    <span className="[font-family:'Inter',Helvetica] text-[22px] font-semibold tracking-[-0.4px] text-[#1c2b33]">
      {value}
    </span>
    <span className="[font-family:'Inter',Helvetica] text-[12px] font-normal uppercase tracking-[0.8px] text-[#1c2b33]/45">
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
    <div className="flex flex-col gap-2">
      <SectionTitle>{title}</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {entities.map((e) => (
          <span
            key={e.label}
            className="inline-flex items-baseline gap-1.5 rounded-full bg-white/70 px-3.5 py-1.5"
          >
            <span className="[font-family:'Inter',Helvetica] text-[13px] font-medium text-[#1c2b33]/80">
              {e.label}
            </span>
            {e.detail && (
              <span className="[font-family:'Inter',Helvetica] text-[11px] font-normal text-[#1c2b33]/40">
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
      className="relative flex h-full w-full flex-col"
    >
      {/* Same washed-out pastel orb background as the other screens. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(160deg, #f6eeff 0%, #fdf1f3 48%, #fef6f1 100%)",
        }}
      />

      {/* Header + range selector. */}
      <div className="px-5 pt-12 pb-3">
        <button
          type="button"
          onClick={onBack}
          className="all-[unset] box-border mb-3 inline-flex cursor-pointer items-center gap-1.5 [font-family:'Inter',Helvetica] text-[14px] font-medium text-[#1c2b33]/55 hover:text-[#1c2b33]/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]"
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
        <h1 className="[font-family:'Inter',Helvetica] text-[28px] font-medium leading-[1.2] tracking-[-0.5px] text-[#1c2b33]">
          Insights
        </h1>
        <div className="mt-3">
          <RangeToggle value={range} onChange={setRange} />
        </div>
      </div>

      {!hasEntries ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <span
            aria-hidden="true"
            className="mb-5 flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              background:
                "linear-gradient(135deg, rgba(244,231,255,1) 0%, rgba(253,221,222,1) 100%)",
            }}
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
          <p className="[font-family:'Inter',Helvetica] text-[19px] font-medium tracking-[-0.3px] text-[#1c2b33]">
            Nothing here yet
          </p>
          <p className="mt-1.5 max-w-[260px] [font-family:'Inter',Helvetica] text-[14px] font-normal leading-[21px] text-[#1c2b33]/55">
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
          className="min-h-0 flex-1 overflow-y-auto px-5 pb-24"
        >
          {/* AI period reflection. */}
          <motion.section variants={item} className="flex flex-col gap-2.5">
            {showNarrative ? (
              <>
                <p className="[font-family:'Inter',Helvetica] text-[20px] font-medium leading-[1.4] tracking-[-0.3px] text-[#1c2b33]">
                  {insights.headline}
                </p>
                <p className="[font-family:'Inter',Helvetica] text-[16px] font-normal leading-[1.5] tracking-[-0.2px] text-[#1c2b33]/80">
                  {insights.throughLine}
                </p>
                {insights.shift && (
                  <p className="[font-family:'Inter',Helvetica] text-[15px] font-normal leading-[1.5] text-[#1c2b33]/65">
                    {insights.shift}
                  </p>
                )}
                {insights.question && (
                  <p className="mt-1 [font-family:'Inter',Helvetica] text-[16px] font-medium leading-[1.45] tracking-[-0.2px] text-[#a07ee0]">
                    {insights.question}
                  </p>
                )}
              </>
            ) : (
              // Soft skeleton standing in for the narrative while it generates,
              // mirroring its shape: a bold headline, a couple of through-line
              // rows, and the purple closing question.
              <div
                className="flex flex-col gap-2.5"
                role="status"
                aria-label="Generating insights"
              >
                {/* headline (text-[20px] font-medium) */}
                <div className="h-[26px] w-4/5 animate-pulse rounded-full bg-[#1c2b33]/12" />
                {/* throughLine (text-[16px], 2 rows) */}
                <div className="h-[19px] w-full animate-pulse rounded-full bg-[#1c2b33]/[0.08]" />
                <div className="h-[19px] w-11/12 animate-pulse rounded-full bg-[#1c2b33]/[0.08]" />
                {/* shift (text-[15px]) */}
                <div className="h-[18px] w-2/3 animate-pulse rounded-full bg-[#1c2b33]/[0.07]" />
                {/* question (text-[16px] purple) */}
                <div className="mt-1 h-[19px] w-3/4 animate-pulse rounded-full bg-[#a07ee0]/30" />
                <span className="sr-only">Generating insights…</span>
              </div>
            )}
          </motion.section>

          {/* Computed stats. */}
          <motion.div variants={item} className="mt-7 flex gap-2.5">
            <Stat value={String(data.entryCount)} label="Entries" />
            <Stat value={String(data.totalMinutes)} label="Minutes" />
            <Stat value={data.totalWords.toLocaleString()} label="Words" />
          </motion.div>

          {/* Streak + busiest time, when meaningful. */}
          {(data.streak > 1 || data.busiestTime) && (
            <motion.div variants={item} className="mt-2.5 flex gap-2.5">
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
            <motion.section variants={item} className="mt-8 flex flex-col gap-3">
              <SectionTitle>Recurring patterns</SectionTitle>
              <PatternTags patterns={patterns} graph={data.graph} range={range} />
            </motion.section>
          )}

          {/* Top people + feelings. */}
          {(data.topPeople.length > 0 || data.topFeelings.length > 0) && (
            <motion.section variants={item} className="mt-8 flex flex-col gap-5">
              <EntityRow title="People who came up" entities={data.topPeople} />
              <EntityRow title="Feelings that recurred" entities={data.topFeelings} />
            </motion.section>
          )}

          {/* The aggregated atom graph for the range. */}
          <motion.section variants={item} className="mt-8 flex flex-col gap-3">
            <SectionTitle>Your map</SectionTitle>
            {data.graph.grewTodayCount > 0 && (
              <p className="[font-family:'Inter',Helvetica] text-[13px] font-normal leading-[19px] text-[#1c2b33]/55">
                <span className="font-semibold text-[#7c3aed]">
                  {data.graph.grewTodayCount} new{" "}
                  {data.graph.grewTodayCount === 1 ? "thread" : "threads"}
                </span>{" "}
                grew today — the purple nodes. Tap any node to see what you said
                and how it connects.
              </p>
            )}
            <div className="-mx-5 mt-1">
              <EntryGraph graph={data.graph} range={range} height={420} />
            </div>
          </motion.section>
        </motion.div>
      )}
    </motion.div>
  );
};
