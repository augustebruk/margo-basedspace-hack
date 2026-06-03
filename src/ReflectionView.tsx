import {
  useCallback,
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
import { buildAggregatedGraph } from "./graphModel";
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
  /** Secondary — go back to the home/entry screen. */
  onBackHome: () => void;
  /** Called whenever the user writes a response to a next-step prompt. */
  onNextStepResponse?: (stepIndex: number, text: string) => void;
  /** Previously saved responses (keyed by step index). */
  nextStepResponses?: Record<number, string>;
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
  onBackHome,
  onNextStepResponse,
  nextStepResponses: savedResponses = {},
}: ReflectionViewProps): JSX.Element => {
  // The map can be viewed two ways, just like a past entry's detail: just
  // THIS entry's own graph, or the cumulative all-time map. Both treat the
  // just-finished entry as "now" so its nodes light up purple as "new".
  const [mapScope, setMapScope] = useState<"entry" | "all">("entry");
  const aggregated = useMemo(() => {
    // The just-finished entry is the most recent (prepended in useEntries).
    const latest = pastEntries[0];
    const now = latest?.createdAt ?? Date.now();
    const upTo =
      mapScope === "entry"
        ? pastEntries.filter((e) => e.createdAt === now)
        : pastEntries;
    return buildAggregatedGraph(upTo, "all", { now });
  }, [pastEntries, mapScope]);

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

  // Local state for next-step responses; seeded from saved values.
  const [stepResponses, setStepResponses] = useState<Record<number, string>>(savedResponses);
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const handleStepInput = useCallback(
    (index: number, text: string) => {
      setStepResponses((prev) => ({ ...prev, [index]: text }));
      if (debounceTimers.current[index]) clearTimeout(debounceTimers.current[index]);
      debounceTimers.current[index] = setTimeout(() => {
        onNextStepResponse?.(index, text);
      }, 600);
    },
    [onNextStepResponse],
  );

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

        {/* Patterns → graph → next steps, staggered in only AFTER the reframe
            has fully revealed. Nothing here (including the map) is visible
            while the summary is still animating in sentence by sentence. */}
        <motion.div
          variants={container}
          initial="hidden"
          animate={contentRevealed ? "show" : "hidden"}
          className="mt-7 flex flex-col gap-8"
        >
          {/* Patterns — bigger, insightful chips with real frequency. */}
          <motion.section variants={item} className="flex flex-col gap-3">
            <SectionTitle>Patterns</SectionTitle>
            <PatternTags patterns={patterns} graph={aggregated} range="all" />
          </motion.section>

          {/* The living atom graph — big, full-bleed on the background. */}
          <motion.section variants={item} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>Your map</SectionTitle>
              <RangeToggle
                value={mapScope}
                onChange={setMapScope}
                options={[
                  { id: "entry", label: "This entry" },
                  { id: "all", label: "All time" },
                ]}
              />
            </div>
            {!mapLoading && aggregated.grewTodayCount > 0 && (
              <p className="[font-family:'Inter',Helvetica] text-[13px] font-normal leading-[19px] text-[#1c2b33]/55">
                {mapScope === "entry" ? (
                  <>
                    <span className="font-semibold text-[#7c3aed]">
                      {aggregated.grewTodayCount} new{" "}
                      {aggregated.grewTodayCount === 1 ? "thread" : "threads"}
                    </span>{" "}
                    grew from tonight — the purple nodes. Tap any node to see
                    what you said and how it connects.
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-[#7c3aed]">Tonight</span>{" "}
                    is lit up in purple against your wider map. Tap any node to
                    see what you said and how it connects.
                  </>
                )}
              </p>
            )}
            {/* Full-bleed: negative margins push past the px-5 page padding so
                the graph reaches the screen edges, Obsidian-style. No card. */}
            <div className="-mx-5 mt-1">
              <EntryGraph
                graph={aggregated}
                range="all"
                height={340}
                loading={mapLoading}
              />
            </div>
          </motion.section>

          {/* Next steps */}
          <motion.section variants={item} className="flex flex-col gap-3">
            <SectionTitle>Next steps</SectionTitle>
            <ul className="flex flex-col gap-3">
              {nextSteps.map((step, i) => (
                <li key={i} className="flex flex-col gap-2">
                  <div className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[linear-gradient(135deg,#c7a6f5,#f7a8c5)]"
                    />
                    <span className="[font-family:'Inter',Helvetica] text-[14px] font-normal leading-[21px] text-[#1c2b33]/75">
                      {step}
                    </span>
                  </div>
                  <div className="pl-4">
                    <textarea
                      value={stepResponses[i] ?? ""}
                      onChange={(e) => handleStepInput(i, e.target.value)}
                      rows={2}
                      placeholder="Write your thoughts here…"
                      className="w-full resize-none rounded-[14px] border border-[#e7e2ef] bg-white/70 p-3 [font-family:'Inter',Helvetica] text-[13px] leading-[19px] text-[#1c2b33] placeholder:text-[#1c2b33]/30 focus:border-[#c7a6f5] focus:outline-none focus:ring-2 focus:ring-[#c7a6f5]/20"
                    />
                    {stepResponses[i]?.trim() && (
                      <p className="mt-1 [font-family:'Inter',Helvetica] text-[11px] font-medium text-[#c7a6f5]">
                        Saved
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </motion.section>
        </motion.div>
      </div>

      {/* ---- Primary CTA — appears after the content has loaded ---- */}
      <div className="flex flex-col items-center gap-2.5 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
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
              aria-label="Start Daily Practice"
            >
              <span className="[font-family:'Inter',Helvetica] text-[15px] font-semibold tracking-[-0.2px] text-white">
                Start Daily Practice
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

        <AnimatePresence>
          {(contentRevealed || (!mapLoading && !hasSummary)) && (
            <motion.button
              type="button"
              onClick={onBackHome}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: 0.5 }}
              className="all-[unset] box-border inline-flex cursor-pointer items-center gap-1.5 [font-family:'Inter',Helvetica] text-[14px] font-medium text-[#1c2b33]/55 hover:text-[#1c2b33]/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]"
              aria-label="Return Home"
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 6-6 6 6 6" />
              </svg>
              Return Home
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
