/**
 * OnboardingOverlay — layered above the orb during first-time onboarding.
 *
 * Renders different text/content depending on the current `onboardingStage`.
 * It never replaces the orb or controls — it sits in front of them.
 *
 * Stage transitions
 * ─────────────────
 *   'intro'        → auto-advances after 3 s (driven by MicScreen)
 *   'askName'      → waits for voice/text capture, then parent calls onNameCaptured()
 *   'askFirstThought' → waits for voice capture, then parent calls onFirstThoughtCaptured()
 *   'firstInsight' → shows a bottom panel with placeholder "You said / Margo notices"
 *
 * Props
 * ─────
 *   stage                    The current onboarding stage.
 *   capturedName             Name captured in 'askName', shown back in later stages.
 *   onIntroFinished()        Called by MicScreen after the intro auto-advance.
 *   onNameCaptured(name)     Called when a name has been captured (real or simulated).
 *   onFirstThoughtCaptured() Called when the first thought has been captured.
 */

import { AnimatePresence, motion } from "motion/react";
import type { JSX } from "react";
import type { OnboardingStage } from "./MicScreen";

interface OnboardingOverlayProps {
  stage: OnboardingStage;
  capturedName: string;
  onIntroFinished: () => void;
  onNameCaptured: (name: string) => void;
  onFirstThoughtCaptured: (transcript: string) => void;
}

/* Shared text styles */
const headingCls =
  "[font-family:'Inter',Helvetica] font-medium text-[#1c2b33] tracking-[-0.5px] leading-[1.25] text-center";
const subCls =
  "[font-family:'Inter',Helvetica] font-normal text-[#1c2b33]/55 tracking-[-0.3px] leading-[1.5] text-center";

export const OnboardingOverlay = ({
  stage,
  capturedName,
  onNameCaptured,
  onFirstThoughtCaptured,
}: OnboardingOverlayProps): JSX.Element => {
  return (
    <>
      {/* ── Top text overlay (intro / askName / askFirstThought) ──────────── */}
      <AnimatePresence mode="wait">
        {stage === "intro" && (
          <motion.div
            key="intro"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="absolute top-[88px] left-0 right-0 flex flex-col items-center gap-2 px-8"
          >
            <p className={`${headingCls} text-[28px]`}>Hi, I&apos;m Margo.</p>
            <p className={`${subCls} text-[17px] mt-1`}>
              What if your journal talked back?
            </p>
          </motion.div>
        )}

        {stage === "askName" && (
          <motion.div
            key="askName"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="absolute top-[88px] left-0 right-0 flex flex-col items-center gap-3 px-8"
          >
            <p className={`${headingCls} text-[22px]`}>
              Before we begin — what should I call you?
            </p>
            {/* Placeholder where the captured name will appear */}
            <AnimatePresence>
              {capturedName && (
                <motion.p
                  key="capturedName"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="[font-family:'Inter',Helvetica] font-medium text-[#1c2b33] text-[32px] tracking-[-0.6px] mt-1"
                >
                  {capturedName}
                </motion.p>
              )}
              {!capturedName && (
                <motion.span
                  key="listening-hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`${subCls} text-[14px] mt-1`}
                >
                  Listening for your name&hellip;
                </motion.span>
              )}
            </AnimatePresence>

            {/* DEV ONLY: simulate name capture */}
            {import.meta.env.DEV && (
              <button
                type="button"
                onClick={() => onNameCaptured("Alex")}
                className="mt-3 rounded-full border border-dashed border-[#1c2b33]/20 px-4 py-1.5 text-[12px] text-[#1c2b33]/40 [font-family:'Inter',Helvetica] hover:border-[#1c2b33]/40 hover:text-[#1c2b33]/60 transition-colors"
              >
                [dev] simulate name → &ldquo;Alex&rdquo;
              </button>
            )}
          </motion.div>
        )}

        {stage === "askFirstThought" && (
          <motion.div
            key="askFirstThought"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="absolute top-[88px] left-0 right-0 flex flex-col items-center gap-3 px-8"
          >
            <p className={`${headingCls} text-[21px] max-w-[300px]`}>
              {capturedName ? `Nice to meet you, ${capturedName}.` : ""}
            </p>
            <p className={`${subCls} text-[16px] max-w-[300px] mt-1`}>
              Tell me one thing that&apos;s been on your mind lately. Anything.
              Big, small, messy. I&apos;m here to listen.
            </p>

            {/* DEV ONLY: simulate first thought capture */}
            {import.meta.env.DEV && (
              <button
                type="button"
                onClick={() =>
                  onFirstThoughtCaptured(
                    "I've been feeling overwhelmed at work lately.",
                  )
                }
                className="mt-3 rounded-full border border-dashed border-[#1c2b33]/20 px-4 py-1.5 text-[12px] text-[#1c2b33]/40 [font-family:'Inter',Helvetica] hover:border-[#1c2b33]/40 hover:text-[#1c2b33]/60 transition-colors"
              >
                [dev] simulate first thought captured
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom panel: firstInsight ─────────────────────────────────────── */}
      <AnimatePresence>
        {stage === "firstInsight" && (
          <motion.div
            key="firstInsight"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="absolute bottom-[160px] left-4 right-4 rounded-[20px] bg-white/90 backdrop-blur-sm border border-[#1c2b33]/8 px-5 py-4 flex flex-col gap-3 shadow-[0_4px_24px_rgba(0,0,0,0.07)]"
          >
            <div className="flex flex-col gap-1">
              <span className="[font-family:'Inter',Helvetica] font-medium uppercase tracking-[1.5px] text-[10px] text-[#1c2b33]/40">
                You said
              </span>
              <p className="[font-family:'Inter',Helvetica] font-normal text-[14px] leading-[1.5] text-[#1c2b33]/70">
                &ldquo;I&apos;ve been feeling overwhelmed at work lately.&rdquo;
              </p>
            </div>
            <div className="h-px w-full bg-[#1c2b33]/8" />
            <div className="flex flex-col gap-1">
              <span className="[font-family:'Inter',Helvetica] font-medium uppercase tracking-[1.5px] text-[10px] text-[#1c2b33]/40">
                Margo notices
              </span>
              <p className="[font-family:'Inter',Helvetica] font-normal text-[14px] leading-[1.5] text-[#1c2b33]/70">
                You named a feeling without judging it. That takes more
                awareness than you might think.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
