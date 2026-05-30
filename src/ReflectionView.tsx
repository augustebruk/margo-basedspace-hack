import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { EntryGraph } from "./EntryGraph";
import { RangeToggle } from "./RangeToggle";
import { PatternTags } from "./PatternTags";
import { buildAggregatedGraph, type GraphRange } from "./graphModel";
import type { Entry } from "./useEntries";

/* ============================================================================
 * Types — shape the AI output into these props. Plug real model output in
 * place of the mock data passed from <Frame/>:
 *   • summary   → the spoken reflection / reframe (1–3 sentences)
 *   • patterns  → recurring themes + light recurrence info
 *   • nextSteps → 1–3 tiny concrete actions
 * ==========================================================================*/
export interface ReflectionPattern {
  label: string;
  /** Tiny recurrence hint, e.g. "3x this week" or "recurring". */
  recurrenceLabel?: string;
}

export interface ReflectionViewProps {
  /** The spoken reflection — written as a warm reframe (1–3 sentences). */
  summary: string;
  patterns: ReflectionPattern[];
  nextSteps: string[];
  /** All saved entries (incl. the one just finished), to aggregate the map. */
  pastEntries: Entry[];
  /** True while the reflection (and its graph seed) is still generating. */
  mapLoading?: boolean;
  /** @deprecated No longer used — the voice bar/waveform was removed. */
  aiSpeaking?: boolean;
  /** Called once the summary has fully revealed (parent calms the wave). */
  onSummaryComplete?: () => void;
  /** Main CTA — wire to the real practice experience later. */
  onStartDailyPractice: () => void;
}

// Premium, calm easing (no bounce).
const EASE = [0.22, 1, 0.36, 1] as const;

/* -------------------------------------------------------------------------- */
/* Section stagger variants — content "flows down" after the summary.         */
/* -------------------------------------------------------------------------- */
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.16, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

const SectionTitle = ({ children }: { children: string }): JSX.Element => (
  <p className="[font-family:'Inter',Helvetica] text-[12px] font-medium uppercase tracking-[1.4px] text-[#1c2b33]/40">
    {children}
  </p>
);

/* -------------------------------------------------------------------------- */
/* ReflectionView                                                             */
/* -------------------------------------------------------------------------- */
export const ReflectionView = ({
  summary,
  patterns,
  nextSteps,
  pastEntries,
  mapLoading = false,
  onSummaryComplete,
  onStartDailyPractice,
}: ReflectionViewProps): JSX.Element => {
  // Which span of life to map. Default to the week — the most actionable view.
  const [range, setRange] = useState<GraphRange>("week");

  // The cumulative atom graph: every entry's people/situations/feelings for
  // the selected range. Tonight's entry is already persisted into
  // `pastEntries` by the time we render, so it's included automatically (and
  // its nodes light up purple as "new today").
  const aggregated = useMemo(
    () => buildAggregatedGraph(pastEntries, range),
    [pastEntries, range],
  );

  // Split the reframe into sentences for the progressive reveal. Empty until
  // the summary has actually been generated (the screen can appear first).
  const hasSummary = summary.trim().length > 0;
  const sentences = useMemo(
    () =>
      hasSummary
        ? summary.match(/[^.!?]+[.!?]+(\s|$)/g)?.map((s) => s.trim()) ?? [summary]
        : [],
    [summary, hasSummary],
  );

  const [visible, setVisible] = useState(0); // sentences revealed so far
  const [contentRevealed, setContentRevealed] = useState(false); // sections in

  // Keep the latest callback in a ref so the reveal effects don't re-run (and
  // cancel their timers) just because the parent passes a new function.
  const onCompleteRef = useRef(onSummaryComplete);
  useEffect(() => {
    onCompleteRef.current = onSummaryComplete;
  }, [onSummaryComplete]);

  // Reveal one sentence at a time (once the summary exists).
  useEffect(() => {
    if (sentences.length === 0 || visible >= sentences.length) return;
    const delay = visible === 0 ? 350 : 1500;
    const t = setTimeout(() => setVisible((v) => v + 1), delay);
    return () => clearTimeout(t);
  }, [visible, sentences.length]);

  // Once the reframe is fully revealed: calm the wave, then flow the rest in.
  const completedRef = useRef(false);
  useEffect(() => {
    if (
      sentences.length === 0 ||
      visible < sentences.length ||
      completedRef.current
    )
      return;
    completedRef.current = true;
    onCompleteRef.current?.();
    const t = setTimeout(() => setContentRevealed(true), 350);
    return () => clearTimeout(t);
  }, [visible, sentences.length]);

  return (
    <motion.div
      key="reflection"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative flex h-full w-full flex-col"
    >
      {/* Washed-out, low-contrast version of the orb gradient as background. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(160deg, #f6eeff 0%, #fdf1f3 48%, #fef6f1 100%)",
        }}
      />

      {/* ---- Scrollable reflection content (min-h-0 so the footer stays) ---- */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-14 pb-6">
        {/* Reframe — the spoken reflection, revealed sentence by sentence.
            While it's still being written, a gentle shimmer holds the space. */}
        {!hasSummary ? (
          mapLoading ? (
            <div aria-live="polite" className="flex flex-col gap-3">
              <span className="sr-only">Writing your reflection…</span>
              <motion.div
                aria-hidden="true"
                className="h-[19px] w-[88%] rounded-full bg-[#1c2b33]/10"
                animate={{ opacity: [0.4, 0.85, 0.4] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                aria-hidden="true"
                className="h-[19px] w-[72%] rounded-full bg-[#1c2b33]/10"
                animate={{ opacity: [0.4, 0.85, 0.4] }}
                transition={{
                  duration: 1.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.2,
                }}
              />
              <motion.div
                aria-hidden="true"
                className="h-[19px] w-[54%] rounded-full bg-[#1c2b33]/10"
                animate={{ opacity: [0.4, 0.85, 0.4] }}
                transition={{
                  duration: 1.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.4,
                }}
              />
            </div>
          ) : (
            <p className="[font-family:'Inter',Helvetica] text-[17px] font-normal leading-[1.5] text-[#1c2b33]/55">
              We couldn’t put your reflection into words this time. Your map
              below still holds what you said.
            </p>
          )
        ) : (
          <p className="[font-family:'Inter',Helvetica] text-[19px] font-normal leading-[1.5] tracking-[-0.2px] text-[#1c2b33]">
            {sentences.map((s, i) =>
              i < visible ? (
                <motion.span
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                >
                  {s}{" "}
                </motion.span>
              ) : null,
            )}
          </p>
        )}

        {/* The living atom graph — revealed early (while patterns/steps still
            wait on the reframe) so its loading state is visible as the entry
            is processed. Big, full-bleed on the background. */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.15 }}
          className="mt-7 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-3">
            <SectionTitle>Your map</SectionTitle>
            <RangeToggle value={range} onChange={setRange} />
          </div>
          {!mapLoading && aggregated.grewTodayCount > 0 && (
            <p className="[font-family:'Inter',Helvetica] text-[13px] font-normal leading-[19px] text-[#1c2b33]/55">
              <span className="font-semibold text-[#7c3aed]">
                {aggregated.grewTodayCount} new{" "}
                {aggregated.grewTodayCount === 1 ? "thread" : "threads"}
              </span>{" "}
              grew from tonight — the purple nodes. Tap any node to see what
              you said and how it connects.
            </p>
          )}
          {/* Full-bleed: negative margins push past the px-5 page padding so
              the graph reaches the screen edges, Obsidian-style. No card. */}
          <div className="-mx-5 mt-1">
            <EntryGraph
              graph={aggregated}
              range={range}
              height={420}
              loading={mapLoading}
            />
          </div>
        </motion.section>

        {/* Patterns + next steps, staggered in after the reframe. */}
        <motion.div
          variants={container}
          initial="hidden"
          animate={contentRevealed ? "show" : "hidden"}
          className="mt-8 flex flex-col gap-8"
        >
          {/* Patterns — bigger, insightful chips with real frequency. */}
          <motion.section variants={item} className="flex flex-col gap-3">
            <SectionTitle>Patterns</SectionTitle>
            <PatternTags patterns={patterns} graph={aggregated} range={range} />
          </motion.section>

          {/* Next steps */}
          <motion.section variants={item} className="flex flex-col gap-3">
            <SectionTitle>Next steps</SectionTitle>
            <ul className="flex flex-col gap-2">
              {nextSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[linear-gradient(135deg,#c7a6f5,#f7a8c5)]"
                  />
                  <span className="[font-family:'Inter',Helvetica] text-[14px] font-normal leading-[21px] text-[#1c2b33]/75">
                    {step}
                  </span>
                </li>
              ))}
            </ul>
          </motion.section>
        </motion.div>
      </div>

      {/* ---- Primary CTA — appears after the content has loaded ---- */}
      <div className="flex justify-center px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <AnimatePresence>
          {(contentRevealed || (!mapLoading && !hasSummary)) && (
            <motion.button
              type="button"
              onClick={onStartDailyPractice}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.35 }}
              whileTap={{ scale: 0.96 }}
              className="all-[unset] box-border flex h-12 cursor-pointer items-center gap-2 rounded-full px-6 text-white shadow-[0_14px_34px_rgba(199,166,245,0.45)] transition-transform hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c7a6f5]"
              style={{
                background:
                  "linear-gradient(90deg, #c7a6f5 0%, #ec9fc4 52%, #f7b59a 100%)",
              }}
              aria-label="Start daily practice"
            >
              <span className="[font-family:'Inter',Helvetica] text-[15px] font-semibold tracking-[-0.2px] text-white">
                Start daily practice
              </span>
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
                className="shrink-0"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
