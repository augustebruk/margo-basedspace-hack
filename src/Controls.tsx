import type { JSX } from "react";
import { motion } from "motion/react";

/* -------------------------------------------------------------------------- */
/* Icons (inline SVG so we don't pull in an icon dependency). Color is         */
/* inherited via `currentColor`, set by each button.                          */
/* -------------------------------------------------------------------------- */

const MicIcon = (): JSX.Element => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <line x1="12" y1="17.5" x2="12" y2="21" />
    <line x1="8.5" y1="21" x2="15.5" y2="21" />
  </svg>
);

const CheckIcon = (): JSX.Element => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);

const ForwardIcon = (): JSX.Element => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12h13" />
    <path d="M12.5 6l6 6-6 6" />
  </svg>
);

const KeyboardIcon = (): JSX.Element => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="2" y="6" width="20" height="12" rx="2.5" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 13h.01M18 13h.01M9 13h6" />
  </svg>
);

/* -------------------------------------------------------------------------- */
/* Color tokens                                                               */
/* -------------------------------------------------------------------------- */

// Medium gray / soft navy for icons (good contrast, never pure black).
const ICON_COLOR = "#54656e";
// Pastel purple from the orb family used for the mic recording ring + icon.
const RECORD_ACCENT = "#b6a0e0";

// Secondary buttons: a very light, translucent tint of the orb gradient —
// lighter than the orb itself so they stay subordinate to the mic.
const sideButtonClass =
  "all-[unset] box-border flex h-14 w-14 cursor-pointer items-center justify-center rounded-full " +
  "bg-[linear-gradient(135deg,rgba(244,231,255,0.4)_0%,rgba(253,221,222,0.4)_100%)] " +
  "border border-[rgba(244,231,255,0.6)] " +
  "shadow-[0_6px_16px_rgba(28,43,51,0.08)] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]";

interface ControlsProps {
  isRecording: boolean;
  isTyping: boolean;
  onMicToggle: () => void;
  onToggleKeyboard: () => void;
  onFinish: () => void;
  onNext: () => void;
}

export const Controls = ({
  isRecording,
  isTyping,
  onMicToggle,
  onToggleKeyboard,
  onFinish,
  onNext,
}: ControlsProps): JSX.Element => {
  return (
    <div className="flex w-full flex-col items-center gap-4 pb-[env(safe-area-inset-bottom)]">
      <div className="flex w-full items-center justify-center gap-9">
      {/* Left — Finish entry (secondary, soft tint, no color change on press) */}
      <motion.button
        type="button"
        onClick={onFinish}
        whileTap={{ scale: 0.96, boxShadow: "0 10px 24px rgba(28,43,51,0.16)" }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={sideButtonClass}
        style={{ color: ICON_COLOR }}
        aria-label="Finish Entry"
        title="Finish Entry"
      >
        <CheckIcon />
      </motion.button>

      {/* Center — Mic (dominant). Always white; recording shown with a gentle
          pulsing pastel ring + soft inner glow, never a heavy fill. */}
      <motion.button
        type="button"
        onClick={onMicToggle}
        whileTap={{ scale: 0.97 }}
        // Recording: slight scale up + softer, larger shadow (still white).
        animate={{
          scale: isRecording ? 1.04 : 1,
          boxShadow: isRecording
            ? "0 16px 38px rgba(28,43,51,0.16)"
            : "0 10px 26px rgba(28,43,51,0.10)",
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        aria-label={isRecording ? "Pause recording" : "Resume recording"}
        aria-pressed={isRecording}
        style={{ color: isRecording ? RECORD_ACCENT : ICON_COLOR }}
        className={
          "all-[unset] box-border relative flex h-[72px] w-[72px] cursor-pointer items-center justify-center rounded-full " +
          // Always pure white, with a 1px light pastel border from the orb.
          "bg-white border " +
          (isRecording
            ? "border-[rgba(182,160,224,0.55)]"
            : "border-[rgba(244,231,255,0.9)]") +
          " focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]"
        }
      >
        {isRecording && (
          <>
            {/* Thin pastel ring that gently pulses around the circle. */}
            <motion.span
              aria-hidden="true"
              className="absolute -inset-[5px] rounded-full border-2"
              style={{ borderColor: RECORD_ACCENT }}
              initial={{ opacity: 0.4, scale: 1 }}
              animate={{ opacity: [0.35, 0.85, 0.35], scale: [1, 1.12, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* Subtle inner glow in the same pastel. */}
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(182,160,224,0.30) 0%, rgba(182,160,224,0) 70%)",
              }}
              animate={{ opacity: [0.4, 0.85, 0.4] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
          </>
        )}
        {/* Icon sits above the glow/ring. */}
        <span className="relative">
          <MicIcon />
        </span>
      </motion.button>

      {/* Right — Next prompt (secondary, soft tint, no color change on press) */}
      <motion.button
        type="button"
        onClick={onNext}
        whileTap={{ scale: 0.96, boxShadow: "0 10px 24px rgba(28,43,51,0.16)" }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={sideButtonClass}
        style={{ color: ICON_COLOR }}
        aria-label="Next Prompt"
        title="Next Prompt"
      >
        <ForwardIcon />
      </motion.button>
      </div>

      {/* Keyboard toggle — switch between speaking and typing for this turn.
          When recording is paused, tapping the mic resumes and appends. */}
      <button
        type="button"
        onClick={onToggleKeyboard}
        aria-pressed={isTyping}
        className="all-[unset] box-border inline-flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-1.5 [font-family:'Inter',Helvetica] text-[13px] font-medium text-[#1c2b33]/45 transition-colors hover:text-[#1c2b33]/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]"
        title={isTyping ? "Switch Back To Voice" : "Type Instead"}
      >
        {isTyping ? (
          <span className="[&>svg]:h-5 [&>svg]:w-5">
            <MicIcon />
          </span>
        ) : (
          <KeyboardIcon />
        )}
        <span>{isTyping ? "Use Voice" : "Type Instead"}</span>
      </button>
    </div>
  );
};
