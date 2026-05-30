/**
 * OnboardingOverlay — positioned elements rendered on top of the orb.
 *
 * Only handles content that must be *absolutely positioned* over the screen
 * (currently just the firstInsight bottom panel). All onboarding text
 * (intro, askName, askFirstThought) is rendered in the normal document flow
 * below the orb inside MicScreen.
 */

import { AnimatePresence, motion } from "motion/react";
import type { JSX } from "react";
import type { OnboardingStage } from "./MicScreen";

interface OnboardingOverlayProps {
  stage: OnboardingStage;
}

export const OnboardingOverlay = ({
  stage,
}: OnboardingOverlayProps): JSX.Element => {
  return (
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
              You named a feeling without judging it. That takes more awareness
              than you might think.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
