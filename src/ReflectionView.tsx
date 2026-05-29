import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";

/* ============================================================================
 * Types — shape the AI output into these props. Plug real model output in
 * place of the mock data passed from <Frame/>:
 *   • summary        → the spoken reflection (2–3 sentences)
 *   • patterns       → recurring themes + light recurrence info
 *   • interpretation → one warm, validating paragraph (+ optional question)
 *   • nextSteps      → 1–3 tiny concrete actions
 * ==========================================================================*/
export interface ReflectionPattern {
  label: string;
  /** Tiny recurrence hint, e.g. "3x this week" or "recurring". */
  recurrenceLabel?: string;
}

export interface ReflectionViewProps {
  summary: string;
  patterns: ReflectionPattern[];
  interpretation: string;
  nextSteps: string[];
  /** True while the AI is "speaking" — drives the voice-bar waveform. */
  aiSpeaking: boolean;
  /** Called once the summary has fully revealed (parent calms the wave). */
  onSummaryComplete?: () => void;
  /** Main CTA — wire to the real practice experience later. */
  onStartDailyPractice: () => void;
}

// Orb gradient (the most saturated element — the "orb material").
const ORB_GRADIENT =
  "linear-gradient(110deg, #ece3ff 0%, #fcdfe3 55%, #ffe9dc 100%)";

// Premium, calm easing (no bounce).
const EASE = [0.22, 1, 0.36, 1] as const;

/* -------------------------------------------------------------------------- */
/* Waveform — soft vertical bars that gently move while the AI speaks.        */
/* -------------------------------------------------------------------------- */
const BAR_COUNT = 26;

const Waveform = ({ active }: { active: boolean }): JSX.Element => (
  <div className="flex h-9 items-center justify-center gap-[3px]">
    {Array.from({ length: BAR_COUNT }).map((_, i) => {
      // Smooth, organic peak heights across the bar.
      const peak = 0.45 + 0.55 * Math.abs(Math.sin(i * 0.7 + 1));
      return (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-white/75"
          style={{ height: 24, originY: 0.5 }}
          animate={
            active
              ? { scaleY: [0.28, peak, 0.28] }
              : { scaleY: 0.22 } // calmed / paused
          }
          transition={
            active
              ? {
                  duration: 0.9 + (i % 5) * 0.14,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: (i % 7) * 0.07,
                }
              : { duration: 0.5, ease: "easeOut" }
          }
        />
      );
    })}
  </div>
);

/* -------------------------------------------------------------------------- */
/* PracticeCard — light surface card with a tiny interactive element.         */
/* -------------------------------------------------------------------------- */
const PracticeCard = (): JSX.Element => {
  const [done, setDone] = useState(false);
  const [seconds, setSeconds] = useState(120);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [running]);

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-[20px] bg-[linear-gradient(180deg,#ffffff_0%,#fdf6ff_100%)] p-4 shadow-[0_8px_28px_rgba(28,43,51,0.06)]">
      <p className="[font-family:'Inter',Helvetica] text-[15px] font-semibold text-[#1c2b33]">
        2-minute reset
      </p>
      <p className="mt-1 [font-family:'Inter',Helvetica] text-[13px] font-normal leading-[19px] text-[#1c2b33]/55">
        A short breathing pause to ease the overwhelm before you move on.
      </p>

      <div className="mt-3 flex items-center justify-between">
        {/* Tiny timer */}
        <button
          type="button"
          onClick={() => setRunning((r) => !r)}
          className="all-[unset] box-border flex cursor-pointer items-center gap-2 rounded-full bg-[rgba(244,231,255,0.5)] px-3 py-1.5"
        >
          <span className="[font-family:'Inter',Helvetica] text-[13px] font-medium tabular-nums text-[#54656e]">
            {mmss}
          </span>
          <span className="[font-family:'Inter',Helvetica] text-[12px] font-medium text-[#54656e]/70">
            {running ? "Pause" : seconds === 0 ? "Done" : "Start"}
          </span>
        </button>

        {/* Mark-as-done checkbox */}
        <button
          type="button"
          onClick={() => setDone((d) => !d)}
          aria-pressed={done}
          className="all-[unset] box-border flex cursor-pointer items-center gap-2"
        >
          <span
            className={
              "flex h-5 w-5 items-center justify-center rounded-md border transition-colors " +
              (done
                ? "border-transparent bg-[linear-gradient(135deg,#c7a6f5,#f7a8c5)]"
                : "border-[#1c2b33]/15 bg-white")
            }
          >
            {done && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7" />
              </svg>
            )}
          </span>
          <span className="[font-family:'Inter',Helvetica] text-[13px] font-medium text-[#54656e]">
            I'll try this
          </span>
        </button>
      </div>
    </div>
  );
};

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
  interpretation,
  nextSteps,
  aiSpeaking,
  onSummaryComplete,
  onStartDailyPractice,
}: ReflectionViewProps): JSX.Element => {
  // Split the summary into sentences for the progressive reveal.
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

  // Once the summary is fully revealed: calm the wave, then flow the rest in.
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

      {/* ---- Voice bar (the orb, reshaped into a pill) ---- */}
      <div className="px-5 pt-14 pb-3">
        <motion.div
          // Morphs in from a small rounded shape into the wide pill, so it
          // feels like the orb flowing up and reshaping.
          initial={{ opacity: 0, scaleX: 0.45, scaleY: 0.85, y: -6 }}
          animate={{ opacity: 1, scaleX: 1, scaleY: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          style={{ background: ORB_GRADIENT }}
          className="flex h-16 w-full items-center justify-center rounded-[28px] shadow-[0_12px_34px_rgba(28,43,51,0.12)]"
        >
          <Waveform active={aiSpeaking} />
        </motion.div>
      </div>

      {/* ---- Scrollable reflection content (min-h-0 so the footer stays) ---- */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {/* 1) AI reflection summary — revealed sentence by sentence. */}
        <p className="mt-2 [font-family:'Inter',Helvetica] text-[19px] font-normal leading-[1.5] tracking-[-0.2px] text-[#1c2b33]">
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

        {/* 2–4) Patterns → interpretation → next steps, staggered in. */}
        <motion.div
          variants={container}
          initial="hidden"
          animate={contentRevealed ? "show" : "hidden"}
          className="mt-7 flex flex-col gap-7"
        >
          {/* 2) Patterns */}
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
          </motion.section>

          {/* 3) Interpretation / reframe */}
          <motion.section variants={item} className="flex flex-col gap-2">
            <SectionTitle>Reframe</SectionTitle>
            <div className="rounded-[20px] bg-[linear-gradient(180deg,#ffffff_0%,#fdf7f7_100%)] p-4 shadow-[0_8px_28px_rgba(28,43,51,0.05)]">
              <p className="[font-family:'Inter',Helvetica] text-[15px] font-normal leading-[23px] text-[#1c2b33]/75">
                {interpretation}
              </p>
            </div>
          </motion.section>

          {/* 4) Next steps & practice */}
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
            <PracticeCard />
          </motion.section>
        </motion.div>
      </div>

      {/* ---- Primary CTA — appears after the content has loaded ---- */}
      <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <AnimatePresence>
          {contentRevealed && (
            <motion.button
              type="button"
              onClick={onStartDailyPractice}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.35 }}
              whileTap={{
                scale: 0.97,
                boxShadow: "0 6px 16px rgba(199,166,245,0.30)",
              }}
              className="all-[unset] box-border flex h-14 w-full cursor-pointer items-center justify-center rounded-full shadow-[0_14px_34px_rgba(199,166,245,0.45)]"
              style={{
                background:
                  "linear-gradient(90deg, #c7a6f5 0%, #ec9fc4 52%, #f7b59a 100%)",
              }}
              aria-label="Start daily practice"
            >
              <span className="[font-family:'Inter',Helvetica] text-[16px] font-semibold tracking-[-0.2px] text-white">
                Start daily practice
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
