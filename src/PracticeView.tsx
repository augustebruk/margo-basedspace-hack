import { useState, type JSX } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import type { Practice } from "./usePractice";

/* ============================================================================
 * PracticeView — a personalized, evidence-based daily practice.
 *
 * The whole practice is generated from the entry transcript (see `usePractice`
 * / the `practice` mode of `/api/reflection`). The server silently picks the
 * single best-fitting therapeutic modality for what the person said — CBT
 * thought records, ACT defusion + values + committed action, DBT skills,
 * Kristin Neff self-compassion / CFT, or behavioral activation — and shapes the
 * steps around it. This component just renders those steps:
 *
 *   1. Focus      — a single-choice read of what's really going on tonight.
 *   2. Deepen     — a guided written reflection with "write more about X" chips.
 *   3. Skill      — one tiny in-the-moment skill to try right now.
 *   4. Commit     — one small, values-aligned action before tomorrow.
 *
 * The OUTER SHELL (gradient, header, "Save practice", "Back to home") stays
 * stable; all copy is prop-driven from the generated `Practice`.
 * ==========================================================================*/
export interface PracticeResult {
  /** The Step 1 single-choice read the person picked. */
  focus: string | null;
  /** The Step 2 free-written reflection. */
  reflection: string;
  /** Whether they marked the Step 3 micro-skill as done. */
  triedSkill: boolean;
  /** The Step 4 committed action (a suggested one or their own). */
  action: string;
}

export interface PracticeViewProps {
  /** The generated, personalized practice. */
  practice: Practice;
  /** Called with the collected answers when "Save practice" is tapped. */
  onSave?: (result: PracticeResult) => void;
  /** Secondary CTA — wire to real navigation later. */
  onBackHome: () => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;

// Gentle entrance stagger so the steps "flow" in, matching the Reflection feel.
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

const StepLabel = ({
  step,
  children,
}: {
  step: number;
  children: string;
}): JSX.Element => (
  <div className="flex items-center gap-2">
    <span
      aria-hidden="true"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{ background: "linear-gradient(135deg,#c7a6f5,#f7a8c5)" }}
    >
      {step}
    </span>
    <p className="[font-family:'Inter',Helvetica] text-[14px] font-semibold leading-[20px] text-[#1c2b33]">
      {children}
    </p>
  </div>
);

/** Radio-style single choice tile. */
const ChoiceTile = ({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}): JSX.Element => (
  <button
    type="button"
    onClick={onSelect}
    aria-pressed={active}
    className={
      "all-[unset] box-border flex w-full cursor-pointer items-center gap-3 rounded-[16px] border px-4 py-3 transition-colors " +
      (active
        ? "border-[#c7a6f5] bg-[rgba(244,231,255,0.6)]"
        : "border-[#e7e2ef] bg-white/70 hover:bg-white")
    }
  >
    <span
      aria-hidden="true"
      className={
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors " +
        (active ? "border-transparent" : "border-[#1c2b33]/20")
      }
      style={
        active
          ? { background: "linear-gradient(135deg,#c7a6f5,#f7a8c5)" }
          : undefined
      }
    >
      {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
    </span>
    <span className="[font-family:'Inter',Helvetica] text-[14px] font-normal leading-[20px] text-[#1c2b33]/85">
      {label}
    </span>
  </button>
);

export const PracticeView = ({
  practice,
  onSave,
  onBackHome,
}: PracticeViewProps): JSX.Element => {
  const [selectedFocus, setSelectedFocus] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");
  // Which "write more about X" chips have already been appended to the text,
  // so each only adds its nudge once.
  const [usedFollowups, setUsedFollowups] = useState<string[]>([]);
  const [triedSkill, setTriedSkill] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [customAction, setCustomAction] = useState("");
  const [saved, setSaved] = useState(false);

  const finalAction = customAction.trim() || selectedAction || "";

  // Tapping a "write more about X" chip appends its nudge as a gentle scaffold
  // to the reflection so the person can keep writing under it.
  const handleAddFollowup = (followup: string) => {
    if (usedFollowups.includes(followup)) return;
    setUsedFollowups((prev) => [...prev, followup]);
    setReflection((prev) => {
      const prefix = prev.trim() ? prev.replace(/\s*$/, "") + "\n\n" : "";
      return `${prefix}${followup}\n`;
    });
  };

  const handleSave = () => {
    const result: PracticeResult = {
      focus: selectedFocus,
      reflection: reflection.trim(),
      triedSkill,
      action: finalAction,
    };
    // Placeholder: later persist this / advance to the next experience.
    console.log("[practice] save practice:", result);
    onSave?.(result);
    setSaved(true);
  };

  return (
    <motion.div
      key="practice"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative flex h-full w-full flex-col"
    >
      {/* Same washed-out pastel orb background as the Reflection screen. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(160deg, #f6eeff 0%, #fdf1f3 48%, #fef6f1 100%)",
        }}
      />

      {/* Header — title + Margo's intro + the (non-clinical) approach pill. */}
      <div className="px-5 pt-12 pb-3">
        <p className="[font-family:'Inter',Helvetica] text-[12px] font-medium uppercase tracking-[1.4px] text-[#1c2b33]/40">
          Tonight's practice
        </p>
        <h1 className="mt-1 [font-family:'Inter',Helvetica] text-[24px] font-medium leading-[1.25] tracking-[-0.4px] text-[#1c2b33]">
          {practice.title}
        </h1>
        <p className="mt-2 [font-family:'Inter',Helvetica] text-[14px] font-normal leading-[21px] text-[#1c2b33]/65">
          {practice.intro}
        </p>
        {practice.approachLabel && (
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 shadow-[0_4px_14px_rgba(28,43,51,0.05)]">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-[linear-gradient(135deg,#c7a6f5,#f7a8c5)]"
            />
            <span className="[font-family:'Inter',Helvetica] text-[12px] font-medium text-[#1c2b33]/70">
              {practice.approachLabel}
            </span>
          </span>
        )}
      </div>

      {/* Scrollable steps (min-h-0 so the footer stays pinned). */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="min-h-0 flex-1 overflow-y-auto px-5 pb-5"
      >
        {/* Step 1 — focus (single choice) */}
        <motion.section variants={item} className="flex flex-col gap-2.5">
          <StepLabel step={1}>{practice.focusPrompt}</StepLabel>
          <div className="flex flex-col gap-2">
            {practice.options.map((opt) => (
              <ChoiceTile
                key={opt}
                label={opt}
                active={selectedFocus === opt}
                onSelect={() => setSelectedFocus(opt)}
              />
            ))}
          </div>
        </motion.section>

        {/* Step 2 — guided written reflection + "write more about X" chips */}
        <motion.section variants={item} className="mt-6 flex flex-col gap-2.5">
          <StepLabel step={2}>{practice.deepenLabel}</StepLabel>
          <p className="[font-family:'Inter',Helvetica] text-[13px] font-normal leading-[19px] text-[#1c2b33]/60">
            {practice.deepenPrompt}
          </p>
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            rows={5}
            placeholder="Take your time. There's no wrong answer here."
            className="w-full resize-none rounded-[16px] border border-[#e7e2ef] bg-white/80 p-3.5 [font-family:'Inter',Helvetica] text-[14px] leading-[21px] text-[#1c2b33] placeholder:text-[#1c2b33]/35 focus:border-[#c7a6f5] focus:outline-none focus:ring-2 focus:ring-[#c7a6f5]/20"
          />
          {practice.deepenFollowups.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="[font-family:'Inter',Helvetica] text-[12px] font-medium text-[#1c2b33]/45">
                Stuck? Write a little more about…
              </p>
              <div className="flex flex-wrap gap-2">
                {practice.deepenFollowups.map((f) => {
                  const used = usedFollowups.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => handleAddFollowup(f)}
                      disabled={used}
                      className={
                        "all-[unset] box-border flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 [font-family:'Inter',Helvetica] text-[12px] font-medium transition-colors " +
                        (used
                          ? "cursor-default border-[#e7e2ef] bg-[rgba(244,231,255,0.35)] text-[#1c2b33]/35"
                          : "border-[#e7e2ef] bg-white/70 text-[#1c2b33]/70 hover:bg-white")
                      }
                    >
                      {!used && (
                        <span
                          aria-hidden="true"
                          className="text-[14px] leading-none text-[#c7a6f5]"
                        >
                          +
                        </span>
                      )}
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </motion.section>

        {/* Step 3 — one tiny in-the-moment skill */}
        <motion.section variants={item} className="mt-6 flex flex-col gap-2.5">
          <StepLabel step={3}>Try this, right now</StepLabel>
          <button
            type="button"
            onClick={() => setTriedSkill((v) => !v)}
            aria-pressed={triedSkill}
            className={
              "all-[unset] box-border flex w-full cursor-pointer flex-col gap-2 rounded-[18px] border p-4 transition-colors " +
              (triedSkill
                ? "border-[#c7a6f5] bg-[rgba(244,231,255,0.55)]"
                : "border-[#e7e2ef] bg-white/80 hover:bg-white")
            }
          >
            <div className="flex items-center justify-between gap-3">
              <span className="[font-family:'Inter',Helvetica] text-[15px] font-semibold leading-[20px] text-[#1c2b33]">
                {practice.skill.name}
              </span>
              <span
                aria-hidden="true"
                className={
                  "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border transition-colors " +
                  (triedSkill ? "border-transparent" : "border-[#1c2b33]/20")
                }
                style={
                  triedSkill
                    ? { background: "linear-gradient(135deg,#c7a6f5,#f7a8c5)" }
                    : undefined
                }
              >
                {triedSkill && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
            </div>
            <p className="text-left [font-family:'Inter',Helvetica] text-[13px] font-normal leading-[20px] text-[#1c2b33]/65">
              {practice.skill.instruction}
            </p>
            <span className="[font-family:'Inter',Helvetica] text-[12px] font-medium text-[#1c2b33]/45">
              {triedSkill ? "Nice — you did it." : "Tap when you've tried it"}
            </span>
          </button>
        </motion.section>

        {/* Step 4 — one small committed action */}
        <motion.section variants={item} className="mt-6 flex flex-col gap-2.5">
          <StepLabel step={4}>One small thing before tomorrow</StepLabel>
          <p className="[font-family:'Inter',Helvetica] text-[13px] font-normal leading-[19px] text-[#1c2b33]/60">
            Pick one tiny step you're actually willing to take. Small counts.
          </p>
          <div className="flex flex-col gap-2">
            {practice.actions.map((a) => {
              const active = !customAction.trim() && selectedAction === a;
              return (
                <ChoiceTile
                  key={a}
                  label={a}
                  active={active}
                  onSelect={() => {
                    setSelectedAction(a);
                    setCustomAction("");
                  }}
                />
              );
            })}
          </div>
          <input
            type="text"
            value={customAction}
            onChange={(e) => {
              setCustomAction(e.target.value);
              if (e.target.value.trim()) setSelectedAction(null);
            }}
            placeholder="Or write your own…"
            className="w-full rounded-[16px] border border-[#e7e2ef] bg-white/80 px-3.5 py-3 [font-family:'Inter',Helvetica] text-[14px] leading-[20px] text-[#1c2b33] placeholder:text-[#1c2b33]/35 focus:border-[#c7a6f5] focus:outline-none focus:ring-2 focus:ring-[#c7a6f5]/20"
          />
        </motion.section>

        {/* Margo's closing line. */}
        {practice.closingLine && (
          <motion.p
            variants={item}
            className="mt-7 text-center [font-family:'Inter',Helvetica] text-[14px] font-normal italic leading-[21px] text-[#1c2b33]/55"
          >
            {practice.closingLine}
          </motion.p>
        )}
      </motion.div>

      {/* Footer — primary "Save practice" + secondary "Back to home". */}
      <div className="flex flex-col gap-2.5 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <AnimatePresence>
          {saved && (
            <motion.p
              key="saved"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="text-center [font-family:'Inter',Helvetica] text-[13px] font-medium text-[#1c2b33]/60"
            >
              Saved — your practice is set for tonight.
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={handleSave}
          whileTap={{ scale: 0.97, boxShadow: "0 6px 16px rgba(199,166,245,0.30)" }}
          className="all-[unset] box-border flex h-14 w-full cursor-pointer items-center justify-center rounded-full shadow-[0_14px_34px_rgba(199,166,245,0.45)]"
          style={{
            background:
              "linear-gradient(90deg, #c7a6f5 0%, #ec9fc4 52%, #f7b59a 100%)",
          }}
          aria-label="Save practice"
        >
          <span className="[font-family:'Inter',Helvetica] text-[16px] font-semibold tracking-[-0.2px] text-white">
            Save practice
          </span>
        </motion.button>

        <button
          type="button"
          onClick={onBackHome}
          className="all-[unset] box-border flex h-11 w-full cursor-pointer items-center justify-center rounded-full [font-family:'Inter',Helvetica] text-[15px] font-medium text-[#1c2b33]/55 hover:text-[#1c2b33]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]"
          aria-label="Back to home"
        >
          Back to home
        </button>
      </div>
    </motion.div>
  );
};
