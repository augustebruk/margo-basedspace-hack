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
import { cx } from "./cx";
import styles from "./ReflectionView.module.css";

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
  <p className={styles.sectionTitle}>
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
      className={styles.root}
    >
      {/* Washed-out, low-contrast version of the orb gradient as background. */}
      <div aria-hidden="true" className={styles.bg} />

      {/* ---- Scrollable reflection content (min-h-0 so the footer stays) ---- */}
      <div className={styles.scroll}>
        {/* Reframe — the spoken reflection, revealed sentence by sentence.
            While it's still being written, a gentle shimmer holds the space. */}
        {!hasSummary ? (
          mapLoading ? (
            <div aria-live="polite" className={styles.shimmerStack}>
              <span className={styles.srOnly}>Writing your reflection…</span>
              <motion.div
                aria-hidden="true"
                className={cx(styles.shimmerBar, styles.shimmerBarWide)}
                animate={{ opacity: [0.4, 0.85, 0.4] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                aria-hidden="true"
                className={cx(styles.shimmerBar, styles.shimmerBarMid)}
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
                className={cx(styles.shimmerBar, styles.shimmerBarNarrow)}
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
            <p className={styles.summaryFallback}>
              We couldn’t put your reflection into words this time. Your map
              below still holds what you said.
            </p>
          )
        ) : (
          <p className={styles.summary}>
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
          className={styles.sections}
        >
          {/* Patterns — bigger, insightful chips with real frequency. */}
          <motion.section variants={item} className={styles.section}>
            <SectionTitle>Patterns</SectionTitle>
            <PatternTags patterns={patterns} graph={aggregated} range="all" />
          </motion.section>

          {/* The living atom graph — big, full-bleed on the background. */}
          <motion.section variants={item} className={styles.section}>
            <div className={styles.mapHeader}>
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
              <p className={styles.mapHint}>
                {mapScope === "entry" ? (
                  <>
                    <span className={styles.mapHintEmphasis}>
                      {aggregated.grewTodayCount} new{" "}
                      {aggregated.grewTodayCount === 1 ? "thread" : "threads"}
                    </span>{" "}
                    grew from tonight — the purple nodes. Tap any node to see
                    what you said and how it connects.
                  </>
                ) : (
                  <>
                    <span className={styles.mapHintEmphasis}>Tonight</span>{" "}
                    is lit up in purple against your wider map. Tap any node to
                    see what you said and how it connects.
                  </>
                )}
              </p>
            )}
            {/* Full-bleed: negative margins push past the px-5 page padding so
                the graph reaches the screen edges, Obsidian-style. No card. */}
            <div className={styles.graphBleed}>
              <EntryGraph
                graph={aggregated}
                range="all"
                height={340}
                loading={mapLoading}
              />
            </div>
          </motion.section>

          {/* Next steps */}
          <motion.section variants={item} className={styles.section}>
            <SectionTitle>Next steps</SectionTitle>
            <ul className={styles.steps}>
              {nextSteps.map((step, i) => (
                <li key={i} className={styles.stepItem}>
                  <div className={styles.stepRow}>
                    <span
                      aria-hidden="true"
                      className={styles.stepBullet}
                    />
                    <span className={styles.stepText}>
                      {step}
                    </span>
                  </div>
                  <div className={styles.stepResponseWrap}>
                    <textarea
                      value={stepResponses[i] ?? ""}
                      onChange={(e) => handleStepInput(i, e.target.value)}
                      rows={2}
                      placeholder="Write your thoughts here…"
                      className={styles.stepResponseInput}
                    />
                    {stepResponses[i]?.trim() && (
                      <p className={styles.stepSavedNote}>
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
      <div className={styles.footer}>
        <AnimatePresence>
          {(contentRevealed || (!mapLoading && !hasSummary)) && (
            <motion.button
              type="button"
              onClick={onStartDailyPractice}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.35 }}
              whileTap={{ scale: 0.96 }}
              className={cx("btnReset", styles.cta)}
              aria-label="Start Daily Practice"
            >
              <span className={styles.ctaLabel}>
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
                className={styles.ctaIcon}
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
              className={cx("btnReset", "focusRing", styles.backHome)}
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
