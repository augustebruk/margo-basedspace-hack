import { useState, type JSX } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";

/* ============================================================================
 * PracticeView — placeholder for a future Shadify-generated practice.
 *
 * The OUTER SHELL (title, "Save practice", "Back to home") should stay stable;
 * later, swap the inner steps with a Shadify-generated layout. All copy is
 * prop-driven with sensible placeholder defaults.
 * ==========================================================================*/
export interface PracticeResult {
  option: string | null;
  reflection: string;
  action: string;
}

export interface PracticeViewProps {
  title?: string;
  description?: string;
  /** Step 1 — single-choice options. */
  options?: string[];
  /** Step 3 — suggested tiny actions (plus a free-text "Other"). */
  suggestedActions?: string[];
  /** Called with the collected answers when "Save practice" is tapped. */
  onSave?: (result: PracticeResult) => void;
  /** Secondary CTA — wire to real navigation later. */
  onBackHome: () => void;
}

const DEFAULT_OPTIONS = [
  "I'm overwhelmed and need to rest",
  "I'm stressed about work or school",
  "I'm hard on myself and feeling guilty",
  "Something else",
];

const DEFAULT_ACTIONS = [
  "Go to bed 30 minutes earlier",
  "Say no to one extra request",
  "Take a 10-minute walk without my phone",
];

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

const StepLabel = ({ children }: { children: string }): JSX.Element => (
  <p className="[font-family:'Inter',Helvetica] text-[14px] font-semibold leading-[20px] text-[#1c2b33]">
    {children}
  </p>
);

export const PracticeView = ({
  title = "Tonight's Practice",
  description = "Choose what matters most right now and plan one small step.",
  options = DEFAULT_OPTIONS,
  suggestedActions = DEFAULT_ACTIONS,
  onSave,
  onBackHome,
}: PracticeViewProps): JSX.Element => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [customAction, setCustomAction] = useState("");
  const [saved, setSaved] = useState(false);

  const finalAction = customAction.trim() || selectedAction || "";

  const handleSave = () => {
    const result: PracticeResult = {
      option: selectedOption,
      reflection: reflection.trim(),
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

      {/* Header */}
      <div className="px-5 pt-12 pb-3">
        <h1 className="[font-family:'Inter',Helvetica] text-[24px] font-medium leading-[1.25] tracking-[-0.4px] text-[#1c2b33]">
          {title}
        </h1>
        <p className="mt-1.5 [font-family:'Inter',Helvetica] text-[14px] font-normal leading-[20px] text-[#1c2b33]/55">
          {description}
        </p>
      </div>

      {/* Scrollable steps (min-h-0 so the footer stays pinned). */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="min-h-0 flex-1 overflow-y-auto px-5 pb-5"
      >
        {/* Step 1 — single choice */}
        <motion.section variants={item} className="flex flex-col gap-2.5">
          <StepLabel>Step 1 — What feels most true tonight?</StepLabel>
          <div className="flex flex-col gap-2">
            {options.map((opt) => {
              const active = selectedOption === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSelectedOption(opt)}
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
                        ? {
                            background:
                              "linear-gradient(135deg,#c7a6f5,#f7a8c5)",
                          }
                        : undefined
                    }
                  >
                    {active && (
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    )}
                  </span>
                  <span className="[font-family:'Inter',Helvetica] text-[14px] font-normal leading-[20px] text-[#1c2b33]/85">
                    {opt}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.section>

        {/* Step 2 — short reflection */}
        <motion.section variants={item} className="mt-6 flex flex-col gap-2.5">
          <StepLabel>Step 2 — Put it into words</StepLabel>
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            rows={3}
            placeholder="In 2–3 sentences, describe what's on your mind about this."
            className="w-full resize-none rounded-[16px] border border-[#e7e2ef] bg-white/80 p-3.5 [font-family:'Inter',Helvetica] text-[14px] leading-[21px] text-[#1c2b33] placeholder:text-[#1c2b33]/35 focus:border-[#c7a6f5] focus:outline-none focus:ring-2 focus:ring-[#c7a6f5]/20"
          />
        </motion.section>

        {/* Step 3 — tiny commitment */}
        <motion.section variants={item} className="mt-6 flex flex-col gap-2.5">
          <StepLabel>Step 3 — One small thing you'll try</StepLabel>
          <p className="[font-family:'Inter',Helvetica] text-[13px] font-normal leading-[19px] text-[#1c2b33]/55">
            Pick one small action you're willing to take before tomorrow.
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestedActions.map((s) => {
              const active = !customAction.trim() && selectedAction === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSelectedAction(s);
                    setCustomAction("");
                  }}
                  aria-pressed={active}
                  className={
                    "all-[unset] box-border cursor-pointer rounded-full border px-3.5 py-2 [font-family:'Inter',Helvetica] text-[13px] font-medium transition-colors " +
                    (active
                      ? "border-[#c7a6f5] bg-[rgba(244,231,255,0.6)] text-[#1c2b33]"
                      : "border-[#e7e2ef] bg-white/70 text-[#1c2b33]/75 hover:bg-white")
                  }
                >
                  {s}
                </button>
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
            placeholder="Other — write your own…"
            className="w-full rounded-[16px] border border-[#e7e2ef] bg-white/80 px-3.5 py-3 [font-family:'Inter',Helvetica] text-[14px] leading-[20px] text-[#1c2b33] placeholder:text-[#1c2b33]/35 focus:border-[#c7a6f5] focus:outline-none focus:ring-2 focus:ring-[#c7a6f5]/20"
          />
        </motion.section>
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
