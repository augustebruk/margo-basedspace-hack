import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { EntryGraph } from "./EntryGraph";

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
  onSummaryComplete,
  onStartDailyPractice,
}: ReflectionViewProps): JSX.Element => {
  // Split the reframe into sentences for the progressive reveal.
  const sentences = useMemo(
    () => summary.match(/[^.!?]+[.!?]+(\s|$)/g)?.map((s) => s.trim()) ?? [summary],
    [summary],
  );

  const [visible, setVisible] = useState(0); // sentences revealed so far
  const [contentRevealed, setContentRevealed] = useState(false); // sections in

  // Keep the latest callback in a ref so the reveal effects don't re-run (and
  // cancel their timers) just because the parent passes a new function.
  const onCompleteRef = useRef(onSummaryComplete);
  useEffect(() => {
    onCompleteRef.current = onSummaryComplete;
  }, [onSummaryComplete]);

  // Reveal one sentence at a time.
  useEffect(() => {
    if (visible >= sentences.length) return;
    const delay = visible === 0 ? 350 : 1500;
    const t = setTimeout(() => setVisible((v) => v + 1), delay);
    return () => clearTimeout(t);
  }, [visible, sentences.length]);

  // Once the reframe is fully revealed: calm the wave, then flow the rest in.
  const completedRef = useRef(false);
  useEffect(() => {
    if (visible < sentences.length || completedRef.current) return;
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
        {/* Reframe — the spoken reflection, revealed sentence by sentence. */}
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

        {/* Patterns → graph → next steps, staggered in after the reframe. */}
        <motion.div
          variants={container}
          initial="hidden"
          animate={contentRevealed ? "show" : "hidden"}
          className="mt-7 flex flex-col gap-7"
        >
          {/* Patterns + connection graph */}
          <motion.section variants={item} className="flex flex-col gap-3">
            <SectionTitle>Patterns</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {patterns.map((p) => (
                <span
                  key={p.label}
                  className="inline-flex items-baseline gap-1.5 rounded-full bg-[rgba(244,231,255,0.5)] px-3.5 py-1.5"
                >
                  <span className="[font-family:'Inter',Helvetica] text-[13px] font-medium text-[#1c2b33]/80">
                    {p.label}
                  </span>
                  {p.recurrenceLabel && (
                    <span className="[font-family:'Inter',Helvetica] text-[11px] font-normal text-[#1c2b33]/40">
                      · {p.recurrenceLabel}
                    </span>
                  )}
                </span>
              ))}
            </div>

            {/* Obsidian-style graph of how this entry connects — drag, pan, zoom. */}
            <div className="mt-1 overflow-hidden rounded-[20px] bg-white p-1.5 shadow-[0_8px_28px_rgba(28,43,51,0.05)]">
              <EntryGraph height={240} />
            </div>
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
          {contentRevealed && (
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
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
